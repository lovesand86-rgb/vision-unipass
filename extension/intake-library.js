import {BASIC,TABLES,blankJob,decimal} from './intake-model.js';
export const LIBRARY_KEY='visionIntakeLibraryV1';
export const COMPANY=['대행업체사업자번호','대행업체허가번호','신청인전화','신청인휴대폰','화주휴대폰'];
export const OWNER=['수입화주명','수입화주사업자번호','화주허가번호','화주휴대폰','신고기관','보관창고코드','검사기관코드'];
export const SHIPMENT=['작업명','선적일','반입일','국내도착항','선적항','선기명','수입신고 참고사항'];
export const CARGO=['HBL','MBL','화물관리번호','조회연도'];
export const AMOUNTS=['수량','순중량kg','금액USD'];
const FIXED=BASIC.filter(k=>!COMPANY.includes(k)&&!OWNER.includes(k)&&!SHIPMENT.includes(k));
const copy=v=>structuredClone(v),pick=(o,ks)=>Object.fromEntries(ks.map(k=>[k,String(o?.[k]??'')]));
const business=v=>String(v||'').replace(/[\s-]/g,'');
export const emptyLibrary=()=>({schema:1,company:{},owners:[],products:[]});
export function labelRule(row){
 if(['fixed','manual','manufactured','expiry'].includes(row.reuse))return row.reuse;
 if(row.표시사항코드==='108')return 'manufactured';if(row.표시사항코드==='109')return 'expiry';
 return row.표시사항코드==='110'||/(?:20\d{2}[-./년]\s*\d{1,2})|제조일|소비기한|생산연도/.test(row.내용||'')?'manual':'fixed';
}
export function makeOwner(b){
 if(!b.수입화주명?.trim()||!/^\d{10}$/.test(business(b.수입화주사업자번호)))throw Error('화주명과 사업자번호 10자리를 입력해주세요.');
 return {id:business(b.수입화주사업자번호),basic:pick(b,OWNER),at:Date.now()};
}
export function makeProduct(job,ownerId,existing){
 if(!job.basic.제조업소등록번호?.trim()||!job.basic.제조업소명?.trim())throw Error('제조업소명과 등록번호를 제품 등록정보에 넣어주세요.');
 if(!job.items.length||job.items.some(r=>!r.제품명?.trim()||!r.한글명?.trim()||!r.수량단위?.trim()))throw Error('제품명·한글명·수량단위를 제품 등록정보에 넣어주세요.');
 const p={id:existing?.id||crypto.randomUUID(),ownerId,revision:(existing?.revision||0)+1,at:Date.now(),basic:pick(job.basic,FIXED),items:job.items.map(r=>pick(r,['제품명','한글명','수량단위'])),types:copy(job.types),processes:copy(job.processes),ingredients:copy(job.ingredients),labels:job.labels.map(r=>({...pick(r,TABLES.표시사항),reuse:labelRule(r),내용:labelRule(r)==='fixed'?r.내용:''})),previous:[]};
 p.previous=job.items.map(r=>AMOUNTS.every(k=>decimal(r[k])>0)?{...pick(r,AMOUNTS),product:r.제품명,unit:r.수량단위,currency:'USD',at:Date.now()}:null);
 return p;
}
export function useProduct(library,id,kind='history'){
 const p=library.products.find(p=>p.id===id),owner=library.owners.find(o=>o.id===p?.ownerId);if(!p||!owner)throw Error('저장된 화주·제품을 찾지 못했습니다.');
 const job=blankJob(kind);Object.assign(job.basic,library.company,Object.fromEntries(Object.entries(owner.basic).filter(([,v])=>v!=='')),p.basic);
 job.items=p.items.map((r,i)=>({...copy(r),품목ID:'P'+(i+1)}));for(const key of ['types','labels','processes','ingredients'])job[key]=copy(p[key]);
 job.library={ownerId:owner.id,productId:p.id,revision:p.revision};return job;
}
export function applyLabelDates(job){
 for(const r of job.labels){const rule=labelRule(r);if(!['manufactured','expiry'].includes(rule))continue;
 const key=rule==='manufactured'?'제조일자':'소비기한',values=[...new Set(job.items.map(i=>i[key]||''))];r.내용=values.length===1?values[0]:'';
 }return job;
}
export function upsertJob(library,job){
 const next=copy(library);for(const k of COMPANY.filter(k=>k!=='화주휴대폰'))if(!next.company[k]&&job.basic[k])next.company[k]=job.basic[k];const owner=makeOwner(job.basic),ownerIndex=next.owners.findIndex(o=>o.id===owner.id);
 if(ownerIndex<0)next.owners.push(owner);else next.owners[ownerIndex]=owner;
 const existing=next.products.find(p=>p.id===job.library?.productId);
 if(existing&&existing.ownerId!==owner.id)throw Error('다른 화주의 제품을 덮어쓸 수 없습니다. 새 제품으로 등록해주세요.');
 if(existing&&existing.revision!==job.library.revision)throw Error('다른 창에서 제품 정보가 바뀌었습니다. 다시 불러온 뒤 수정해주세요.');
 const product=makeProduct(job,owner.id,existing),index=next.products.findIndex(p=>p.id===product.id);
 if(index<0)next.products.push(product);else next.products[index]=product;
 return {library:next,ref:{ownerId:owner.id,productId:product.id,revision:product.revision}};
}
export function parseLibrary(text){
 if(text.length>4000000)throw Error('기본정보 백업은 4MB 이하입니다.');const b=JSON.parse(text),x=b.library;
 if(b.format!=='vision-intake-library'||x?.schema!==1||!Array.isArray(x.owners)||!Array.isArray(x.products)||x.owners.length>500||x.products.length>1000)throw Error('기본정보 백업 형식이 다릅니다.');
 const string=(v)=>typeof v==='string'&&v.length<=12000;
 const object=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).every(k=>keys.includes(k)&&string(o[k]));
 if(!object(x.company,COMPANY))throw Error('회사 기본정보가 올바르지 않습니다.');
 const ownerIds=new Set(),productIds=new Set();
 for(const o of x.owners){if(!object(o.basic,OWNER)||o.id!==business(o.basic.수입화주사업자번호)||!/^\d{10}$/.test(o.id)||ownerIds.has(o.id))throw Error('화주 정보가 올바르지 않습니다.');ownerIds.add(o.id);}
 for(const p of x.products){
  if(!string(p.id)||!p.id||productIds.has(p.id)||!ownerIds.has(p.ownerId)||!Number.isSafeInteger(p.revision)||p.revision<1||!object(p.basic,FIXED)||!Array.isArray(p.items)||!p.items.length||p.items.length>300||p.items.some(i=>!object(i,['제품명','한글명','수량단위'])))throw Error('제품 정보가 올바르지 않습니다.');productIds.add(p.id);
  for(const [key,name]of [['types','제품유형'],['labels','표시사항'],['processes','제조공정'],['ingredients','성분']])if(!Array.isArray(p[key])||p[key].length>300||p[key].some(r=>!object(r,[...TABLES[name],...(key==='labels'?['reuse']:[])])))throw Error('제품 상세자료가 올바르지 않습니다.');
  for(const r of p.labels){r.reuse=labelRule(r);if(r.reuse!=='fixed')r.내용='';}p.previous=[];
 }
 return {schema:1,company:pick(x.company,COMPANY),owners:x.owners.map(o=>({id:o.id,basic:pick(o.basic,OWNER),at:0})),products:x.products.map(p=>({...pickProduct(p),at:0}))};
}
const pickProduct=p=>Object.fromEntries(['id','ownerId','revision','basic','items','types','labels','processes','ingredients','previous'].map(k=>[k,copy(p[k])]));
export async function readLibrary(){const data=await chrome.storage.local.get([LIBRARY_KEY,'visionIntakeDefaultsV1']);return data[LIBRARY_KEY]||{...emptyLibrary(),company:pick(data.visionIntakeDefaultsV1,COMPANY)};}
export async function changeLibrary(fn){return navigator.locks.request(LIBRARY_KEY,async()=>{const old=await readLibrary(),next=await fn(old);await chrome.storage.local.set({[LIBRARY_KEY]:next});return next;});}
