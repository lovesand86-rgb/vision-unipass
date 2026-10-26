// Observed form fields only: agency/product state writes and full label readback.
export async function followupStep(request) {
  try {
    const fail=m=>{throw Error(m);},pre='CSW0101001S_';
    const norm=v=>String(v??'').replace(/[\s-]/g,'').toUpperCase();
    const one=k=>{const a=document.querySelectorAll('#'+pre+k);if(a.length!==1)fail(a.length?'추가 확인 입력칸이 여러 개입니다: '+k+' ('+a.length+'개)':'원래 신고서에서 추가 확인 입력칸을 찾지 못했습니다: '+k);return a[0];};
    const value=k=>String(one(k).value??'').trim();
    const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
    const names=['통조림','병조림','레토르트식품','분말제품','액상제품','냉동식품(가열하여 섭취)','냉동식품(가열하지 않고 섭취)','살균제품','멸균제품','건조제품','유탕유처리 제품','캡슐제품','정제제품','더 이상 가공 가열 조리하지 않고 그대로 섭취하는 제품','해당사항 없음'];
    const identity=()=>{
      if(location.origin!=='https://unipass.customs.go.kr'||location.pathname!=='/csp/index.do')fail('신고서 작성 화면이 아닙니다.');
      const expected=request.binding;
      if(!expected?.identity||!Array.isArray(expected.application_ref)||expected.application_ref.length!==3)fail('추가 확인 대상이 없습니다.');
      if(['reqRqstNo1','reqRqstNo2','reqRqstNo3'].some((k,i)=>value(k)!==expected.application_ref[i]))fail('추가 확인 중 신청번호가 바뀌었습니다.');
      for(const [k,s]of [['importer_id','impOwrBrno'],['manufacturer_id','mnfcCoPermDclrNo'],['bl','blNoCn']])if(!expected.identity[k]||norm(value(s))!==norm(expected.identity[k]))fail('추가 확인 신고 대상이 다릅니다: '+k);
      const table=one('prlstTbl'), radios=table.querySelectorAll('input[name="CSW0101001S_prlstSlct"]');
      const cell=c=>c?.querySelector('input[readonly]')?.value??c?.textContent??'';
      if(radios.length!==1)fail('단일 품목을 확인해야 합니다.');
      const row=radios[0].closest('tr');
      if(norm(cell(row.cells[1]))!==norm(expected.identity.cargo_mt_no)||norm(cell(row.nextElementSibling?.cells[0]))!==norm(expected.identity.product_name))fail('품목 목록의 제품·화물번호가 바뀌었습니다.');
      if(value('inscBrngFdmcSfkpWrhsCd')!==expected.context?.inscBrngFdmcSfkpWrhsCd)fail('보관창고코드가 바뀌었습니다.');
      for(const k of ['reqRqstNo1','aplcNm','aplcEml1','aplcEml2'])if(value(k)!==expected.context?.[k])fail('추가 확인 중 신청인이 바뀌었습니다.');
    };
    if(request.action==='diagnostics'){
      if(location.origin!=='https://unipass.customs.go.kr'||location.pathname!=='/csp/index.do')fail('진단 대상이 신고서 작성 화면이 아닙니다.');
      const fields={};
      for(const k of ['reqRqstNo1','reqRqstNo2','reqRqstNo3','prlstTbl','inscBrngFdmcSfkpWrhsCd','btnInscBrngFdmcSfkpWrhsCd','dclrFdmcIttCd','koreIndcMatrTbl','attachTbl']){
        const nodes=[...document.querySelectorAll('#'+pre+k)];fields[k]={total:nodes.length,visible:nodes.filter(visible).length};
      }
      return {status:'diagnostics',pathname:location.pathname,fields,iframe_count:document.querySelectorAll('iframe').length};
    }
    identity();
    const protectedValues=()=>JSON.stringify(['mnfcProgTbl','mnigTbl'].map(k=>{const t=one(k);return [t.innerHTML,[...t.querySelectorAll('input,textarea,select')].map(n=>[n.value,n.checked??null])];}));
    const states=()=>names.map((label,i)=>{const n=one('mnfuSttsNm'+(i+1));if(n.type!=='checkbox')fail('제품상태 구조가 다릅니다.');return {label,checked:n.checked};});
    const agency=one('dclrFdmcIttCd');
    if(!(agency instanceof HTMLSelectElement))fail('신고기관 선택칸을 확인하지 못했습니다.');
    const label=n=>String(n?.textContent??'').trim();
    const options=()=>[...agency.options].filter(o=>o.value&&!o.disabled).map(o=>label(o));
    const current=()=>({warehouse_code:value('inscBrngFdmcSfkpWrhsCd'),warehouse_name:value('inscBrngPlcNm'),agency:label(agency.selectedOptions[0]),agencies:options(),states:states()});
    if(request.action==='read')return {status:'read',details:current()};
    if(request.action==='open_warehouse'){
      const button=one('btnInscBrngFdmcSfkpWrhsCd');
      if(!visible(button)||button.disabled||button.textContent.replace(/\s/g,'')!=='검색')fail('보관창고 조회 버튼을 확인하지 못했습니다.');
      if(typeof request.open_token!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(request.open_token))fail('창고 조회 작업 식별자가 없습니다.');
      button.dataset.visionWarehouseLookup=request.open_token;
      button.click();return {status:'opened'};
    }
    if(request.action==='label')fail('한글표시 자동 대조는 사용하지 않습니다. 사람이 직접 확인·수정해 주세요.');
    if(request.action!=='apply')fail('지원하지 않는 추가 확인 동작입니다.');
    const config=request.config;
    if(config?.confirmed!==true)fail('신고기관·제품상태 기준 확인이 필요합니다.');
    const stable=v=>Array.isArray(v)?v.map(stable):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,stable(v[k])])):v;
    const before=current();
    if(JSON.stringify(stable(before))!==JSON.stringify(stable(request.before)))fail('대조 이후 신고기관 또는 제품상태가 바뀌었습니다.');
    let option=null;
    if(config.agency){
      if(config.warehouse_code!==before.warehouse_code)fail('신고기관 기준의 창고코드가 다릅니다.');
      const found=[...agency.options].filter(o=>o.value&&!o.disabled&&label(o)===config.agency);
      if(found.length!==1||!visible(agency)||agency.disabled)fail('확인된 신고기관을 하나로 선택하지 못했습니다.');option=found[0];
    }
    if(config.states!==undefined){
      if(!Array.isArray(config.states)||!config.states.length||new Set(config.states).size!==config.states.length||config.states.some(s=>!names.includes(s)))fail('제품상태 선택값이 올바르지 않습니다.');
      if(config.states.includes('해당사항 없음')&&config.states.length!==1)fail('해당사항 없음과 다른 제품상태를 동시에 선택할 수 없습니다.');
      for(let i=0;i<15;i++){const n=one('mnfuSttsNm'+(i+1));if(!visible(n)||n.disabled)fail('제품상태 입력칸이 편집 가능하지 않습니다.');}
    }
    const protectedBefore=protectedValues(), commonBefore=['shpmDt','inscBrngDt','aplcTelno','aplcCralTelno'].map(k=>[k,value(k)]);
    const guard=()=>{identity();if(protectedValues()!==protectedBefore)fail('제조공정·성분 정보가 바뀌었습니다.');if(commonBefore.some(([k,v])=>value(k)!==v))fail('신고기관·제품상태 선택 중 날짜 또는 연락처가 바뀌었습니다.');};
    if(option&&agency.value!==option.value){agency.value=option.value;agency.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,200));guard();if(agency.value!==option.value)fail('신고기관 값이 유지되지 않습니다.');}
    if(config.states){
      // Uncheck unwanted states before checking new ones, including 'none'.
      for(const desired of [false,true])for(let i=0;i<15;i++){
        const n=one('mnfuSttsNm'+(i+1)), want=config.states.includes(names[i]);
        if(want===desired&&n.checked!==want){guard();n.click();await new Promise(r=>setTimeout(r,40));}
      }
      if(states().some(s=>s.checked!==config.states.includes(s.label)))fail('제품상태 선택 결과가 기준과 다릅니다.');
    }
    guard();return {status:'applied',details:current()};
  }catch(error){return {status:'blocked',reason:error.message};}
}
