// Stable business keys; never use the current array index as a parent row ID.
export function ingredientPlan(rows){
 const byId=new Map(rows.map(r=>[r.성분ID,r]));
 if(byId.size!==rows.length)throw Error('성분ID 중복');
 const seen=new Set(),active=new Set(),result=[];
 function visit(r){if(seen.has(r.성분ID))return;if(active.has(r.성분ID))throw Error('성분 상하위 연결이 순환합니다.');active.add(r.성분ID);
  if(r.상위성분ID){const parent=byId.get(r.상위성분ID);if(!parent)throw Error('상위 성분이 없습니다: '+r.상위성분ID);visit(parent);}
  active.delete(r.성분ID);seen.add(r.성분ID);result.push(r);
 }
 rows.forEach(visit);return result;
}
export const GENERAL_CHOICES=['무포장여부','유전자변형식품 표시 여부','유기식품등 여부','할랄인증 식품 등 해당 여부','식품조사처리 여부','주문자상표부착방식 식품 여부','고열량저영양 식품 해당 여부','영유아를 섭취대상으로 표시하여 판매하는 식품 해당 여부','서류검사 또는 현장검사 생략 대상 여부','고령친화식품 여부','기능성표시일반식품 여부','세트포장 여부','포장재 연장 승인 대상 여부','대체식품으로 표시하여 판매하는 식품 여부'];
export function representativeItem(items){
 const chosen=items.map((r,i)=>r.대표품목==='예'?i:-1).filter(i=>i>=0);
 if(chosen.length>1)throw Error('대표품목은 한 건만 지정해주세요.');
 if(chosen.length===1)return chosen[0];if(items.length===1)return 0;
 const dates=items.map(r=>r.제조일자);if(dates.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d||'')))throw Error('여러 품목은 제조일자를 입력하거나 대표품목 한 건을 지정해주세요.');
 return dates.indexOf([...dates].sort()[0]);
}
export const businessSignature=job=>JSON.stringify({basic:job.basic,items:job.items,types:job.types,labels:job.labels,processes:job.processes,ingredients:job.ingredients});
