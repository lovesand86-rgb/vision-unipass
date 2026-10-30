import test from 'node:test';import assert from 'node:assert/strict';
import {blankJob,validateIntake,intakeSearchPeriods,referenceSearch} from '../extension/intake-model.js';
import {emptyLibrary,COMPANY_DEFAULTS,upsertJob} from '../extension/intake-library.js';
import {folderWorkbook,prepareImportedJob,rememberImportedJob,WORKBOOK_NAME} from '../extension/intake-folder.js';
test('only a unique designated workbook is automatically selected, ignoring Office locks',()=>{
 const f={name:WORKBOOK_NAME};assert.equal(folderWorkbook([{name:'invoice.xlsx'},f,{name:'~$'+WORKBOOK_NAME}]).file,f);
 assert.equal(folderWorkbook([{name:'invoice.xlsx'}]).file,null);assert.equal(folderWorkbook([f,{...f}]).ambiguous,true);
});
test('Excel business ID resolves the importer; explicit shipment values win and names alone never match',()=>{
 const library=emptyLibrary();library.owners=[{id:'1111111111',basic:{수입화주명:'SAME NAME',수입화주사업자번호:'1111111111',화주허가번호:'OWNER01',화주휴대폰:'01011112222'}}];library.company={신청인전화:'0211112222'};
 const j=blankJob();Object.assign(j.basic,{수입화주사업자번호:'111-11-11111',화주휴대폰:'01099998888'});prepareImportedJob(j,library);
 assert.equal(j.basic.화주허가번호,'OWNER01');assert.equal(j.basic.화주휴대폰,'01099998888');assert.equal(j.basic.신청인전화,'0211112222');assert.equal(j.basic.대행업체허가번호,COMPANY_DEFAULTS.대행업체허가번호);assert.equal(j.basic.선적일,'');
 const other=blankJob();other.basic.수입화주명='SAME NAME';prepareImportedJob(other,library);assert.equal(other.basic.화주허가번호,'');assert.equal(other.basic.수입화주사업자번호,'');
});
test('imports remember new parties without overwriting a stored recipe or carrying prior shipment values',()=>{
 const job=blankJob();Object.assign(job.basic,{수입화주사업자번호:'1111111111',수입화주명:'OWNER',제조업소명:'MAKER',제조업소등록번호:'MAKER01'});job.items=[{품목ID:'P1',제품명:'PRODUCT',한글명:'제품',수량단위:'CT',수량:'10',순중량kg:'20',금액USD:'30',HBL:'OLD'}];job.processes=[{순서:'1',공정코드:'01',공정명:'원료'}];
 const {library}=upsertJob(emptyLibrary(),job),next=blankJob();Object.assign(next.basic,job.basic);next.items=[{품목ID:'P1',제품명:'PRODUCT',한글명:'제품',수량단위:'CT'}];prepareImportedJob(next,library);const saved=rememberImportedJob(library,next);
 assert.equal(saved.library.products.length,1);assert.equal(saved.library.products[0].processes.length,1);assert.equal(next.items[0].수량,undefined);assert.equal(next.items[0].HBL,undefined);assert.equal(next.processes.length,0);
});
test('specified receipt and application stay distinct and the supplied original date selects its period',()=>{
 const j=blankJob();Object.assign(j.basic,{실적접수번호:'2025123456789',실적신청번호:'TEST-25-A',실적신청일:'2025-02-03'});
 assert.deepEqual(referenceSearch(j.basic),{receipt_no:'2025123456789',application_no:'TEST-25-A'});assert.deepEqual(intakeSearchPeriods(j.basic),[{from:'2025-02-03',to:'2025-02-03'}]);
 j.basic.실적신청일='2025-02-30';assert.match(validateIntake(j).join(),/실적신청일/);
});
