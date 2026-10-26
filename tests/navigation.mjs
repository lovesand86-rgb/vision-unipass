import {createRequire} from 'node:module';const require=createRequire(import.meta.url);const {chromium}=require('playwright');
import {resolve} from 'node:path';import {mkdir,mkdtemp,cp,readFile,writeFile,rm} from 'node:fs/promises';import assert from 'node:assert/strict';
const root=resolve(import.meta.dirname,'..');await mkdir(root+'/artifacts/screenshots',{recursive:true});
// Pregrant the optional host in an isolated fixture: headless Chrome cannot answer the permission bubble.
const fixture=await mkdtemp('/tmp/vision-nav-extension-');await cp(root+'/extension',fixture,{recursive:true});
const manifest=JSON.parse(await readFile(fixture+'/manifest.json','utf8'));manifest.host_permissions=manifest.optional_host_permissions;await writeFile(fixture+'/manifest.json',JSON.stringify(manifest));
const context=await chromium.launchPersistentContext('/tmp/vision-nav-test-'+Date.now(),{executablePath:process.env.VISION_TEST_BROWSER||'/tmp/vision-playwright/chromium-1234/chrome-linux64/chrome',headless:true,ignoreDefaultArgs:['--disable-extensions'],args:['--no-sandbox','--disable-extensions-except='+fixture,'--load-extension='+fixture],viewport:{width:920,height:760}});
const errors=[];context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));
try{
const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');const base='chrome-extension://'+new URL(worker.url()).host+'/';
const app=await context.newPage();await app.goto(base+'assist.html');
const initialTabs=await app.evaluate(()=>chrome.tabs.query({}).then(ts=>ts.map(t=>t.id)));const appId=await app.evaluate(()=>chrome.tabs.getCurrent().then(t=>t.id));
await app.getByRole('button',{name:'실적 기반 입력',exact:false}).click();await app.getByRole('button',{name:'실적 검색부터 시작'}).click();await app.waitForURL(base+'workflow.html');await app.locator('#workflow-status').waitFor();
assert.equal(await app.evaluate(()=>chrome.tabs.getCurrent().then(t=>t.id)),appId);assert.deepEqual(await app.evaluate(()=>chrome.tabs.query({}).then(ts=>ts.map(t=>t.id))),initialTabs);
await app.screenshot({path:root+'/artifacts/screenshots/06-integrated-search.png',fullPage:true});
await app.getByRole('link',{name:'설정',exact:true}).click();await app.getByRole('dialog').waitFor();await app.getByRole('button',{name:'닫기',exact:true}).click();
await app.getByRole('button',{name:'실적 기반 입력',exact:false}).click();await app.getByRole('button',{name:'상세 도구',exact:true}).click();await app.waitForURL(base+'popup.html');
await app.getByRole('button',{name:'실적 검색과 입력',exact:true}).click();await app.waitForURL(base+'workflow.html');
// Exercise the existing post-copy handoff URL without performing a copy or autorun.
await app.evaluate(()=>location.assign('cargo-workflow.html?tab=999999'));await app.waitForURL(/cargo-workflow.html/);await app.getByRole('link',{name:'설정',exact:true}).waitFor();
assert.equal(await app.evaluate(()=>chrome.tabs.getCurrent().then(t=>t.id)),appId);assert.equal(context.pages().length,initialTabs.length);
await app.screenshot({path:root+'/artifacts/screenshots/07-integrated-cargo.png',fullPage:true});
await app.getByRole('link',{name:'실적 기반 입력'}).click();await app.getByRole('button',{name:'상세 도구',exact:true}).click();await app.waitForURL(base+'popup.html');
// All government URLs are intercepted. The extension still uses real Chrome tab APIs.
await context.route('https://unipass.customs.go.kr/**',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<title>합성 UNI-PASS</title><h1>합성 화면</h1>'}));
// The test fixture already grants the optional host; all target pages remain synthetic.
assert.equal(await app.evaluate(()=>chrome.permissions.request({origins:['https://unipass.customs.go.kr/*']})),true);
const form1=await context.newPage();await form1.goto('https://unipass.customs.go.kr/csp/synthetic-a');
const form2=await context.newPage();await form2.goto('https://unipass.customs.go.kr/csp/synthetic-b');
const formId=await app.evaluate(()=>chrome.tabs.query({url:'https://unipass.customs.go.kr/csp/synthetic-b'}).then(ts=>ts[0].id));
await app.bringToFront();const count=context.pages().length;
await app.getByRole('button',{name:'열린 신고서 한 번에 입력·이어하기'}).click();await app.getByRole('dialog').waitFor();await app.getByRole('button',{name:'취소',exact:true}).click();assert.equal(app.url(),base+'popup.html');
await app.getByRole('button',{name:'열린 신고서 한 번에 입력·이어하기'}).click();await app.getByLabel('작업할 UNI-PASS 화면').selectOption(String(formId));await app.getByRole('button',{name:'이 화면 연결'}).click();await app.waitForURL(base+'cargo-workflow.html?tab='+formId);
assert.equal(context.pages().length,count);assert.equal(await app.evaluate(()=>chrome.tabs.getCurrent().then(t=>t.id)),appId);
await app.getByRole('link',{name:'실적 기반 입력'}).click();await app.getByRole('button',{name:'상세 도구',exact:true}).click();
await app.getByRole('button',{name:'반입일·담당자 연락처 자동 준비'}).click();await app.getByLabel('작업할 UNI-PASS 화면').selectOption(String(formId));await app.getByRole('button',{name:'이 화면 연결'}).click();await app.waitForURL(base+'common-assist.html?tab='+formId);
assert.equal(context.pages().length,count);await app.setViewportSize({width:390,height:844});assert.ok(await app.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await app.getByRole('link',{name:'실적 기반 입력'}).click();await app.getByRole('button',{name:'상세 도구',exact:true}).click();assert.ok(await app.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await app.screenshot({path:root+'/artifacts/screenshots/08-integrated-detail-compact.png',fullPage:true});
// An in-progress controller must block app navigation, not silently destroy its task.
await app.evaluate(async()=>{const {guardToolNavigation}=await import('./assist-navigation.js');guardToolNavigation(()=>true);});
app.once('dialog',dialog=>dialog.accept());await app.getByRole('link',{name:'실적 기반 입력'}).click();assert.equal(app.url(),base+'popup.html');
assert.deepEqual(errors,[]);console.log(JSON.stringify({passed:true,checks:['search stays in app tab','settings return','detail stays in app tab','handoff stays in app tab','target picker cancellation','explicit cargo target','explicit common target','no new tool tabs','390px layouts','busy navigation blocked'],pageErrors:errors},null,2));
}finally{await context.close();await rm(fixture,{recursive:true,force:true});}
