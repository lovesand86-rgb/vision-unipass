// Passed as a self-contained function to chrome.scripting.executeScript.
// No writes, events, page function calls, requests, form values or HTML export.
export function collectFormStructure() {
  if (location.protocol !== 'https:' || location.hostname !== 'unipass.customs.go.kr' ||
      !location.pathname.startsWith('/csp/')) {
    return {status: 'excluded_origin'};
  }
  const visible = node => node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  if ([...document.querySelectorAll('input[type="password"]')].some(visible)) {
    return {status: 'authentication_screen'};
  }
  const cleanText = node => {
    if (!node) return '';
    const copy = node.cloneNode(true);
    copy.querySelectorAll('input,textarea,select,script,style,[hidden]').forEach(child => child.remove());
    return (copy.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 180);
  };
  const attr = (node, name) => (node.getAttribute(name) || '').slice(0, 200);
  const selectorFor = node => {
    if (node.id) {
      const candidate = '#' + CSS.escape(node.id);
      if (document.querySelectorAll(candidate).length === 1) return candidate;
    }
    const parts = [];
    for (let current = node; current && current.nodeType === 1; current = current.parentElement) {
      let part = current.tagName.toLowerCase();
      if (current.parentElement) {
        const siblings = [...current.parentElement.children].filter(sibling => sibling.tagName === current.tagName);
        part += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
      }
      parts.unshift(part);
    }
    return parts.join(' > ');
  };
  const labelFor = node => {
    const labels = [...(node.labels || [])].map(cleanText).filter(Boolean);
    if (labels.length) return labels.join(' / ').slice(0, 240);
    const references = attr(node, 'aria-labelledby').split(/\s+/).filter(Boolean);
    const aria = references.map(id => cleanText(document.getElementById(id))).filter(Boolean).join(' / ');
    if (aria) return aria.slice(0, 240);
    if (node.hasAttribute('aria-label')) return attr(node, 'aria-label');
    const cell = node.closest('td');
    const previous = cell && cell.previousElementSibling;
    if (previous && previous.tagName === 'TH') return cleanText(previous);
    return '';
  };
  const fields = [];
  const nodes = [...document.querySelectorAll('input,select,textarea')];
  for (const node of nodes.slice(0, 4000)) {
    const type = node.tagName === 'INPUT' ? node.type : node.tagName.toLowerCase();
    if (['hidden', 'password', 'submit', 'reset', 'button', 'image'].includes(type)) continue;
    if (/(password|passwd|csrf|token|secret|session)/i.test(node.id + ' ' + node.name)) continue;
    const selector = selectorFor(node);
    fields.push({
      selector, selector_matches: document.querySelectorAll(selector).length,
      tag: node.tagName.toLowerCase(), type, id: attr(node, 'id'), name: attr(node, 'name'),
      label: labelFor(node), visible: visible(node), disabled: node.matches(':disabled'),
      readonly: node.hasAttribute('readonly'), required: node.hasAttribute('required'),
      maxlength: attr(node, 'maxlength'), accept: attr(node, 'accept'), multiple: node.hasAttribute('multiple'),
      option_count: node.tagName === 'SELECT' ? node.options.length : null,
      table_id: node.closest('table')?.id || '',
      row_index: node.closest('tr')?.rowIndex ?? null,
      cell_index: node.closest('td,th')?.cellIndex ?? null
    });
  }
  const navigationNames = new Set(['공통사항', '품목사항', '복합구성제품', '한글표시사항정보',
    '제조/가공공정', '성분/재질', '도축/가공장', '식육종류/부위', '첨부파일',
    '조회', '검색', '신청서복사', '수정', '추가', '확인', '닫기', '오류검증', '임시저장', '전송', '채번']);
  const buttons = [];
  for (const node of [...document.querySelectorAll('button,input[type="button"],input[type="submit"],input[type="reset"],input[type="image"],a,[role="button"]')].slice(0, 4000)) {
    const label = node.tagName === 'INPUT' ? attr(node, node.type === 'image' ? 'alt' : 'value') : cleanText(node);
    if (node.tagName === 'A' && node.getAttribute('role') !== 'button' && !navigationNames.has(label)) continue;
    const selector = selectorFor(node);
    buttons.push({selector, selector_matches: document.querySelectorAll(selector).length,
      tag: node.tagName.toLowerCase(), id: attr(node, 'id'), label,
      title: attr(node, 'title'), visible: visible(node), disabled: node.matches(':disabled')});
  }
  return {status: 'ok', schema_version: 1, pathname: location.pathname,
    fields, buttons, frame_element_count: document.querySelectorAll('iframe,frame').length,
    truncated: nodes.length > 4000,
    excluded: ['form_values', 'selected_options', 'checkbox_state', 'option_text_and_values',
      'file_names_and_contents', 'password_and_hidden_inputs', 'cookies', 'storage', 'query_parameters', 'page_html']};
}
