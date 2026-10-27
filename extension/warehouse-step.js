// Read the displayed agency for the exact warehouse. Never select a warehouse
// by name or infer jurisdiction from an address, cargo port, or prior agency.
export async function warehouseStep(request) {
  try {
    const fail=m=>{throw Error(m);},norm=v=>String(v??'').replace(/\s/g,'');
    const b=request.binding,code=b?.context?.inscBrngFdmcSfkpWrhsCd;
    if(location.origin!=='https://unipass.customs.go.kr'||!location.pathname.startsWith('/csp/')||!/^\d{8}$/.test(code))fail('창고 조회 대상이 아닙니다.');
    // This lookup only reads the agency; it never clicks a returned warehouse.
    // A fresh launch marker + observed endpoint + complete opener identity binds
    // read-only queries even when the site's optional return-field hint is absent.
    if(location.pathname!=='/csp/csw/infomt/cdmt/openCSW0302065Q.do')fail('식약보관창고 조회창 경로가 아닙니다: '+location.pathname);
    if(request.action==='probe'&&document.readyState==='loading')return {status:'waiting'};
    const doc=window.opener?.document;
    if(!doc||window.opener.location.origin!==location.origin||window.opener.location.pathname!=='/csp/index.do')fail('창고 조회창의 원래 신고서를 확인하지 못했습니다.');
    const one=k=>{const found=doc.querySelectorAll('#CSW0101001S_'+k);if(found.length!==1)fail('창고 조회 중 원래 신고서 항목을 하나로 확인하지 못했습니다: '+k+' ('+found.length+'개)');return found[0];};
    const value=k=>one(k).value?.trim();
    const compact=v=>String(v??'').replace(/[\s-]/g,'').toUpperCase();
    const guard=()=>{
      if(window.opener?.document!==doc||window.opener.location.pathname!=='/csp/index.do')fail('창고 조회 중 원래 신고서 화면이 교체됐습니다.');
      if(!Array.isArray(b.application_ref)||b.application_ref.length!==3||['reqRqstNo1','reqRqstNo2','reqRqstNo3'].some((k,i)=>value(k)!==b.application_ref[i]))fail('창고 조회 중 원래 신청번호가 바뀌었습니다.');
      for(const [k,field]of [['bl','blNoCn'],['importer_id','impOwrBrno'],['manufacturer_id','mnfcCoPermDclrNo']])if(!b.identity?.[k]||compact(value(field))!==compact(b.identity[k]))fail('창고 조회 중 원래 신고 대상이 바뀌었습니다.');
      for(const k of ['inscBrngFdmcSfkpWrhsCd','aplcNm','aplcEml1','aplcEml2'])if(value(k)!==b.context?.[k])fail('창고 조회 중 보관창고 또는 신청인이 바뀌었습니다.');
      const radios=one('prlstTbl').querySelectorAll('input[name="CSW0101001S_prlstSlct"]');if(radios.length!==1)fail('창고 조회 대상 단일 품목을 확인해야 합니다.');
      const row=radios[0].closest('tr'),cell=c=>c?.querySelector('input[readonly]')?.value??c?.textContent??'';
      if(compact(cell(row.cells[1]))!==compact(b.identity.cargo_mt_no)||compact(cell(row.nextElementSibling?.cells[0]))!==compact(b.identity.product_name))fail('창고 조회 중 제품 또는 화물이 바뀌었습니다.');
      if(typeof request.open_token!=='string'||request.open_token.length<8||one('btnInscBrngFdmcSfkpWrhsCd').dataset.visionWarehouseLookup!==request.open_token)fail('현재 신고서에서 시작한 창고 조회 작업인지 확인하지 못했습니다.');
    };
    guard();
    const mapping=[...document.querySelectorAll('input[type=hidden]')].map(n=>n.value).concat([...new URL(location.href).searchParams.values()]);
    // If an explicit warehouse return target exists, it must name this form.
    // Its absence is not an error for a query whose result is only read.
    const returnTargets=mapping.flatMap(v=>String(v).match(/[A-Za-z0-9]+_inscBrngFdmcSfkpWrhsCd/g)||[]);
    if(returnTargets.some(v=>v!=='CSW0101001S_inscBrngFdmcSfkpWrhsCd'))fail('창고 조회창이 다른 신고서의 보관창고 항목에 연결되어 있습니다.');
    const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
    const field=(allowWait=false)=>{
      const found=[...document.querySelectorAll('input[type=text],input:not([type])')].filter(e=>visible(e)&&!e.disabled&&!e.readOnly&&
        (/wrhs.*cd|sfkp.*cd/i.test(e.id+' '+e.name)||[...e.labels||[]].some(l=>/^(보관)?창고코드$/.test(norm(l.textContent)))));
      if(!found.length&&allowWait)return null;
      if(found.length!==1)fail('창고 조회창의 보관창고코드 입력칸을 하나로 확인하지 못했습니다.');return found[0];
    };
    if(request.action==='probe')return {status:field(true)?'warehouse_ready':'waiting'};
    if(request.action==='search'){
      const input=field(),buttons=[...document.querySelectorAll('button,a,input[type=button]')].filter(e=>visible(e)&&!e.disabled&&norm(e.textContent||e.value)==='조회');
      if(buttons.length!==1)fail('창고 조회 버튼을 하나로 확인하지 못했습니다.');
      if(typeof request.token!=='string'||!request.token)fail('창고 검색 식별자가 없습니다.');
      const previous=window.__visionWarehouseRead;
      if(previous?.token===request.token){if(previous.code!==code||input.value.trim()!==code)fail('창고 조회 조건이 바뀌었습니다.');return {status:'searched'};}
      input.value=code;input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));
      const state={token:request.token,code,changed:false,at:0};
      const observer=new MutationObserver(changes=>{if(changes.some(c=>c.target.nodeType===1?c.target.closest('table')||[...c.addedNodes].some(n=>n.nodeType===1&&(n.matches('table')||n.querySelector('table'))):c.target.parentElement?.closest('table'))){state.changed=true;state.at=Date.now();}});
      window.__visionWarehouseRead?.observer?.disconnect();state.observer=observer;observer.observe(document.body,{subtree:true,childList:true,characterData:true});window.__visionWarehouseRead=state;
      guard();buttons[0].click();guard();return {status:'searched'};
    }
    if(request.action!=='result')fail('지원하지 않는 창고 조회 단계입니다.');
    const state=window.__visionWarehouseRead;
    if(!state||state.token!==request.token||state.code!==code||field().value.trim()!==code)fail('창고 조회 조건이 바뀌었습니다.');
    if(!state.changed||Date.now()-state.at<350)return {status:'waiting'};
    const cell=e=>e.querySelector('input[readonly]')?.value??e.textContent;
    const rows=[...document.querySelectorAll('table tr')].filter(r=>visible(r)&&[...r.cells].some(c=>norm(cell(c))===code));
    if(rows.length!==1)fail('해당 창고코드의 조회 결과를 한 건으로 확인하지 못했습니다.');
    if(!Array.isArray(request.agencies))fail('현재 신고기관 목록이 없습니다.');
    const values=[...rows[0].cells].map(c=>norm(cell(c)));
    const agencies=[...new Set(request.agencies)].filter(a=>a&&values.includes(norm(a)));
    if(agencies.length!==1)fail('창고 조회 결과의 신고기관을 현재 신고기관 목록과 정확히 대조하지 못했습니다.');
    guard();return {status:'matched',warehouse_code:code,agency:agencies[0],source:'UNI-PASS 보관창고코드 조회 결과',retrieved_at:new Date().toISOString()};
  }catch(error){return {status:'blocked',reason:error.message};}
}
