// Runs in the declaration's isolated world. Read-only; no page script eval,
// cookies, login credentials, or government save/submit requests.
export async function readCommonData(request) {
  try {
    const fail = message => { throw new Error(message); };
    if (location.origin !== 'https://unipass.customs.go.kr' || !location.pathname.startsWith('/csp/')) fail('UNI-PASS 신고서에서 실행해 주세요.');
    const prefix = 'CSW0101001S_';
    const one = suffix => {
      const nodes = document.querySelectorAll('#' + CSS.escape(prefix + suffix));
      if (nodes.length !== 1) fail('신고서 입력칸을 확인하지 못했습니다: ' + suffix);
      return nodes[0];
    };
    const value = suffix => String(one(suffix).value || '').trim();
    const norm = s => String(s || '').replace(/[\s-]/g, '').toUpperCase();
    // Allocation of an application number is not evidence of saving or
    // submission. Read the current editable form and bind later writes to
    // all three number components instead of requiring an empty suffix.
    const applicationRef = ['reqRqstNo1', 'reqRqstNo2', 'reqRqstNo3'].map(value);
    if (!/^[A-Z0-9]+$/i.test(applicationRef[0]) || !/^\d{2}$/.test(applicationRef[1]) ||
        (applicationRef[2] && !/^[A-Z0-9]+$/i.test(applicationRef[2]))) fail('신청번호 형식을 확인하지 못했습니다.');
    const dateInput = one('inscBrngDt');
    if (!dateInput.getClientRects().length || getComputedStyle(dateInput).visibility === 'hidden') fail('신고서의 공통사항 탭을 먼저 열어 주세요.');
    for (const suffix of ['inscBrngDt', 'aplcTelno', 'aplcCralTelno']) {
      const node = one(suffix);
      if (!(node instanceof HTMLInputElement) || node.type !== 'text' || node.readOnly || node.matches(':disabled')) fail('편집 가능한 신청서가 아닙니다: ' + suffix);
    }
    const table = one('prlstTbl');
    const radios = table.querySelectorAll('input[name="CSW0101001S_prlstSlct"]');
    if (radios.length !== 1) fail('단일 품목 신고만 지원합니다.');
    const first = radios[0].closest('tr');
    const second = first?.nextElementSibling;
    const cellValue = cell => {
      const input = cell?.querySelector('input[readonly]');
      return String(input ? input.value : cell?.textContent || '').trim();
    };
    // Read the committed grid, never the cleared item editor. Locate cargo
    // by its complete format; the identifier column uses rowspan.
    const cargoValues = [...new Set([...first.cells].map(cellValue).map(norm).filter(v => /^\d{2}[A-Z0-9]{9}\d{8}$/.test(v)))];
    if (cargoValues.length !== 1) fail('품목 목록에서 단일 화물관리번호를 확인하지 못했습니다.');
    const cargo = cargoValues[0];
    const product = cellValue(second?.cells[0]);
    if (!/^\d{2}[A-Z0-9]{9}\d{8}$/.test(cargo) || !product) fail('품목 목록의 화물번호·제품명을 확인하지 못했습니다. 품목 수정 반영 여부를 확인해 주세요.');
    const context = {};
    for (const field of ['reqRqstNo1', 'aplcNm', 'aplcEml1', 'aplcEml2', 'inscBrngFdmcSfkpWrhsCd']) context[field] = value(field);
    if (!context.aplcNm || !context.reqRqstNo1) fail('현재 신청인 정보를 확인하지 못했습니다.');
    if (!/^\d{8}$/.test(context.inscBrngFdmcSfkpWrhsCd)) fail('보관창고코드 8자리를 확인해야 합니다.');
    const snapshot = {application_ref: applicationRef, identity: {product_name: product, cargo_mt_no: cargo,
      importer_id: value('impOwrBrno'), manufacturer_id: value('mnfcCoPermDclrNo'),
      bl: value('blNoCn'), applicant_name: context.aplcNm}, context,
      warehouse_name: value('inscBrngPlcNm'), phone: value('aplcTelno'), mobile: value('aplcCralTelno'),
      entry_date: value('inscBrngDt')};
    if (Object.values(snapshot.identity).some(v => !v)) fail('제품·화주·제조업소·B/L 연결을 확인해 주세요.');
    if (request.action === 'read') return {status: 'read', snapshot};
    if (request.action !== 'lookup') fail('허용하지 않은 조회 동작입니다.');
    // Chrome serialization may reorder object keys. Compare the actual query
    // binding, not a JSON string or unrelated phone/date display formatting.
    const expected=request.snapshot;
    if(!expected||!Array.isArray(expected.application_ref)||expected.application_ref.length!==3)fail('반입일 조회 대상 정보가 없습니다.');
    const changed=[];
    if(applicationRef.some((v,i)=>v!==expected.application_ref[i]))changed.push('신청번호');
    const labels={product_name:'제품명',cargo_mt_no:'화물관리번호',importer_id:'수입화주',manufacturer_id:'제조업소',bl:'B/L',applicant_name:'신청인'};
    for(const [k,label] of Object.entries(labels))if(snapshot.identity[k]!==expected.identity?.[k])changed.push(label);
    const contextLabels={reqRqstNo1:'신고인부호',aplcNm:'신청인',aplcEml1:'이메일',aplcEml2:'이메일',inscBrngFdmcSfkpWrhsCd:'보관창고코드'};
    for(const [k,label] of Object.entries(contextLabels))if(context[k]!==expected.context?.[k])changed.push(label);
    if(changed.length)fail('조회 전 신고 대상이 바뀌었습니다: '+[...new Set(changed)].join(', ')+'. 다시 읽어 주세요.');

    // Endpoint and fields observed in official MYC0405102Q.js and HTML.
    // Public read-only query: omit credentials, paginate, never use arrival
    // or customs processing timestamps as a fallback for warehouse entry.
    const endpoint = '/csp/myc/bsopspptinfo/cscllgstinfo/ImpCargPrgsInfoMtCtr/retrieveImpCargPrgsInfoDtl.do';
    const decode = s => String(s || '').replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex, dec) => {
      const n = parseInt(hex || dec, hex ? 16 : 10);
      return n <= 0x10ffff ? String.fromCodePoint(n) : '';
    }).replace(/&amp;/g, '&').trim();
    const records = [];
    let total = null;
    for (let page = 1; page <= 5; page++) {
      const params = new URLSearchParams({cargMtNo: cargo, firstIndex: String((page - 1) * 100),
        recordCountPerPage: '100', page: String(page), pageIndex: String(page), pageSize: '100', pageUnit: '100'});
      const response = await fetch(endpoint + '?' + params, {credentials: 'omit', redirect: 'error',
        headers: {'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest'}, signal: AbortSignal.timeout(15000)});
      if (!response.ok) fail('화물진행정보 조회 응답 오류: ' + response.status);
      const data = await response.json();
      if (data.errMsg) fail('유니패스 화물조회가 완료되지 않았습니다.');
      const master = data.resultListM;
      if (!master || norm(master.cargMtNo) !== cargo || norm(master.hblNo) !== norm(snapshot.identity.bl)) fail('조회된 화물관리번호 또는 H B/L이 신고서와 다릅니다.');
      const count = Number(data.count);
      if (!Number.isInteger(count) || count < 1 || count > 500 || !Array.isArray(data.resultListL)) fail('화물 이력 건수를 확인하지 못했습니다.');
      if (total !== null && total !== count) fail('조회 중 화물 이력이 변경됐습니다. 다시 조회해 주세요.');
      total = count;
      if (data.resultListL.length !== Math.min(100, total - records.length)) fail('전체 화물 이력을 받지 못했습니다. 날짜를 자동 선택하지 않습니다.');
      records.push(...data.resultListL);
      if (records.length === total) break;
    }
    const relevant = records.filter(row => {
      const site = decode(row.snarSgn).split('/')[0].trim();
      return site === context.inscBrngFdmcSfkpWrhsCd &&
        (row.cdValtVal === 'CAGE01' || decode(row.cargTrcnRelaBsopTpcd).includes('반입'));
    });
    if (relevant.length !== 1) fail(relevant.length ? '해당 창고의 반입 이력이 여러 건입니다. 자동 선택하지 않습니다.' : '신고서 보관창고와 일치하는 반입 이력이 없습니다.');
    const row = relevant[0];
    if (row.cdValtVal !== 'CAGE01' || decode(row.cargTrcnRelaBsopTpcd) !== '반입신고') fail('정상 반입신고 이력인지 확인해야 합니다.');
    const at = decode(row.rlbrDttm);
    if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(at)) fail('실제 반입일시가 없습니다. 처리일시로 대신 입력하지 않습니다.');
    const date = new Date(at.replace(' ', 'T') + 'Z');
    if (isNaN(date.getTime()) || date.toISOString().slice(0, 19) !== at.replace(' ', 'T')) fail('반입일시 형식이 올바르지 않습니다.');
    return {status: 'looked_up', entry: {date: at.slice(0, 10), at,
      warehouse_code: context.inscBrngFdmcSfkpWrhsCd, warehouse_name: decode(row.snarKoreNm),
      cargo_mt_no: cargo, bl: snapshot.identity.bl, retrieved_at: new Date().toISOString(),
      source: 'UNI-PASS 화물진행정보 · 반입신고 · 반출입(처리)일시', endpoint}};
  } catch (error) { return {status: 'blocked', reason: error.message || '공통사항 조회를 완료하지 못했습니다.'}; }
}
