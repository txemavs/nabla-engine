"""Shared OSM query and relation normalization; independent of map addressing."""

def overpass_query(bounds):
    """Generate Overpass query for a zone."""
    s, w, n, e = bounds
    return f'[out:json][timeout:25];(way[building]({s},{w},{n},{e});way["building:part"]({s},{w},{n},{e});way[highway]({s},{w},{n},{e});relation[building]({s},{w},{n},{e});node[natural=tree]({s},{w},{n},{e});node[place~"^(city|town|village)$"][name]({s},{w},{n},{e});way[railway~"^(rail|light_rail|tram|narrow_gauge)$"]({s},{w},{n},{e});way[landuse]({s},{w},{n},{e});way[leisure]({s},{w},{n},{e});way["natural"~"water|wood|beach|sand|scrub|heath|wetland|marsh|grassland"]({s},{w},{n},{e});way[water]({s},{w},{n},{e});way[waterway~"riverbank|dock|river|stream"]({s},{w},{n},{e});relation[landuse]({s},{w},{n},{e});relation[leisure]({s},{w},{n},{e});relation["natural"~"water|wood"]({s},{w},{n},{e});relation[water]({s},{w},{n},{e});relation[waterway~"riverbank"]({s},{w},{n},{e}););out geom;'

def coords_equal(a, b, tolerance=1e-7):
    """Check if two coordinate points are equal within tolerance."""
    return abs(a['lat'] - b['lat']) < tolerance and abs(a['lon'] - b['lon']) < tolerance

def assemble_multipolygon_rings(ways):
    """
    Assemble ways into closed rings by joining at shared endpoints.
    Returns list of assembled rings with role and coordinates.
    """
    rings = []
    
    by_role = {}
    for w in ways:
        role = 'inner' if w.get('role') == 'inner' else 'outer'
        if role not in by_role:
            by_role[role] = []
        by_role[role].append(w)
    
    for role, role_ways in by_role.items():
        role_rings = assemble_rings_for_role(role_ways)
        for ring in role_rings:
            rings.append({'role': role, 'coordinates': ring})
    
    return rings

def is_closed(geom):
    """Check if geometry forms a closed ring."""
    return len(geom) >= 4 and coords_equal(geom[0], geom[-1])

def assemble_rings_for_role(ways):
    """Assemble ways of the same role into closed rings."""
    rings = []
    available = set(range(len(ways)))
    
    for i, way in enumerate(ways):
        if i not in available:
            continue
        geom = way.get('geometry')
        if not geom or len(geom) < 2:
            available.discard(i)
            continue
        
        if is_closed(geom):
            rings.append([[p['lon'], p['lat']] for p in geom])
            available.discard(i)
            continue
        
        chain = list(geom)
        available.discard(i)
        
        extended = True
        while extended and not is_closed(chain):
            extended = False
            
            for j in list(available):
                other = ways[j].get('geometry')
                if not other or len(other) < 2:
                    available.discard(j)
                    continue
                
                chain_start, chain_end = chain[0], chain[-1]
                other_start, other_end = other[0], other[-1]
                
                if coords_equal(chain_end, other_start):
                    chain.extend(other[1:])
                    available.discard(j)
                    extended = True
                    break
                elif coords_equal(chain_end, other_end):
                    chain.extend(list(reversed(other))[1:])
                    available.discard(j)
                    extended = True
                    break
                elif coords_equal(chain_start, other_end):
                    chain = list(other[:-1]) + chain
                    available.discard(j)
                    extended = True
                    break
                elif coords_equal(chain_start, other_start):
                    chain = list(reversed(other))[:-1] + chain
                    available.discard(j)
                    extended = True
                    break
        
        if is_closed(chain):
            rings.append([[p['lon'], p['lat']] for p in chain])
    
    return rings

def overpass_features(elements):
    """
    Convert Overpass elements to MapFeature format.
    Handles multipolygon assembly for relations where member ways need to be joined.
    """
    result = []
    members = set()
    
    def coordinates(g):
        return [[p['lon'], p['lat']] for p in g]
    
    def closed(g):
        return len(g) >= 4 and g[0]['lat'] == g[-1]['lat'] and g[0]['lon'] == g[-1]['lon']
    
    for e in elements:
        if e.get('type') == 'relation' and e.get('members'):
            ways = [m for m in e['members'] if m.get('type') == 'way' and m.get('role', '') in ('', 'outer', 'inner')]
            if not ways:
                continue
            
            all_closed = all(m.get('geometry') and closed(m['geometry']) for m in ways)
            if all_closed:
                result.append({
                    'id': f"relation/{e['id']}",
                    'tags': e.get('tags', {}),
                    'rings': [{'role': m.get('role') or 'outer', 'coordinates': coordinates(m['geometry'])} for m in ways]
                })
                for m in ways:
                    members.add(m['ref'])
            else:
                way_geoms = [
                    {'role': m.get('role') or 'outer', 'geometry': m['geometry'], 'ref': m['ref']}
                    for m in ways if m.get('geometry') and len(m['geometry']) >= 2
                ]
                if not way_geoms:
                    continue
                
                assembled = assemble_multipolygon_rings(way_geoms)
                joined = {tuple(p) for ring in assembled for p in ring['coordinates']}
                used = [m for m in ways if m.get('geometry') and all((p['lon'], p['lat']) in joined for p in m['geometry'])]
                tags = e.get('tags', {})
                if any(m.get('role') == 'inner' and m not in used for m in ways) or ((tags.get('building') or tags.get('building:part')) and len(used) != len(ways)):
                    continue
                if assembled:
                    result.append({
                        'id': f"relation/{e['id']}",
                        'tags': e.get('tags', {}),
                        'rings': assembled
                    })
                    for m in used:
                        members.add(m['ref'])
    
    for e in elements:
        if e.get('type') == 'way' and e.get('geometry') and e['id'] not in members:
            tags = e.get('tags', {})
            if (tags.get('building') or tags.get('building:part')) and not closed(e['geometry']):
                continue
            result.append({
                'id': f"way/{e['id']}",
                'tags': tags,
                'rings': [{'role': 'outer', 'coordinates': coordinates(e['geometry'])}]
            })
        elif e.get('type') == 'node' and (e.get('tags', {}).get('natural') == 'tree' or e.get('tags', {}).get('place')):
            if e.get('lat') is not None and e.get('lon') is not None:
                result.append({
                    'id': f"node/{e['id']}",
                    'tags': e.get('tags', {}),
                    'rings': [{'role': 'point', 'coordinates': [[e['lon'], e['lat']]]}]
                })
    
    return result

