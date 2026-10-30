import {readLibrary,changeLibrary} from './intake-library.js';
export const validPhone=value=>/^\+?[\d -]{8,22}$/.test(value)&&value.replace(/\D/g,'').length>=8;
export async function mountContact(container,onSaved=()=>{}){
 if(!container)return;
 const library=await readLibrary();if(!container.isConnected)return;
 const phone=library.company.신청인전화||'';
 container.replaceChildren();
 const title=document.createElement('strong');title.textContent='신청인 연락처';container.append(title);
 const display=document.createElement('div');display.className='toolbar';container.append(display);
 const form=document.createElement('form');form.className='toolbar';form.hidden=!!phone;
 const input=document.createElement('input');input.type='tel';input.autocomplete='tel';input.value=phone;input.placeholder='처음 한 번 전화번호 입력';input.setAttribute('aria-label','사용자 연락처');input.required=true;
 const save=document.createElement('button');save.type='submit';save.className='button green';save.textContent='연락처 저장';
 const message=document.createElement('p');message.className='muted';message.setAttribute('role','status');message.textContent='유니패스 신청인 전화번호에 사용합니다. 이름·주소·이메일·휴대폰은 기존 값을 유지합니다.';
 form.append(input,save);container.append(form,message);
 const paint=value=>{display.replaceChildren();display.hidden=!value;form.hidden=!!value;if(value){const text=document.createElement('span');text.textContent=value;const edit=document.createElement('button');edit.type='button';edit.className='button small';edit.textContent='수정';edit.onclick=()=>{display.hidden=true;form.hidden=false;input.focus();};display.append(text,edit);}};
 paint(phone);
 form.onsubmit=async event=>{event.preventDefault();const value=input.value.trim();if(!validPhone(value)){message.textContent='전화번호 형식을 확인해주세요.';return;}save.disabled=true;try{const next=await changeLibrary(old=>({...old,company:{...old.company,신청인전화:value}}));await onSaved(next);paint(value);message.textContent='저장했습니다. 다음 작업부터 자동으로 사용합니다.';}catch(e){message.textContent=e.message;}finally{save.disabled=false;}};
}
