// Injected in Chrome's isolated world. Only observed controls; no submission.
export async function declarationStep(request) {
  // Return failures explicitly: Chrome may omit `result` when injected code
  // rejects. A thrown guard must not become an unhelpful empty response.
  try {
  const originalPath = '/csp/csw/reqrqstmt/apfmmt/foodEtcImpDcshMtCtr/retrieveApfmOdv.do';
  const fail = message => { throw new Error(message); };
  if (location.protocol !== 'https:' || location.hostname !== 'unipass.customs.go.kr' || !location.pathname.startsWith('/csp/')) fail('UNI-PASS 화면이 아닙니다.');
  const visible = node => !!node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  if ([...document.querySelectorAll('input[type=password]')].some(visible)) fail('로그인을 직접 완료해 주세요.');
  const one = id => {
    const nodes = document.querySelectorAll('#' + CSS.escape(id));
    if (nodes.length !== 1) fail('예상한 화면 구조가 아닙니다: ' + id);
    return nodes[0];
  };
  const norm = value => String(value).replace(/\s+/g, '').toUpperCase();
  const company = value => norm(value).replace(/주식회사|\(주\)|㈜/g, '');
  const text = node => (node.textContent || '').replace(/\s+/g, ' ').trim();
  // The real editable declaration grid displays product names inside
  // readonly text inputs. textContent alone cannot read those values.
  const productValues = table => [
    ...[...table.querySelectorAll('td')].map(text),
    ...[...table.querySelectorAll('td input[readonly]')].filter(input => input.type === 'text').map(input => input.value)
  ];
  const click = (id, label) => {
    const button = ['btnQry','btnApfmOdv'].includes(id)?listControl(id):one(id);
    if (!visible(button) || button.matches(':disabled') || norm(text(button)) !== norm(label)) fail('버튼을 확인할 수 없습니다: ' + label);
    button.click();
  };
  const job = request.job;
  if (!job || job.format !== 'vision-unipass-search-copy' || job.version !== 1 ||
      !job.identity || !job.search || !/^[A-Z0-9]+-\d{2}-[A-Z0-9]+$/.test(job.source_application || '')) fail('지정 실적 검색·복사 작업 파일이 필요합니다.');
  for (const key of ['product_name', 'importer_name', 'importer_id', 'manufacturer_name', 'manufacturer_id']) {
    if (typeof job.identity[key] !== 'string' || !job.identity[key].trim()) fail('대상 식별정보가 부족합니다: ' + key);
  }
  // Hidden templates can retain the same IDs as the active search screen.
  // Only one visible control is acceptable; never guess between active screens.
  const listControl = id => {
    const nodes=[...document.querySelectorAll('#'+CSS.escape(id))];
    const shown=nodes.filter(visible);
    if(shown.length===1)return shown[0];
    if(!shown.length&&nodes.length===1)return nodes[0]; // account scope may be hidden
    const names={reqApreIttCd:'기관',reqApfmCd:'서식'};
    fail(`처리현황 조회 조건을 확인할 수 없습니다 (${names[id]||id}). 신청서 처리현황을 다시 열어주세요.`);
  };
  const isList = () => {
    if(location.pathname!=='/csp/index.do')return false;
    const button=listControl('btnQry'), product=listControl('prnm'), table=listControl('qryTbl1');
    if(!visible(button)||!visible(product)||!visible(table))return false;
    for(const id of ['reqApreIttCd','reqApfmCd']){
      const node=listControl(id);
      if(!(node instanceof HTMLSelectElement)||!visible(node)||(id==='reqApreIttCd'&&node.disabled))fail('처리현황 조회 조건이 아직 준비되지 않았습니다. 조회 조건을 펼친 뒤 다시 시작해주세요.');
    }
    return true;
  };
  if(request.action==='probe'){
    const candidate=location.pathname==='/csp/index.do'&&document.getElementById('btnQry')&&document.getElementById('qryTbl1');
    if(!candidate)return {list:false};
    try{return {list:isList()};}catch(error){return {list:false,reason:error.message};}
  }
  if (request.action === 'draft_presence') {
    // Recovery is read-only and deliberately ignores identity: an open form
    // must be reviewed even when it no longer matches this job.
    return {status: document.getElementById('CSW0101001S_reqRqstNo3') ? 'draft_present' : 'no_draft'};
  }
  const setter = (id, value) => {
    const node = listControl(id);
    if (!(node instanceof HTMLInputElement) || node.type !== 'text' || !visible(node) || node.readOnly || node.matches(':disabled')) fail('검색 조건을 입력할 수 없습니다: ' + id);
    if (typeof value !== 'string' || (node.maxLength >= 0 && value.length > node.maxLength)) fail('검색 조건 길이를 확인해 주세요.');
    if (node.value !== value) {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(node, value);
      node.dispatchEvent(new Event('input', {bubbles: true}));
      node.dispatchEvent(new Event('change', {bubbles: true}));
    }
    if (node.value !== value) fail('검색 조건이 유지되지 않습니다: ' + id);
  };
  const selected = id => {
    const node = listControl(id);
    if (!(node instanceof HTMLSelectElement)) fail('선택 필드가 아닙니다: ' + id);
    return norm(node.selectedOptions[0]?.textContent || '');
  };
  const selectLabel = (id, label) => {
    const node = listControl(id);
    if (!(node instanceof HTMLSelectElement) || !visible(node) || node.matches(':disabled')) fail('검색 분류를 선택할 수 없습니다: ' + id);
    const matches = [...node.options].filter(option => norm(option.textContent) === norm(label) && !option.disabled);
    if (matches.length !== 1) fail('검색 분류 항목을 확인해 주세요: ' + label);
    if (node.value !== matches[0].value) {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(node, matches[0].value);
      node.dispatchEvent(new Event('change', {bubbles: true}));
    }
  };
  const filters = () => ['qryStrtDt', 'qryEndDt', 'prnm', 'owrEntsConm', 'reqRqstNo', 'reqRqstAcapNo', 'reqIttApreNo', 'prlstCdCn', 'blNoCn', 'cargMtNo', 'ovrsEntsConm', 'reqApreIttCd', 'reqApfmCd', 'reqRqstPrcsSttsClsfCd', 'aplcUserId', 'reqUserId', 'dcerSgn'].map(id => {
    const value = listControl(id).value;
    // Date widgets can remove hyphens on submit without changing the date.
    return [id, ['qryStrtDt', 'qryEndDt'].includes(id) && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.replace(/-/g, '') : value];
  });
  if (request.action === 'search') {
    if (!isList()) fail('신청서 처리현황 화면을 먼저 열어 주세요.');
    for (const key of ['product_term', 'importer_term']) if (typeof job.search[key] !== 'string' || !job.search[key].trim()) fail('검색어가 없습니다.');
    for (const key of ['from', 'to']) {
      const value = job.search[key];
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value) fail('검색 기간 형식을 확인해 주세요.');
    }
    if (job.search.from > job.search.to) fail('검색 시작일이 종료일보다 늦습니다.');
    if (listControl('excelCheck').checked) fail('신청번호 엑셀조회 선택을 해제해 주세요.');
    selectLabel('reqApreIttCd', '식품의약품안전처');
    const start = Date.now();
    while (Date.now() - start < 4000) {
      const options = [...listControl('reqApfmCd').options];
      if (options.some(option => norm(option.textContent) === norm('수입식품등의수입신고서'))) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    selectLabel('reqApfmCd', '수입식품등의수입신고서');
    // Keep account scope, but do not silently search under other narrowing filters.
    for (const id of ['aplcUserId', 'reqRqstPrcsSttsClsfCd']) if (listControl(id).value.trim()) fail('추가 검색 조건을 비워 주세요: ' + id);
    for (const id of ['reqRqstNo', 'reqRqstAcapNo', 'reqIttApreNo', 'prlstCdCn', 'blNoCn', 'cargMtNo', 'ovrsEntsConm']) setter(id, '');
    setter('qryStrtDt', job.search.from); setter('qryEndDt', job.search.to);
    setter('prnm', job.search.product_term); setter('owrEntsConm', job.search.importer_term);
    const state = {token: request.token, filters: JSON.stringify(filters()), changed: false, lastChange: 0};
    window.__visionSearchObserver?.disconnect();
    window.__visionSearchState = state;
    let observedTable = listControl('qryTbl1');
    const observer = new MutationObserver(records => {
      let currentTable;try{currentTable=listControl('qryTbl1');}catch{currentTable=null;}
      const replaced = currentTable !== observedTable;
      if (replaced || records.some(record => observedTable?.contains(record.target))) {
        state.changed = true; state.lastChange = Date.now();
      }
      observedTable = currentTable;
    });
    // Listen across replacement of the table or its AJAX wrapper, but ignore
    // unrelated page mutations when deciding whether search results refreshed.
    observer.observe(document.body, {childList: true, subtree: true, characterData: true});
    window.__visionSearchObserver = observer;
    click('btnQry', '조회');
    return {status: 'query_requested'};
  }
  const listRecord = () => {
    if (!isList()) fail('조회 화면이 바뀌었습니다.');
    const state = window.__visionSearchState;
    if (!state || state.token !== request.token) fail('검색 후 화면이 다시 로드되어 조회 연결을 확인하지 못했습니다. 아직 원문 열기·복사를 실행하지 않았습니다.');
    const nowFilters = filters();
    if (state.filters !== JSON.stringify(nowFilters)) {
      const before = new Map(JSON.parse(state.filters));
      const changed = nowFilters.filter(([id, value]) => before.get(id) !== value).map(([id]) => id);
      fail('조회 중 검색 조건이 변경되었습니다: ' + changed.join(', '));
    }
    if (!state.changed || Date.now() - state.lastChange < 600) return null;
    if (selected('reqApreIttCd') !== norm('식품의약품안전처') || selected('reqApfmCd') !== norm('수입식품등의수입신고서')) fail('조회 서식이 다릅니다.');
    const table = listControl('qryTbl1');
    const checks = [...table.querySelectorAll('input[type=checkbox][name=check]')];
    const matches = [];
    for (const check of checks) {
      const rows = [check.closest('tr')];
      for (let row = rows[0].nextElementSibling; row && !row.querySelector('input[name=check]'); row = row.nextElementSibling) rows.push(row);
      if (rows.length !== 3) fail('실적 목록의 행 구조가 달라 중단했습니다. 확인된 묶음 행 수: ' + rows.length);
      const cells = rows.flatMap(row => [...row.querySelectorAll('td')]);
      const links = rows.flatMap(row => [...row.querySelectorAll('a')]).filter(a => text(a) === job.source_application);
      if (!links.length) continue;
      if (links.length !== 1) fail('지정한 신청번호 링크가 여러 개여서 중단했습니다.');
      const unmatched = [];
      if (!cells.some(cell => norm(text(cell)) === norm(job.identity.product_name))) unmatched.push('제품명');
      if (!cells.some(cell => company(text(cell)) === company(job.identity.importer_name))) unmatched.push('수입화주');
      if (!cells.some(cell => norm(text(cell)) === norm(job.identity.manufacturer_name))) unmatched.push('제조업소');
      if (unmatched.length) fail('지정한 실적에서 일치를 확인하지 못한 항목: ' + unmatched.join(', '));
      const combined = cells.map(text).join(' ');
      if (!combined.includes('통관완료') || /취하|취소|반려/.test(combined)) fail('통관완료 실적을 확인하지 못했습니다.');
      matches.push({check, signature: rows.map(text).join('\n')});
    }
    if (matches.length !== 1) fail('현재 조회 결과에서 지정한 실적을 하나로 찾지 못했습니다. 검색 기간·첫 페이지 결과를 확인해 주세요.');
    return matches[0];
  };
  if (request.action === 'result' || request.action === 'open') {
    const record = listRecord();
    if (!record) return {status: 'waiting_for_results'};
    if (request.action === 'result') return {status: 'matched', signature: record.signature};
    if (record.signature !== request.signature) fail('검토 이후 실적 목록이 바뀌었습니다.');
    for (const box of listControl('qryTbl1').querySelectorAll('input[type=checkbox][name=check]')) {
      const wanted = box === record.check;
      if (box.checked !== wanted) box.click();
      if (box.checked !== wanted) fail('실적 선택을 확인할 수 없습니다.');
    }
    if (listRecord()?.signature !== request.signature) fail('선택 중 실적 목록이 바뀌었습니다.');
    click('btnApfmOdv', '신청서 원문보기');
    return {status: 'original_requested'};
  }
  const originalIdentity = () => {
    if (location.pathname !== originalPath) fail('원문보기 화면이 아닙니다.');
    const cellValues = [...document.querySelectorAll('td')].map(text);
    const labelled = label => [...document.querySelectorAll('th')].filter(th => norm(text(th)) === norm(label)).map(th => text(th.nextElementSibling || th));
    if (!labelled('신청번호').some(value => value === job.source_application)) fail('원문 신청번호가 다릅니다.');
    if (!cellValues.some(value => value.replace(/[-\s]/g, '') === job.identity.importer_id.replace(/[-\s]/g, '')) ||
        !cellValues.some(value => norm(value) === norm(job.identity.manufacturer_id)) ||
        !cellValues.some(value => norm(value) === norm(job.identity.manufacturer_name))) fail('원문 화주·제조업소 등록정보가 다릅니다.');
    const table = one('CSW0101002S_prlstTbl');
    if (table.querySelectorAll('input[type=radio][name=CSW0101002S_prlstSlct]').length !== 1) fail('첫 검색·복사 시험은 단일 품목 실적만 지원합니다.');
    if (!productValues(table).some(value => norm(value) === norm(job.identity.product_name))) fail('원문 제품명이 다릅니다.');
    return JSON.stringify({application: labelled('신청번호'), cells: cellValues});
  };
  if (request.action === 'original' || request.action === 'copy') {
    const signature = originalIdentity();
    if (request.action === 'original') return {status: 'original_matched', signature};
    if (signature !== request.signature) fail('원문이 확인 이후 바뀌었습니다.');
    if (window.__visionCopyClicked) fail('이 창에서는 이미 복사를 요청했습니다. 결과 확인 전 다시 실행하지 않습니다.');
    window.__visionCopyClicked = true;
    click('btnNewChg', '신청서복사');
    return {status: 'copy_requested'};
  }
  if (request.action === 'draft') {
    const pre = 'CSW0101001S_';
    if (!document.getElementById(pre + 'reqRqstNo3')) return {status: 'not_draft'};
    if (one(pre + 'reqRqstNo3').value.trim()) fail('채번된 문서이므로 시험을 중단했습니다.');
    if (one(pre + 'prlstTbl').querySelectorAll('input[type=radio][name=CSW0101001S_prlstSlct]').length !== 1) fail('복사본의 단일 품목을 확인하지 못했습니다.');
    if (one(pre + 'impOwrBrno').value.replace(/[-\s]/g, '') !== job.identity.importer_id.replace(/[-\s]/g, '')) fail('복사본 수입화주가 작업 파일과 다릅니다.');
    if (norm(one(pre + 'mnfcCoPermDclrNo').value) !== norm(job.identity.manufacturer_id)) fail('복사본 제조업소 등록번호가 작업 파일과 다릅니다.');
    if (!productValues(one(pre + 'prlstTbl')).some(value => norm(value) === norm(job.identity.product_name))) fail('복사본 품목 목록의 제품명을 확인하지 못했습니다.');
    return {status: 'draft_verified', saved: false, submitted: false};
  }
  fail('허용하지 않은 동작입니다.');
  } catch (error) {
    return {status: 'blocked', action: request?.action || 'unknown',
      reason: error?.message || '화면 확인 중 알 수 없는 오류가 발생했습니다.'};
  }
}
