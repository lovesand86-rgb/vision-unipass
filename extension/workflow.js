import {watchLabelNotice} from './label-notice.js';
import {declarationStep} from './search-copy.js';
import * as targets from './cargo-target.js';
const $ = id => document.getElementById(id);
const key = 'visionCopyAttemptV1';
const origin = 'https://unipass.customs.go.kr/*';
const originalPath = '/csp/csw/reqrqstmt/apfmmt/foodEtcImpDcshMtCtr/retrieveApfmOdv.do';
let job = targets.searchTarget||null, busy = false;
const canChain=()=>job&&targets.searchTarget&&targets.itemTarget&&targets.commonTarget&&
  JSON.stringify(job)===JSON.stringify(targets.searchTarget);
let draftDiagnostics = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const status = message => { $('workflow-status').textContent = message; };
const log = message => { const li = document.createElement('li'); li.textContent = message; $('workflow-log').append(li); status(message); };
const refresh = () => {
  $('workflow-job').disabled = busy;
  $('find-list').disabled = busy || !job;
  $('list-target').disabled = busy;
  $('start-copy').disabled = busy || !job || !$('list-target').value;
  $('check-copy').disabled = busy || !job;
  $('closed-draft-ack').disabled = busy;
  $('close-attempt').disabled = busy || !job || !$('closed-draft-ack').checked;
  $('start-sequence').disabled=busy||!canChain();
};
const invoke = async (tabId, action, more = {}) => {
  let timer;
  let result;
  try {
    result = await Promise.race([
      chrome.scripting.executeScript({target: {tabId}, func: declarationStep, args: [{action, job, ...more}]}),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('화면 응답 대기 시간이 지났습니다. 남아 있는 알림창을 확인해 주세요. 자동 재복사는 하지 않습니다.')), 15000); })
    ]);
  } finally { clearTimeout(timer); }
  const main = result.find(frame => frame.frameId === 0);
  if (main?.result?.status === 'blocked') throw new Error(main.result.reason || '화면 검증을 통과하지 못했습니다.');
  if (main?.error) throw new Error('화면 실행 오류 (' + action + '): ' + (main.error.message || String(main.error)));
  if (!main?.result) throw new Error('화면 응답을 확인하지 못했습니다: ' + action);
  return main.result;
};
const digest = async () => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(job))))].map(b => b.toString(16).padStart(2, '0')).join('');
const save = attempt => chrome.storage.local.set({[key]: attempt});
const load = async () => (await chrome.storage.local.get(key))[key];
const tabs = () => chrome.tabs.query({url: origin});
const poll = async (fn, timeout = 20000) => {
  const until = Date.now() + timeout;
  while (Date.now() < until) { const result = await fn(); if (result) return result; await delay(350); }
  throw new Error('화면 전환을 확인하지 못했습니다. UNI-PASS 알림창·팝업 차단·현재 화면을 확인해 주세요.');
};
const checkDraft = async attempt => {
  const allTabs = await tabs();
  const candidates = allTabs.filter(tab => [attempt.listTab, attempt.originalTab].includes(tab.id) || !attempt.beforeCopyTabs.includes(tab.id));
  draftDiagnostics = [];
  if (!allTabs.length) draftDiagnostics.push('접근 가능한 UNI-PASS 창이 없습니다. 로그인 상태와 사이트 접근 권한을 확인해 주세요.');
  if (candidates.length < allTabs.length) draftDiagnostics.push(`복사 전부터 열려 있던 다른 탭 ${allTabs.length - candidates.length}개는 복사 성공으로 간주하지 않았습니다.`);
  const found = [];
  for (const tab of candidates) {
    try {
      const result = await invoke(tab.id, 'draft');
      if (result.status === 'draft_verified') found.push(tab);
      else draftDiagnostics.push(`탭 ${tab.id}: 신청서 작성 입력칸을 찾지 못했습니다.`);
    } catch (error) {
      draftDiagnostics.push(`탭 ${tab.id}: ${error.message || '화면을 읽지 못했습니다.'}`);
    }
  }
  if (found.length > 1) throw new Error('대상과 일치하는 복사본이 여러 개여서 자동 확정하지 않았습니다.');
  return found[0] || null;
};
const showDraft = async (attempt, tab) => {
  await save({...attempt, stage: 'copy_verified', draftTab: tab.id});
  log('제품·화주·제조업소가 맞는 채번 전 복사본을 확인했습니다. 화물 연결·입력·저장·전송은 아직 하지 않았습니다.');
  await chrome.tabs.update(tab.id, {active: true});
  await chrome.windows.update(tab.windowId, {focused: true});
};
$('workflow-job').addEventListener('change', async () => {
  job = null;
  $('closed-draft-ack').checked = false;
  $('list-target').replaceChildren(new Option('처리현황을 찾아주세요', ''));
  $('job-summary').textContent = '';
  try {
    const file = $('workflow-job').files[0];
    if (!file || file.size > 200000) throw new Error('검색·복사 작업 JSON 파일을 선택해 주세요.');
    const value = JSON.parse(await file.text());
    if (value.format !== 'vision-unipass-search-copy' || value.version !== 1 || !value.identity || !value.search || !value.source_application) throw new Error('입력 시험 파일이 아닌 검색·복사 작업 파일을 선택해 주세요.');
    job = value;
    $('job-summary').textContent = `제품: ${job.identity.product_name}\n수입화주: ${job.identity.importer_name}\n복사할 실적: ${job.source_application}\n조회 기간: ${job.search.from} ~ ${job.search.to}`;
    status('열린 처리현황 찾기를 누르세요.');
  } catch (error) { status(error.message); }
  refresh();
});
$('list-target').addEventListener('change', refresh);
async function findLists() {
  if (busy || !job) return;
  busy = true;let foundOne=false;
  try {
    const granted = await chrome.permissions.request({origins: [origin]});
    refresh();
    if (!granted) throw new Error('UNI-PASS 사이트 접근 권한이 필요합니다.');
    const found = [];
    for (const tab of await tabs()) {
      try { if ((await invoke(tab.id, 'probe')).list) found.push(tab); } catch { /* Only known list screens. */ }
    }
    const previous=$('list-target').value;
    $('list-target').replaceChildren(new Option('처리현황 창을 선택하세요', ''));
    for (const tab of found) $('list-target').append(new Option(`처리현황 · 창 ${tab.windowId} / 탭 ${tab.id}`, String(tab.id)));
    if (found.length === 1) $('list-target').value = String(found[0].id);
    else if(found.some(t=>String(t.id)===previous))$('list-target').value=previous;
    foundOne=!!$('list-target').value;
    status(found.length ? '검색·복사 시작 버튼을 누르세요.' : '로그인한 UNI-PASS의 신청서 처리현황을 열어둔 뒤 다시 찾아주세요.');
  } catch (error) { status(error.message); } finally { busy = false; refresh(); }
  return foundOne;
}
$('find-list').addEventListener('click',findLists);
async function lockedRun(checkOnly,chain=false) {
  if (busy || !job) return;
  let handoff=null;
  const complete=async(attempt,tab)=>{await showDraft(attempt,tab);if(chain&&canChain())handoff=tab.id;};
  busy = true; refresh();
  status(checkOnly ? '열린 복사본을 다시 확인합니다.' : '이전 작업 기록과 실행 대상을 확인합니다.');
  try {
    await navigator.locks.request('vision-unipass-search-copy', {ifAvailable: true}, async lock => {
      if (!lock) throw new Error('다른 도구 창에서 진행 중입니다.');
      const fingerprint = await digest();
      let attempt = await load();
      if (checkOnly) {
        if (!attempt || attempt.fingerprint !== fingerprint || !attempt.beforeCopyTabs) throw new Error('이 작업의 복사 요청 기록이 없습니다.');
        const tab = await checkDraft(attempt);
        if (!tab) throw new Error('복사본을 아직 확인하지 못했습니다. 자동 재복사는 하지 않습니다.\n' + draftDiagnostics.join('\n'));
        await complete(attempt, tab); return;
      }
      if (attempt && ['copy_requested', 'copy_unknown', 'copy_verified'].includes(attempt.stage)) {
        if(chain&&attempt.fingerprint===fingerprint&&attempt.beforeCopyTabs){
          const existing=await checkDraft(attempt);
          if(existing){await complete(attempt,existing);return;}
        }
        throw new Error('이전에 복사를 요청한 기록이 있습니다. 해당 작업 파일로 복사 결과만 다시 확인해 주세요. 자동 재복사는 하지 않습니다.');
      }
      const listTab = Number($('list-target').value);
      if (!Number.isInteger(listTab) || !$('list-target').value) throw new Error('처리현황 창을 선택해 주세요.');
      const token = crypto.randomUUID();
      attempt = {fingerprint, token, listTab, source: job.source_application, stage: 'searching', started: new Date().toISOString()};
      await save(attempt);
      log('제품·화주로 기존 실적을 조회합니다.');
      await invoke(listTab, 'search', {token});
      const result = await poll(async () => { const value = await invoke(listTab, 'result', {token}); return value.status === 'matched' ? value : null; });
      log('지정한 통관완료 실적의 제품·화주·제조업소가 일치합니다. 원문을 엽니다.');
      await invoke(listTab, 'open', {token, signature: result.signature});
      const original = await poll(async () => {
        const found = [];
        for (const tab of await tabs()) {
          if (new URL(tab.url).pathname !== originalPath) continue;
          try {
            const result = await invoke(tab.id, 'original');
            if (result.status === 'original_matched') found.push({tab, result});
          } catch { /* Read-only matching before selecting any popup. */ }
        }
        if (found.length > 1) throw new Error('같은 실적 원문보기 창이 여러 개입니다. 하나만 남겨 주세요. 아직 복사하지 않았습니다.');
        return found[0];
      });
      const guard = await watchLabelNotice(original.tab.id, log);
      try {
        log('원문 신청번호·제품·등록정보를 확인했습니다. 신청서복사를 한 번 요청합니다. 지정된 한글표시사항 안내는 자동 확인합니다.');
        attempt = {...attempt, originalTab: original.tab.id, beforeCopyTabs: (await tabs()).map(tab => tab.id), stage: 'copy_requested'};
        await save(attempt); // Persist before click: lost response must never repeat it.
        try {
          try {
            await invoke(original.tab.id, 'copy', {signature: original.result.signature});
          } catch {
            // The website may close the original popup immediately after copying.
            // A lost script response cannot justify repeating the click.
            log('복사 요청 응답이 끊겼습니다. 재클릭 없이 열린 복사본을 확인합니다.');
          }
          const draft = await poll(() => checkDraft(attempt), 30000);
          await complete(attempt, draft);
        } catch (error) {
          await save({...attempt, stage: 'copy_unknown'});
          throw new Error('복사 결과 확인이 필요합니다. ' + error.message + ' 복사 결과만 다시 확인 버튼을 이용해 주세요.\n' + draftDiagnostics.join('\n'));
        }
      } finally { await guard.stop(); }
    });
  } catch (error) { log(error.message || '확인할 수 없는 오류로 중단했습니다.'); }
  finally { busy = false; refresh(); }
  // The shared lock and notice debugger have been released before handoff.
  if(handoff!==null)location.assign('cargo-workflow.html?tab='+handoff+'&autorun=1');
}
$('start-sequence').addEventListener('click',async()=>{
  if(busy||!canChain())return;
  const attempt=await load();
  if(attempt&&attempt.fingerprint===await digest()&&['copy_requested','copy_unknown','copy_verified'].includes(attempt.stage)){
    await lockedRun(false,true);return;
  }
  if(await findLists())await lockedRun(false,true);
});
$('start-copy').addEventListener('click', () => lockedRun(false));
$('check-copy').addEventListener('click', () => lockedRun(true));
$('closed-draft-ack').addEventListener('change', refresh);
$('close-attempt').addEventListener('click', async () => {
  if (busy || !job || !$('closed-draft-ack').checked) return;
  busy = true; refresh();
  try {
    await navigator.locks.request('vision-unipass-search-copy', {ifAvailable: true}, async lock => {
      if (!lock) throw new Error('다른 도구 창에서 진행 중입니다.');
      const attempt = await load();
      if (!attempt || attempt.fingerprint !== await digest() ||
          !['copy_requested', 'copy_unknown', 'copy_verified'].includes(attempt.stage)) {
        throw new Error('선택한 작업 파일의 종료 가능한 복사 기록이 없습니다.');
      }
      const openTabs = await tabs();
      if (!openTabs.length) throw new Error('UNI-PASS 창을 확인할 수 없습니다. 로그인한 처리현황을 열어 주세요.');
      // Read all accessible UNI-PASS tabs, including pre-existing ones. A
      // failed read must not authorize another copy. Never close a form here.
      for (const tab of openTabs) {
        const result = await invoke(tab.id, 'draft_presence');
        if (result.status !== 'no_draft') {
          throw new Error(`탭 ${tab.id}에 신청서 작성 화면이 열려 있습니다. 해당 화면의 저장 여부를 먼저 확인해 주세요. 작업 기록은 유지했습니다.`);
        }
      }
      // Preserve the old attempt for diagnosis. No website click or new copy
      // occurs until the user explicitly starts search/copy again.
      const closed = {...attempt, stage: 'closed_by_user', previousStage: attempt.stage,
        closedAt: new Date().toISOString(), closure: 'user_confirmed_closed_without_save_or_submit'};
      await chrome.storage.local.set({[key]: closed, visionLastClosedCopyAttemptV1: closed});
      $('closed-draft-ack').checked = false;
      log('닫은 복사본 작업을 종료했습니다. 열린 처리현황 찾기 → 실적 검색 → 확인 → 복사본 열기 순서로 다시 시작하세요.');
    });
  } catch (error) { log(error.message || '작업을 종료하지 못했습니다. 이전 기록을 유지합니다.'); }
  finally { busy = false; refresh(); }
});
if(job){
  $('job-summary').textContent=`제품: ${job.identity.product_name}\n수입화주: ${job.identity.importer_name}\n복사할 실적: ${job.source_application}\n조회 기간: ${job.search.from} ~ ${job.search.to}`;
  status('작업 정보가 준비됐습니다. 검색부터 한 번에 시작을 누르세요.');
}
refresh();
