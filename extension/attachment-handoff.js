// Same-device, one-use transfer between the preparation and input pages.
const database='visionAttachmentHandoffV1',ttl=15*60*1000;
export function validateAttachments(entries){
 if(!Array.isArray(entries)||entries.length>11)throw Error('첨부 파일 구성을 확인해주세요.');
 const slots=new Set();
 for(const e of entries){
  if(!e||!Number.isInteger(e.slot)||!(e.slot===0||e.slot>=9&&e.slot<=18)||slots.has(e.slot)||!(e.file instanceof File)||!e.file.size||e.file.size>5000000||! /\.(png|jpe?g|bmp|gif|tiff?|pdf)$/i.test(e.file.name))throw Error('첨부 파일 형식·개수·크기를 확인해주세요.');
  slots.add(e.slot);
 }
 const extra=entries.filter(e=>e.slot>=10).map(e=>e.slot).sort((a,b)=>a-b);
 if(extra.some((slot,i)=>slot!==10+i))throw Error('기타 첨부 순서를 확인해주세요.');
}
function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open(database,1);r.onupgradeneeded=()=>r.result.createObjectStore('transfers',{keyPath:'token'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('첨부 파일 연결을 준비하지 못했습니다.'));});}
const bindingKey=b=>{if(!Number.isInteger(b.appTab)||!Number.isInteger(b.targetTab)||b.appTab<=0||b.targetTab<=0||!b.jobKey)throw Error('첨부할 작업을 확인해주세요.');return JSON.stringify([b.appTab,b.targetTab,b.jobKey]);};
export async function putAttachments(entries,binding){
 validateAttachments(entries);const key=bindingKey(binding),db=await open(),token=crypto.randomUUID();
 try{await new Promise((resolve,reject)=>{const tx=db.transaction('transfers','readwrite'),store=tx.objectStore('transfers');
  const cursor=store.openCursor();cursor.onsuccess=()=>{const c=cursor.result;if(c){if(c.value.expires<Date.now()||c.value.appTab===binding.appTab)c.delete();c.continue();}};
  // Queue insertion after cleanup so the new transfer cannot be purged by that cursor.
  cursor.addEventListener('success',()=>{if(!cursor.result)store.put({token,key,appTab:binding.appTab,expires:Date.now()+ttl,entries});});
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('첨부 준비가 취소됐습니다.'));
 });return token;}finally{db.close();}
}
export async function takeAttachments(token,binding){
 const key=bindingKey(binding);if(!/^[a-f0-9-]{36}$/.test(token||''))throw Error('첨부 연결 정보가 없습니다.');
 const db=await open();let entries,error;
 try{await new Promise((resolve,reject)=>{const tx=db.transaction('transfers','readwrite'),store=tx.objectStore('transfers'),r=store.get(token);
  r.onsuccess=()=>{const row=r.result;if(!row){error='첨부 준비 정보가 없거나 이미 사용했습니다.';return;}if(row.expires<Date.now()){store.delete(token);error='첨부 준비 시간이 지났습니다. 파일을 다시 선택해주세요.';return;}if(row.key!==key){error='첨부를 준비한 작업과 현재 화면이 다릅니다.';return;}entries=row.entries;store.delete(token);};
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('첨부 연결이 취소됐습니다.'));
 });if(error)throw Error(error);validateAttachments(entries);return entries;}finally{db.close();}
}
