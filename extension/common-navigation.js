// Only opens the observed common tab of the already verified declaration.
export function openCommonTab(request) {
  try {
    const fail=m=>{throw Error(m);}, pre='CSW0101001S_';
    const norm=v=>String(v??'').replace(/[\s-]/g,'').toUpperCase();
    const one=k=>{const a=document.querySelectorAll('#'+pre+k);if(a.length!==1)fail('공통사항 구조를 확인하지 못했습니다: '+k);return a[0];};
    const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
    if(location.origin!=='https://unipass.customs.go.kr'||location.pathname!=='/csp/index.do')fail('현재 신고서 작성 화면이 아닙니다.');
    const app=['reqRqstNo1','reqRqstNo2','reqRqstNo3'].map(k=>one(k).value.trim());
    if(JSON.stringify(app)!==JSON.stringify(request.application_ref))fail('품목 확인 이후 신청번호가 달라졌습니다.');
    const id=request.identity;
    for(const [key,field] of [['importer_id','impOwrBrno'],['manufacturer_id','mnfcCoPermDclrNo'],['bl','blNoCn']]){
      if(!id?.[key]||norm(one(field).value)!==norm(id[key]))fail('공통사항 이동 대상이 다릅니다: '+key);
    }
    const table=one('prlstTbl'), radios=table.querySelectorAll('input[name="CSW0101001S_prlstSlct"]');
    if(radios.length!==1)fail('공통사항 이동 전 단일 품목을 확인해야 합니다.');
    const row=radios[0].closest('tr'), value=c=>c?.querySelector('input[readonly]')?.value??c?.textContent??'';
    if(norm(value(row.cells[1]))!==norm(id.cargo_mt_no)||norm(value(row.nextElementSibling?.cells[0]))!==norm(id.product_name))fail('품목 목록의 제품 또는 화물번호가 바뀌었습니다.');
    if(visible(one('inscBrngDt')))return {status:'common_open'};
    const candidates=[1,2,3,4].flatMap(n=>[...document.querySelectorAll('#'+pre+'comnTab'+n)])
      .filter(e=>visible(e)&&e.tagName==='A'&&norm(e.textContent)==='공통사항');
    if(candidates.length!==1)fail('공통사항 탭을 하나로 확인하지 못했습니다.');
    candidates[0].click();
    return {status:'common_opening'};
  }catch(error){return {status:'blocked',reason:error.message};}
}
