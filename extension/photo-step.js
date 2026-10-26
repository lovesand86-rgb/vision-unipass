// Transfer only user-selected original files into observed attachment slots.
export async function photoStep(request) {
  try {
    const fail=m=>{throw Error(m);},pre='CSW0101001S_',b=request.binding;
    const one=k=>{const a=document.querySelectorAll('#'+pre+k);if(a.length!==1)fail('첨부 대상 구조를 확인하지 못했습니다: '+k);return a[0];};
    const norm=v=>String(v??'').replace(/[\s-]/g,'').toUpperCase();
    if(location.origin!=='https://unipass.customs.go.kr'||location.pathname!=='/csp/index.do'||!b?.identity)fail('첨부할 신고서가 아닙니다.');
    if(['reqRqstNo1','reqRqstNo2','reqRqstNo3'].some((k,i)=>one(k).value.trim()!==b.application_ref?.[i]))fail('첨부 중 신청번호가 바뀌었습니다.');
    for(const [k,s] of [['bl','blNoCn'],['importer_id','impOwrBrno'],['manufacturer_id','mnfcCoPermDclrNo']])if(norm(one(s).value)!==norm(b.identity[k]))fail('첨부 대상 화물·화주·제조업소가 다릅니다.');
    const grid=one('prlstTbl'),radios=grid.querySelectorAll('input[name="CSW0101001S_prlstSlct"]');
    if(radios.length!==1)fail('사진 첨부는 단일 제품만 지원합니다.');
    const r=radios[0].closest('tr'),cell=c=>c?.querySelector('input[readonly]')?.value??c?.textContent??'';
    if(norm(cell(r.cells[1]))!==norm(b.identity.cargo_mt_no)||norm(cell(r.nextElementSibling?.cells[0]))!==norm(b.identity.product_name))fail('사진 첨부 대상 제품·화물번호가 다릅니다.');
    const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';
    const table=one('attachTbl');
    const targetBound=()=>{
      if(one('attachTbl')!==table||one('prlstTbl')!==grid||!r.isConnected||
        ['reqRqstNo1','reqRqstNo2','reqRqstNo3'].some((k,i)=>one(k).value.trim()!==b.application_ref[i])||
        [['bl','blNoCn'],['importer_id','impOwrBrno'],['manufacturer_id','mnfcCoPermDclrNo']].some(([k,s])=>norm(one(s).value)!==norm(b.identity[k]))||
        norm(cell(r.cells[1]))!==norm(b.identity.cargo_mt_no)||norm(cell(r.nextElementSibling?.cells[0]))!==norm(b.identity.product_name))fail('사진 확인 중 첨부 대상 신고서가 바뀌었습니다.');
    };
    const noticeClosed=()=>{
      const titles=[...document.querySelectorAll('h1,h2,h3,h4,h5,h6,strong,span,div,p')].filter(n=>visible(n)&&n.innerText?.replace(/\s/g,'')==='첨부파일안내');
      if(titles.length)fail('첨부파일 안내 확인을 먼저 완료해야 합니다.');
    };
    if(request.action==='evidence'){
      const files=[];
      for(const slot of [0,9,10,11,12,13,14,15,16,17,18]){
        const input=table.rows[slot]?.querySelector('input[type=file]');
        if(!input?.files.length)continue;
        if(input.files.length!==1)fail('첨부 슬롯의 원본 파일을 하나로 확인하지 못했습니다.');
        const file=input.files[0];if(file.size<1||file.size>5000000)fail('첨부된 원본 파일 크기를 확인해 주세요.');
        const sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await file.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
        targetBound();if(!input.isConnected||input.files[0]!==file)fail('사진을 읽는 중 선택된 파일이 바뀌었습니다.');
        files.push({slot,meta:{name:file.name,size:file.size,type:file.type,lastModified:file.lastModified,sha256}});
      }
      return {status:'evidence',files};
    }
    if(request.action==='open'){
      if(!visible(table)){
        const tabs=[1,2,3,4].flatMap(i=>[...document.querySelectorAll('#'+pre+'attchTab'+i)]).filter(e=>visible(e)&&e.textContent.replace(/\s/g,'')==='첨부파일');
        if(tabs.length!==1)fail('첨부파일 탭을 하나로 확인하지 못했습니다.');targetBound();tabs[0].click();
      }
      await new Promise(resolve=>setTimeout(resolve,200));
      targetBound();noticeClosed();
      return {status:'opened'};
    }
    if(['begin','commit'].includes(request.action))noticeClosed();
    if(!visible(table))fail('첨부파일 탭이 열리지 않았습니다.');
    const rows=[...table.rows];
    const slot=request.slot;
    if(!Number.isInteger(slot)||!(slot===0||slot>=9&&slot<=18)||rows.length<10||slot>=rows.length)fail('허용된 사진 첨부 슬롯이 아닙니다.');
    const front=rows[9].querySelector('input[type=file]');
    if(!front||!front.accept.toLowerCase().includes('.jpg')||!front.accept.toLowerCase().includes('.pdf'))fail('10번 첫 제품 전면 사진 슬롯 구조를 확인하지 못했습니다.');
    const row=rows[slot],files=row.querySelectorAll('input[type=file]');
    if(files.length!==1)fail('첨부 파일 선택칸을 하나로 확인하지 못했습니다.');
    const input=files[0],meta=request.file;
    const stillBound=()=>{
      targetBound();if(!input.isConnected)fail('사진 확인 중 첨부 대상 신고서가 바뀌었습니다.');
    };
    if(!meta||!Number.isInteger(meta.size)||meta.size<1||meta.size>5000000||!/^.{1,200}\.(png|jpg|jpeg|bmp|gif|tif|pdf)$/i.test(meta.name)||/[\\/\u0000-\u001f]/.test(meta.name)||!/^[a-f0-9]{64}$/.test(meta.sha256))fail('사진 파일 이름·크기·해시를 확인해 주세요. 파일당 5MB 이하만 지원합니다.');
    const hash=async buffer=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(v=>v.toString(16).padStart(2,'0')).join('');
    const selected=async()=>input.files.length===1&&input.files[0].size===meta.size&&await hash(await input.files[0].arrayBuffer())===meta.sha256;
    const marker='visionAttachment'+slot;
    const protect=()=>JSON.stringify(['mnfcProgTbl','mnigTbl'].map(k=>{const t=one(k);return [t.innerHTML,[...t.querySelectorAll('input,textarea,select')].map(n=>[n.value,n.checked??null])];}));
    if(request.action==='begin'){
      if(await selected()){stillBound();return {status:'selected',name:input.files[0].name};}
      stillBound();
      if(input.files.length||input.value)fail('이 사진 슬롯에 다른 파일이 있어 덮어쓰지 않았습니다.');
      if(document.documentElement.dataset[marker])fail('이 슬롯의 첨부 시도 기록이 있습니다. 결과를 확인하지 못해 자동 재첨부하지 않습니다.');
      const selects=row.querySelectorAll('select[id="sbmtMthd"]');
      // Supplemental slots may inherit row 10's method; use its observed select.
      const method=selects.length===1?selects[0]:slot>9?rows[9].querySelector('select[id="sbmtMthd"]'):null;
      if(!method)fail('첨부 제출방법 선택칸을 확인하지 못했습니다.');
      const opts=[...method.options].filter(o=>o.textContent.replace(/\s/g,'')==='파일첨부'&&!o.disabled);
      if(opts.length!==1)fail('파일첨부 제출방법을 확인하지 못했습니다.');
      const protectedBefore=protect();
      if(method.value!==opts[0].value){method.value=opts[0].value;method.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,150));}
      if(protect()!==protectedBefore)fail('첨부 준비 중 공정·성분이 바뀌었습니다.');
      stillBound();
      if(!input.isConnected||input.disabled||!visible(input))fail('사진 파일 선택칸이 활성화되지 않았습니다.');
      window.__visionPhotoTransfers??={};
      window.__visionPhotoTransfers[request.token]={input,row,table,meta,protected:protectedBefore,chunks:[],size:0};
      return {status:'ready'};
    }
    if(request.action==='verify')return {status:await selected()?'selected':'unconfirmed'};
    const state=window.__visionPhotoTransfers?.[request.token];
    if(!state||state.input!==input||state.row!==row||state.table!==table||state.meta.sha256!==meta.sha256||state.meta.name!==meta.name||state.meta.size!==meta.size||state.protected!==protect())fail('사진 전달 대상 또는 화면 상태가 바뀌었습니다.');
    if(request.action==='chunk'){
      if(request.index!==state.chunks.length||typeof request.data!=='string'||request.data.length>350000)fail('사진 전달 순서 또는 크기가 올바르지 않습니다.');
      const bytes=Uint8Array.from(atob(request.data),c=>c.charCodeAt(0));
      if(state.size+bytes.length>meta.size)fail('사진 전달 크기가 원본과 다릅니다.');
      state.chunks.push(bytes);state.size+=bytes.length;return {status:'received'};
    }
    if(request.action!=='commit'||state.size!==meta.size)fail('사진 원본 전달이 끝나지 않았습니다.');
    const file=new File(state.chunks,meta.name,{type:meta.type||'application/octet-stream',lastModified:meta.lastModified||0});
    if(await hash(await file.arrayBuffer())!==meta.sha256)fail('전달된 사진이 원본과 다릅니다.');
    stillBound();
    if(protect()!==state.protected)fail('사진 전달 중 공정·성분이 바뀌었습니다.');
    if(input.files.length||input.disabled||!visible(input)||document.documentElement.dataset[marker])fail('첨부 전 슬롯 상태가 바뀌었습니다.');
    const dt=new DataTransfer();dt.items.add(file);
    document.documentElement.dataset[marker]=meta.sha256; // Before the only change event.
    delete window.__visionPhotoTransfers[request.token];
    input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
    if(protect()!==state.protected)fail('첨부 중 공정·성분이 바뀌었습니다.');
    return {status:await selected()?'selected':'unconfirmed',name:input.files[0]?.name};
  }catch(error){return {status:'blocked',reason:error.message};}
}
