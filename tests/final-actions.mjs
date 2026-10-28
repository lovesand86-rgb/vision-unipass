import {createRequire} from 'node:module';
import {mkdtemp,cp,writeFile,readFile,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const fixture=await mkdtemp('/tmp/vision-final-extension-');await cp(new URL('../extension',import.meta.url),fixture,{recursive:true});
await writeFile(fixture+'/cargo-target.js','export const cargoTarget=null,itemTarget=null,commonTarget=null,followupTarget=null,searchTarget=null;');
const manifest=JSON.parse(await readFile(fixture+'/manifest.json'));manifest.host_permissions=manifest.optional_host_permissions;await writeFile(fixture+'/manifest.json',JSON.stringify(manifest));
const context=await chromium.launchPersistentContext('/tmp/vision-final-'+Date.now(),{executablePath:process.env.VISION_TEST_BROWSER||'/tmp/vision-playwright/chromium-1234/chrome-linux64/chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--load-extension='+fixture],viewport:{width:600,height:720}});
const checks=[],errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
try{
 await context.route('https://unipass.customs.go.kr/**',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));
 const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker'),base='chrome-extension://'+new URL(worker.url()).host+'/';
 const form=await context.newPage();await form.goto('https://unipass.customs.go.kr/csp/index.do');
 // Only known error/unknown test alerts are dismissed as a simulated user; success uses the real watcher.
 form.on('dialog',async d=>{if(!['오류가 없습니다.','임시저장되었습니다.','전송되었습니다.'].includes(d.message()))await d.dismiss();});
 const app=await context.newPage();let tabId;
 async function setup(mode='success'){
  await form.reload();await form.evaluate(mode=>{
   const p='CSW0101001S_';const fields={reqRqstNo1:'TEST',reqRqstNo2:'26',reqRqstNo3:'',blNoCn:'TESTBL',impOwrBrno:'TESTIMPORTER',mnfcCoPermDclrNo:'TESTMAKER',inscBrngFdmcSfkpWrhsCd:'TESTWH',shpmDt:'2026-01-01',inscBrngDt:'2026-01-02',aplcTelno:'0212345678',aplcCralTelno:'01012345678'};
   for(const [k,v]of Object.entries(fields)){const n=document.createElement('input');n.id=p+k;n.value=v;document.body.append(n);}
   document.body.insertAdjacentHTML('beforeend',`<select id="${p}dclrFdmcIttCd"><option>TEST AGENCY</option></select><table id="${p}prlstTbl"><tr><td><input type="radio" name="${p}prlstSlct"></td><td>26TEST</td></tr><tr><td>TEST PRODUCT</td></tr></table><table id="${p}koreIndcMatrTbl"><tr><td>TEST LABEL</td></tr></table><table id="${p}attachTbl"><tr><td><input type="file"></td></tr></table><button id="${p}btnVerifyErr">오류검증</button><button id="${p}btnRegistTemp">임시저장</button><button id="${p}btnTrsn">전송</button>`);
   window.counts={validate:0,save:0,send:0};
   document.getElementById(p+'btnVerifyErr').onclick=()=>{window.counts.validate++;alert(mode==='validate-error'?'필수 항목을 입력하세요.':mode==='unknown'?'처리 결과를 확인하세요.':'오류가 없습니다.');};
   document.getElementById(p+'btnRegistTemp').onclick=()=>{window.counts.save++;if(mode==='save-error'){alert('저장에 실패했습니다.');return;}document.getElementById(p+'reqRqstNo3').value='0001';alert('임시저장되었습니다.');};
   document.getElementById(p+'btnTrsn').onclick=()=>{window.counts.send++;alert('전송되었습니다.');};
  },mode);
  await app.goto(base+'cargo-workflow.html?tab=999');await app.locator('#final-read').waitFor({state:'attached'});
  tabId=await app.evaluate(()=>chrome.tabs.query({url:'https://unipass.customs.go.kr/*'}).then(ts=>ts[0].id));
  await app.evaluate(async tabId=>{
   await chrome.storage.local.clear();window.logs=[];window.finalBusy=false;const {createFinalActions}=await import('./final-controller.js');
   window.final=createFinalActions({identity:{bl:'TESTBL',importer_id:'TESTIMPORTER',manufacturer_id:'TESTMAKER',cargo_mt_no:'26TEST',product_name:'TEST PRODUCT'},tabId,log:m=>window.logs.push(m),
    invoke:async(func,arg)=>{const r=(await chrome.scripting.executeScript({target:{tabId},func,args:[arg]}))[0].result;if(r.status==='blocked'){const e=Error(r.reason);e.blockedBeforeAction=r.before_action;throw e;}return r;},
    runExclusive:async fn=>{if(window.finalBusy)return;window.finalBusy=true;window.final.refresh(true);try{await fn();}finally{window.finalBusy=false;window.final.refresh(false);}}
   });
  },tabId);
 }
 await setup();let s=await app.evaluate(()=>window.final.prepare());assert.equal(s.ready,true);assert.deepEqual(await form.evaluate(()=>window.counts),{validate:1,save:0,send:0});assert.equal(await app.locator('#ready-panel').isVisible(),true);assert.equal(await app.locator('#final-send').isEnabled(),true);
 await app.evaluate(()=>window.final.prepare());assert.equal(await form.evaluate(()=>window.counts.validate),1);checks.push('automatic validation stops at ready; no automatic save/send; unchanged result reused');
 await app.locator('#final-send').click();await app.waitForFunction(()=>!window.finalBusy);assert.deepEqual(await form.evaluate(()=>window.counts),{validate:1,save:1,send:1});assert.equal(await app.evaluate(()=>window.final.state().sent),true);assert.equal(await app.locator('#final-send').isVisible(),false);await app.evaluate(()=>window.final.prepare());assert.deepEqual(await form.evaluate(()=>window.counts),{validate:1,save:1,send:1});checks.push('explicit send click saves once then sends once; reopening preparation cannot resend');
 await setup('validate-error');s=await app.evaluate(()=>window.final.prepare());assert.equal(s.ready,false);assert.deepEqual(await form.evaluate(()=>window.counts),{validate:1,save:0,send:0});assert.equal(await app.locator('#final-send').isEnabled(),false);checks.push('validation error never enables transmission');
 await setup('unknown');s=await app.evaluate(()=>window.final.prepare());assert.equal(s.pending,true);s=await app.evaluate(()=>window.final.prepare());assert.equal(s.ready,false);assert.equal(await form.evaluate(()=>window.counts.validate),1);checks.push('unconfirmed validation is not repeated or treated as success');
 await setup();await app.evaluate(()=>window.final.prepare());await form.locator('#CSW0101001S_aplcTelno').fill('0299999999');await app.locator('#final-send').click();await app.waitForFunction(()=>!window.finalBusy);assert.deepEqual(await form.evaluate(()=>window.counts),{validate:1,save:0,send:0});assert.equal(await app.evaluate(()=>window.final.state().ready),false);checks.push('manual changes after validation invalidate readiness before save or send');
 await setup('save-error');await app.evaluate(()=>window.final.prepare());await app.locator('#final-send').click();await app.waitForFunction(()=>!window.finalBusy);assert.deepEqual(await form.evaluate(()=>window.counts),{validate:1,save:1,send:0});checks.push('failed prerequisite save prevents transmission');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks,pageErrors:errors},null,2));
}finally{await context.close();await rm(fixture,{recursive:true,force:true});}
