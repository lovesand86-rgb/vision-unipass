// Only the exact informational notice approved by the user is accepted.
// No Runtime evaluation, input injection, network inspection or other dialog action.
export const LABEL_NOTICE = '수입신고서의 한글표시사항 기재내용이 실제 현품 포장지와 다른 경우가 많이 있습니다. 이로 인해 수입식품 전자심사에 큰 지장을 초래하고 있으니 신고서 작성시 한글표시사항 기재내용과 현품 포장지의 한글표시 내용이 일치하도록 주의를 당부드립니다.(중요)';
const originalPath = '/csp/csw/reqrqstmt/apfmmt/foodEtcImpDcshMtCtr/retrieveApfmOdv.do';
const allowedUrl = value => {
  try { const url = new URL(value); return url.origin === 'https://unipass.customs.go.kr' && url.pathname === originalPath; }
  catch { return false; }
};
const normalized = value => typeof value === 'string' ? value.replace(/\s/g, '') : '';
export async function watchLabelNotice(tabId, report = () => {}) {
  if (!Number.isInteger(tabId) || tabId <= 0) throw new Error('확인창을 처리할 원문 탭을 확인하지 못했습니다.');
  const tab = await chrome.tabs.get(tabId);
  if (!allowedUrl(tab.url)) throw new Error('지정한 원문보기 창이 바뀌었습니다. 안내창을 자동 확인하지 않았습니다.');
  const target = {tabId};
  let attached = false, ended = false, consumed = false, dialogOpen = false, commandSent = false, timer;
  let closing = null;
  const stop = () => {
    if (closing) return closing;
    ended = true;
    clearTimeout(timer);
    chrome.debugger.onEvent.removeListener(onEvent);
    chrome.debugger.onDetach.removeListener(onDetach);
    closing = (async () => {
      if (attached) {
        attached = false;
        try { await chrome.debugger.detach(target); } catch { /* Closed or already detached target. */ }
      }
    })();
    return closing;
  };
  const onDetach = source => {
    if (source.tabId !== tabId) return;
    attached = false;
    if (!ended && !consumed) report('확인창 자동 처리 연결이 종료됐습니다. 남아 있는 알림은 직접 확인해 주세요.');
    void stop();
  };
  const onEvent = (source, method, params) => {
    if (ended || source.tabId !== tabId || source.sessionId) return;
    if (method === 'Page.javascriptDialogClosed') {
      dialogOpen = false;
      if (!commandSent) void stop();
      return;
    }
    if (method !== 'Page.javascriptDialogOpening') return;
    if (consumed) { dialogOpen = false; void stop(); return; }
    dialogOpen = true;
    consumed = true; // One dialog only, even if the command response is lost.
    void (async () => {
      try {
        const current = await chrome.tabs.get(tabId);
        if (!allowedUrl(current.url) || !allowedUrl(params?.url) || params?.type !== 'alert' ||
            normalized(params?.message) !== normalized(LABEL_NOTICE)) {
          report('등록된 한글표시사항 안내와 다른 알림입니다. 자동 확인하지 않았습니다. 내용을 직접 확인해 주세요.');
          return;
        }
        if (ended || !attached || !dialogOpen) return;
        commandSent = true;
        await chrome.debugger.sendCommand(target, 'Page.handleJavaScriptDialog', {accept: true});
        report('한글표시사항 안내 문구를 확인하고 확인 버튼을 자동 처리했습니다.');
      } catch (error) {
        report('안내창 확인 결과를 확인하지 못했습니다. 자동 재시도하지 않습니다. ' + (error.message || ''));
      } finally { await stop(); }
    })();
  };
  chrome.debugger.onEvent.addListener(onEvent);
  chrome.debugger.onDetach.addListener(onDetach);
  try {
    let startupTimer;
    try {
      await Promise.race([
        (async () => {
          await chrome.debugger.attach(target, '1.3');
          if (ended) {
            // A late attach belongs to us; do not leave it active after timeout.
            try { await chrome.debugger.detach(target); } catch { /* Target closed. */ }
            return;
          }
          attached = true;
          timer = setTimeout(() => { void stop(); }, 35000);
          await chrome.debugger.sendCommand(target, 'Page.enable');
        })(),
        new Promise((_, reject) => { startupTimer = setTimeout(() => reject(new Error('확인창 연결 응답 시간이 지났습니다.')), 5000); })
      ]);
    } finally { clearTimeout(startupTimer); }
    return {stop};
  } catch (error) {
    await stop();
    throw new Error('확인창 자동 처리에 연결하지 못했습니다. 확장 권한 또는 이 탭의 다른 디버깅 연결을 확인해 주세요. 다른 연결은 해제하지 않았습니다. ' + (error.message || ''));
  }
}
