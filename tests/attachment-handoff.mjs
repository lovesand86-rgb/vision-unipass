import {createRequire} from 'node:module';
import {mkdtemp,cp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const fixture=await mkdtemp('/tmp/vision-handoff-extension-');await cp(new URL('../extension',import.meta.url),fixture,{recursive:true});
const identity={product_name:'TEST PRODUCT',importer_name:'TEST IMPORTER',importer_id:'TESTIMPORTER',manufacturer_name:'TEST MAKER',manufacturer_id:'TESTMAKER',bl:'TESTBL',cargo_mt_no:'26TESTCAR0100010001'};
const search={format:'vision-unipass-search-copy',version:1,identity,source_application:'TEST-26-001',search:{}};
const cargo={format:'vision-unipass-cargo-job',version:1,identity,cargo:{hbl:'TESTBL',mbl:'TESTMBL',year:'2026',cargo_mt_no:identity.cargo_mt_no}};
await writeFile(fixture+'/cargo-target.js',`export const searchTarget=${JSON.stringify(search)},cargoTarget=${JSON.stringify(cargo)},itemTarget={identity:${JSON.stringify(identity)}},commonTarget={identity:${JSON.stringify(identity)}},followupTarget=null;`);
// The first input read is an intentional stop on a routed synthetic page; no business input is executed.
await writeFile(fixture+'/item-commit.js',`export async function itemCommitStep(){document.documentElement.dataset.autoRead=String(1+Number(document.documentElement.dataset.autoRead||0));return {status:'blocked',reason:'SYNTHETIC INPUT REACHED'};}`);
const manifest=JSON.parse(await readFile(fixture+'/manifest.json'));manifest.host_permissions=manifest.optional_host_permissions;await writeFile(fixture+'/manifest.json',JSON.stringify(manifest));
const context=await chromium.launchPersistentContext('/tmp/vision-handoff-'+Date.now(),{executablePath:process.env.VISION_TEST_BROWSER||'/tmp/vision-playwright/chromium-1234/chrome-linux64/chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--load-extension='+fixture],viewport:{width:600,height:720}});
const checks=[],errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
try{
 await context.route('https://unipass.customs.go.kr/**',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),base='chrome-extension://'+new URL(worker.url()).host+'/';
 const form=await context.newPage();await form.goto('https://unipass.customs.go.kr/csp/index.do');const app=await context.newPage();await app.goto(base+'workflow.html');
 await app.locator('#photo-files-label').waitFor({state:'attached'});
 const names=[['label','label.png'],['front','front.png'],['other','document.pdf']];
 for(const [role,name]of names)await app.locator('#photo-files-'+role).setInputFiles({name,mimeType:role==='other'?'application/pdf':'image/png',buffer:role==='other'?Buffer.from('%PDF-1.4 synthetic'):Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJr8AAAAASUVORK5CYII=','base64')});
 await mkdir(new URL('../artifacts/screenshots',import.meta.url),{recursive:true});await app.screenshot({path:new URL('../artifacts/screenshots/14-start-with-attachments.png',import.meta.url).pathname,fullPage:true});
 const appId=await app.evaluate(()=>chrome.tabs.getCurrent().then(t=>t.id));
 const formId=await app.evaluate(()=>chrome.tabs.query({url:'https://unipass.customs.go.kr/*'}).then(ts=>ts[0].id));
 await app.evaluate(async({search,formId})=>{
  const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(search))))].map(b=>b.toString(16).padStart(2,'0')).join('');
  await chrome.storage.local.set({visionCopyAttemptV1:{stage:'copy_verified',fingerprint,listTab:formId,beforeCopyTabs:[],draftTab:formId}});
  chrome.scripting.executeScript=async()=>[{frameId:0,result:{status:'draft_verified'}}];
 },{search,formId});
 await app.locator('#start-sequence').click();await app.waitForURL(/cargo-workflow.html/);await app.waitForFunction(()=>document.getElementById('cargo-status').textContent.includes('SYNTHETIC INPUT REACHED'));
 assert.equal(await app.evaluate(()=>chrome.tabs.getCurrent().then(t=>t.id)),appId);assert.ok(Number(await form.evaluate(()=>document.documentElement.dataset.autoRead))>0);
 assert.equal(await app.locator('.photo-card').count(),3);assert.deepEqual(await app.locator('.photo-name').allTextContents(),names.map(x=>x[1]));
 assert.equal(await app.locator('#start-cargo').isEnabled(),true);checks.push('one initial start transfers selected attachments in the same app tab and automatically reaches input without a second start click');
 const transfer=await app.evaluate(async()=>{
  const {putAttachments,takeAttachments}=await import('./attachment-handoff.js');
  const binding={appTab:10,targetTab:20,jobKey:'test-job'};
  const files=[{slot:0,file:new File(['label-original'],'label.jpg',{type:'image/jpeg',lastModified:1234})},{slot:9,file:new File(['front-original'],'front.pdf',{type:'application/pdf',lastModified:2345})}];
  const token=await putAttachments(files,binding);let wrong=false;try{await takeAttachments(token,{...binding,targetTab:99});}catch{wrong=true;}
  const got=await takeAttachments(token,binding);let replay=false;try{await takeAttachments(token,binding);}catch{replay=true;}
  const bytes=await Promise.all(got.map(async e=>({slot:e.slot,name:e.file.name,type:e.file.type,modified:e.file.lastModified,bytes:await e.file.text()})));
  return {wrong,replay,bytes};
 });
 assert.equal(transfer.wrong,true);assert.equal(transfer.replay,true);assert.deepEqual(transfer.bytes,[{slot:0,name:'label.jpg',type:'image/jpeg',modified:1234,bytes:'label-original'},{slot:9,name:'front.pdf',type:'application/pdf',modified:2345,bytes:'front-original'}]);checks.push('File bytes, name, type, lastModified and roles survive IndexedDB; different target and token replay are rejected');
 const guards=await app.evaluate(async()=>{
  const {putAttachments,takeAttachments}=await import('./attachment-handoff.js'),binding={appTab:10,targetTab:20,jobKey:'test-job'},files=[{slot:0,file:new File(['test'],'test.jpg')}];
  const token=await putAttachments(files,binding);const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('visionAttachmentHandoffV1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise(resolve=>{const tx=db.transaction('transfers','readwrite'),s=tx.objectStore('transfers'),r=s.get(token);r.onsuccess=()=>s.put({...r.result,expires:0});tx.oncomplete=resolve;});db.close();
  let expired=false;try{await takeAttachments(token,binding);}catch{expired=true;}
  const next=await putAttachments(files,binding);let otherApp=false,otherJob=false;
  try{await takeAttachments(next,{...binding,appTab:11});}catch{otherApp=true;}
  try{await takeAttachments(next,{...binding,jobKey:'other'});}catch{otherJob=true;}
  await takeAttachments(next,binding);
  let invalid=false;try{await putAttachments([{slot:0,file:new File(['bad'],'bad.xlsx')}],binding);}catch{invalid=true;}
  return {expired,otherApp,otherJob,invalid};
 });assert.deepEqual(guards,{expired:true,otherApp:true,otherJob:true,invalid:true});checks.push('expired preparation, other app/job and unsupported attachments cannot start input');
 const count=await app.evaluate(async()=>{const db=await new Promise(resolve=>{const r=indexedDB.open('visionAttachmentHandoffV1');r.onsuccess=()=>resolve(r.result);});try{return await new Promise(resolve=>{const r=db.transaction('transfers').objectStore('transfers').count();r.onsuccess=()=>resolve(r.result);});}finally{db.close();}});assert.equal(count,0);checks.push('consumed and expired handoff files are removed from temporary storage');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks,pageErrors:errors},null,2));
}finally{await context.close();await rm(fixture,{recursive:true,force:true});}
