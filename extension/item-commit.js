// Bounded item-editor changes followed by exactly one local row update.
// Completion is proved by the committed grid, never by a site toast.
export async function itemCommitStep(request) {
  try {
    const fail = message => { throw new Error(message); };
    const pre='CSW0101001S_', job=request.job;
    const norm=v=>String(v??'').replace(/\s/g,'').toUpperCase();
    const cargo=v=>norm(v).replace(/-/g,'');
    const num=v=>String(v??'').replace(/,/g,'').trim().replace(/^0+(?=\d)/,'').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
    const date=v=>String(v??'').replace(/[-.\s]/g,'');
    const one=s=>{const nodes=document.querySelectorAll('#'+CSS.escape(pre+s));if(nodes.length!==1)fail('품목 입력 구조를 확인하지 못했습니다: '+s);return nodes[0];};
    const val=s=>String(one(s).value??'').trim();
    const visible=n=>n.getClientRects().length>0&&getComputedStyle(n).visibility!=='hidden';
    if(location.origin!=='https://unipass.customs.go.kr'||location.pathname!=='/csp/index.do')fail('현재 신고서 작성 화면에서 실행해 주세요.');
    if(!job||job.format!=='vision-unipass-item-commit'||job.version!==1||!job.identity||!job.fields)fail('품목 입력 작업 정보가 없습니다.');
    const defs={cartons:'dclrQtyPrlst',net_kg:'mdlStszNtwgPrlst',amount_usd:'mdlStszAmtPrlst',expiry_date:'circPridEndDtPrlst'};
    if(Object.keys(job.fields).length!==4||Object.keys(job.fields).some(k=>!Object.hasOwn(defs,k)))fail('허용된 품목 입력 항목이 아닙니다.');
    for(const [key,f] of Object.entries(job.fields)){
      if(f?.reviewed!==true||typeof f.source!=='string'||!f.source.trim()||typeof f.value!=='string')fail('자료 대조가 끝난 입력값이 필요합니다.');
      if(key==='expiry_date'){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(f.value))fail('소비기한 형식을 확인해 주세요.');
        const d=new Date(f.value+'T00:00:00Z');if(isNaN(d.getTime())||d.toISOString().slice(0,10)!==f.value)fail('유효한 소비기한이 아닙니다.');
      }else if(!/^\d{1,15}(\.\d{1,6})?$/.test(f.value)||Number(f.value)<=0)fail('수량·중량·금액이 올바르지 않습니다.');
    }
    for(const k of ['product_name','importer_id','manufacturer_id','bl','cargo_mt_no'])if(typeof job.identity[k]!=='string'||!job.identity[k])fail('대상 식별정보가 부족합니다.');
    const signature=JSON.stringify(job);
    const protectedValues=()=>JSON.stringify(['mnfcProgTbl','mnigTbl'].map(k=>{const t=one(k);return [norm(t.textContent),[...t.querySelectorAll('input,select,textarea')].map(n=>[n.name,n.value,n.checked??null])];}));
    const app=()=>['reqRqstNo1','reqRqstNo2','reqRqstNo3'].map(val);
    const cell=c=>c?.querySelector('input[readonly]')?.value??c?.textContent??'';
    const grid=()=>{
      const table=one('prlstTbl'),radios=table.querySelectorAll('input[type=radio][name="CSW0101001S_prlstSlct"]');
      if(radios.length!==1)fail('단일 품목 목록인지 확인해야 합니다.');
      const row=radios[0].closest('tr'),next=row.nextElementSibling;
      if(row.cells.length!==6||next?.cells.length!==3)fail('품목 목록 행 구조가 달라 중단했습니다.');
      if(norm(cell(next.cells[0]))!==norm(job.identity.product_name))fail('품목 목록 제품명이 다릅니다.');
      const dates=[...next.cells[2].querySelectorAll('input[readonly]')];
      const expiry=dates.length===2?dates[1].value:String(next.cells[2].textContent).split('~').at(-1).trim();
      const data={item_id:cell(row.cells[0]),cargo:cell(row.cells[1]),cartons:cell(row.cells[2]),net_kg:cell(row.cells[3]),amount_usd:cell(row.cells[4]),expiry_date:expiry};
      const matches=cargo(data.cargo)===cargo(job.identity.cargo_mt_no)&&num(data.cartons)===num(job.fields.cartons.value)&&
        num(data.net_kg.replace(/\s*kg\s*$/i,''))===num(job.fields.net_kg.value)&&num(data.amount_usd.replace(/\s*\(US\$\)\s*$/i,''))===num(job.fields.amount_usd.value)&&date(data.expiry_date)===date(job.fields.expiry_date.value);
      return {table,radio:radios[0],data,matches};
    };
    const identity=()=>{
      if(cargo(val('impOwrBrno'))!==cargo(job.identity.importer_id)||norm(val('mnfcCoPermDclrNo'))!==norm(job.identity.manufacturer_id))fail('품목 입력 대상 화주 또는 제조업소가 다릅니다.');
      return grid();
    };
    const editorReady=g=>g.radio.checked&&visible(one('mdlStszEnglNmPrlst'))&&norm(val('mdlStszEnglNmPrlst'))===norm(job.identity.product_name)&&
      cargo(['cargMtNoPrlst1','cargMtNoPrlst2','cargMtNoPrlst3'].map(val).join(''))===cargo(job.identity.cargo_mt_no)&&norm(val('blNoCn'))===norm(job.identity.bl);
    const rowNow=identity();
    const previous=window.__visionItemCommit;
    const checkBound=(s,readOnly=false)=>{
      if(!s||s.signature!==signature||s.token!==request.token||s.numberNode!==one('reqRqstNo3')||(!readOnly&&s.table!==rowNow.table)||JSON.stringify(s.app)!==JSON.stringify(app()))fail('품목 수정 대상 신고서가 바뀌었습니다.');
      if(s.protected!==protectedValues())fail('제조공정 또는 성분 정보가 변경돼 중단했습니다.');
    };
    const differences=()=>[
      ['화물관리번호',rowNow.data.cargo,job.identity.cargo_mt_no,cargo],
      ['수량',rowNow.data.cartons,job.fields.cartons.value,num],
      ['순중량',rowNow.data.net_kg,job.fields.net_kg.value,v=>num(String(v).replace(/\s*kg\s*$/i,''))],
      ['과세가격',rowNow.data.amount_usd,job.fields.amount_usd.value,v=>num(String(v).replace(/\s*\(US\$\)\s*$/i,''))],
      ['소비기한',rowNow.data.expiry_date,job.fields.expiry_date.value,date],
      ['B/L',val('blNoCn'),job.identity.bl,norm]
    ].map(([label,current,expected,normalize])=>({label,current,expected,matches:normalize(current)===normalize(expected)}));
    // Read before a bounded recovery in the user's start action. Recovery must
    // still use this exact snapshot/token and can only update the existing row.
    if(request.action==='review'){
      if(!document.documentElement.dataset.visionItemCommitToken)return {status:'no_attempt'};
      if(previous&&(previous.signature!==signature||JSON.stringify(previous.app)!==JSON.stringify(app())||previous.protected!==protectedValues()))fail('이전 입력과 현재 신청서가 다릅니다. 현재 작업 대상을 확인해주세요.');
      const rows=differences(),canRepair=rows.some(r=>!r.matches)&&
        (!cargo(rowNow.data.cargo)||cargo(rowNow.data.cargo)===cargo(job.identity.cargo_mt_no));
      window.__visionItemRepair={token:request.token,signature,app:app(),numberNode:one('reqRqstNo3'),table:rowNow.table,
        protected:protectedValues(),gridBefore:JSON.stringify(rowNow.data),bl:val('blNoCn'),marker:document.documentElement.dataset.visionItemCommitToken,canRepair,used:false};
      return {status:'repair_review',rows,can_repair:canRepair,token:request.token};
    }
    const repair=['repair_select','repair_prepare','repair_restart'].includes(request.action);
    if(repair){
      const s=window.__visionItemRepair;
      checkBound(s);
      if(request.confirmed!==true||s.used||!s.canRepair||s.marker!==document.documentElement.dataset.visionItemCommitToken||
        s.gridBefore!==JSON.stringify(rowNow.data)||s.bl!==val('blNoCn'))fail('품목 대조 이후 화면이 바뀌었습니다. 목록을 다시 확인해 주세요.');
      if(request.action==='repair_select'){
        if(!visible(one('mdlStszEnglNmPrlst'))){
          const tabs=[1,2,3,4].flatMap(n=>[...document.querySelectorAll('#'+pre+'prlstTab'+n)])
            .filter(e=>visible(e)&&e.tagName==='A'&&norm(e.textContent)==='품목사항');
          if(tabs.length!==1)fail('품목사항 탭을 하나로 확인하지 못했습니다.');
          tabs[0].click();return {status:'opening'};
        }
        if(!editorReady(rowNow)){
          if(!cargo(rowNow.data.cargo))return {status:'needs_cargo'};
          if(s.selectionRequested)return {status:'selecting'};
          s.selectionRequested=true;rowNow.radio.click();return {status:'selecting'};
        }
        return {status:'ready'};
      }
      if(request.action==='repair_restart'){
        if(cargo(rowNow.data.cargo))fail('목록에 화물이 있습니다. 기존 연결부터 확인해야 합니다.');
        s.used=true;
        // Keep the reviewed attempt as an audit record; replace only the old
        // active guards after the user's explicit bound recovery action.
        window.__visionItemRecoveryHistory=window.__visionItemRecoveryHistory||[];
        window.__visionItemRecoveryHistory.push({token:s.token,app:s.app,grid:s.gridBefore,marker:s.marker});
        window.__visionCargoResume={app:app(),numberNode:one('reqRqstNo3'),table:rowNow.table,identity:job.identity,protected:protectedValues(),bl:val('blNoCn'),
          grid:JSON.stringify([...rowNow.table.querySelectorAll('input[readonly]')].map(n=>n.value))};
        delete window.__visionItemCommit;delete window.__visionCargoLink;
        delete document.documentElement.dataset.visionItemCommitToken;
        return {status:'needs_cargo'};
      }
    }
    if(request.action==='inspect'){
      if(rowNow.matches&&norm(val('blNoCn'))===norm(job.identity.bl)){
        if(previous?.signature===signature)checkBound({...previous,token:request.token},true);
        return {status:'committed',values:rowNow.data,application_ref:app()};
      }
      if(previous?.signature===signature&&['applying','commit_requested','committed'].includes(previous.stage)){
        return {status:'check_only',token:previous.token};
      }
      if(document.documentElement.dataset.visionItemCommitToken)fail('이 화면에 품목 수정 시도 기록이 있습니다. 목록의 반영값을 확인하지 못해 자동 재수정하지 않습니다.');
      return {status:editorReady(rowNow)?'ready':'needs_cargo'};
    }
    if(request.action==='verify'){
      // The site may replace only the grid after its local update. A read may
      // verify the new grid; write actions must still use their exact DOM.
      checkBound(previous,true);
      if(!['commit_requested','committed'].includes(previous.stage))fail('수정 버튼 실행을 확인하지 못했습니다. 현재 입력칸을 확인해 주세요.');
      if(!rowNow.matches||norm(val('blNoCn'))!==norm(job.identity.bl))return {status:'waiting'};
      previous.stage='committed';return {status:'committed',values:rowNow.data,application_ref:app()};
    }
    if(request.action==='prepare'||request.action==='repair_prepare'){
      if(!repair&&previous?.signature===signature&&['applying','commit_requested','committed'].includes(previous.stage))fail('품목 수정 시도 기록이 있습니다. 결과만 확인합니다.');
      if(!repair&&document.documentElement.dataset.visionItemCommitToken)fail('품목 수정 시도 기록이 있습니다. 목록 대조 후 다시 진행해 주세요.');
      if(!editorReady(rowNow))fail('화물번호·B/L이 연결된 대상 품목을 먼저 확인해야 합니다.');
      let panel=one('mdlStszEnglNmPrlst').parentElement;
      while(panel&&!panel.contains(rowNow.table))panel=panel.parentElement;
      if(!panel||panel===document.body)fail('품목 수정 영역을 확인하지 못했습니다.');
      const buttons=[...panel.querySelectorAll('button')].filter(b=>visible(b)&&!b.matches(':disabled')&&norm(b.textContent)==='수정'&&
        [...b.parentElement.querySelectorAll('button')].filter(visible).map(x=>norm(x.textContent)).join('|')==='추가|수정|삭제|초기화|항전체삭제');
      if(buttons.length!==1)fail('품목 영역의 수정 버튼을 하나로 확인하지 못했습니다.');
      const before={};
      for(const [key,suffix]of Object.entries(defs)){
        const node=one(suffix);
        if(!(node instanceof HTMLInputElement)||node.type!=='text'||!visible(node)||node.readOnly||node.matches(':disabled'))fail('수정할 품목 입력칸이 편집 가능하지 않습니다: '+suffix);
        if(node.maxLength>=0&&job.fields[key].value.length>node.maxLength)fail('입력값 길이가 허용 범위를 넘습니다.');
        before[key]=node.value;
      }
      const otherEditor=['prlstIdfySgnPrlst','mdlStszKoreNmPrlst','circPridStrtDtPrlst'].map(k=>[k,val(k)]);
      if(repair)window.__visionItemRepair.used=true;
      window.__visionItemCommit={token:request.token,signature,app:app(),numberNode:one('reqRqstNo3'),table:rowNow.table,protected:protectedValues(),button:buttons[0],before,otherEditor,gridBefore:JSON.stringify(rowNow.data),stage:'prepared'};
      return {status:'prepared',before};
    }
    if(request.action!=='apply')fail('지원하지 않는 품목 수정 단계입니다.');
    checkBound(previous);
    if(previous.stage!=='prepared')fail('이미 품목 수정을 시도했습니다. 자동 재실행하지 않습니다.');
    if(!editorReady(rowNow)||previous.gridBefore!==JSON.stringify(rowNow.data)||Object.entries(defs).some(([k,s])=>val(s)!==previous.before[k]))fail('대조 이후 품목 입력값이 바뀌었습니다.');
    const editorStable=()=>{
      checkBound(previous);
      if(!editorReady(identity())||previous.otherEditor.some(([k,v])=>val(k)!==v))fail('입력 중 선택 품목 또는 다른 품목 값이 바뀌었습니다.');
    };
    previous.stage='applying';
    document.documentElement.dataset.visionItemCommitToken=previous.token;
    for(const [key,suffix]of Object.entries(defs)){
      editorStable();const node=one(suffix),next=job.fields[key].value;
      const equal=key==='expiry_date'?date(node.value)===date(next):num(node.value)===num(next);
      if(!equal){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,next);node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));}
      if(key==='expiry_date'?date(node.value)!==date(next):num(node.value)!==num(next))fail('품목 입력값이 유지되지 않습니다: '+suffix);
    }
    editorStable();
    if(Object.entries(defs).some(([k,s])=>k==='expiry_date'?date(val(s))!==date(job.fields[k].value):num(val(s))!==num(job.fields[k].value)))fail('수정 전 입력값 최종 대조에 실패했습니다.');
    if(!previous.button.isConnected||!visible(previous.button)||previous.button.matches(':disabled')||norm(previous.button.textContent)!=='수정')fail('품목 수정 버튼이 바뀌었습니다.');
    previous.stage='commit_requested'; // Set before the only click; never retry.
    previous.button.click();
    return {status:'commit_requested'};
  }catch(error){return {status:'blocked',reason:error.message||'품목 수정 중단'};}
}
