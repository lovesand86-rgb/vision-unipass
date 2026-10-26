// Final actions use observed button IDs. No business-result text is invented.
export async function finalStep(request) {
  let attempted=false;
  try {
    const fail=m=>{throw Error(m);},p='CSW0101001S_',id=request.identity;
    const one=k=>{const ns=document.querySelectorAll('#'+p+k);if(ns.length!==1)fail('최종 단계의 입력칸을 하나로 확인하지 못했습니다: '+k);return ns[0];};
    const norm=v=>String(v??'').replace(/[\s-]/g,'').toUpperCase();
    const visible=n=>n.getClientRects().length>0&&getComputedStyle(n).visibility!=='hidden';
    const value=k=>String(one(k).value??'').trim();
    const guard=()=>{
      if(location.origin!=='https://unipass.customs.go.kr'||location.pathname!=='/csp/index.do')fail('현재 신고서 작성 화면이 아닙니다.');
      for(const [key,k]of [['bl','blNoCn'],['importer_id','impOwrBrno'],['manufacturer_id','mnfcCoPermDclrNo']])if(!id?.[key]||norm(value(k))!==norm(id[key]))fail('최종 실행 대상 화물·화주·제조업소가 다릅니다.');
      const radios=one('prlstTbl').querySelectorAll('input[name="'+p+'prlstSlct"]');if(radios.length!==1)fail('최종 실행 대상 단일 품목을 확인해야 합니다.');
      const r=radios[0].closest('tr'),cell=c=>c?.querySelector('input[readonly]')?.value??c?.textContent??'';
      if(norm(cell(r.cells[1]))!==norm(id.cargo_mt_no)||norm(cell(r.nextElementSibling?.cells[0]))!==norm(id.product_name))fail('최종 실행 대상 제품·화물번호가 다릅니다.');
    };
    guard();
    const root=document.documentElement;
    root.dataset.visionFinalForm??=crypto.randomUUID();
    const formId=root.dataset.visionFinalForm;
    const controls=()=>[...document.querySelectorAll('input,select,textarea')].filter(n=>!['hidden','password','button','submit','reset','file'].includes(n.type)&&n.id!==p+'reqRqstNo3');
    const values=()=>controls().map(n=>[n.id,n.name,n.type,n.value,n.checked??null]);
    const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    async function read(){
      const nodes=controls(),before=JSON.stringify(values()),fileInputs=[...document.querySelectorAll('input[type=file]')],fileSets=fileInputs.map(n=>[...n.files]),files=[];
      const checkFiles=()=>{const now=[...document.querySelectorAll('input[type=file]')];if(now.length!==fileInputs.length||now.some((n,i)=>n!==fileInputs[i]||n.files.length!==fileSets[i].length||[...n.files].some((f,j)=>f!==fileSets[i][j])))fail('최종 확인 중 첨부파일이 바뀌었습니다.');};
      for(let i=0;i<fileInputs.length;i++)for(const f of fileInputs[i].files){
        const sha256=await hash(await f.arrayBuffer());
        if(!fileInputs[i].isConnected||![...fileInputs[i].files].includes(f))fail('최종 확인 중 첨부파일이 바뀌었습니다.');
        files.push({slot:i,name:f.name,size:f.size,sha256});
      }
      guard();if(root!==document.documentElement||formId!==root.dataset.visionFinalForm||before!==JSON.stringify(values())||controls().some((n,i)=>n!==nodes[i]))fail('최종 확인 중 신고서 내용이 바뀌었습니다.');
      one('koreIndcMatrTbl');one('attachTbl');
      const tables=()=>[...document.querySelectorAll('table[id^="'+p+'"]')].map(n=>[n.id,n.textContent]);
      const structure=JSON.stringify(tables());
      // Hash manual label values too, but never interpret or modify them.
      const digest=await hash(new TextEncoder().encode(JSON.stringify({values:JSON.parse(before),files,structure})));
      checkFiles();guard();if(structure!==JSON.stringify(tables())||root!==document.documentElement||formId!==root.dataset.visionFinalForm||controls().length!==nodes.length||controls().some((n,i)=>n!==nodes[i])||before!==JSON.stringify(values()))fail('최종 확인 중 신고서 내용이 바뀌었습니다.');
      const app=['reqRqstNo1','reqRqstNo2','reqRqstNo3'].map(value);
      return {form_id:formId,digest,application_ref:app,files,
        summary:{product:id.product_name,cargo:id.cargo_mt_no,bl:id.bl,warehouse:value('inscBrngFdmcSfkpWrhsCd'),agency:one('dclrFdmcIttCd').selectedOptions[0]?.textContent?.trim(),shipment:value('shpmDt'),entry:value('inscBrngDt'),phone:value('aplcTelno'),mobile:value('aplcCralTelno')}};
    }
    const notices=()=>[...document.querySelectorAll('[role=alert],[role=dialog],.ui-dialog')].filter(visible).map(n=>n.innerText?.trim()).filter(Boolean).map(s=>s.slice(0,5000)).slice(0,10);
    if(request.action==='read')return {status:'final_read',snapshot:await read(),notices:notices()};
    if(request.action!=='execute')fail('지원하지 않는 최종 단계입니다.');
    const buttons={validate:['btnVerifyErr','오류검증'],save:['btnRegistTemp','임시저장'],send:['btnTrsn','전송']},def=buttons[request.kind];
    if(!def||typeof request.token!=='string'||!request.token)fail('최종 실행 항목을 확인하지 못했습니다.');
    const snapshot=await read(),review=request.review;
    if(!review||snapshot.form_id!==review.form_id||snapshot.digest!==review.digest||JSON.stringify(snapshot.application_ref)!==JSON.stringify(review.application_ref))fail('검토 이후 신고서나 첨부가 바뀌었습니다. 최종 입력내용을 다시 읽어 주세요.');
    if(request.kind==='send'&&!snapshot.application_ref[2])fail('신청번호가 없는 신고서는 전송하지 않습니다.');
    const button=one(def[0]);if(button.tagName!=='BUTTON'||!visible(button)||button.disabled||norm(button.textContent)!==norm(def[1]))fail(def[1]+' 버튼을 하나로 확인하지 못했습니다.');
    const journal=JSON.parse(root.dataset.visionFinalAttempts||'[]');
    if(journal.some(r=>r.token===request.token||r.kind==='send'&&request.kind==='send'))fail('이 화면에 같은 실행 시도 기록이 있습니다. 자동 재실행하지 않습니다.');
    journal.push({token:request.token,kind:request.kind,digest:snapshot.digest});root.dataset.visionFinalAttempts=JSON.stringify(journal);
    // The controller also persists intent before this call. A lost response
    // remains unconfirmed; neither a click nor an absent alert means success.
    attempted=true;button.click();
    return {status:'requested',kind:request.kind,notices:notices()};
  }catch(error){return {status:'blocked',reason:error.message,before_action:!attempted};}
}
