// Observed declaration IDs and official MYC0801008Q controls only.
// This function runs in the page's isolated world; it never evaluates site JS.
export async function cargoStep(request) {
  try {
    const fail = message => { throw new Error(message); };
    const job = request.job, token = request.token;
    const pre = 'CSW0101001S_', popupPre = 'MYC0801008Q_';
    // Exact pathname captured in the user's progress export (2026-10-28).
    const popupPath = '/csp/myc/comn/ComnCdCtr/openMYC0801008Q.do';
    const norm = v => String(v ?? '').replace(/\s/g, '').toUpperCase();
    const cargoNorm = v => norm(v).replace(/-/g, '');
    const one = id => { const nodes = document.querySelectorAll('#' + CSS.escape(id)); if (nodes.length !== 1) fail('필드를 하나로 확인하지 못했습니다: ' + id); return nodes[0]; };
    const value = id => String(one(id).value ?? '').trim();
    const visible = node => !!node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
    const text = node => (node?.textContent || '').trim();
    const usable = node => visible(node) && !node.matches(':disabled') && node.getAttribute('aria-disabled') !== 'true';
    if (location.origin !== 'https://unipass.customs.go.kr' || !location.pathname.startsWith('/csp/')) fail('UNI-PASS 화면이 아닙니다.');
    if ([...document.querySelectorAll('input[type=password]')].some(visible)) fail('로그인을 먼저 완료해 주세요.');
    if (!job || job.format !== 'vision-unipass-cargo-job' || job.version !== 1 || !job.identity || !job.cargo || typeof token !== 'string' || !token) fail('화물 연결 작업 정보가 없습니다.');
    for (const k of ['product_name', 'importer_id', 'manufacturer_id']) if (typeof job.identity[k] !== 'string' || !job.identity[k].trim()) fail('제품 식별정보가 부족합니다.');
    for (const k of ['hbl', 'mbl']) if (!/^[A-Z0-9]{1,20}$/.test(job.cargo[k] || '')) fail('B/L 번호 형식을 확인해 주세요.');
    if (!/^20\d{2}$/.test(job.cargo.year || '') || !/^\d{2}[A-Z0-9]{9}\d{8}$/.test(job.cargo.cargo_mt_no || '') || job.cargo.cargo_mt_no.slice(0,2) !== job.cargo.year.slice(2)) fail('화물번호·조회 연도가 올바르지 않습니다.');
    const signature = JSON.stringify(job);
    const click = (id, label) => { const node = one(id); if (!usable(node) || norm(text(node)) !== norm(label)) fail('누를 버튼을 확인하지 못했습니다: ' + label); node.click(); };
    const setText = (id, next) => {
      const node = one(id);
      if (!(node instanceof HTMLInputElement) || node.type !== 'text' || !usable(node) || node.readOnly || (node.maxLength >= 0 && next.length > node.maxLength)) fail('조회 조건을 입력할 수 없습니다: ' + id);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, next);
      node.dispatchEvent(new Event('input', {bubbles:true})); node.dispatchEvent(new Event('change', {bubbles:true}));
      if (node.value !== next) fail('조회 조건이 유지되지 않습니다: ' + id);
    };
    const select = (id, next, label) => {
      const node = one(id);
      if (!(node instanceof HTMLSelectElement) || !usable(node)) fail('조회 분류를 확인하지 못했습니다.');
      const options = [...node.options].filter(o => o.value === next && !o.disabled && norm(text(o)) === norm(label));
      if (options.length !== 1) fail('선택 항목을 확인하지 못했습니다: ' + label);
      node.value = next; node.dispatchEvent(new Event('change',{bubbles:true}));
      if (node.value !== next) fail('선택값이 유지되지 않습니다.');
    };
    if (['popup_ready','popup_search','popup_result','popup_select'].includes(request.action)) {
      if (location.pathname !== popupPath) fail('화물관리번호 조회창이 아닙니다.');
      if (request.action === 'popup_ready' && (document.readyState !== 'complete' || !document.getElementById(popupPre+'reqForm'))) return {status:'waiting'};
      const mapping = value(popupPre + 'reqForm');
      if (mapping.replace(/^\//,'').split('|')[0] !== pre + 'cargMtNoPrlst' || !mapping.replace(/^\//,'').split('|').includes(pre + 'blNoCn')) fail('이 조회창은 신고서 품목의 화물 연결용이 아닙니다.');
      const table = one(popupPre + 'result');
      if (request.action === 'popup_ready') return {status:'ready'};
      const filters = () => ['qryTp','mblNo','hblNo','year'].map(k => value(popupPre+k));
      if (request.action === 'popup_search') {
        if (window.__visionCargoPopup?.selected) fail('이미 선택을 요청한 조회창입니다. 다시 선택하지 않습니다.');
        select(popupPre+'qryTp','2','M B/L - H B/L');
        setText(popupPre+'mblNo',''); setText(popupPre+'hblNo',job.cargo.hbl);
        select(popupPre+'year',job.cargo.year,job.cargo.year+'년');
        window.__visionCargoPopup?.observer?.disconnect();
        const state = {token, signature, mapping, filters: JSON.stringify(filters()), changed:false, changedAt:0, selected:false};
        const observer = new MutationObserver(mutations => {
          if (mutations.some(m => m.target === table || table.contains(m.target) || [...m.addedNodes,...m.removedNodes].some(n => n === table))) {
            state.changed = true; state.changedAt = Date.now();
          }
        });
        observer.observe(table.parentElement,{childList:true,subtree:true,characterData:true});
        state.observer = observer; window.__visionCargoPopup = state;
        click(popupPre+'searchBtn','조회');
        return {status:'searched'};
      }
      const state = window.__visionCargoPopup;
      if (!state || state.token !== token || state.signature !== signature || state.mapping !== mapping || state.filters !== JSON.stringify(filters())) fail('조회 조건 또는 연결 대상이 바뀌었습니다.');
      if (state.selected) fail('이미 화물 선택을 요청했습니다. 결과 확인만 해 주세요.');
      if (!state.changed || Date.now() - state.changedAt < 400) {
        if (request.action === 'popup_select') fail('확인한 조회 결과가 변경됐습니다. 자동 선택하지 않았습니다.');
        return {status:'waiting'};
      }
      if (!table.querySelector('tbody tr')) return {status:'waiting'};
      const counts = one('MYC0801008Q_div').querySelectorAll('strong[data-recordCount]');
      if (counts.length !== 1 || text(counts[0]).replace(/,/g,'') !== '1') fail('화물 조회 결과가 정확히 1건이 아닙니다. 자동 선택하지 않았습니다.');
      const rows = [...table.querySelectorAll('tbody tr')];
      if (rows.length !== 1 || rows[0].cells.length !== 7) fail('화물 조회 결과 행 구조가 달라 중단했습니다.');
      const row = rows[0], links = [...row.cells[1].querySelectorAll('a')];
      if (links.length !== 1 || cargoNorm(text(links[0])) !== job.cargo.cargo_mt_no ||
          norm(text(row.cells[2])) !== norm(job.cargo.mbl+' - '+job.cargo.hbl)) fail('조회된 화물관리번호 또는 M B/L·H B/L이 작업 대상과 다릅니다.');
      const rowSignature = JSON.stringify([...row.cells].map(c => norm(text(c))));
      if (request.action === 'popup_result') return {status:'matched',signature:rowSignature};
      if (request.signature !== rowSignature || !usable(links[0])) fail('확인한 조회 결과가 변경됐습니다.');
      // Recheck the actual opener synchronously at the final click, not just
      // in an earlier controller call while the user can switch declarations.
      const guard = request.parent_guard;
      const opener = window.opener;
      if (!guard || !opener || opener.closed || opener.location.origin !== location.origin || opener.location.pathname !== '/csp/index.do') fail('연결할 원래 신고서를 확인하지 못했습니다.');
      const parentOne = suffix => {
        const nodes = opener.document.querySelectorAll('#'+CSS.escape(pre+suffix));
        if (nodes.length !== 1) fail('원래 신고서 구조가 바뀌었습니다.');
        return nodes[0];
      };
      const parentApp = ['reqRqstNo1','reqRqstNo2','reqRqstNo3'].map(k=>String(parentOne(k).value).trim());
      const parentProtected = ['mnfcProgTbl','mnigTbl'].map(k=>{
        const t=parentOne(k);return {text:norm(text(t)),controls:[...t.querySelectorAll('input,select,textarea')].map(n=>[n.name,n.value,n.checked ?? null])};
      });
      const selected = parentOne('prlstTbl').querySelectorAll('input[type=radio][name="CSW0101001S_prlstSlct"]');
      if (JSON.stringify(parentApp)!==JSON.stringify(guard.app) || JSON.stringify(parentProtected)!==guard.protected ||
          cargoNorm(parentOne('impOwrBrno').value)!==cargoNorm(job.identity.importer_id) || norm(parentOne('mnfcCoPermDclrNo').value)!==norm(job.identity.manufacturer_id) ||
          norm(parentOne('mdlStszEnglNmPrlst').value)!==norm(job.identity.product_name) || selected.length!==1 || !selected[0].checked) fail('화물 선택 직전에 원래 신고서 또는 대상 품목이 바뀌었습니다.');
      state.selected = true; state.observer.disconnect(); // Before click; never retry a lost response.
      links[0].click();
      return {status:'selection_requested'};
    }
    if (location.pathname !== '/csp/index.do') fail('현재 신고서 작성 탭에서 실행해 주세요.');
    const protectedValues = () => ['mnfcProgTbl','mnigTbl'].map(k => {
      const table = one(pre+k);
      return {text:norm(text(table)),controls:[...table.querySelectorAll('input,select,textarea')].map(n => [n.name,n.value,n.checked ?? null])};
    });
    const identity = () => {
      if (cargoNorm(value(pre+'impOwrBrno')) !== cargoNorm(job.identity.importer_id) || norm(value(pre+'mnfcCoPermDclrNo')) !== norm(job.identity.manufacturer_id)) fail('신고서 수입화주 또는 제조업소가 작업 대상과 다릅니다.');
      const table = one(pre+'prlstTbl'), radios = table.querySelectorAll('input[type=radio][name="CSW0101001S_prlstSlct"]');
      if (radios.length !== 1) fail('단일 품목 신고서만 자동 연결합니다.');
      const first = radios[0].closest('tr'), second = first.nextElementSibling;
      const nameCell = second?.cells[0];
      const product = nameCell?.querySelector('input[readonly]')?.value ?? text(nameCell);
      if (norm(product) !== norm(job.identity.product_name)) fail('품목 목록의 제품명이 작업 대상과 다릅니다.');
      return {radio:radios[0], app:['reqRqstNo1','reqRqstNo2','reqRqstNo3'].map(k => value(pre+k))};
    };
    const current = identity();
    if (request.action === 'begin') {
      const previous = window.__visionCargoLink;
      if (previous?.signature === signature && JSON.stringify(previous.app) === JSON.stringify(current.app)) return {status:'existing',token:previous.token,stage:previous.stage};
      if (previous && ['selection_requested','connected'].includes(previous.stage)) fail('이 신고서에 다른 화물 연결 기록이 있습니다. 현재 상태를 확인해 주세요.');
      const resume=window.__visionCargoResume;
      if(resume){
        const protectedItem=JSON.stringify(['mnfcProgTbl','mnigTbl'].map(k=>{const t=one(pre+k);return [norm(t.textContent),[...t.querySelectorAll('input,select,textarea')].map(n=>[n.name,n.value,n.checked??null])];}));
        if(JSON.stringify(resume.app)!==JSON.stringify(current.app)||resume.numberNode!==one(pre+'reqRqstNo3')||resume.table!==one(pre+'prlstTbl')||resume.protected!==protectedItem||
          resume.bl!==value(pre+'blNoCn')||resume.grid!==JSON.stringify([...one(pre+'prlstTbl').querySelectorAll('input[readonly]')].map(n=>n.value))||
          ['product_name','importer_id','manufacturer_id'].some(k=>resume.identity[k]!==job.identity[k])||resume.identity.bl!==job.cargo.hbl||resume.identity.cargo_mt_no!==job.cargo.cargo_mt_no)fail('확인한 복구 대상과 현재 신고서가 다릅니다.');
        delete window.__visionCargoResume;
      }else if (current.app[2]) fail('이번 화물 연결은 새로 복사한 채번 전 신고서에서 시작해 주세요.');
      window.__visionCargoLink = {token, signature, app:current.app, protected:JSON.stringify(protectedValues()), stage:'begun'};
      return {status:'begun',token,stage:'begun'};
    }
    const state = window.__visionCargoLink;
    if (!state || state.token !== token || state.signature !== signature || JSON.stringify(state.app) !== JSON.stringify(current.app)) fail('신고서 또는 연결 작업이 바뀌었습니다.');
    if (state.protected !== JSON.stringify(protectedValues())) fail('제조공정 또는 성분 정보가 변경돼 중단했습니다.');
    if (request.action === 'verify') {
      const cargo = ['cargMtNoPrlst1','cargMtNoPrlst2','cargMtNoPrlst3'].map(k => value(pre+k)).join('');
      if (cargoNorm(cargo) !== job.cargo.cargo_mt_no || norm(value(pre+'blNoCn')) !== norm(job.cargo.hbl)) return {status:'waiting'};
      if (!['selection_requested','connected'].includes(state.stage)) fail('아직 조회 결과 선택을 요청하지 않았습니다.');
      if (!current.radio.checked || norm(value(pre+'mdlStszEnglNmPrlst')) !== norm(job.identity.product_name)) fail('선택한 품목이 바뀌었습니다.');
      state.stage = 'connected'; return {status:'connected',cargo:job.cargo.cargo_mt_no,bl:job.cargo.hbl};
    }
    if (['selection_requested','connected'].includes(state.stage)) fail('이미 화물 선택을 요청했습니다. 연결 결과만 확인하세요.');
    if (request.action === 'item_tab') {
      const links = [1,2,3,4].map(n => document.getElementById(pre+'prlstTab'+n)).filter(visible);
      if (links.length !== 1 || !usable(links[0]) || norm(text(links[0])) !== norm('품목사항')) fail('품목사항 탭을 하나로 확인하지 못했습니다.');
      links[0].click(); return {status:'tab_opened'};
    }
    if (request.action === 'item_select') {
      if (!usable(current.radio) || !visible(one(pre+'mdlStszEnglNmPrlst'))) return {status:'waiting'};
      if (!current.radio.checked) current.radio.click();
      if (current.radio.checked && !value(pre+'mdlStszEnglNmPrlst')) return {status:'waiting'};
      if (!current.radio.checked || norm(value(pre+'mdlStszEnglNmPrlst')) !== norm(job.identity.product_name)) fail('품목 선택 후 제품명이 일치하지 않습니다.');
      return {status:'item_selected'};
    }
    if (!current.radio.checked || norm(value(pre+'mdlStszEnglNmPrlst')) !== norm(job.identity.product_name)) fail('대상 품목이 선택되어 있지 않습니다.');
    if (request.action === 'open_popup') {
      if (state.stage === 'popup_requested') fail('이미 조회창을 열었습니다. 열린 조회창 결과를 확인하세요.');
      state.stage = 'popup_requested'; if(request.reuse_popup!==true)click(pre+'btnCargMtNoPrlst','검색'); return {status:'popup_requested'};
    }
    if (request.action === 'mark_selection') { if (state.stage !== 'popup_requested') fail('화물 조회창을 먼저 열어야 합니다.'); state.stage = 'selection_requested'; return {status:'selection_marked',parent_guard:{app:state.app,protected:state.protected}}; }
    fail('지원하지 않는 화물 연결 단계입니다.');
  } catch (error) { return {status:'blocked', reason:error.message || '화물 연결을 중단했습니다.'}; }
}
