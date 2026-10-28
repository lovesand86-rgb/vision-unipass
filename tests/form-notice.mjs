import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {formNoticeStep} from '../extension/form-notice.js';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const browser=await chromium.launch({executablePath:process.env.VISION_TEST_BROWSER||'/tmp/vision-playwright/chromium-1234/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage(),checks=[];
const body='사진파일, 각종 증명서류를 10번 항목에 10개까지 등록할 수 있도록 개선하였습니다. 가급적 각 항목에 맞는 구비서류(첨부파일)를 등록하여 주시기 바라며, 향후 항목에 맞지 않는 구비서류를 첨부하는 경우 식약처 수입 시스템 검증 과정에서 자동 반려될 수 있음을 알려드립니다.';
const binding={application_ref:['TEST','26',''],identity:{bl:'TESTBL',importer_id:'TESTIMPORTER',manufacturer_id:'TESTMAKER',cargo_mt_no:'26TEST',product_name:'TEST PRODUCT'},context:{reqRqstNo1:'TEST',aplcNm:'TEST',aplcEml1:'test',aplcEml2:'example.com',inscBrngFdmcSfkpWrhsCd:'TESTWH'}};
try{
 await page.route('https://unipass.customs.go.kr/**',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}));await page.goto('https://unipass.customs.go.kr/csp/index.do');
 async function setup(options={}){await page.evaluate(({binding,body,options})=>{
  const p='CSW0101001S_';document.body.replaceChildren();
  const fields={reqRqstNo1:'TEST',reqRqstNo2:'26',reqRqstNo3:'',blNoCn:'TESTBL',impOwrBrno:'TESTIMPORTER',mnfcCoPermDclrNo:'TESTMAKER',...binding.context};
  for(const [k,v]of Object.entries(fields)){const n=document.createElement('input');n.id=p+k;n.value=v;document.body.append(n);}
  document.body.insertAdjacentHTML('beforeend',`<table id="${p}prlstTbl"><tr><td><input type="radio" name="${p}prlstSlct"></td><td>26TEST</td></tr><tr><td>TEST PRODUCT</td></tr></table><table id="${p}attachTbl"><tr><td>Attachments</td></tr></table>`);
  window.clicks=0;window.closeClicks=0;window.checkChanges=0;
  if(options.absent)return;
  const dialog=document.createElement('div');dialog.id='notice';dialog.setAttribute('role','dialog');
  dialog.innerHTML='<header><span>첨부파일 안내</span><button type="button" class="ui-dialog-titlebar-close"><span class="ui-icon ui-icon-closethick">close</span></button></header><textarea readonly></textarea><button id="confirm">확인</button><label><input id="today" type="checkbox">오늘 하루 그만보기</label>';
  dialog.querySelector('textarea').value=body+(options.extra||'');dialog.querySelector('#today').checked=!!options.checked;
  dialog.querySelector('#today').onchange=()=>window.checkChanges++;
  dialog.querySelector('.ui-dialog-titlebar-close').onclick=()=>window.closeClicks++;
  dialog.querySelector('#confirm').onclick=()=>{window.clicks++;if(!options.stuck)dialog.style.display='none';};
  document.body.append(dialog);
  if(options.replaced)document.getElementById(p+'reqRqstNo3').value='OTHER';
 },{binding,body,options});}
 const invoke=()=>page.evaluate(formNoticeStep,{action:'dismiss',kind:'attachment',binding});
 await setup();let r=await invoke();assert.equal(r.status,'ready');assert.equal(r.notice,'confirmed');assert.equal(await page.evaluate(()=>window.clicks),1);assert.equal(await page.evaluate(()=>window.closeClicks),0);assert.equal(await page.locator('#today').isChecked(),false);checks.push('exact reported notice with close icon confirms once without clicking close or toggling today');
 r=await invoke();assert.equal(r.notice,'absent');assert.equal(await page.evaluate(()=>window.clicks),1);checks.push('hidden confirmed notice is not clicked again');
 await setup({checked:true});r=await invoke();assert.equal(r.notice,'confirmed');assert.equal(await page.locator('#today').isChecked(),true);assert.equal(await page.evaluate(()=>window.checkChanges),0);checks.push('existing checked today preference is preserved');
 await setup({absent:true});r=await invoke();assert.equal(r.notice,'absent');assert.equal(await page.evaluate(()=>window.clicks),0);checks.push('notice suppressed for today proceeds without a click');
 for(const extra of [' 추가로 동의해야 합니다.',' close']){await setup({extra});r=await invoke();assert.equal(r.status,'blocked');assert.equal(await page.evaluate(()=>window.clicks),0);}checks.push('additional body text including close is not silently ignored');
 await setup({replaced:true});r=await invoke();assert.equal(r.status,'blocked');assert.equal(await page.evaluate(()=>window.clicks),0);checks.push('changed application blocks confirmation');
 await setup({stuck:true});r=await invoke();assert.equal(r.status,'blocked');r=await invoke();assert.equal(r.status,'blocked');assert.equal(await page.evaluate(()=>window.clicks),1);checks.push('notice that stays open is not confirmed twice');
 console.log(JSON.stringify({passed:true,checks},null,2));
}finally{await browser.close();}
