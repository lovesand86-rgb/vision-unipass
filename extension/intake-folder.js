import {OWNER,COMPANY,companyDefaults,makeOwner,makeProduct} from './intake-library.js';
export const WORKBOOK_NAME='비전-신고자료.xlsx';
const number=v=>String(v||'').replace(/[\s-]/g,'');
export function folderWorkbook(files){
 const books=files.filter(f=>/\.xlsx$/i.test(f.name)&&!f.name.startsWith('~$'));
 const designated=books.filter(f=>f.name.normalize('NFC')===WORKBOOK_NAME);
 return {books,file:designated.length===1?designated[0]:null,ambiguous:designated.length>1};
}
export function prepareImportedJob(job,library){
 const defaults=companyDefaults(library.company);
 const owner=library.owners.find(o=>o.id===number(job.basic.수입화주사업자번호));
 for(const k of OWNER)if(!job.basic[k]&&owner?.basic[k])job.basic[k]=owner.basic[k];
 for(const k of COMPANY)if(!job.basic[k]&&defaults[k])job.basic[k]=defaults[k];
 for(const k of ['수입화주사업자번호','대행업체사업자번호'])job.basic[k]=number(job.basic[k]);
 for(const r of job.items)if(!r.조회연도&&/^\d{2}[A-Z0-9]{9}\d{8}$/.test(r.화물관리번호||''))r.조회연도='20'+r.화물관리번호.slice(0,2);
 for(const r of job.labels)if(['108','109','110'].includes(r.표시사항코드)&&r.내용)r.reuse='manual';
 return job;
}
// Remember identified parties without requiring a separate registration step.
// Do not overwrite an existing curated recipe with a sparse shipment workbook.
export function rememberImportedJob(library,job){
 const next=structuredClone(library);let owner;
 try{owner=makeOwner(job.basic);}catch{return {library:next};}
 const old=next.owners.find(o=>o.id===owner.id);
 if(!old)next.owners.push(owner);else for(const k of OWNER)if(!old.basic[k])old.basic[k]=owner.basic[k];
 const matches=next.products.filter(p=>p.ownerId===owner.id&&p.basic.제조업소등록번호===job.basic.제조업소등록번호&&p.items.length===job.items.length&&p.items.every((r,i)=>['제품명','한글명','수량단위'].every(k=>r[k]===job.items[i][k])));
 if(matches.length>1)return {library:next};
 let product=matches[0];
 if(!product){try{product=makeProduct(job,owner.id);next.products.push(product);}catch{return {library:next};}}
 return {library:next,ref:{ownerId:owner.id,productId:product.id,revision:product.revision}};
}
