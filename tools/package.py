from pathlib import Path
import json,hashlib,zipfile
root=Path(__file__).resolve().parents[1];art=root/'artifacts';art.mkdir(exist_ok=True)
files=[]
for p in sorted((root/'extension').iterdir()):
 if p.is_file() and p.name!='cargo-target.js':files.append(dict(path=p.name,sha256=hashlib.sha256(p.read_bytes()).hexdigest(),size=p.stat().st_size))
archive=art/'vision-extension-core.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
 for f in files:
  data=(root/'extension'/f['path']).read_bytes();info=zipfile.ZipInfo(f['path'],(2026,10,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
version=json.loads((root/'extension/manifest.json').read_text())['version']
feed=dict(format='vision-extension-update',schema=1,version=version,updater_min=1,url=f'https://github.com/lovesand86-rgb/vision-unipass/releases/download/v{version}/vision-extension-core.zip',sha256=hashlib.sha256(archive.read_bytes()).hexdigest(),size=archive.stat().st_size,files=files)
(art/'update.json').write_text(json.dumps(feed,ensure_ascii=False,indent=2))
print(json.dumps(dict(version=version,files=len(files),bytes=archive.stat().st_size,sha256=feed['sha256'])))
