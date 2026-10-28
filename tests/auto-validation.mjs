import {createRequire} from 'node:module';
import {mkdtemp,cp,writeFile,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const fixture=await mkdtemp('/tmp/vision-auto-validation-');await cp(new URL('../extension',import.meta.url),fixture,{recursive:true});
const identity={product_name:'TEST PRODUCT',importer_id:'TESTIMPORTER',manufacturer_id:'TESTMAKER',bl:'TESTBL',cargo_mt_no:'26TESTCAR0100010001'};
const cargo={format:'vision-unipass-cargo-job',version:1,identity,cargo:{hbl:'TESTBL',mbl:'TESTMBL',year:'2026',cargo_mt_no:identity.cargo_mt_no}};
const item={identity,fields:Object.fromEntries(Object.entries({cartons:'1',net_kg:'1',amount_usd:'1',expiry_date:'2027-01-01'}).map(([k,value])=>[k,{value}]))};
await writeFile(fixture+'/cargo-target.js',`export const searchTarget=null,cargoTarget=${JSON.stringify(cargo)},itemTarget=${JSON.stringify(item)},commonTarget={identity:${JSON.stringify(identity)}},followupTarget={enabled:true};`);
await writeFile(fixture+'/common-sequence.js',`export async function runCommonSequence({stage}){for(const k of ['common','shipment','entry','contact'])stage(k,'확인 완료');return {status:'common_completed',snapshot:{},entry_record:{},entry:'2026-01-02',shipment:'2026-01-01'};}export async function saveSequenceContact(){}`);
await writeFile(fixture+'/followup-controller.js',`export function createFollowup({stage}){return {async process(){for(const k of ['warehouse','product','photos'])stage(k,window.testMode==='partial'?'확인 필요':'확인 완료');return {pending:window.testMode==='partial'?['사진 첨부']:[]};},hasBinding:()=>false};}`);
await writeFile(fixture+'/final-dialog.js',`export async function watchFinalDialog(){return {arm(){},stop:async()=>{},finished:Promise.resolve(window.testMode==='unknown'?null:{classification:window.testMode==='error'?'error':'success',source:'synthetic_fixture',message:window.testMode==='error'?'필수항목 오류':'오류가 없습니다.'})};}`);
const context=await chromium.launchPersistentContext('/tmp/vision-auto-'+Date.now(),{executablePath:process.env.VISION_TEST_BROWSER||'/tmp/vision-playwright/chromium-1234/chrome-linux64/chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--load-extension='+fixture],viewport:{width:600,height:720}});
try{
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),base='chrome-extension://'+new URL(worker.url()).host+'/';
 const app=await context.newPage(),errors=[],checks=[];app.on('pageerror',e=>errors.push(e.message));
 async function run(mode){
  await app.goto(base+'cargo-workflow.html?tab=10');await app.locator('#start-cargo').waitFor();
  await app.evaluate(async mode=>{
   await chrome.storage.local.clear();window.testMode=mode;window.actions=[];
   chrome.tabs.get=async()=>({id:10,windowId:1,url:'https://unipass.customs.go.kr/csp/index.do'});chrome.tabs.update=async()=>{};chrome.windows.update=async()=>{};
   chrome.scripting.executeScript=async({func,args})=>{const a=args[0];let result;
    if(func.name==='itemCommitStep')result=a.action==='review'?{status:'no_attempt'}:{status:'committed',application_ref:['TEST','26','']};
    if(func.name==='finalStep'){
     if(a.action==='read')result={snapshot:{form_id:'SYNTHETIC',digest:'SYNTHETIC',application_ref:['TEST','26',''],summary:{product:'TEST PRODUCT'},files:[]},notices:[]};
     else{window.actions.push(a.kind);result={status:'requested'};}
    }
    if(!result)throw Error('Unexpected synthetic call: '+func.name+'/'+a.action);return [{frameId:0,result}];
   };
  },mode);
  await app.locator('#start-cargo').click();await app.waitForFunction(()=>!document.getElementById('start-cargo').disabled);
 }
 await run('success');assert.deepEqual(await app.evaluate(()=>window.actions),['validate']);assert.equal(await app.locator('#ready-panel').isVisible(),true);assert.equal(await app.locator('#photo-panel').isVisible(),false);assert.equal(await app.locator('#start-cargo').isVisible(),false);assert.equal(await app.locator('#final-send').isEnabled(),true);assert.match(await app.locator('#cargo-status').textContent(),/전송 준비 완료/);checks.push('full input pipeline automatically validates then shows only the ready state, never auto saves or sends');
 await app.screenshot({path:new URL('../artifacts/screenshots/13-ready-to-send.png',import.meta.url).pathname,fullPage:true});
 await app.locator('#edit-input').click();await app.locator('#photo-files-other').setInputFiles({name:'new.pdf',mimeType:'application/pdf',buffer:Buffer.from('synthetic')});assert.equal(await app.locator('#ready-panel').isVisible(),false);assert.equal(await app.locator('#final-validate').isEnabled(),false);assert.equal(await app.locator('#start-cargo').isEnabled(),true);checks.push('new local attachments require applying input before final validation');
 await run('partial');assert.deepEqual(await app.evaluate(()=>window.actions),[]);assert.equal(await app.locator('#ready-panel').isVisible(),false);checks.push('pending input or attachments prevents automatic final validation');
 for(const mode of ['error','unknown']){await run(mode);assert.deepEqual(await app.evaluate(()=>window.actions),['validate']);assert.equal(await app.locator('#ready-panel').isVisible(),false);assert.equal(await app.locator('#final-send').isEnabled(),false);assert.equal(await app.locator('#final-panel').evaluate(e=>e.open),true);}checks.push('error or unknown validation shows results and cannot transmit');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks,pageErrors:errors},null,2));
}finally{await context.close();await rm(fixture,{recursive:true,force:true});}
