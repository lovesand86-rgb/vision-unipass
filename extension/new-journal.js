// Persist intent before mutation; on a lost response reconcile, never replay it.
export function createJournal({state,persist,log}){
 state.steps??={};
 return async function step(key,read,write,{idempotent=false}={}){
  let record=state.steps[key];
  const current=await read(record);
  if(current?.done){state.steps[key]={status:'done',proof:current.proof??null};await persist();return current;}
  if(record?.status==='done')throw Error(key+'의 확인된 결과가 변경됐습니다. 입력 결과를 다시 확인해주세요.');
  if(record?.status==='pending'&&!idempotent)throw Error(key+' 결과를 아직 확인하지 못했습니다. 같은 버튼을 다시 누르지 않았습니다.');
  log(key);record=state.steps[key]={status:'pending',before:current?.proof??null,at:Date.now()};await persist();
  await write(current);
  const result=await read(record,true);if(!result?.done)throw Error(key+' 반영 결과를 확인하지 못했습니다.');
  state.steps[key]={status:'done',proof:result.proof??null};await persist();return result;
 };
}
