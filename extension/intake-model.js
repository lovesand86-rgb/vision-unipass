export const TABLES={
 기본정보:['항목','값','출처'],
 품목:['품목ID','제품명','한글명','수량','수량단위','순중량kg','금액USD','소비기한','화물관리번호','HBL','MBL','조회연도','출처'],
 제품유형:['제품유형코드','제품유형명'],
 표시사항:['표시사항코드','명칭','내용','출처'],
 제조공정:['순서','공정코드','공정명'],
 성분:['성분ID','상위성분ID','구분','성분코드','성분명','배합비율','비율기준','출처']
};
export const BASIC=['작업명','신고제품구분','신고기관','수입화주사업자번호','수입화주명','화주허가번호','화주휴대폰','제조업소등록번호','제조업소명','보관창고코드','검사기관코드','대행업체사업자번호','대행업체허가번호','신청인전화','신청인휴대폰','용도','생산국','수출국','선적일','반입일','국내도착항','선적항','선기명','HSK','수량단위','제품상태','무포장여부','유전자변형식품 표시 여부','유기식품등 여부','할랄인증 식품 등 해당 여부','식품조사처리 여부','주문자상표부착방식 식품 여부','고열량저영양 식품 해당 여부','영유아를 섭취대상으로 표시하여 판매하는 식품 해당 여부','서류검사 또는 현장검사 생략 대상 여부','고령친화식품 여부','기능성표시일반식품 여부','세트포장 여부','구성제품 수량','포장재 연장 승인 대상 여부','대체식품으로 표시하여 판매하는 식품 여부','수입신고 참고사항'];
export function blankJob(kind='history'){return {schema:2,id:crypto.randomUUID(),kind,basic:Object.fromEntries(BASIC.map(k=>[k,''])),items:[{품목ID:'P1'}],types:[],labels:[],processes:[],ingredients:[],sources:{}};}
const maps={품목:'items',제품유형:'types',표시사항:'labels',제조공정:'processes',성분:'ingredients'};
export function fromTables(tables,kind='history'){
 const job=blankJob(kind);
 for(const [name,headers] of Object.entries(TABLES)){
  const rows=tables[name];if(!rows){if(['기본정보','품목'].includes(name))throw Error(name+' 시트가 없습니다.');continue;}
  if(headers.some((h,i)=>rows[0]?.[i]!==h)||rows[0].length!==headers.length)throw Error(name+' 열 이름이 전용 양식과 다릅니다.');
  const records=rows.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map(r=>Object.fromEntries(headers.map((h,i)=>[h,String(r[i]??'').trim()])));
  if(records.length>300)throw Error(name+'은 최대 300행입니다.');
  if(name==='기본정보'){
   const seen=new Set();for(const r of records){if(!BASIC.includes(r.항목)||seen.has(r.항목))throw Error('기본정보 항목이 없거나 중복됨: '+r.항목);seen.add(r.항목);job.basic[r.항목]=r.값;job.sources[r.항목]=r.출처;}
  }else job[maps[name]]=records;
 }
 return job;
}
export const decimal=v=>/^\d+(\.\d+)?$/.test(String(v).replace(/,/g,''))?Number(String(v).replace(/,/g,'')):NaN;
export function validateIntake(job,{execution=false}={}){
 const errors=[];const require=(v,label)=>{if(!String(v??'').trim()||/확인\s*필요/.test(v))errors.push(label+'을 입력해주세요.');};
 if(!job||job.schema!==2||!['history','new'].includes(job.kind))return ['작업 형식이 다릅니다.'];
 if(!job.items?.length||job.items.length>300)return ['품목은 1~300개여야 합니다.'];
 if(execution)for(const k of ['선적일','수입화주사업자번호','수입화주명','제조업소등록번호','제조업소명'])require(job.basic[k],k);
 if(execution&&job.kind==='new')for(const k of ['신고제품구분','신고기관','대행업체사업자번호','대행업체허가번호','화주허가번호','보관창고코드','신청인전화','신청인휴대폰','화주휴대폰','용도','생산국','수출국','선적일'])require(job.basic[k],k);
 if(execution&&job.kind==='new'&&job.basic.신고제품구분!=='가공식품')errors.push('신규 자동 입력 1차 버전은 가공식품을 지원합니다.');
 if(new Set(job.items.map(r=>r.HBL).filter(Boolean)).size>1)errors.push('한 작업에는 같은 H B/L의 품목만 넣어주세요.');
 const ids=new Set();for(const [i,r]of job.items.entries()){
  if(!r.품목ID||ids.has(r.품목ID))errors.push(`${i+1}번 품목ID가 없거나 중복됩니다.`);ids.add(r.품목ID);
  if(execution)for(const k of ['제품명','한글명','수량','수량단위','순중량kg','금액USD','소비기한','화물관리번호','HBL','MBL','조회연도'])require(r[k],`${i+1}번 ${k}`);
  for(const k of ['수량','순중량kg','금액USD'])if(r[k]&&!(decimal(r[k])>0))errors.push(`${i+1}번 ${k}: 0보다 큰 숫자가 필요합니다.`);
  if(r.화물관리번호&&!/^\d{2}[A-Z0-9]{9}\d{8}$/.test(r.화물관리번호))errors.push(`${i+1}번 화물관리번호 형식을 확인하세요.`);
  if(r.소비기한&&(!/^\d{4}-\d{2}-\d{2}$/.test(r.소비기한)||isNaN(Date.parse(r.소비기한))||new Date(r.소비기한).toISOString().slice(0,10)!==r.소비기한))errors.push(`${i+1}번 소비기한은 YYYY-MM-DD로 입력하세요.`);
 }
 const seen=new Map();for(const r of job.ingredients){
  if(!r.성분ID||seen.has(r.성분ID))errors.push('성분ID가 없거나 중복됩니다.');
  if(r.상위성분ID&&!seen.has(r.상위성분ID))errors.push(r.성분명+': 상위 성분을 먼저 적어주세요.');
  if(!['주','부','혼합','부혼합'].includes(r.구분))errors.push(r.성분명+': 성분 구분을 확인하세요.');
  if(['부','부혼합'].includes(r.구분)!==!!r.상위성분ID)errors.push(r.성분명+': 주·부성분 연결이 다릅니다.');
  if(!['제품','상위성분'].includes(r.비율기준))errors.push(r.성분명+': 비율기준을 지정해주세요.');
  if(!r.상위성분ID&&r.비율기준!=='제품')errors.push(r.성분명+': 주성분은 제품 기준입니다.');
  if(r.배합비율!==''&&(!Number.isFinite(decimal(r.배합비율))||decimal(r.배합비율)<0||decimal(r.배합비율)>100))errors.push(r.성분명+': 배합비율을 확인하세요.');
  if(execution){require(r.성분코드,'성분코드');require(r.배합비율,r.성분명+' 배합비율');require(r.출처,r.성분명+' 출처');}
  seen.set(r.성분ID,r);
 }
 // Never sum children with their parents or infer a missing percentage.
 const totals=new Map();for(const r of job.ingredients)if(r.배합비율!==''&&Number.isFinite(decimal(r.배합비율))){const key=r.상위성분ID+'|'+r.비율기준;totals.set(key,(totals.get(key)||0)+decimal(r.배합비율));}
 for(const [group,total]of totals)if(total>100.00001)errors.push('성분 배합비 합계가 100%를 넘습니다: '+group);
 for(const r of job.processes)if(!/^\d+$/.test(r.순서)||!r.공정코드)errors.push('제조공정 순서·코드를 확인하세요.');
 if(new Set(job.processes.map(r=>r.순서)).size!==job.processes.length)errors.push('제조공정 순서가 중복됩니다.');
 if(execution&&job.kind==='new'&&(!job.ingredients.length||!job.processes.length||!job.labels.length||!job.types.length))errors.push('신규의 제품유형·표시사항·제조공정·성분 자료가 필요합니다.');
 return [...new Set(errors)];
}
export function searchPeriods(now=new Date()){
 const end=new Date(Date.UTC(now.getFullYear(),now.getMonth(),now.getDate()));
 const iso=d=>d.toISOString().slice(0,10);
 return [3,12,36].map(months=>{const start=new Date(end);start.setUTCDate(1);start.setUTCMonth(start.getUTCMonth()-months);const days=new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).getUTCDate();start.setUTCDate(Math.min(end.getUTCDate(),days));return {from:iso(start),to:iso(end)};});
}
export function applyPrevious(item,previous,keys=['수량','순중량kg','금액USD']){
 if(previous.product!==item.제품명||previous.currency!=='USD'||previous.unit!==item.수량단위)throw Error('이전 실적의 제품·수량 단위·통화가 다릅니다.');
 const next={...item};for(const k of keys){if(!['수량','순중량kg','금액USD'].includes(k)||!(decimal(previous[k])>0))throw Error('이전 값이 확인되지 않았습니다.');next[k]=String(previous[k]);}return next;
}
export function compileTargets(job,source,period){
 const problems=validateIntake(job,{execution:true});if(problems.length)throw Error(problems.join('\n'));
 if(job.items.length!==1)throw Error('실적 복사 자동 입력은 현재 단일 품목을 지원합니다. 여러 품목은 신규 입력을 이용하세요.');
 const b=job.basic,r=job.items[0],identity={product_name:r.제품명,importer_name:b.수입화주명,importer_id:b.수입화주사업자번호,manufacturer_name:b.제조업소명,manufacturer_id:b.제조업소등록번호};
 const linked={product_name:r.제품명,importer_id:identity.importer_id,manufacturer_id:identity.manufacturer_id,bl:r.HBL,cargo_mt_no:r.화물관리번호};
 const field=(value)=>({value:String(value).replace(/,/g,''),reviewed:true,source:r.출처||'이번 건 준비 화면'});
 return {searchTarget:{format:'vision-unipass-search-copy',version:1,identity,source_application:source,search:{...period,product_term:r.제품명,importer_term:b.수입화주명}},cargoTarget:{format:'vision-unipass-cargo-job',version:1,identity,cargo:{hbl:r.HBL,mbl:r.MBL,year:r.조회연도,cargo_mt_no:r.화물관리번호}},itemTarget:{format:'vision-unipass-item-commit',version:1,identity:linked,fields:{cartons:field(r.수량),net_kg:field(r.순중량kg),amount_usd:field(r.금액USD),expiry_date:field(r.소비기한)}},commonTarget:{contact:{phone:b.신청인전화,mobile:b.신청인휴대폰,confirmed:true},format:'vision-unipass-fill-job',version:1,phase:'common',identity:linked,fields:{shipment_date:field(b.선적일)}},followupTarget:{enabled:true,...(b.제품상태?{product_states:{confirmed:true,states:b.제품상태.split('|').map(x=>x.trim())}}:{})}};
}
