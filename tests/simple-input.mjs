import {createRequire} from 'node:module';
import {mkdtemp,cp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {itemCommitStep} from '../extension/item-commit.js';
import {cargoStep} from '../extension/cargo-step.js';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const fixture=await mkdtemp('/tmp/vision-simple-extension-');await cp(new URL('../extension',import.meta.url),fixture,{recursive:true});
const identity={product_name:'테스트 제품',importer_id:'TESTIMPORTER',manufacturer_id:'TESTMAKER',bl:'TESTHBL',cargo_mt_no:'26TESTCAR0100010001'};
const cargo={format:'vision-unipass-cargo-job',version:1,identity,cargo:{hbl:identity.bl,mbl:'TESTMBL',year:'2026',cargo_mt_no:identity.cargo_mt_no}};
const item={format:'vision-unipass-item-commit',version:1,identity,fields:Object.fromEntries(Object.entries({cartons:'1250',net_kg:'19260',amount_usd:'25625',expiry_date:'2027-09-19'}).map(([k,value])=>[k,{value,reviewed:true,source:'synthetic fixture'}]))};
await writeFile(fixture+'/cargo-target.js',`export const cargoTarget=${JSON.stringify(cargo)},itemTarget=${JSON.stringify(item)},searchTarget=null,commonTarget=null,followupTarget=null;`);
const manifest=JSON.parse(await readFile(fixture+'/manifest.json'));manifest.host_permissions=manifest.optional_host_permissions;await writeFile(fixture+'/manifest.json',JSON.stringify(manifest));
const context=await chromium.launchPersistentContext('/tmp/vision-simple-'+Date.now(),{executablePath:process.env.VISION_TEST_BROWSER||'/tmp/vision-playwright/chromium-1234/chrome-linux64/chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--load-extension='+fixture],viewport:{width:600,height:720}});
const observed=JSON.parse(await readFile(new URL('./fixtures/cargo-popup-observed.json',import.meta.url)));
const errors=[],checks=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
try{
 await context.route('https://unipass.customs.go.kr/**',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),base='chrome-extension://'+new URL(worker.url()).host+'/';
 const page=await context.newPage();await page.goto(base+'cargo-workflow.html?tab=10');await page.locator('#start-cargo').waitFor();
 assert.equal(await page.locator('#item-repair-ack').count(),0);assert.equal(await page.locator('#final-panel').evaluate(e=>e.open),false);
 await page.evaluate(()=>{window.calls=[];chrome.tabs.get=async()=>({id:10,windowId:1});chrome.tabs.update=async()=>{};chrome.windows.update=async()=>{};chrome.scripting.executeScript=async req=>{const a=req.args[0];window.calls.push(a.action);let result;
  if(a.action==='review')result={status:'repair_review',rows:[{matches:false}],can_repair:true,token:'repair-test'};
  if(a.action==='repair_select')result={status:'ready'};
  if(a.action==='repair_prepare')result={status:'prepared'};
  if(a.action==='apply')result={status:'commit_requested'};
  if(a.action==='inspect')result={status:'committed',application_ref:['TEST','26','']};
  return [{frameId:0,result}];};});
 await page.locator('#start-cargo').click();await page.waitForFunction(()=>!document.getElementById('start-cargo').disabled);
 assert.deepEqual(await page.evaluate(()=>window.calls),['review','repair_select','repair_prepare','apply','inspect']);
 checks.push('one start recovers the reviewed existing row without confirmation UI or repeated update');
 await page.evaluate(()=>{window.calls=[];chrome.scripting.executeScript=async req=>{window.calls.push(req.args[0].action);return [{frameId:0,result:{status:'blocked',reason:'현재 신청서가 다릅니다.'}}];};});
 await page.locator('#start-cargo').click();await page.waitForFunction(()=>!document.getElementById('start-cargo').disabled);assert.ok((await page.evaluate(()=>window.calls)).every(a=>a==='review'));assert.match(await page.locator('#cargo-status').textContent(),/신청서가 다릅니다/);
 checks.push('changed declaration still stops before writes');
 // A correctly identified already-open cargo popup is reused; no new popup.
 await page.goto(base+'cargo-workflow.html?tab=10');await page.locator('#start-cargo').waitFor();
 await page.evaluate(observed=>{
  window.calls=[];window.selected=false;window.applied=false;
  chrome.tabs.query=async()=>[{id:10,url:'https://unipass.customs.go.kr/csp/index.do'}, {...observed.popup,url:'https://unipass.customs.go.kr'+observed.popup.path}];
  chrome.tabs.get=async()=>({id:10,windowId:1});chrome.tabs.update=async()=>{};chrome.windows.update=async()=>{};
  chrome.scripting.executeScript=async req=>{const a=req.args[0];window.calls.push({action:a.action,reuse:a.reuse_popup,id:req.target.tabId});let result;
   if(req.func.name==='itemCommitStep'){
    if(a.action==='review')result={status:'no_attempt'};
    if(a.action==='inspect')result={status:window.applied?'committed':window.selected?'ready':'needs_cargo'};
    if(a.action==='prepare')result={status:'prepared'};
    if(a.action==='apply'){window.applied=true;result={status:'commit_requested'};}
    if(a.action==='verify')result={status:'committed',application_ref:['TEST','26','']};
   }else{
    result={status:({begin:'begun',item_tab:'tab_opened',item_select:'item_selected',open_popup:'popup_requested',popup_ready:'ready',popup_search:'searched',popup_result:'matched',mark_selection:'selection_marked',popup_select:'selection_requested',verify:'connected'})[a.action],token:a.token,stage:'begun',signature:'test',parent_guard:{}};
    if(a.action==='popup_select')window.selected=true;
   }
   return [{frameId:0,result}];
  };
 },observed);
 await page.locator('#start-cargo').click();await page.waitForFunction(()=>!document.getElementById('start-cargo').disabled);
 const calls=await page.evaluate(()=>window.calls);assert.equal(calls.filter(x=>x.action==='open_popup').length,1);assert.equal(calls.find(x=>x.action==='open_popup').reuse,true);assert.equal(calls.find(x=>x.action==='popup_search').id,20);assert.equal(calls.filter(x=>x.action==='apply').length,1);
 checks.push('exact exported popup path is found, existing same-opener popup reused, and entry continues in one run');
 // Resume the precise stopped stage from 1.0.7 without opening another popup.
 await page.evaluate(async cargo=>{
  window.calls=[];window.selected=false;window.applied=false;
  const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(cargo))))].map(b=>b.toString(16).padStart(2,'0')).join('');
  await chrome.storage.local.set({visionCargoAttemptV1:{target:10,fingerprint,token:'paused107',stage:'popup_requested',before:[10]}});
  const original=chrome.scripting.executeScript;
  chrome.scripting.executeScript=async req=>req.func.name==='cargoStep'&&req.args[0].action==='begin'?[{frameId:0,result:{status:'existing',stage:'popup_requested',token:'paused107'}}]:original(req);
 },cargo);
 await page.locator('#start-cargo').click();await page.waitForFunction(()=>!document.getElementById('start-cargo').disabled);
 const resumed=await page.evaluate(()=>window.calls);assert.equal(resumed.filter(x=>x.action==='open_popup').length,0);assert.equal(resumed.filter(x=>x.action==='popup_search').length,1);assert.equal(resumed.find(x=>x.action==='popup_search').id,20);
 checks.push('stopped 1.0.7 popup_requested record resumes the already-open popup without opening another');

 // Real injected item DOM and guards, not controller stubs.
 const form=await context.newPage();await form.goto('https://unipass.customs.go.kr/csp/index.do');
 await form.evaluate(({item})=>{
  document.body.innerHTML='<section id="panel"></section>';const panel=document.querySelector('#panel'),pre='CSW0101001S_';
  const fields={impOwrBrno:item.identity.importer_id,mnfcCoPermDclrNo:item.identity.manufacturer_id,reqRqstNo1:'TEST',reqRqstNo2:'26',reqRqstNo3:'',blNoCn:item.identity.bl,mdlStszEnglNmPrlst:item.identity.product_name,cargMtNoPrlst1:item.identity.cargo_mt_no.slice(0,11),cargMtNoPrlst2:item.identity.cargo_mt_no.slice(11,15),cargMtNoPrlst3:item.identity.cargo_mt_no.slice(15),prlstIdfySgnPrlst:'ITEM1',mdlStszKoreNmPrlst:'테스트',circPridStrtDtPrlst:'',dclrQtyPrlst:'1',mdlStszNtwgPrlst:'1',mdlStszAmtPrlst:'1',circPridEndDtPrlst:''};
  for(const [k,v]of Object.entries(fields)){const input=document.createElement('input');input.type='text';input.id=pre+k;input.value=v;panel.append(input);}
  for(const k of ['mnfcProgTbl','mnigTbl']){const table=document.createElement('table');table.id=pre+k;panel.append(table);}
  const grid=document.createElement('table');grid.id=pre+'prlstTbl';grid.innerHTML='<tr><td>ITEM1</td><td>--</td><td>1</td><td>1 kg</td><td>1 (US$)</td><td><input type="radio" name="CSW0101001S_prlstSlct" checked></td></tr><tr><td>테스트 제품</td><td></td><td>~</td></tr>';panel.append(grid);
  const buttons=document.createElement('div');for(const label of ['추가','수정','삭제','초기화','항 전체 삭제']){const button=document.createElement('button');button.textContent=label;buttons.append(button);}panel.append(buttons);window.clicks=0;
  buttons.children[1].onclick=()=>{window.clicks++;const g=document.getElementById(pre+'prlstTbl');g.rows[0].cells[1].textContent=item.identity.cargo_mt_no;g.rows[0].cells[2].textContent=item.fields.cartons.value;g.rows[0].cells[3].textContent=item.fields.net_kg.value+' kg';g.rows[0].cells[4].textContent=item.fields.amount_usd.value+' (US$)';g.rows[1].cells[2].textContent='~'+item.fields.expiry_date.value;g.replaceWith(g.cloneNode(true));};
  document.documentElement.dataset.visionItemCommitToken='old-attempt';
 },{item});
 let result=await form.evaluate(itemCommitStep,{action:'review',job:item,token:'repair'});assert.equal(result.can_repair,true);
 result=await form.evaluate(itemCommitStep,{action:'repair_select',job:item,token:'repair',confirmed:true});assert.equal(result.status,'ready');
 result=await form.evaluate(itemCommitStep,{action:'repair_prepare',job:item,token:'repair',confirmed:true});assert.equal(result.status,'prepared');
 result=await form.evaluate(itemCommitStep,{action:'apply',job:item,token:'repair'});assert.equal(result.status,'commit_requested');assert.equal(await form.evaluate(()=>window.clicks),1);
 result=await form.evaluate(itemCommitStep,{action:'verify',job:item,token:'repair'});assert.equal(result.status,'committed');
 result=await form.evaluate(itemCommitStep,{action:'inspect',job:item,token:'next-read'});assert.equal(result.status,'committed');assert.equal(await form.evaluate(()=>window.clicks),1);
 checks.push('actual row recovery updates once and accepts verified values after site replaces table DOM');
 await form.locator('#CSW0101001S_prlstTbl tr').first().locator('td').nth(1).evaluate(e=>e.textContent='OTHER-CARGO');
 result=await form.evaluate(itemCommitStep,{action:'review',job:item,token:'other-cargo'});assert.equal(result.can_repair,false);assert.equal(await form.evaluate(()=>window.clicks),1);
 checks.push('different nonempty cargo is never silently overwritten');
 const popup=await context.newPage();await popup.goto('https://unipass.customs.go.kr'+observed.popup.path);
 await popup.setContent('<input id="MYC0801008Q_reqForm" value="CSW0101001S_cargMtNoPrlst|CSW0101001S_blNoCn"><table id="MYC0801008Q_result"></table>');
 result=await popup.evaluate(cargoStep,{action:'popup_ready',job:cargo,token:'cargo'});assert.equal(result.status,'ready');
 await popup.evaluate(()=>{
  document.body.insertAdjacentHTML('beforeend','<select id="MYC0801008Q_qryTp"><option value="1">화물관리번호</option><option value="2">M B/L - H B/L</option></select><input type="text" id="MYC0801008Q_mblNo"><input type="text" id="MYC0801008Q_hblNo"><select id="MYC0801008Q_year"><option value="2025">2025년</option><option value="2026">2026년</option></select><button id="MYC0801008Q_searchBtn">조회</button>');
  window.searchClicks=0;document.getElementById('MYC0801008Q_searchBtn').onclick=()=>window.searchClicks++;
 });
 result=await popup.evaluate(cargoStep,{action:'popup_search',job:cargo,token:'cargo'});assert.equal(result.status,'searched');
 assert.equal(await popup.locator('#MYC0801008Q_hblNo').inputValue(),cargo.cargo.hbl);assert.equal(await popup.locator('#MYC0801008Q_year').inputValue(),'2026');assert.equal(await popup.locator('#MYC0801008Q_qryTp').inputValue(),'2');assert.equal(await popup.evaluate(()=>window.searchClicks),1);
 for(const wrong of ['/csp/myc/comm/CommCdCtr/openMYC0801008Q.do','/csp/myc/comm/ComnCdCtr/openMYC0801008Q.do']){
  await popup.goto('https://unipass.customs.go.kr'+wrong);result=await popup.evaluate(cargoStep,{action:'popup_ready',job:cargo,token:'cargo'});assert.equal(result.status,'blocked');
 }
 checks.push('exported comn/ComnCdCtr path accepts actual injected search: HBL and year populated and query clicked once; guessed paths rejected');
 // Fixed attachment areas accept exact user categories and PDF originals.
 await page.goto(base+'cargo-workflow.html?tab=10&autorun=1');await page.locator('#photo-drop-label').waitFor();
 assert.equal(await page.locator('#start-cargo').isEnabled(),true);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJr8AAAAASUVORK5CYII=','base64');
 for(const [role,name]of [['label','01.png'],['front','02.png'],['other','03.pdf']])await page.locator('#photo-files-'+role).setInputFiles({name,mimeType:role==='other'?'application/pdf':'image/png',buffer:png});
 const startBox=await page.locator('#start-cargo').boundingBox();assert.ok(startBox.y+startBox.height<=720);
 assert.equal(await page.locator('.photo-card').count(),3);assert.match(await page.locator('#photo-hint').textContent(),/3개 준비됨/);
 await page.evaluate(async()=>{const {createPhotoPicker}=await import('./photo-picker.js');const root=document.createElement('div');root.id='test-picker';document.body.append(root);window.picker=createPhotoPicker(root);for(const [role,names]of [['label',['1_label.png']],['front',['2_front.png']],['other',['3_other.pdf','10_other.png']]]){const dt=new DataTransfer();for(const name of names)dt.items.add(new File(['test'],name));root.querySelector('[data-role='+role+']').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}));}});
 assert.deepEqual(await page.evaluate(()=>window.picker.files().map(x=>[x.slot,x.file.name])),[[0,'1_label.png'],[9,'2_front.png'],[10,'3_other.pdf'],[11,'10_other.png']]);
 assert.equal(await page.locator('#test-picker select').count(),0);
 await page.locator('#test-picker').getByLabel('10_other.png 앞으로').click();assert.equal(await page.evaluate(()=>window.picker.files().find(x=>x.slot===10).file.name),'10_other.png');
 await page.evaluate(()=>{window.picker.setBusy(true);const dt=new DataTransfer();dt.items.add(new File(['x'],'busy.png'));document.querySelector('#test-picker [data-role=other]').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:dt}));});assert.equal(await page.evaluate(()=>window.picker.count()),4);
 await page.evaluate(()=>window.picker.setBusy(false));
 await page.locator('#test-picker #photo-files-other').setInputFiles({name:'bad.xlsx',mimeType:'application/octet-stream',buffer:png});assert.equal(await page.evaluate(()=>window.picker.count()),4);
 assert.match(await page.locator('#test-picker #photo-hint').textContent(),/이미지 또는 PDF/);
 await page.locator('#test-picker #photo-files-label').setInputFiles({name:'replacement.pdf',mimeType:'application/pdf',buffer:Buffer.from('test')});
 assert.equal(await page.evaluate(()=>window.picker.count()),4);
 const attached=await page.evaluate(async()=>{
  const {createFollowup}=await import('./followup-controller.js');const calls=[];
  const followup=createFollowup({invoke:async(fn,arg,id)=>{calls.push({fn:fn.name,action:arg.action,id,slot:arg.slot,file:arg.file,data:arg.data});
   if(arg.action==='evidence')return {files:[]};if(arg.action==='commit')return {status:'selected',name:arg.file.name};return {};
  },log:()=>{},stage:()=>{},target:{},tabId:10,getPhotos:()=>window.picker.files()});
  const result=await followup.attachPhotos({identity:{},context:{}});return {result,calls};
 });
 assert.deepEqual(attached.calls.filter(x=>x.action==='begin').map(x=>[x.slot,x.file.name]),[[0,'replacement.pdf'],[9,'2_front.png'],[10,'10_other.png'],[11,'3_other.pdf']]);
 assert.ok(attached.calls.every(x=>x.id===10));assert.equal(attached.calls.filter(x=>x.action==='commit').length,4);
 assert.ok(attached.calls.filter(x=>x.action==='begin').every(x=>x.file.size===4&&x.file.sha256==='9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'));
 assert.ok(attached.calls.filter(x=>x.action==='chunk').every(x=>x.data==='dGVzdA=='));
 checks.push('photo provider keeps original bytes/hash and sends chosen roles to exact original tab and correct slots');
 checks.push('fixed attachment slots, PDF/drop, single-file replacement, manual order, Excel rejection and busy protection');
 await page.locator('#test-picker').evaluate(e=>e.remove());await page.locator('#photo-result').evaluate(e=>e.textContent='');
 await mkdir(new URL('../artifacts/screenshots',import.meta.url),{recursive:true});
 await page.screenshot({path:new URL('../artifacts/screenshots/12-simple-input.png',import.meta.url).pathname,fullPage:true});
 await page.setViewportSize({width:390,height:720});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.goto(base+'assist.html');await page.setViewportSize({width:460,height:530});await page.getByRole('heading',{name:'무엇을 할까요?'}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight));assert.equal(await page.locator('.app-version').textContent(),'v'+manifest.version);assert.ok((await page.title()).endsWith('v'+manifest.version));
 await page.screenshot({path:new URL('../artifacts/screenshots/11-compact-home.png',import.meta.url).pathname});
 await page.setViewportSize({width:1000,height:900});
 const resized=await page.evaluate(async()=>{const {sizeAssistWindow}=await import('./assist-window.js');const updates=[];chrome.windows.update=async(id,value)=>updates.push(value);chrome.windows.getCurrent=async()=>({id:1,type:'normal',state:'normal',left:0,top:0});await sizeAssistWindow(true);const normal=updates.length;chrome.windows.getCurrent=async()=>({id:2,type:'popup',state:'normal',left:0,top:0});await sizeAssistWindow(true);await sizeAssistWindow(false);return {normal,updates};});
 assert.equal(resized.normal,0);assert.equal(resized.updates[0].width,460);assert.equal(resized.updates[1].width,620);
 checks.push('compact home fits small window, input has no horizontal overflow, and ordinary Chrome windows never resized');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks,pageErrors:errors},null,2));
}finally{await context.close();await rm(fixture,{recursive:true,force:true});}
