import test from 'node:test';import assert from 'node:assert/strict';
import {blankJob,fromTables,TABLES,validateIntake,applyPrevious,searchPeriods} from '../extension/intake-model.js';
test('template preserves codes, parent links and separate ratio bases',()=>{
 const tables=Object.fromEntries(Object.entries(TABLES).map(([k,v])=>[k,[v]]));tables.기본정보.push(['보관창고코드','01211241','창고자료']);tables.품목.push(['P1','PRODUCT','제품','1','EA','1','2','2027-01-01','26TESTCAR0100010001','HB','MB','2026','invoice']);tables.성분.push(['A','','주','001','복합원료','80','제품','spec'],['B','A','부','002','원료','100','상위성분','spec']);
 const job=fromTables(tables);assert.equal(job.basic.보관창고코드,'01211241');assert.equal(job.ingredients[1].상위성분ID,'A');assert.deepEqual(validateIntake(job),[]);
 job.ingredients[0].상위성분ID='B';assert.match(validateIntake(job).join(),/상위 성분을 먼저/);
});
test('reject duplicate fields, wrong headers, invalid dates and ratios without normalization',()=>{
 const j=blankJob();j.items[0].소비기한='2026-02-30';assert.match(validateIntake(j).join(),/소비기한/);
 j.ingredients=[{성분ID:'A',구분:'주',성분명:'a',상위성분ID:'',배합비율:'101',비율기준:'제품'}];assert.match(validateIntake(j).join(),/배합비/);
 assert.throws(()=>fromTables({기본정보:[['wrong']]}),/열 이름/);
});
test('previous values require same product, unit and currency; all only changes three fields',()=>{
 const item={제품명:'P',수량단위:'EA',소비기한:'2027-01-01',HBL:'NEW'};const previous={product:'P',unit:'EA',currency:'USD',수량:'10',순중량kg:'20',금액USD:'30'};
 assert.deepEqual(applyPrevious(item,previous),{...item,수량:'10',순중량kg:'20',금액USD:'30'});assert.throws(()=>applyPrevious(item,{...previous,unit:'CT'}));assert.throws(()=>applyPrevious(item,{...previous,currency:'KRW'}));assert.throws(()=>applyPrevious(item,previous,['HBL']));
});
test('3 months, 1 year and 3 years date windows clamp month end',()=>{
 const periods=searchPeriods(new Date(2026,4,31));assert.equal(periods[0].from,'2026-02-28');assert.equal(periods[1].from,'2025-05-31');assert.equal(periods[2].from,'2023-05-31');
});
