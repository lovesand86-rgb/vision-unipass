import {createRequire} from 'node:module';
import {mkdtemp,cp,writeFile,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {STORAGE as key} from '../extension/assist-model.js';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const fixture=await mkdtemp('/tmp/vision-restart-extension-'),profile=await mkdtemp('/tmp/vision-restart-profile-');
await cp(new URL('../extension',import.meta.url),fixture,{recursive:true});
await writeFile(fixture+'/cargo-target.js','export const searchTarget=null,cargoTarget=null,itemTarget=null,commonTarget=null;');
// Isolated Chrome only; no user profile, native executable or live UNI-PASS.
const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.VISION_TEST_BROWSER||'/tmp/vision-playwright/chromium-1234/chrome-linux64/chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--enable-unsafe-extension-debugging']});
const checks=[];
try{
 await context.route('https://unipass.customs.go.kr/**',r=>r.fulfill({contentType:'text/html',body:'<input id="untouched" value="KEEP">'}));
 // Real unpacked installations have developer mode enabled. Without it this
 // Chrome build disables a reloaded extension, so that is not a valid fixture.
 const settings=await context.newPage();await settings.goto('chrome://extensions/');
 await settings.evaluate(()=>chrome.developerPrivate.updateProfileConfiguration({inDeveloperMode:true}));await settings.close();
 const cdp=await context.browser().newBrowserCDPSession();const {id}=await cdp.send('Extensions.loadUnpacked',{path:fixture});
 const base='chrome-extension://'+id+'/';
 let worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
 const form=await context.newPage();await form.goto('https://unipass.customs.go.kr/csp/index.do');
 const userBlank=await context.newPage();await userBlank.goto('chrome://newtab/');
 const originalWindows=await worker.evaluate(()=>chrome.windows.getAll({}).then(ws=>ws.map(w=>w.id)));
 async function openApp(){
  const win=await worker.evaluate(()=>chrome.windows.create({url:chrome.runtime.getURL('assist.html'),type:'popup'}));
  const page=await context.waitForEvent('page',{predicate:p=>p.url().startsWith(base),timeout:1000}).catch(()=>context.pages().find(p=>p.url().startsWith(base)));
  await page.locator('#update').waitFor();return {page,win};
 }
 async function mockNative(ok=true){await worker.evaluate(ok=>{
  chrome.runtime.sendNativeMessage=async(_host,message)=>{
   if(message.command!=='reopen')return {ok:false,message:'테스트 연결'};
   const state=await chrome.storage.local.get('reopenCalls');await chrome.storage.local.set({reopenCalls:(state.reopenCalls||0)+1});
   return ok?{ok:true}:{ok:false,message:'테스트 실행 실패'};
  };
 },ok);}
 async function reloadWorker(action){const next=context.waitForEvent('serviceworker');await action();worker=await next;}
 // Reproduce the old close-on-extension-unload behavior without opening a
 // native process: the app's popup survives with no extension document.
 let app=await openApp();const leftover=app.win.id;
 await reloadWorker(()=>worker.evaluate(()=>{setTimeout(()=>chrome.runtime.reload(),100);}));
 assert.ok((await worker.evaluate(()=>chrome.windows.getAll({}))).some(w=>w.id===leftover));
 assert.equal((await worker.evaluate(()=>chrome.runtime.getContexts({contextTypes:['TAB']}))).length,0);
 await worker.evaluate(id=>chrome.windows.remove(id),leftover);
 checks.push('old unload sequence reproduces leftover app window');
 app=await openApp();await mockNative(false);
 let result=await app.page.evaluate(()=>chrome.runtime.sendMessage({type:'reload'}));assert.equal(result.ok,false);assert.match(result.error,/테스트 실행 실패/);assert.equal(app.page.isClosed(),false);
 checks.push('native launch failure keeps current app open');
 await mockNative();await worker.evaluate(()=>chrome.storage.local.set({reopenCalls:0}));
 const tool=await context.newPage();await tool.goto(base+'workflow.html');await tool.locator('#start-sequence').waitFor();
 for(const message of [{type:'reload'},{type:'native',command:'apply'},{type:'native',command:'restore'}]){
  result=await app.page.evaluate(m=>chrome.runtime.sendMessage(m),message);assert.equal(result.ok,false);assert.match(result.error,/입력 도구 탭/);
 }
 assert.equal((await worker.evaluate(()=>chrome.storage.local.get('reopenCalls'))).reopenCalls,0);await tool.close();
 checks.push('other tool pages block update, restore and restart without broad tabs permission');
 await worker.evaluate(key=>chrome.storage.local.set({[key]:{schema:1,jobs:[{attempts:[{result:'pending'}]}]}}),key);
 result=await app.page.evaluate(()=>chrome.runtime.sendMessage({type:'reload'}));assert.equal(result.ok,false);assert.match(result.error,/미확인/);
 await worker.evaluate(key=>chrome.storage.local.remove(key),key);checks.push('pending input result blocks restart');
 for(let cycle=0;cycle<2;cycle++){
  await mockNative();const oldTab=app.win.tabs[0].id,oldWindow=app.win.id;
  const next=context.waitForEvent('serviceworker');
  const replies=await app.page.evaluate(()=>Promise.all([chrome.runtime.sendMessage({type:'reload'}),chrome.runtime.sendMessage({type:'reload'})]));
  assert.equal(replies.filter(r=>r.ok).length,1);worker=await next;
  assert.equal((await worker.evaluate(()=>chrome.storage.local.get('reopenCalls'))).reopenCalls,cycle+1);
  const remaining=await worker.evaluate(()=>chrome.windows.getAll({}));assert.ok(!remaining.some(w=>w.id===oldWindow));
  assert.deepEqual(remaining.map(w=>w.id).sort(),[...originalWindows].sort());
  assert.ok(!(await worker.evaluate(()=>chrome.tabs.query({}))).some(t=>t.id===oldTab));
  assert.equal(await form.locator('#untouched').inputValue(),'KEEP');assert.equal(userBlank.isClosed(),false);assert.match(userBlank.url(),/^chrome:\/\/(newtab|new-tab-page)\/$/);
  // Simulate only the native launcher's one delayed --app reopen. All closing
  // and extension reload behavior above is the production worker code.
  app=await openApp();
 }
 checks.push('two real reload cycles close only requesting app before reload, preserve UNI-PASS and user new tab, and schedule one reopen per cycle');
 console.log(JSON.stringify({passed:true,checks},null,2));
}finally{await context.close();await rm(fixture,{recursive:true,force:true});await rm(profile,{recursive:true,force:true});}
