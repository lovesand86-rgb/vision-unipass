const allowed=/\.(png|jpe?g|bmp|gif|tiff?|pdf)$/i;
// Kept for older imports; fixed attachment areas no longer infer roles from names.
export function photoRole(name){const label=/한글|표시|label/i.test(name),front=/전면|정면|front/i.test(name);return label!==front?(label?'label':'front'):'other';}
export function createPhotoPicker(root,onChange=()=>{}){
 let busy=false;
 const groups=[{role:'label',title:'한글표시사항',limit:1,items:[]},{role:'front',title:'제품 전면',limit:1,items:[]},{role:'other',title:'기타 사진·서류',limit:9,items:[]}];
 root.replaceChildren();
 const hint=document.createElement('p');hint.id='photo-hint';hint.className='photo-hint';hint.setAttribute('role','status');
 const notify=s=>{hint.textContent=s;};
 const count=()=>groups.reduce((n,g)=>n+g.items.length,0);
 // Attachments are optional; each provided file already has an explicit slot.
 const ready=()=>count()>0;
 for(const g of groups){
  const section=document.createElement('section');section.className='photo-section';section.dataset.role=g.role;
  const title=document.createElement('h3');title.textContent=g.title+' · '+(g.limit===1?'1개':'최대 9개');section.append(title);
  const drop=document.createElement('button');drop.type='button';drop.className='photo-drop';drop.id='photo-drop-'+g.role;drop.textContent='＋ 끌어놓거나 눌러서 선택';drop.setAttribute('aria-label',g.title+' 파일 선택');
  const input=document.createElement('input');input.type='file';input.id='photo-files-'+g.role;input.className='sr-only';input.tabIndex=-1;input.multiple=g.limit>1;input.accept='.png,.jpg,.jpeg,.bmp,.gif,.tif,.tiff,.pdf';
  const list=document.createElement('div');list.className='photo-list';section.append(drop,input,list);root.append(section);
  Object.assign(g,{drop,input,list});
  drop.onclick=()=>{if(!busy)input.click();};input.onchange=()=>{add(g,input.files);input.value='';};
  for(const event of ['dragover','drop'])section.addEventListener(event,e=>{e.preventDefault();e.stopPropagation();if(busy)return;if(event==='dragover'){drop.classList.add('dragging');e.dataTransfer.dropEffect='copy';}else{drop.classList.remove('dragging');add(g,e.dataTransfer.files);}});
  section.addEventListener('dragleave',e=>{if(!section.contains(e.relatedTarget))drop.classList.remove('dragging');});
 }
 root.append(hint);
 function render(){
  for(const g of groups){
   g.drop.disabled=g.input.disabled=busy;g.list.replaceChildren();
   g.drop.textContent=g.limit===1&&g.items.length?'파일 바꾸기':'＋ 끌어놓거나 눌러서 선택';
   for(const [i,item]of g.items.entries()){
    const card=document.createElement('div');card.className='photo-card';
    if(item.url){const img=document.createElement('img');img.src=item.url;img.alt=item.file.name;card.append(img);}else{const icon=document.createElement('span');icon.className='photo-icon';icon.textContent=/\.pdf$/i.test(item.file.name)?'PDF':'이미지';card.append(icon);}
    const name=document.createElement('span');name.className='photo-name';name.textContent=item.file.name;card.append(name);
    const actions=document.createElement('div');actions.className='photo-actions';
    if(g.limit>1)for(const [label,delta]of [['앞으로',-1],['뒤로',1]]){
     const b=document.createElement('button');b.type='button';b.textContent=delta<0?'←':'→';b.setAttribute('aria-label',item.file.name+' '+label);b.disabled=busy||i+delta<0||i+delta>=g.items.length;
     b.onclick=()=>{if(busy)return;[g.items[i],g.items[i+delta]]=[g.items[i+delta],g.items[i]];render();onChange();};actions.append(b);
    }
    const remove=document.createElement('button');remove.type='button';remove.textContent='삭제';remove.setAttribute('aria-label',item.file.name+' 삭제');remove.disabled=busy;remove.onclick=()=>{if(busy)return;if(item.url)URL.revokeObjectURL(item.url);g.items=g.items.filter(x=>x!==item);render();onChange();};actions.append(remove);card.append(actions);g.list.append(card);
   }
  }
  notify(count()?`${count()}개 준비됨 · 입력할 때 함께 첨부합니다.`:'이미지·PDF · 파일당 5MB');
 }
 function add(g,files){
  if(busy)return;const incoming=[...files];
  if(!incoming.length)return;
  if(g.limit===1&&incoming.length>1){notify(g.title+'은 1개만 넣어주세요.');return;}
  const bad=incoming.find(f=>!allowed.test(f.name)||!f.size||f.size>5000000);if(bad){notify(bad.name+' · 이미지 또는 PDF, 5MB 이하만 넣어주세요.');return;}
  const unique=incoming.filter((f,i)=>incoming.findIndex(x=>x.name===f.name&&x.size===f.size&&x.lastModified===f.lastModified)===i).filter(f=>g.limit===1||!g.items.some(x=>x.file.name===f.name&&x.file.size===f.size&&x.file.lastModified===f.lastModified));
  if(g.limit>1&&g.items.length+unique.length>g.limit){notify('기타 사진·서류는 최대 9개입니다.');return;}
  if(g.limit===1){for(const item of g.items)if(item.url)URL.revokeObjectURL(item.url);g.items=[];}
  g.items.push(...unique.map(file=>({file,url:/\.(png|jpe?g|bmp|gif)$/i.test(file.name)?URL.createObjectURL(file):null})));
  render();onChange();
 }
 for(const event of ['dragover','drop'])document.addEventListener(event,e=>{if([...e.dataTransfer?.types||[]].includes('Files'))e.preventDefault();});
 render();return {ready,count,setBusy(value){busy=value;render();},files(){return groups.flatMap(g=>g.items.map((x,i)=>({slot:g.role==='label'?0:g.role==='front'?9:10+i,file:x.file})));}};
}
