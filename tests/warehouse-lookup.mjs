import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {warehouseStep} from '../extension/warehouse-step.js';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
// All pages are synthetic and every request is intercepted. No live declarations.
const browser=await chromium.launch({executablePath:process.env.VISION_TEST_BROWSER||'/tmp/vision-playwright/chromium-1234/chrome-linux64/chrome',headless:true,args:['--no-sandbox']});
const context=await browser.newContext(),origin='https://unipass.customs.go.kr';
const path='/csp/csw/infomt/cdmt/openCSW0302065Q.do';
const binding={application_ref:['TEST','26','001'],identity:{bl:'TEST-BL',importer_id:'TEST-IMPORTER',manufacturer_id:'TEST-MAKER',cargo_mt_no:'TEST-CARGO',product_name:'TEST FOOD'},context:{inscBrngFdmcSfkpWrhsCd:'12345678',aplcNm:'TEST',aplcEml1:'test',aplcEml2:'example.invalid'}};
const request={binding,open_token:'test-warehouse-launch',token:'test-search',agencies:['시험기관']};
const checks=[];
try{
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin==='http://localhost'&&/^\/[a-z-]+\.js$/.test(u.pathname))return route.fulfill({contentType:'text/javascript',body:await readFile(new URL('../extension'+u.pathname,import.meta.url),'utf8')});
  await route.fulfill({contentType:'text/html',body:'<html><body></body></html>'});
 });
 const app=await context.newPage();await app.goto('http://localhost/');
 const controller=await app.evaluate(async({binding,path,origin})=>{
  document.body.innerHTML=['photo-panel','followup-panel','warehouse-details','product-states','states-ack'].map(id=>`<div id="${id}"></div>`).join('');
  const {createFollowup}=await import('/followup-controller.js');let opened=false;const calls=[],closed=[];
  window.chrome={storage:{local:{get:async()=>({})}},tabs:{query:async()=>[
   {id:10,url:origin+'/csp/index.do'},
   {id:20,url:origin+path,openerTabId:999},
   {id:21,url:origin+'/csp/csw/informt/cdmt/openCSW0302065Q.do',openerTabId:10},
   {id:22,url:'not a url'},
   ...(opened?[{id:30,url:origin+path+'?interfaceSequence=3',openerTabId:10}]:[])
  ],remove:async id=>closed.push(id)}};
  const details={agency:'시험기관',agencies:['시험기관'],warehouse_code:'12345678',warehouse_name:'시험창고',states:[]};
  const invoke=async(func,arg,id)=>{
   calls.push({func:func.name,action:arg.action,id});
   if(func.name==='followupStep'){
    if(arg.action==='open_warehouse'){opened=true;return {status:'opened'};}
    return {details};
   }
   if(arg.action==='probe')return {status:'warehouse_ready'};
   if(arg.action==='search')return {status:'searched'};
   return {status:'matched',warehouse_code:'12345678',agency:'시험기관'};
  };
  const followup=createFollowup({invoke,log:()=>{},stage:()=>{},target:{},tabId:10});
  const result=await followup.process(binding,{},{attachments:false});return {calls,closed,result};
 },{binding,path,origin});
 assert.deepEqual(controller.calls.filter(c=>c.func==='warehouseStep').map(c=>[c.action,c.id]),[['probe',30],['search',30],['result',30]]);
 assert.ok(controller.calls.filter(c=>c.func==='followupStep').every(c=>c.id===10));assert.deepEqual(controller.closed,[30]);
 checks.push('controller discovers observed infomt URL; ignores wrong opener, old typo and malformed URL; original form stays bound');
 const form=await context.newPage();await form.goto(origin+'/csp/index.do');
 await form.evaluate(({binding,token})=>{
  const fields={reqRqstNo1:binding.application_ref[0],reqRqstNo2:binding.application_ref[1],reqRqstNo3:binding.application_ref[2],blNoCn:binding.identity.bl,impOwrBrno:binding.identity.importer_id,mnfcCoPermDclrNo:binding.identity.manufacturer_id,...binding.context};
  for(const [key,value]of Object.entries(fields)){const input=document.createElement('input');input.id='CSW0101001S_'+key;input.value=value;document.body.append(input);}
  const button=document.createElement('button');button.id='CSW0101001S_btnInscBrngFdmcSfkpWrhsCd';button.dataset.visionWarehouseLookup=token;document.body.append(button);
  const table=document.createElement('table');table.id='CSW0101001S_prlstTbl';table.innerHTML='<tr><td><input name="CSW0101001S_prlstSlct" type="radio" checked></td><td>TEST-CARGO</td></tr><tr><td>TEST FOOD</td></tr>';document.body.append(table);
 },{binding,token:request.open_token});
 const popupPromise=form.waitForEvent('popup');await form.evaluate(url=>window.open(url),origin+path+'?reqForm=CSW0101001S_inscBrngFdmcSfkpWrhsCd&interfaceSequence=3');const popup=await popupPromise;await popup.waitForLoadState();
 await popup.setContent('<input type="text" id="fdmcSfkpWrhsCd"><button id="btnQry">조회</button><table id="qryTbl1"><thead><tr><th>창고코드</th><th>창고명</th><th>식약기관명</th></tr></thead><tbody><tr><td>99999999</td><td>다른 창고</td><td>다른 기관</td></tr></tbody></table>');
 await popup.evaluate(()=>{window.searches=0;window.selections=0;document.querySelector('#qryTbl1').onclick=()=>window.selections++;document.querySelector('#btnQry').onclick=()=>{window.searches++;document.querySelector('#qryTbl1 tbody').innerHTML='<tr><td>12345678</td><td>시험창고</td><td>시험기관</td></tr>';};});
 let result=await popup.evaluate(warehouseStep,{...request,action:'probe'});assert.equal(result.status,'warehouse_ready');
 result=await popup.evaluate(warehouseStep,{...request,action:'search'});assert.equal(result.status,'searched');assert.equal(await popup.locator('#fdmcSfkpWrhsCd').inputValue(),'12345678');
 await popup.waitForFunction(()=>window.__visionWarehouseRead?.changed&&Date.now()-window.__visionWarehouseRead.at>=350);
 result=await popup.evaluate(warehouseStep,{...request,action:'result'});assert.equal(result.status,'matched');assert.equal(result.agency,'시험기관');
 await popup.evaluate(warehouseStep,{...request,action:'search'});assert.equal(await popup.evaluate(()=>window.searches),1);assert.equal(await popup.evaluate(()=>window.selections),0);
 checks.push('actual injected code queries fdmcSfkpWrhsCd once and reads matching qryTbl1 agency without selecting a warehouse');
 result=await popup.evaluate(warehouseStep,{...request,action:'search',open_token:'wrong-launch-token'});assert.equal(result.status,'blocked');
 await form.locator('#CSW0101001S_reqRqstNo3').fill('002');result=await popup.evaluate(warehouseStep,{...request,action:'search'});assert.equal(result.status,'blocked');assert.match(result.reason,/신청번호/);assert.equal(await popup.evaluate(()=>window.searches),1);
 checks.push('launch marker and changed declaration block further queries');
 await popup.goto(origin+'/csp/csw/informt/cdmt/openCSW0302065Q.do');result=await popup.evaluate(warehouseStep,{...request,action:'probe'});assert.equal(result.status,'blocked');assert.match(result.reason,/경로/);
 checks.push('unobserved typo endpoint stays rejected');
 console.log(JSON.stringify({passed:true,checks},null,2));
}finally{await browser.close();}
