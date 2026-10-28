import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {chromium}=require('playwright');
import {resolve} from 'node:path';import {mkdtemp,cp,writeFile,rm} from 'node:fs/promises';import assert from 'node:assert/strict';
import {declarationStep} from '../extension/search-copy.js';
const root=resolve(import.meta.dirname,'..'),fixture=await mkdtemp('/tmp/vision-recovery-extension-');
await cp(root+'/extension',fixture,{recursive:true});
const job={format:'vision-unipass-search-copy',version:1,identity:{product_name:'TEST FOOD',importer_name:'TEST IMPORTER',importer_id:'1234567890',manufacturer_name:'TEST MAKER',manufacturer_id:'TEST-MAKER'},search:{from:'2026-01-01',to:'2026-10-27',product_term:'TEST',importer_term:'TEST'},source_application:'TEST-26-001'};
await writeFile(fixture+'/cargo-target.js',`export const searchTarget=${JSON.stringify(job)};export const cargoTarget=null;export const itemTarget=null;export const commonTarget=null;`);
// This regression test never attaches a debugger or clicks a real government page.
await writeFile(fixture+'/label-notice.js','export async function watchLabelNotice(){return {stop:async()=>{}};}');
const context=await chromium.launchPersistentContext('/tmp/vision-recovery-'+Date.now(),{executablePath:process.env.VISION_TEST_BROWSER||'/tmp/vision-playwright/chromium-1234/chrome-linux64/chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--disable-extensions-except='+fixture,'--load-extension='+fixture]});
const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
try{
const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const base='chrome-extension://'+new URL(worker.url()).host+'/';const page=await context.newPage();
async function setup(stage,mode){
 await page.goto(base+'workflow.html');await page.locator('#start-sequence').waitFor();
 await page.evaluate(async({job,stage,mode})=>{
  window.calls=[];window.opened=stage==='original_requested'||stage==='searching';window.copied=stage==='copy_unknown';window.missingReads=0;
  const fingerprint=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(job))))].map(n=>n.toString(16).padStart(2,'0')).join('');
  await chrome.storage.local.clear();if(stage)await chrome.storage.local.set({visionCopyAttemptV1:{stage,fingerprint,listTab:1,token:'old',source:job.source_application,...(stage==='copy_unknown'?{beforeCopyTabs:[1,2],originalTab:2}:{})}});
  chrome.permissions.request=async()=>true;
  chrome.tabs.query=async()=>{
   const all=[{id:1,url:'https://unipass.customs.go.kr/csp/index.do',windowId:1},{id:90},{id:91,url:''},{id:92,url:'not a url'},{id:93,url:'https://example.com/csp/csw/reqrqstmt/apfmmt/foodEtcImpDcshMtCtr/retrieveApfmOdv.do'}];
   if(window.opened){const url=mode==='loading'&&window.missingReads++<2?undefined:'https://unipass.customs.go.kr/csp/csw/reqrqstmt/apfmmt/foodEtcImpDcshMtCtr/retrieveApfmOdv.do';all.push({id:2,url,windowId:1});if(mode==='duplicates')all.push({id:4,url,windowId:1});}
   if(window.copied)all.push({id:3,url:'https://unipass.customs.go.kr/csp/index.do',windowId:1});return all;
  };
  chrome.tabs.update=async()=>{};chrome.windows.update=async()=>{};
  chrome.scripting.executeScript=async({target,args})=>{
   const {action}=args[0];window.calls.push({action,id:target.tabId});let result;
   if(action==='probe')result={list:target.tabId===1};
   if(action==='search')result={status:'query_requested'};
   if(action==='result')result={status:'matched',signature:'test'};
   if(action==='open'){window.opened=true;if(mode==='lost-open')throw Error('lost popup response');result={status:'original_requested'};}
   if(action==='original')result={status:mode==='mismatch'?'blocked':'original_matched',signature:'verified',reason:'원문 신청번호가 다릅니다.'};
   if(action==='copy'){window.copied=true;result={status:'copy_requested'};}
   if(action==='draft')result={status:target.tabId===3?'draft_verified':'not_draft'};
   return [{frameId:0,result}];
  };
 },{job,stage,mode});
}
async function finish(){await page.locator('#start-sequence').click();await page.waitForFunction(()=>document.getElementById('workflow-status').textContent.includes('복사본을 확인'));await page.waitForFunction(()=>!document.getElementById('start-sequence').disabled);return page.evaluate(()=>window.calls);}
for(const mode of ['normal','loading','lost-open']){await setup(null,mode);const calls=await finish();assert.equal(calls.filter(c=>c.action==='copy').length,1);assert.equal(calls.filter(c=>c.action==='open').length,1);assert.ok(calls.filter(c=>c.action==='original').every(c=>c.id===2));}
for(const stage of ['searching','original_requested']){await setup(stage,'normal');const calls=await finish();assert.equal(calls.filter(c=>c.action==='search'||c.action==='open').length,0);assert.equal(calls.filter(c=>c.action==='copy').length,1);}
await setup('copy_unknown','normal');let calls=await finish();assert.ok(calls.every(c=>c.action==='draft'));assert.equal(calls.filter(c=>c.action==='copy').length,0);
await setup('searching','duplicates');await page.locator('#start-sequence').click();await page.waitForFunction(()=>document.getElementById('workflow-status').textContent.includes('여러 개'));assert.ok(await page.evaluate(()=>window.calls.every(c=>c.action==='original')));
await setup('original_requested','mismatch');await page.locator('#start-sequence').click();await page.waitForFunction(()=>document.getElementById('workflow-status').textContent.includes('하나 열고'));assert.ok(await page.evaluate(()=>window.calls.every(c=>c.action==='original')));
// Actual injected probe/search code against synthetic HTML, with no real network request.
const form=await context.newPage();await form.route('https://unipass.customs.go.kr/**',route=>route.fulfill({contentType:'text/html',body:'<body></body>'}));await form.goto('https://unipass.customs.go.kr/csp/index.do');
const baseHtml='<button id="btnQry">조회</button><input id="prnm" value="UNCHANGED"><table id="qryTbl1"><tr><td>sample</td></tr></table><select id="reqApfmCd"><option>수입식품등의수입신고서</option></select>';
await form.setContent(baseHtml);let result=await form.evaluate(declarationStep,{action:'probe',job});assert.equal(result.list,false);assert.match(result.reason,/기관/);
result=await form.evaluate(declarationStep,{action:'search',job});assert.equal(result.status,'blocked');assert.equal(await form.locator('#prnm').inputValue(),'UNCHANGED');
const select='<select id="reqApreIttCd"><option>식품의약품안전처</option></select>';
await form.setContent(baseHtml+select+'<div hidden>'+select+'</div>');result=await form.evaluate(declarationStep,{action:'probe',job});assert.equal(result.list,true);
await form.setContent(baseHtml+select+select);result=await form.evaluate(declarationStep,{action:'probe',job});assert.equal(result.list,false);
await form.setContent(baseHtml+'<div hidden>'+select+'</div>');result=await form.evaluate(declarationStep,{action:'probe',job});assert.equal(result.list,false);
// Next-job action archives only after every accessible page has no open draft.
await setup('copy_unknown','next');
page.on('dialog',dialog=>dialog.accept());
await page.evaluate(()=>{
 chrome.tabs.query=async()=>[{id:1,url:'https://unipass.customs.go.kr/csp/index.do'}];
 chrome.scripting.executeScript=async({args})=>{window.calls.push({action:args[0].action});return [{frameId:0,result:{status:'draft_present'}}];};
});
await page.evaluate(()=>document.getElementById('close-attempt').hidden=false);await page.locator('#close-attempt').click();await page.waitForFunction(()=>!document.getElementById('close-attempt').disabled);
assert.equal(await page.evaluate(()=>chrome.storage.local.get('visionCopyAttemptV1').then(x=>x.visionCopyAttemptV1.stage)),'copy_unknown');
await page.evaluate(()=>{chrome.scripting.executeScript=async({args})=>{window.calls.push({action:args[0].action});return [{frameId:0,result:args[0].action==='draft_presence'?{status:'no_draft'}:{list:false}}];};});
await page.evaluate(()=>document.getElementById('close-attempt').hidden=false);await page.locator('#close-attempt').click();await page.waitForFunction(()=>document.getElementById('workflow-log').textContent.includes('이전 작업 기록을 보관'));
assert.equal(await page.evaluate(()=>chrome.storage.local.get('visionLastClosedCopyAttemptV1').then(x=>x.visionLastClosedCopyAttemptV1.previousStage)),'copy_unknown');
assert.ok(await page.evaluate(()=>window.calls.some(x=>x.action==='probe')));
assert.equal(await page.locator('#closed-draft-ack').count(),0);
// Exercise search/result on a real synthetic DOM, including hidden duplicate IDs.
const fields=['qryStrtDt','qryEndDt','owrEntsConm','reqRqstNo','reqRqstAcapNo','reqIttApreNo','prlstCdCn','blNoCn','cargMtNo','ovrsEntsConm','aplcUserId','reqUserId','dcerSgn'];
await form.setContent(baseHtml+select+'<input type="checkbox" id="excelCheck"><select id="reqRqstPrcsSttsClsfCd"><option value="">전체</option></select>'+fields.map(id=>`<input type="text" id="${id}">`).join('')+'<div hidden>'+select+'<button id="btnQry">조회</button><table id="qryTbl1"></table></div>');
await form.evaluate(({job})=>{window.queryClicks=0;document.querySelector('#btnQry').onclick=()=>{window.queryClicks++;document.querySelector('#qryTbl1').innerHTML=`<tr><td><input type="checkbox" name="check"><a>${job.source_application}</a></td><td>${job.identity.product_name}</td></tr><tr><td>${job.identity.importer_name}</td></tr><tr><td>${job.identity.manufacturer_name}</td><td>통관완료</td></tr>`;};},{job});
result=await form.evaluate(declarationStep,{action:'search',token:'synthetic',job});assert.equal(result.status,'query_requested');assert.equal(await form.evaluate(()=>window.queryClicks),1);
await form.waitForFunction(()=>window.__visionSearchState?.changed&&Date.now()-window.__visionSearchState.lastChange>=650);
result=await form.evaluate(declarationStep,{action:'result',token:'synthetic',job});assert.equal(result.status,'matched');
assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:['next job preserves open drafts and archives closed work before starting','invalid/missing tab URLs ignored','loading original retried','lost open response recovered','legacy searching stage resumes original','original_requested resumes original','copy_unknown never recopied','duplicate originals blocked','mismatched originals blocked','missing agency blocked before writes','hidden duplicate tolerated','two visible agencies rejected','hidden-only agency rejected','search and result use visible controls with hidden duplicates'],pageErrors:errors},null,2));
}finally{await context.close();await rm(fixture,{recursive:true,force:true});}
