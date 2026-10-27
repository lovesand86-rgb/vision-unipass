const allowed=/\.(png|jpe?g|bmp|gif|tif|pdf)$/i;
export function photoRole(name){
 const label=/한글|표시|label/i.test(name),front=/전면|정면|front/i.test(name);
 return label!==front?(label?'label':'front'):'other';
}
export function createPhotoPicker(root,onChange=()=>{}){
 let items=[],busy=false;
 root.innerHTML='<button type="button" class="photo-drop" id="photo-drop"><span>＋</span><strong>사진을 놓거나 눌러서 선택</strong><small>여러 장을 한 번에 넣을 수 있어요</small></button><input id="photo-files" class="sr-only" tabindex="-1" type="file" multiple accept=".png,.jpg,.jpeg,.bmp,.gif,.tif,.pdf"><p id="photo-hint" class="photo-hint" role="status"></p><div id="photo-list" class="photo-list"></div>';
 const input=root.querySelector('input'),drop=root.querySelector('.photo-drop'),list=root.querySelector('.photo-list'),hint=root.querySelector('.photo-hint');
 const notify=message=>{hint.textContent=message;};
 function render(){
  list.replaceChildren();
  for(const [i,item]of items.entries()){
   const card=document.createElement('div');card.className='photo-card';
   if(item.url){const img=document.createElement('img');img.src=item.url;img.alt=item.file.name;card.append(img);}else{const icon=document.createElement('span');icon.className='photo-icon';icon.textContent='파일';card.append(icon);}
   const name=document.createElement('span');name.className='photo-name';name.textContent=item.file.name;card.append(name);
   const select=document.createElement('select');select.setAttribute('aria-label',item.file.name+' 사진 종류');
   for(const [value,label]of [['label','한글표시'],['front','제품 전면'],['other','기타 사진']])select.append(new Option(label,value));select.value=item.role;select.disabled=busy;
   select.onchange=()=>{if(busy)return;if(select.value!=='other')for(const other of items)if(other!==item&&other.role===select.value)other.role='other';item.role=select.value;render();onChange();};card.append(select);
   const actions=document.createElement('div');actions.className='photo-actions';
   for(const [label,delta]of [['앞으로',-1],['뒤로',1]]){
    const b=document.createElement('button');b.type='button';b.textContent=delta<0?'←':'→';b.setAttribute('aria-label',item.file.name+' '+label);b.disabled=busy||i+delta<0||i+delta>=items.length;
    b.onclick=()=>{if(busy)return;[items[i],items[i+delta]]=[items[i+delta],items[i]];render();onChange();};actions.append(b);
   }
   const remove=document.createElement('button');remove.type='button';remove.textContent='삭제';remove.setAttribute('aria-label',item.file.name+' 삭제');remove.disabled=busy;remove.onclick=()=>{if(busy)return;if(item.url)URL.revokeObjectURL(item.url);items=items.filter(x=>x!==item);render();onChange();};actions.append(remove);card.append(actions);list.append(card);
  }
  drop.disabled=busy;input.disabled=busy;
  notify(!items.length?'파일당 5MB · 최대 11장':ready()?`${items.length}장 준비됨 · 입력할 때 함께 첨부합니다.`:'미리보기에서 한글표시와 제품 전면을 골라주세요.');
 }
 function add(files){
  if(busy)return;
  const incoming=[...files].filter(f=>!items.some(x=>x.file.name===f.name&&x.file.size===f.size&&x.file.lastModified===f.lastModified));
  const unique=incoming.filter((f,i)=>incoming.findIndex(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified)===i);
  if(items.length+unique.length>11){notify('사진은 최대 11장까지 넣을 수 있습니다.');return;}
  const bad=unique.find(f=>!allowed.test(f.name)||!f.size||f.size>5000000);if(bad){notify(bad.name+' · 지원 형식과 5MB 제한을 확인해주세요.');return;}
  unique.sort((a,b)=>a.name.localeCompare(b.name,'ko',{numeric:true}));
  const next=unique.map(file=>({file,role:photoRole(file.name),url:/\.(png|jpe?g|bmp|gif)$/i.test(file.name)?URL.createObjectURL(file):null}));
  for(const role of ['label','front'])if(items.some(x=>x.role===role)||next.filter(x=>x.role===role).length>1)for(const item of next)if(item.role===role)item.role='other';
  items.push(...next);render();onChange();
 }
 function ready(){return items.some(x=>x.role==='label')&&items.some(x=>x.role==='front')&&items.filter(x=>x.role==='other').length<=9;}
 drop.onclick=()=>{if(!busy)input.click();};input.onchange=()=>{add(input.files);input.value='';};
 for(const event of ['dragover','drop'])root.addEventListener(event,e=>{e.preventDefault();e.stopPropagation();if(busy)return;if(event==='dragover'){drop.classList.add('dragging');e.dataTransfer.dropEffect='copy';}else{drop.classList.remove('dragging');add(e.dataTransfer.files);}});
 root.addEventListener('dragleave',e=>{if(!root.contains(e.relatedTarget))drop.classList.remove('dragging');});
 // Dropping outside the picker must not navigate away from selected photos.
 for(const event of ['dragover','drop'])document.addEventListener(event,e=>{if([...e.dataTransfer?.types||[]].includes('Files'))e.preventDefault();});
 render();
 return {ready,count:()=>items.length,setBusy(value){busy=value;render();},files(){
  if(items.length&&!ready())return [];
  return items.filter(x=>x.role==='label').map(x=>({slot:0,file:x.file})).concat(items.filter(x=>x.role==='front').map(x=>({slot:9,file:x.file})),items.filter(x=>x.role==='other').map((x,i)=>({slot:10+i,file:x.file})));
 }};
}
