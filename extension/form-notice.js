// Known in-page notices only. Read textarea values as well as rendered text;
// the UNI-PASS notice body can be a textarea and is absent from innerText.
export async function formNoticeStep(request) {
  try {
    const fail=m=>{throw Error(m);},p='CSW0101001S_',b=request.binding;
    const one=k=>{const a=document.querySelectorAll('#'+p+k);if(a.length!==1)fail('안내 대상 신고서 구조를 확인하지 못했습니다: '+k);return a[0];};
    const norm=v=>String(v??'').replace(/[\s-]/g,'').toUpperCase();
    const compact=v=>String(v??'').normalize('NFKC').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s/g,'');
    const visible=n=>n.getClientRects().length>0&&getComputedStyle(n).visibility!=='hidden';
    const definitions={
      label:{tab:'koreIndcMatrTab',table:'koreIndcMatrTbl',tabText:'한글표시사항정보',title:'한글표시사항 작성 안내',
        body:"수입신고서 불러오기 시 '제조일자', '소비기한', '생산연도' 등 일자 또는 영업자 소재지, 내용량 등 정보의 변경 사항이 있는 경우 현품 포장지 내용을 확인 후 다시 작성하여 신고하시기 바랍니다."},
      attachment:{tab:'attchTab',table:'attachTbl',tabText:'첨부파일',title:'첨부파일 안내',
        body:'사진파일, 각종 증명서류를 10번 항목에 10개까지 등록할 수 있도록 개선하였습니다. 가급적 각 항목에 맞는 구비서류(첨부파일)를 등록하여 주시기 바라며, 향후 항목에 맞지 않는 구비서류를 첨부하는 경우 식약처 수입 시스템 검증 과정에서 자동 반려될 수 있음을 알려드립니다.'}
    };
    const def=definitions[request.kind];if(!def)fail('지원하지 않는 안내창입니다.');
    const guard=()=>{
      if(location.origin!=='https://unipass.customs.go.kr'||location.pathname!=='/csp/index.do'||!b?.identity||!Array.isArray(b.application_ref)||b.application_ref.length!==3)fail('안내를 확인할 신고서가 아닙니다.');
      if(['reqRqstNo1','reqRqstNo2','reqRqstNo3'].some((k,i)=>one(k).value.trim()!==b.application_ref[i]))fail('안내 확인 중 신청번호가 바뀌었습니다.');
      for(const [k,s]of [['bl','blNoCn'],['importer_id','impOwrBrno'],['manufacturer_id','mnfcCoPermDclrNo']])if(!b.identity[k]||norm(one(s).value)!==norm(b.identity[k]))fail('안내 확인 대상 화물·화주·제조업소가 다릅니다.');
      for(const k of ['reqRqstNo1','aplcNm','aplcEml1','aplcEml2','inscBrngFdmcSfkpWrhsCd'])if(one(k).value.trim()!==b.context?.[k])fail('안내 확인 중 신청인 또는 창고가 바뀌었습니다.');
      const radios=one('prlstTbl').querySelectorAll('input[name="'+p+'prlstSlct"]');if(radios.length!==1)fail('단일 품목인지 확인해야 합니다.');
      const row=radios[0].closest('tr'),cell=c=>c?.querySelector('input[readonly]')?.value??c?.textContent??'';
      if(norm(cell(row.cells[1]))!==norm(b.identity.cargo_mt_no)||norm(cell(row.nextElementSibling?.cells[0]))!==norm(b.identity.product_name))fail('안내 확인 중 제품 또는 화물이 바뀌었습니다.');
    };
    guard();
    const table=one(def.table),numberNode=one('reqRqstNo3');
    const stable=()=>{guard();if(one(def.table)!==table||one('reqRqstNo3')!==numberNode)fail('안내 확인 중 신고서 화면이 교체됐습니다.');};
    const rendered=n=>{
      if(n.nodeType===Node.TEXT_NODE)return n.parentElement&&visible(n.parentElement)?n.textContent:'';
      if(n.nodeType!==Node.ELEMENT_NODE||!visible(n)||n.matches('script,style,option'))return '';
      // jQuery UI's close button can render a literal 'close' icon label.
      // Exclude only a close control, never a matching word in notice prose.
      if(n.matches('button,a,[role=button]')&&/^(close|닫기|[×✕✖xX])$/i.test(compact(n.innerText||n.value)))return '';
      if(n.matches('textarea'))return n.value;
      if(n.matches('input'))return ['button','submit'].includes(n.type)?n.value:'';
      return [...n.childNodes].map(rendered).join(' ');
    };
    const find=()=>{
      const heads=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,span,div,p,legend,header')].filter(n=>visible(n)&&compact(n.innerText)===compact(def.title));
      if(!heads.length)return null;
      const candidates=new Set();
      for(const head of heads)for(let n=head.parentElement;n&&n!==document.body;n=n.parentElement){
        const buttons=[...n.querySelectorAll('button,a,input[type=button],input[type=submit]')].filter(e=>visible(e)&&!e.disabled&&compact(e.innerText||e.value)==='확인');
        const checks=[...n.querySelectorAll('input[type=checkbox]')].filter(visible);
        if(buttons.length===1&&checks.length===1&&compact(rendered(n)).includes('오늘하루그만보기')){candidates.add(n);break;}
      }
      const roots=[...candidates].filter(n=>![...candidates].some(other=>other!==n&&n.contains(other)));
      if(roots.length!==1)fail(def.title+' 창을 하나로 확인하지 못했습니다.');
      const root=roots[0],text=compact(rendered(root));
      const rest=text.replace(compact(def.title),'').replace(compact(def.body),'').replace('오늘하루그만보기','').replace('확인','').replace(/닫기|[×✕✖xX]/g,'');
      if(!text.includes(compact(def.body))||rest)fail(def.title+' 문구를 확인하지 못했습니다. 읽은 안내: '+rendered(root).replace(/\s+/g,' ').slice(0,900));
      return root;
    };
    if(request.action==='open'&&!visible(table)){
      const tabs=[1,2,3,4].flatMap(i=>[...document.querySelectorAll('#'+p+def.tab+i)]).filter(n=>visible(n)&&compact(n.textContent)===compact(def.tabText));
      if(tabs.length!==1)fail(def.tabText+' 탭을 하나로 확인하지 못했습니다.');stable();tabs[0].click();
      for(let n=0;n<20&&!visible(table);n++)await new Promise(r=>setTimeout(r,100));
      await new Promise(r=>setTimeout(r,250));
    }else if(!['open','dismiss'].includes(request.action))fail('지원하지 않는 안내 확인 단계입니다.');
    stable();if(request.action==='open'&&!visible(table))fail(def.tabText+' 탭이 열리지 않았습니다.');const root=find();
    if(!root)return {status:'ready',notice:'absent'};
    const button=[...root.querySelectorAll('button,a,input[type=button],input[type=submit]')].find(n=>visible(n)&&!n.disabled&&compact(n.innerText||n.value)==='확인');
    // Preserve the user's current '오늘 하루 그만보기' selection.
    if(root.dataset.visionNoticeAttempt==='requested'||root.dataset.visionAttachmentNotice==='requested')fail(def.title+' 확인 이후 닫힘을 확인하지 못했습니다. 자동 재클릭하지 않습니다.');
    stable();root.dataset.visionNoticeAttempt='requested';button.click();
    for(let n=0;n<20;n++){
      await new Promise(r=>setTimeout(r,100));stable();
      if(!root.isConnected||!visible(root)){delete root.dataset.visionNoticeAttempt;return {status:'ready',notice:'confirmed'};}
    }
    fail(def.title+'가 닫히지 않았습니다. 자동으로 다시 누르지 않습니다.');
  }catch(error){return {status:'blocked',reason:error.message};}
}
