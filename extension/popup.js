import {openTool,chooseUnipassTab,guardToolNavigation} from './assist-navigation.js';
import {collectFormStructure} from './collect.js';
import {fillDraftFields} from './fill.js';

const $ = id => document.getElementById(id);
const key = 'visionFormMapsV1';
$('open-workflow').addEventListener('click', () => openTool('workflow.html'));
$('open-cargo').addEventListener('click', async () => {
  try {
    const tab = await chooseUnipassTab(); if(!tab)return;
    if (!tab?.id || !tab.url?.startsWith('https://unipass.customs.go.kr/csp/')) throw new Error('복사된 신고서 탭에서 열어 주세요.');
    openTool('cargo-workflow.html?tab='+tab.id);
  } catch(error) { $('notice').textContent=error.message; }
});
$('open-common').addEventListener('click', async () => {
  try {
    const tab = await chooseUnipassTab(); if(!tab)return;
    if (!tab?.id || !tab.url?.startsWith('https://unipass.customs.go.kr/csp/')) throw new Error('신고서 공통사항 탭에서 열어 주세요.');
    openTool('common-assist.html?tab='+tab.id);
  } catch (error) { $('notice').textContent = error.message; }
});
const read = async () => (await chrome.storage.local.get(key))[key] || [];
let busy = false;
const originalPath = '/csp/csw/reqrqstmt/apfmmt/foodEtcImpDcshMtCtr/retrieveApfmOdv.do';
const isOriginal = tab => {
  try {
    const url = new URL(tab?.url);
    return url.protocol === 'https:' && url.hostname === 'unipass.customs.go.kr' && url.pathname === originalPath;
  } catch { return false; }
};

async function refresh() {
  const captures = await read();
  $('captures').replaceChildren();
  for (const item of captures) {
    const li = document.createElement('li');
    const count = item.frames.reduce((n, frame) => n + frame.fields.length, 0);
    li.textContent = `${item.step}: 입력칸 ${count}개 (${item.frames.length}개 프레임)`;
    $('captures').append(li);
  }
  $('export').disabled = busy || !captures.length;
  $('clear').disabled = busy || !captures.length;
  $('capture').disabled = busy;
  $('step').disabled = busy;
  $('find-original').disabled = busy;
  $('original-target').disabled = busy;
  $('capture-original').disabled = busy || !$('original-target').value;
}

