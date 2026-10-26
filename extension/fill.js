// Self-contained function for Chrome's isolated execution world.
// Observed IDs only; no arbitrary selector, script, click or submit in a job.
export async function fillDraftFields(request) {
  const fail = message => { throw new Error(message); };
  if (location.protocol !== 'https:' || location.hostname !== 'unipass.customs.go.kr' ||
      !location.pathname.startsWith('/csp/')) fail('UNI-PASS 신고 작성 화면에서만 사용할 수 있습니다.');
  const prefix = 'CSW0101001S_';
  const one = suffix => {
    const nodes = document.querySelectorAll('#' + CSS.escape(prefix + suffix));
    if (nodes.length !== 1) fail('입력칸 구조가 달라 중단했습니다: ' + suffix);
    return nodes[0];
  };
  const visible = node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const norm = value => String(value).trim().replace(/\s+/g, ' ').toUpperCase();
  const business = value => String(value).replace(/-/g, '').trim();
  const fields = {
    cartons: ['item', 'dclrQtyPrlst', '수량', 'decimal'],
    net_kg: ['item', 'mdlStszNtwgPrlst', '순중량', 'decimal'],
    amount_usd: ['item', 'mdlStszAmtPrlst', '과세가격', 'decimal'],
    expiry_date: ['item', 'circPridEndDtPrlst', '소비기한 종료일', 'date'],
    shipment_date: ['common', 'shpmDt', '선적일자', 'date'],
    entry_date: ['common', 'inscBrngDt', '반입일자', 'date'],
    applicant_phone: ['common', 'aplcTelno', '신청인 전화번호', 'phone'],
    applicant_mobile: ['common', 'aplcCralTelno', '신청인 휴대전화번호', 'phone']
  };
  const job = request?.job;
  if (!['preview', 'apply'].includes(request?.mode) || !job ||
      job.format !== 'vision-unipass-fill-job' || job.version !== 1 ||
      !['item', 'common'].includes(job.phase) || typeof job.job_id !== 'string' || !job.job_id.trim() ||
      !job.identity || !job.fields || Array.isArray(job.fields)) fail('지원하는 입력 작업 파일이 아닙니다.');
  const keys = Object.keys(job.fields);
  if (!keys.length || keys.some(key => !Object.hasOwn(fields, key) || fields[key][0] !== job.phase)) {
    fail('이 시험에서 허용하지 않은 입력 항목이 있습니다.');
  }
  for (const key of ['importer_id', 'manufacturer_id', 'product_name', 'bl']) {
    if (typeof job.identity[key] !== 'string' || !job.identity[key].trim()) fail('대상 제품·화물 식별정보가 필요합니다.');
  }
  const readValue = suffix => one(suffix).value;
  const checkIdentity = () => {
    // New common-assist jobs bind the complete application number observed
    // during review. Legacy unbound JSON jobs still require an unnumbered form.
    if (job.application_ref !== undefined) {
      const current = ['reqRqstNo1', 'reqRqstNo2', 'reqRqstNo3'].map(suffix => readValue(suffix).trim());
      if (job.phase !== 'common' || !job.common_context || !Array.isArray(job.application_ref) ||
          job.application_ref.length !== 3 || job.application_ref.some((part, i) => typeof part !== 'string' || part !== current[i])) {
        fail('조회한 신청번호와 현재 신청번호가 다릅니다. 현재 신고서를 다시 읽어 주세요.');
      }
    } else if (readValue('reqRqstNo3').trim()) {
      fail('이 작업 파일에는 현재 신청번호가 연결되지 않았습니다. 공통사항 자동 준비에서 현재 신고서를 읽어 주세요.');
    }
    if (business(readValue('impOwrBrno')) !== business(job.identity.importer_id)) fail('수입화주가 작업 파일과 다릅니다.');
    if (norm(readValue('mnfcCoPermDclrNo')) !== norm(job.identity.manufacturer_id)) fail('제조업소가 작업 파일과 다릅니다.');
    if (norm(readValue('blNoCn')) !== norm(job.identity.bl)) fail('이번 B/L 연결을 먼저 확인해야 합니다.');
    const table = one('prlstTbl');
    if (table.querySelectorAll('input[name="CSW0101001S_prlstSlct"]').length !== 1) {
      fail('첫 연결 시험은 단일 품목 신고만 지원합니다.');
    }
    const productValues = [...[...table.querySelectorAll('td')].map(cell => cell.textContent),
      ...[...table.querySelectorAll('td input[readonly]')].filter(input => input.type === 'text').map(input => input.value)];
    if (!productValues.some(value => norm(value) === norm(job.identity.product_name))) {
      fail('품목 목록의 제품명이 작업 파일과 다릅니다.');
    }
    if (job.identity.cargo_mt_no && !productValues.some(value =>
      norm(value).replace(/-/g, '') === norm(job.identity.cargo_mt_no).replace(/-/g, ''))) {
      fail('품목 목록의 화물관리번호가 조회한 화물과 다릅니다.');
    }
    if (job.common_context) {
      const allowed = ['reqRqstNo1', 'aplcNm', 'aplcEml1', 'aplcEml2', 'inscBrngFdmcSfkpWrhsCd'];
      if (job.phase !== 'common' || Object.keys(job.common_context).length !== allowed.length ||
          Object.keys(job.common_context).some(key => !allowed.includes(key))) fail('공통사항 대조 정보 형식을 확인해야 합니다.');
      for (const suffix of allowed) {
        if (typeof job.common_context[suffix] !== 'string' || readValue(suffix).trim() !== job.common_context[suffix]) {
          fail('조회 이후 창고 또는 신청인이 변경됐습니다. 다시 확인해 주세요.');
        }
      }
    }
    if (job.phase === 'item') {
      if (norm(readValue('mdlStszEnglNmPrlst')) !== norm(job.identity.product_name)) fail('수정할 품목을 목록에서 먼저 선택해 주세요.');
      if (table.querySelectorAll('input[name="CSW0101001S_prlstSlct"]:checked').length !== 1) fail('품목 선택을 확인해야 합니다.');
    }
    if (keys.some(key => key.startsWith('applicant_'))) {
      if (typeof job.identity.applicant_name !== 'string' || !job.identity.applicant_name.trim() ||
          norm(readValue('aplcNm')) !== norm(job.identity.applicant_name)) fail('현재 신청인과 연락처 담당자가 일치하는지 확인해야 합니다.');
    }
  };
  const protectedSnapshot = () => ['mnfcProgTbl', 'mnigTbl'].map(suffix => {
    const table = one(suffix);
    return {suffix, text: table.textContent, html: table.innerHTML,
      controls: [...table.querySelectorAll('input,select,textarea')].map(node => ({
        id: node.id, value: node.value, checked: node.checked ?? null
      }))};
  });
  const digest = async data => {
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
  };
  const validValue = (value, kind) => {
    if (typeof value !== 'string' || !value.trim() || value.length > 100) fail('빈 값 또는 지원하지 않는 값입니다.');
    if (kind === 'decimal' && (!/^\d{1,15}(\.\d{1,6})?$/.test(value) || Number(value) <= 0)) fail('수량·중량·금액 형식을 확인해야 합니다.');
    if (kind === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('날짜는 YYYY-MM-DD 형식이어야 합니다.');
      const date = new Date(value + 'T00:00:00Z');
      if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail('실제로 존재하지 않는 날짜입니다.');
    }
    if (kind === 'phone' && !/^\+?[\d -]{8,22}$/.test(value)) fail('담당자 연락처 형식을 확인해야 합니다.');
  };
  const equivalent = (a, b, kind) => {
    if (kind === 'decimal') {
      const strip = value => value.replace(/,/g, '').trim().replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      return strip(a) === strip(b);
    }
    if (kind === 'phone') return a.replace(/[ -]/g, '') === b.replace(/[ -]/g, '');
    return a.trim() === b;
  };
  checkIdentity();
  const changes = keys.map(key => {
    const [, suffix, label, kind] = fields[key];
    const data = job.fields[key];
    if (!data || typeof data.source !== 'string' || !data.source.trim() || data.reviewed !== true) {
      fail('출처와 확인 상태가 없는 항목은 입력하지 않습니다: ' + label);
    }
    validValue(data.value, kind);
    const node = one(suffix);
    if (!(node instanceof HTMLInputElement) || node.type !== 'text' || node.readOnly || node.matches(':disabled') || !visible(node)) {
      fail('편집 가능한 해당 탭을 열어야 합니다: ' + label);
    }
    if (node.maxLength >= 0 && data.value.length > node.maxLength) fail('입력칸 길이 제한을 넘습니다: ' + label);
    return {key, suffix, label, kind, before: node.value, after: data.value,
      same: equivalent(node.value, data.value, kind), source: data.source};
  });
  const protectedBefore = protectedSnapshot();
  const application = ['reqRqstNo1', 'reqRqstNo2', 'reqRqstNo3', 'rqstDttm', 'fdmcDclrMnfuTpcd'].map(readValue);
  const reviewHash = await digest({job, changes, application, protectedBefore});
  if (request.mode === 'preview') return {status: 'preview', review_hash: reviewHash, changes,
    phase: job.phase, saved: false, submitted: false};
  if (request.review_hash !== reviewHash) fail('미리보기 이후 입력값 또는 대상 화면이 바뀌었습니다. 다시 확인해 주세요.');
  const applied = [];
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  try {
    checkIdentity();
    for (const change of changes) {
      if (change.same) continue;
      checkIdentity();
      if (JSON.stringify(protectedSnapshot()) !== JSON.stringify(protectedBefore)) fail('보존 대상 공정·성분 정보가 변경되어 중단했습니다.');
      const node = one(change.suffix);
      if (!visible(node) || node.readOnly || node.matches(':disabled') || node.value !== change.before) {
        fail('입력 중 화면 상태가 변경되어 중단했습니다.');
      }
      nativeSetter.call(node, change.after);
      applied.push(change.key);
      node.dispatchEvent(new Event('input', {bubbles: true}));
      node.dispatchEvent(new Event('change', {bubbles: true}));
      await new Promise(resolve => setTimeout(resolve, 150));
      if (!equivalent(one(change.suffix).value, change.after, change.kind)) fail('입력값이 유지되지 않아 중단했습니다: ' + change.label);
    }
    checkIdentity();
    if (JSON.stringify(protectedSnapshot()) !== JSON.stringify(protectedBefore)) fail('보존 대상 정보가 변경되어 중단했습니다.');
    for (const change of changes) {
      if (!equivalent(one(change.suffix).value, change.after, change.kind)) fail('최종 입력값 확인에 실패했습니다: ' + change.label);
    }
    return {status: 'fields_filled', applied, unchanged: changes.filter(c => c.same).map(c => c.key),
      saved: false, submitted: false, note: '입력칸 반영 확인. 품목 수정·오류검증·임시저장·전송은 실행하지 않았습니다.'};
  } catch (error) {
    return {status: 'stopped', applied, saved: false, submitted: false,
      note: '일부 입력이 반영됐을 수 있습니다. 자동 재실행하지 말고 화면을 확인해 주세요.', error: error.message};
  }
}
