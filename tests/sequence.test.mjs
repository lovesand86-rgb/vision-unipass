import test from 'node:test';
import assert from 'node:assert/strict';
import {runCommonSequence,profileKey,profileId} from '../extension/common-sequence.js';
import {photoRole} from '../extension/photo-picker.js';
test('existing valid applicant contact is used without a repeat confirmation',async()=>{
 const snapshot={application_ref:['TEST','26',''],identity:{product_name:'TEST',bl:'TESTBL',cargo_mt_no:'TESTCARGO'},context:{reqRqstNo1:'TEST',aplcNm:'TEST',aplcEml1:'test',aplcEml2:'example.invalid',inscBrngFdmcSfkpWrhsCd:'12345678'},phone:'02-1234-5678',mobile:'010-1234-5678'};
 const store={},applied=[];let asked=0;
 globalThis.chrome={storage:{local:{get:async k=>({[k]:store[k]}),set:async data=>Object.assign(store,data)}}};
 const invoke=async(fn,arg)=>{
  if(fn.name==='openCommonTab')return {};
  if(fn.name==='readCommonData')return arg.action==='read'?{snapshot}:{entry:{cargo_mt_no:'TESTCARGO',bl:'TESTBL',warehouse_code:'12345678',date:'2026-10-07',source:'synthetic',at:'test'}};
  if(arg.mode==='apply'){applied.push(arg.job.fields);return {status:'fields_filled'};}
  return {status:'preview',review_hash:'test',changes:[{same:true}]};
 };
 const job={format:'vision-unipass-fill-job',phase:'common',identity:snapshot.identity,fields:{shipment_date:{value:'2026-09-26',reviewed:true,source:'synthetic'}}};
 const result=await runCommonSequence({invoke,job,applicationRef:snapshot.application_ref,log:()=>{},stage:()=>{},onContact:()=>asked++});
 assert.equal(asked,0);assert.equal(result.status,'common_completed');assert.equal(store[profileKey][profileId(snapshot)].phone,snapshot.phone);
 assert.ok(applied.some(f=>f.applicant_phone?.value===snapshot.phone&&f.applicant_mobile?.value===snapshot.mobile));
 delete store[profileKey];snapshot.phone='';applied.length=0;
 const missing=await runCommonSequence({invoke,job,applicationRef:snapshot.application_ref,log:()=>{},stage:()=>{},onContact:()=>asked++});
 assert.equal(missing.status,'needs_contact');assert.equal(asked,1);assert.ok(applied.every(f=>!f.applicant_phone));
 delete globalThis.chrome;
});
test('photo filenames classify only an unambiguous label or front',()=>{
 assert.equal(photoRole('01_한글표시.jpg'),'label');assert.equal(photoRole('02_front.png'),'front');
 assert.equal(photoRole('한글표시_전면.jpg'),'other');assert.equal(photoRole('IMG_1234.jpg'),'other');
});
