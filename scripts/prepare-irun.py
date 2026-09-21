"""Normalize a bounded OSM API extract and sampled Esri Terrain3D into the playable fixture."""
import json, math, xml.etree.ElementTree as E
from datetime import datetime, timezone
r=E.parse('/tmp/irun-osm.xml').getroot()
nodes={e.attrib['id']:e for e in r.findall('node')}
def tags(e): return {t.attrib['k']:t.attrib['v'] for t in e.findall('tag')}
def point(e): return [float(e.attrib['lon']),float(e.attrib['lat'])]
features=[]
keys={'building','building:part','height','min_height','building:levels','building:min_level','building:colour','building:material','roof:shape','roof:height','roof:colour','name','highway','width','lanes','bridge','tunnel','layer','landuse','natural','leisure','amenity','access'}
ways={w.attrib['id']:w for w in r.findall('way')}
# Relations are retained as rings when each member is closed; unsupported split rings stay explicit.
relation_members=set()
for rel in r.findall('relation'):
 t=tags(rel)
 if t.get('type')!='multipolygon' or not ('building' in t or 'building:part' in t):continue
 rings=[];valid=True;members=[]
 for m in rel.findall('member'):
  if m.attrib['type']!='way':continue
  w=ways.get(m.attrib['ref'])
  if w is None:valid=False;break
  refs=[n.attrib['ref'] for n in w.findall('nd')]
  if len(refs)<4 or refs[0]!=refs[-1]:valid=False;break
  rings.append({'role':m.attrib.get('role','outer'),'coordinates':[point(nodes[n]) for n in refs]});members.append(w.attrib['id'])
 if valid and rings:
  features.append({'id':'relation/'+rel.attrib['id'],'tags':{k:v for k,v in t.items() if k in keys},'rings':rings});relation_members.update(members)
for ident,w in ways.items():
 t=tags(w)
 if ident in relation_members or not any(k in t for k in ['building','building:part','highway','landuse','natural','leisure']):continue
 refs=[n.attrib['ref'] for n in w.findall('nd')]
 if not all(n in nodes for n in refs):continue
 features.append({'id':'way/'+ident,'tags':{k:v for k,v in t.items() if k in keys},'rings':[{'role':'outer','coordinates':[point(nodes[n]) for n in refs]}]})
for ident,n in nodes.items():
 t=tags(n)
 if t.get('natural')=='tree':features.append({'id':'node/'+ident,'tags':{'natural':'tree'},'rings':[{'role':'point','coordinates':[point(n)]}]})
lat,lon=43.32969,-1.819606
rasters=[json.load(open('/tmp/irun-height.json')),json.load(open('/tmp/irun-height-south.json'))]
def elevation(latitude,longitude):
 tx=(longitude+180)/360*4096;ty=(1-math.asinh(math.tan(math.radians(latitude)))/math.pi)/2*4096
 row=int(ty)-1499;d=rasters[row];u=(tx-2027)*256;v=(ty-int(ty))*256;x=int(u);y=int(v);a=u-x;b=v-y
 def p(dx,dy):return d['pixels'][(y+dy)*d['width']+x+dx]
 return (1-a)*(1-b)*p(0,0)+a*(1-b)*p(1,0)+(1-a)*b*p(0,1)+a*b*p(1,1)
base=elevation(lat,lon)
heights=[]
for z in range(121):
 for x in range(121):
  latitude=lat-math.degrees((z*10-600)/6371000)
  longitude=lon+math.degrees((x*10-600)/(6371000*math.cos(math.radians(lat))))
  heights.append(round(elevation(latitude,longitude)-base,3))
doc={'name':'Irún · Ventas / Katea','origin':{'latitude':lat,'longitude':lon,'altitude':round(base,3)},'terrain':{'columns':121,'rows':121,'spacing':10,'heights':heights},'features':features,'source':{'osm':'https://www.openstreetmap.org/api/0.6/map?bbox=-1.828,43.324,-1.811,43.336','osmTimestamp':r.attrib.get('timestamp',''),'retrievedAt':datetime.now(timezone.utc).isoformat(),'elevation':'Esri WorldElevation3D/Terrain3D, level 12, x=2027, y=1499..1500','license':'OSM data © OpenStreetMap contributors, ODbL 1.0; elevation © Esri and its data providers'}}
with open('assets/geography/irun-ventas.json','w') as f:json.dump(doc,f,separators=(',',':'),ensure_ascii=False)
print(len(features),'features; elevation',base,'range',min(heights),max(heights))