async function captureScreen(originalTabId = null) {
  if (busy) return;
  busy = true;
  $('capture').disabled = true;
  $('notice').textContent = '현재 화면 구조를 읽는 중입니다.';
  try {
    const tab = originalTabId === null
      ? await chooseUnipassTab()
      : await chrome.tabs.get(originalTabId);
    if(!tab)return;
    await refresh();
    if (originalTabId !== null && !isOriginal(tab)) throw new Error('선택한 원문보기 창이 닫혔거나 다른 화면으로 바뀌었습니다. 다시 찾아주세요.');
    if (!tab?.id || !tab.url) throw new Error('현재 탭을 확인하지 못했습니다. UNI-PASS에서 확장 도구를 다시 여세요.');
    const url = new URL(tab.url);
    if (url.protocol !== 'https:' || url.hostname !== 'unipass.customs.go.kr' || !url.pathname.startsWith('/csp/')) {
      throw new Error('로그인한 UNI-PASS 신고 화면에서 실행해 주세요.');
    }
    let results;
    let partial = false;
    try {
      results = await chrome.scripting.executeScript({target: {tabId: tab.id, allFrames: true}, func: collectFormStructure});
    } catch {
      partial = true;
      results = await chrome.scripting.executeScript({target: {tabId: tab.id}, func: collectFormStructure});
    }
    if (results.some(item => item.result?.status === 'authentication_screen')) {
      throw new Error('인증 화면은 수집하지 않습니다. 로그인을 끝낸 신고 화면에서 실행해 주세요.');
    }
    if (results.some(item => item.result?.status !== 'ok')) partial = true;
    const frames = results.filter(item => item.result?.status === 'ok')
      .map(item => ({frame_id: item.frameId, ...item.result}));
    if (originalTabId !== null && !frames.some(frame => frame.frame_id === 0 && frame.pathname === originalPath)) {
      throw new Error('원문보기 화면인지 확인하지 못했습니다. 다시 찾아주세요.');
    }
    if (!frames.some(frame => frame.fields.length || frame.buttons.length)) {
      throw new Error('입력칸이나 버튼을 찾지 못했습니다. 화면 로딩이 끝난 뒤 다시 읽어 주세요.');
    }
    const entry = {step: originalTabId === null ? $('step').value : '신청서 원문보기', captured_at: new Date().toISOString(),
      partial, frames};
    const previous = await read();
    // Replace the same step/path instead of accumulating repeated reads of one screen.
    const next = previous.filter(item => item.step !== entry.step ||
      item.frames[0]?.pathname !== entry.frames[0]?.pathname);
    next.push(entry);
    if (next.length > 20) throw new Error('최대 20개 화면까지 저장할 수 있습니다. 먼저 수집 파일을 저장해 주세요.');
    await chrome.storage.local.set({[key]: next});
    const clipped = frames.some(frame => frame.truncated);
    $('notice').textContent = `${entry.step} 수집 완료. 신고 값은 변경하지 않았습니다.` +
      (partial ? '\n일부 프레임은 읽지 못했습니다. 이 상태로 파일을 보내주셔도 됩니다.' : '') +
      (clipped ? '\n화면이 커서 일부 항목만 수집했습니다.' : '');
  } catch (error) {
    $('notice').textContent = '수집하지 못했습니다: ' + (error.message || '알 수 없는 오류');
  } finally {
    busy = false;
    await refresh();
  }
}
$('capture').addEventListener('click', () => captureScreen());
$('original-target').addEventListener('change', () => refresh());
$('capture-original').addEventListener('click', () => {
  const id = Number($('original-target').value);
  if ($('original-target').value && Number.isInteger(id)) captureScreen(id);
});
$('find-original').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  $('original-target').replaceChildren(new Option('찾는 중입니다', ''));
  try {
    // Request directly within the user gesture, before querying other windows.
    const grant = chrome.permissions.request({origins: ['https://unipass.customs.go.kr/*']});
    await refresh();
    if (!await grant) throw new Error('UNI-PASS 접근 권한이 허용되지 않았습니다. 창을 읽지 않았습니다.');
    const tabs = (await chrome.tabs.query({url: 'https://unipass.customs.go.kr/*'})).filter(isOriginal);
    $('original-target').replaceChildren(new Option(tabs.length ? '읽을 창을 선택하세요' : '열린 원문보기 창이 없습니다', ''));
    for (const tab of tabs) {
      $('original-target').append(new Option(`원문보기 · 창 ${tab.windowId} / 탭 ${tab.id}`, String(tab.id)));
    }
    if (tabs.length === 1) $('original-target').value = String(tabs[0].id);
    $('notice').textContent = tabs.length
      ? `원문보기 ${tabs.length}개를 찾았습니다. 선택한 원문보기 읽기를 누르세요.`
      : '신청번호를 눌러 원문보기 창을 열어둔 뒤 다시 찾아주세요.';
  } catch (error) {
    $('original-target').replaceChildren(new Option('다시 찾아주세요', ''));
    $('notice').textContent = error.message || '원문보기 창을 찾지 못했습니다.';
  } finally {
    busy = false;
    await refresh();
  }
});

$('export').addEventListener('click', async () => {
  try {
    const captures = await read();
    if (!captures.length) return;
    const data = {format: 'vision-unipass-form-map', version: 1, captures};
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vision-unipass-form-map.json';
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    $('notice').textContent = '다운로드한 JSON 파일을 이 대화에 첨부해 주세요.';
  } catch (error) {
    $('notice').textContent = '파일 저장 실패: ' + error.message;
  }
});

$('clear').addEventListener('click', async () => {
  await chrome.storage.local.remove(key);
  $('notice').textContent = '확장 도구에 저장된 수집 내용을 지웠습니다. 신고 내용은 바뀌지 않았습니다.';
  await refresh();
});
refresh().catch(() => { $('notice').textContent = '확장 도구 저장소를 열지 못했습니다.'; });

