import {guardToolNavigation} from './assist-navigation.js';
import {readCommonData} from './common-data.js';
import {fillDraftFields} from './fill.js';
const $ = id => document.getElementById(id);
const profileKey = 'visionApplicantProfilesV1';
const target = Number(new URL(location.href).searchParams.get('tab'));
let snapshot = null, entry = null, contact = null, review = null, busy = false, lookupError = '';
const status = message => { $('common-status').textContent = message; };
const profileId = s => JSON.stringify([s.context.reqRqstNo1, s.context.aplcNm,
  s.context.aplcEml1.toLowerCase(), s.context.aplcEml2.toLowerCase()]);
const profiles = async () => (await chrome.storage.local.get(profileKey))[profileKey] || {};
const call = async (func, arg) => {
  if (!Number.isInteger(target) || target <= 0) throw new Error('신고서 탭에서 확장 아이콘으로 다시 열어 주세요.');
  const frames = await chrome.scripting.executeScript({target: {tabId: target, frameIds: [0]}, func, args: [arg]});
  const frame = frames.find(f => f.frameId === 0);
  if (frame?.error) throw new Error(frame.error.message || '신고서 실행 오류');
  if (!frame?.result) throw new Error('신고서 응답이 없습니다. 신고서가 열려 있는지 확인해 주세요.');
  if (frame.result.status === 'blocked') throw new Error(frame.result.reason);
  return frame.result;
};
const refresh = () => {
  $('read-common').disabled = busy;
  $('retry-entry').disabled = busy;
  for (const id of ['contact-phone', 'contact-mobile', 'contact-ack', 'use-mobile', 'forget-contact']) $(id).disabled = busy || !snapshot;
  $('save-contact').disabled = busy || !snapshot || !$('contact-ack').checked;
  $('preview-common').disabled = busy || !snapshot || !entry || !contact;
  $('apply-common').disabled = busy || !review;
};
const clearReview = () => { review = null; $('common-preview').textContent = ''; };
const sameContext = async () => {
  const current = (await call(readCommonData, {action: 'read'})).snapshot;
  if (JSON.stringify(current.application_ref) !== JSON.stringify(snapshot.application_ref) ||
      JSON.stringify(current.identity) !== JSON.stringify(snapshot.identity) ||
      JSON.stringify(current.context) !== JSON.stringify(snapshot.context)) throw new Error('신고 대상·창고·신청인이 바뀌었습니다. 다시 조회해 주세요.');
  return current;
};
const run = async action => {
  if (busy) return;
  busy = true; refresh();
  try {
    await navigator.locks.request('vision-unipass-search-copy', {ifAvailable: true}, async lock => {
      if (!lock) throw new Error('다른 도구에서 작업 중입니다. 끝난 뒤 다시 실행해 주세요.');
      await action();
    });
  } catch (error) { clearReview(); status(error.message || '작업을 완료하지 못했습니다.'); }
  finally { busy = false; refresh(); }
};
async function read() {
  lookupError = '';
  $('entry-status').textContent = '반입일 조회 준비 중입니다.';
  $('retry-entry').hidden = true;
  try {
    snapshot = null; entry = null; contact = null; clearReview();
    $('contact-panel').hidden = true; $('common-summary').textContent = ''; $('entry-result').textContent = '';
    status('현재 신고서와 화물진행정보를 읽고 있습니다.');
    snapshot = (await call(readCommonData, {action: 'read'})).snapshot;
    $('common-summary').textContent = `신청번호: ${snapshot.application_ref[2] ? snapshot.application_ref.join('-') : '채번 전'}\n제품: ${snapshot.identity.product_name}\nB/L: ${snapshot.identity.bl}\n화물관리번호: ${snapshot.identity.cargo_mt_no}\n보관창고: ${snapshot.context.inscBrngFdmcSfkpWrhsCd} ${snapshot.warehouse_name}\n현재 신청인: ${snapshot.context.aplcNm}`;
    const saved = (await profiles())[profileId(snapshot)];
    contact = saved?.confirmed === true ? saved : null;
    $('contact-phone').value = contact?.phone || snapshot.phone;
    $('contact-mobile').value = contact?.mobile || snapshot.mobile;
    $('contact-ack').checked = !!contact;
    $('contact-panel').hidden = false;
    $('contact-notice').textContent = contact ? '이 담당자가 확인한 저장 연락처를 불러왔습니다.' : '신고서의 현재 연락처를 가져왔습니다. 이 담당자의 번호가 맞는지 최초 한 번 확인해 주세요.';
    // A lookup failure leaves the contact panel available, but never enables
    // entry-date input with a guessed date or an old preview.
    $('entry-status').textContent = '신고서는 읽었습니다. 보관창고와 일치하는 반입 이력을 조회하고 있습니다.';
    const found = (await call(readCommonData, {action: 'lookup', snapshot})).entry;
    if (!found) throw new Error('반입일 조회 결과를 받지 못했습니다.');
    await sameContext();
    entry = found;
    $('entry-result').textContent = `확인된 반입일: ${entry.date}\n창고: ${entry.warehouse_code} ${entry.warehouse_name}\n반입일시: ${entry.at}\n출처: ${entry.source}`;
    $('entry-status').textContent = '반입일 조회 완료';
    status(contact ? '반입일과 저장 연락처를 가져왔습니다. 가져온 값 확인을 누르세요.' : '반입일을 조회했습니다. 담당자 연락처를 한 번 확인해 저장해 주세요.');
  } catch (error) {
    entry = null;
    lookupError = error.message || '반입일 조회 응답을 받지 못했습니다.';
    $('entry-result').textContent = '';
    $('entry-status').textContent = `반입일 조회 미완료: ${lookupError}`;
    $('retry-entry').hidden = false;
    throw error;
  }
}
const retryRead = () => run(async () => {
  try { await read(); }
  finally { $('entry-status').scrollIntoView({block: 'center'}); }
});
$('read-common').addEventListener('click', retryRead);
$('retry-entry').addEventListener('click', retryRead);
const invalidateContact = () => { contact = null; $('contact-ack').checked = false; clearReview(); refresh(); };
for (const id of ['contact-phone', 'contact-mobile']) $(id).addEventListener('input', invalidateContact);
$('contact-ack').addEventListener('change', () => { contact = null; clearReview(); refresh(); });
$('use-mobile').addEventListener('click', () => { $('contact-phone').value = $('contact-mobile').value; invalidateContact(); });
$('save-contact').addEventListener('click', () => run(async () => {
  if (!snapshot || !$('contact-ack').checked) throw new Error('현재 담당자 연락처를 확인해 주세요.');
  await sameContext();
  const phone = $('contact-phone').value.trim(), mobile = $('contact-mobile').value.trim();
  if (!/^\+?[\d -]{8,22}$/.test(phone) || !/^01[016789][ -]?\d{3,4}[ -]?\d{4}$/.test(mobile)) throw new Error('전화번호와 휴대전화번호 형식을 확인해 주세요.');
  const stored = await profiles(), id = profileId(snapshot);
  if (!Object.hasOwn(stored, id) && Object.keys(stored).length >= 50) throw new Error('저장 가능한 담당자 수를 초과했습니다.');
  contact = {phone, mobile, confirmed: true, confirmed_at: new Date().toISOString()};
  stored[id] = contact;
  await chrome.storage.local.set({[profileKey]: stored});
  clearReview(); $('contact-notice').textContent = '이 담당자의 연락처를 저장했습니다. 다음 건에서 자동으로 불러옵니다.';
  status(entry ? '가져온 값 확인을 누르세요.' : `연락처는 저장했습니다. 반입일 조회 미완료: ${lookupError || '조회 결과 없음'}\n아래 ‘반입일 다시 조회’를 누르면 연락처를 다시 저장할 필요 없이 재조회합니다.`);
}));
$('forget-contact').addEventListener('click', () => run(async () => {
  if (!snapshot) return;
  const stored = await profiles(); delete stored[profileId(snapshot)];
  await chrome.storage.local.set({[profileKey]: stored}); invalidateContact();
  $('contact-notice').textContent = '이 담당자의 저장 연락처를 지웠습니다. 신고서 값은 변경하지 않았습니다.';
}));
$('preview-common').addEventListener('click', () => run(async () => {
  clearReview();
  if (!entry || !contact) throw new Error('반입일 조회와 담당자 연락처 확인이 필요합니다.');
  await sameContext();
  if (Date.now() - Date.parse(entry.retrieved_at) > 10 * 60 * 1000) throw new Error('조회한 지 10분이 지났습니다. 반입일을 다시 조회해 주세요.');
  const field = (value, source) => ({value, source, reviewed: true});
  const job = {format: 'vision-unipass-fill-job', version: 1, job_id: 'common-' + crypto.randomUUID(), phase: 'common',
    application_ref: snapshot.application_ref, identity: snapshot.identity, common_context: snapshot.context, fields: {
      entry_date: field(entry.date, `${entry.source} / 창고 ${entry.warehouse_code} / ${entry.at}`),
      applicant_phone: field(contact.phone, '현재 신청인 확인 연락처'),
      applicant_mobile: field(contact.mobile, '현재 신청인 확인 연락처')
    }};
  const result = await call(fillDraftFields, {mode: 'preview', job});
  if (result.status !== 'preview') throw new Error('입력 전 대조에 실패했습니다.');
  review = {job, hash: result.review_hash};
  $('common-preview').textContent = result.changes.map(c => `${c.label}: ${c.before || '(비어 있음)'} → ${c.after}${c.same ? ' (동일)' : ''}`).join('\n');
  status('가져온 값을 확인한 뒤 입력을 누르세요.');
}));
$('apply-common').addEventListener('click', () => run(async () => {
  if (!review) throw new Error('가져온 값을 먼저 확인해 주세요.');
  const selected = review; clearReview();
  await sameContext();
  if (Date.now() - Date.parse(entry.retrieved_at) > 10 * 60 * 1000) throw new Error('반입일을 다시 조회해 주세요.');
  const result = await call(fillDraftFields, {mode: 'apply', job: selected.job, review_hash: selected.hash});
  status(result.status === 'fields_filled' ? '반입일과 신청인 연락처 입력·읽기 확인을 마쳤습니다. 임시저장·전송은 하지 않았습니다.' : `${result.note || '입력을 중단했습니다.'}\n${result.error || ''}`);
}));
refresh();
run(read);

guardToolNavigation(()=>busy);
