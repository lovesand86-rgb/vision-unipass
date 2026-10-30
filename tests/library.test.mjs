import test from 'node:test';import assert from 'node:assert/strict';
import {blankJob} from '../extension/intake-model.js';
import {emptyLibrary,upsertJob,useProduct,applyLabelDates,parseLibrary} from '../extension/intake-library.js';
const prepared=()=>{const j=blankJob('new');Object.assign(j.basic,{수입화주명:'화주 A',수입화주사업자번호:'111-11-11111',화주휴대폰:'01011112222',제조업소명:'제조 A',제조업소등록번호:'MAKER-A',신청인전화:'0211112222',대행업체사업자번호:'2222222222',선적일:'2026-10-01',선기명:'OLD SHIP',수입신고참고사항:'old',HSK:'1234567890'});j.items=[{품목ID:'P1',제품명:'PRODUCT',한글명:'제품',수량단위:'EA',수량:'10',순중량kg:'20',금액USD:'30',HBL:'OLDHBL',MBL:'OLDMBL',화물관리번호:'26TESTCARGO00010001',조회연도:'2026',제조일자:'2026-09-01',소비기한:'2027-09-01'}];j.labels=[{표시사항코드:'101',명칭:'제품명',내용:'제품',출처:'spec'},{표시사항코드:'108',명칭:'제조일자',내용:'2026-09-01',출처:'spec'},{표시사항코드:'109',명칭:'소비기한',내용:'2027-09-01',출처:'spec'},{표시사항코드:'119',명칭:'기타',내용:'2026-10-01 생산',출처:'spec'}];return j;};
test('library persists fixed information while a new shipment has no dates, cargo, prices or photos',()=>{
 const j=prepared(),{library,ref}=upsertJob(emptyLibrary(),j),next=useProduct(library,ref.productId,'new');
 assert.equal(next.basic.신청인전화,j.basic.신청인전화);assert.equal(next.basic.화주휴대폰,j.basic.화주휴대폰);assert.equal(next.basic.선적일,'');assert.equal(next.basic.선기명,'');assert.equal(next.items[0].HBL,undefined);assert.equal(next.items[0].수량,undefined);assert.equal(next.items[0].소비기한,undefined);assert.notEqual(next.id,j.id);assert.equal(next.labels[0].내용,'제품');assert.equal(next.labels[1].내용,'');assert.equal(next.labels[3].내용,'');assert.equal(library.products[0].previous[0].수량,'10');
 next.labels[0].내용='changed';assert.equal(library.products[0].labels[0].내용,'제품');
});
test('different importer and manufacturer stay separate; stale edits cannot overwrite a newer product',()=>{
 const j=prepared();let {library,ref}=upsertJob(emptyLibrary(),j);j.library=ref;const second=upsertJob(library,j);assert.throws(()=>upsertJob(second.library,j),/다른 창/);
 const other=prepared();other.basic.수입화주사업자번호='3333333333';other.basic.제조업소등록번호='MAKER-B';library=upsertJob(second.library,other).library;assert.equal(library.products.length,2);assert.equal(library.owners.length,2);other.library=ref;assert.throws(()=>upsertJob(library,other),/다른 화주/);
});
test('label dates follow new shipment and divergent multi-item dates demand explicit content',()=>{
 const {library,ref}=upsertJob(emptyLibrary(),prepared()),j=useProduct(library,ref.productId,'new');Object.assign(j.items[0],{제조일자:'2026-11-01',소비기한:'2027-11-01'});applyLabelDates(j);assert.equal(j.labels[1].내용,'2026-11-01');assert.equal(j.labels[2].내용,'2027-11-01');
 j.items.push({...j.items[0],소비기한:'2028-01-01'});applyLabelDates(j);assert.equal(j.labels[2].내용,'');
});
test('backup roundtrip keeps profile links, drops previous preparation values and rejects bad shape',()=>{
 const {library}=upsertJob(emptyLibrary(),prepared());const parsed=parseLibrary(JSON.stringify({format:'vision-intake-library',library}));assert.equal(parsed.products[0].ownerId,parsed.owners[0].id);assert.deepEqual(parsed.products[0].previous,[]);assert.equal(parsed.products[0].labels[1].내용,'');
 const invalid=structuredClone(library);invalid.products[0].ownerId='missing';assert.throws(()=>parseLibrary(JSON.stringify({format:'vision-intake-library',library:invalid})),/제품 정보/);
});
