import json, subprocess, tempfile, hashlib
from pathlib import Path
with tempfile.TemporaryDirectory() as tmp:
 root=Path(tmp); source=root/'source.json'; out=root/'published'
 reports=[]
 for z in (15,14,13):
  span=2**(z-13)
  for x in range(4054*span,4055*span):
   for y in range(2999*span,3000*span):
    source.write_text(json.dumps({'format':'nabla-planet-source-v1','tile':{'z':z,'x':x,'y':y},'retrievedAt':'2026-09-28T00:00:00Z','elevation':{'segments':32,'heights':[40]*1089,'measured':[True]*1089,'provider':'esri-terrain-3d'},'features':[]}))
    subprocess.run(['node','--conditions=nabla-prepare','/app/prepare-dist/services/world-cache/planet/prepare-planet.js',str(source),str(out)],check=True,capture_output=True)
    directory=out/f'z/{z}/{x}/{y}'; manifest=json.loads((directory/'manifest.json').read_text())
    for f in manifest['files'].values():
     assert hashlib.sha256((directory/f['path']).read_bytes()).hexdigest()==f['sha256']
    if z<15:
     lod=manifest['lod']; assert len(lod['sources'])==4
     assert lod['outputTriangles']<lod['inputTriangles']
     reports.append({'z':z,**lod})
    else: assert 'lod' not in manifest
 print(json.dumps(reports,indent=2))
 print('PASS: 16 Z15 -> 4 simplified Z14 -> 1 simplified Z13; verified publication hashes, source provenance and reductions')