let fillJob = null;
let fillReview = null;
let fillTab = null;
let fillBusy = false;
const resetFillReview = () => {
  fillReview = null;
  fillTab = null;
  $('apply-fill').disabled = true;
  $('fill-preview').replaceChildren();
};
$('job-file').addEventListener('change', async () => {
  resetFillReview();
  fillJob = null;
  $('preview-fill').disabled = true;
  try {
    const file = $('job-file').files[0];
    if (!file) return;
    if (file.size > 200000) throw new Error('입력 작업 파일은 200KB 이하만 지원합니다.');
    const data = JSON.parse(await file.text());
    if (data.format !== 'vision-unipass-fill-job' || data.version !== 1) {
      throw new Error('화면 수집 파일이 아닌, 별도로 준비한 입력 작업 파일이 필요합니다.');
    }
    fillJob = data;
    $('preview-fill').disabled = false;
    $('fill-notice').textContent = '작업 파일을 읽었습니다. 아직 신고값을 바꾸지 않았습니다.';
  } catch (error) {
    $('fill-notice').textContent = error.message;
  }
});

async function runFill(mode) {
  if (fillBusy || !fillJob) return;
  fillBusy = true;
  $('preview-fill').disabled = true;
  $('apply-fill').disabled = true;
  $('job-file').disabled = true;
  try {
    const tab = mode === 'apply' ? await chrome.tabs.get(fillTab) : await chooseUnipassTab(); if(!tab)return;
    if (!tab?.id || !tab.url) throw new Error('현재 신고 탭을 찾지 못했습니다.');
    const url = new URL(tab.url);
    if (url.protocol !== 'https:' || url.hostname !== 'unipass.customs.go.kr' || !url.pathname.startsWith('/csp/')) {
      throw new Error('UNI-PASS 신고 작성 화면에서 실행해 주세요.');
    }
    if (mode === 'apply' && (!fillReview || fillTab !== tab.id)) throw new Error('현재 화면에서 대상과 변경값을 다시 확인해 주세요.');
    const results = await chrome.scripting.executeScript({target: {tabId: tab.id, frameIds: [0]},
      func: fillDraftFields, args: [{mode, job: fillJob, review_hash: fillReview}]});
    const result = results[0]?.result;
    if (!result) throw new Error('입력 결과를 받지 못했습니다. 자동 재실행하지 말고 현재 화면을 확인해 주세요.');
    if (mode === 'preview') {
      if (result.status !== 'preview') throw new Error('미리보기 결과를 확인하지 못했습니다.');
      resetFillReview();
      fillReview = result.review_hash;
      fillTab = tab.id;
      for (const change of result.changes) {
        const row = document.createElement('p');
        row.textContent = `${change.label}: ${change.before || '(비어 있음)'} → ${change.after}${change.same ? ' (동일)' : ''}\n출처: ${change.source}`;
        $('fill-preview').append(row);
      }
      $('fill-notice').textContent = '대상 제품·화주·B/L 일치를 확인했습니다. 변경값을 확인한 뒤 입력을 누르세요.';
      $('apply-fill').disabled = false;
    } else {
      resetFillReview();
      $('fill-notice').textContent = result.status === 'fields_filled' ? result.note :
        `${result.note || '입력을 중단했습니다.'}\n${result.error || ''}`;
      if (result.status !== 'fields_filled') fillJob = null;
    }
  } catch (error) {
    resetFillReview();
    if (mode === 'apply') fillJob = null;
    $('fill-notice').textContent = error.message + (mode === 'apply' ? '\n일부 값이 반영됐을 수 있으니 현재 화면을 확인해 주세요.' : '');
  } finally {
    fillBusy = false;
    $('job-file').disabled = false;
    $('preview-fill').disabled = !fillJob;
  }
}
$('preview-fill').addEventListener('click', () => runFill('preview'));
$('apply-fill').addEventListener('click', () => runFill('apply'));

guardToolNavigation(()=>busy||fillBusy);
