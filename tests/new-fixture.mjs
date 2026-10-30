// Synthetic UNI-PASS-like page built from screenshot/manual structure, not a live-site DOM capture.
const esc=s=>String(s??'').replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;');
export const P='CSW0101001S_';
export function newFixture(job){
 const input=(id,value='',ro=false)=>`<input id="${P+id}" value="${esc(value)}" ${ro?'readonly':''}>`;
 const field=(label,id,value='')=>`<tr><th>${label}</th><td>${input(id,value)}</td></tr>`;
 const lookup=(label,id,kind)=>`<tr><th>${label}</th><td>${input(id,'',true)}<button data-lookup="${kind}" data-target="${P+id}" title="조회">⌕</button></td></tr>`;
 const table=(id,headers)=>`<table id="${P+id}"><thead><tr>${headers.map(h=>'<th>'+h+'</th>').join('')}</tr></thead><tbody></tbody></table>`;
 const section=(name,html)=>`<h3>${name}</h3><table>${html}</table>`;
 const panel=(key,html)=>`<section data-panel="${key}" ${key==='common'?'':'hidden'}>${html}</section>`;
 return `<body><style>[hidden]{display:none!important}td,th{border:1px solid #ccc}input{width:130px}</style>${input('reqRqstNo1','TEST')}${input('reqRqstNo2','26')}${input('reqRqstNo3')}
 <nav>${Object.entries({common:'공통사항',items:'품목사항',types:'복합구성제품',labels:'한글표시사항정보',processes:'제조/가공공정',ingredients:'성분/재질',attachments:'첨부파일'}).map(([k,v])=>`<button data-tab="${k}">${v}</button>`).join('')}</nav>
 ${panel('common',section('기본사항',`<tr><th>신고제품구분</th><td><select id="category"><option>농·임산물</option><option>가공식품</option></select></td></tr><tr><th>신고기관</th><td><select><option>TEST 기관</option></select></td></tr>`)+section('신청인',field('전화번호','aplcTelno')+field('휴대전화번호','aplcCralTelno'))+section('수입신고대행업체',field('사업자등록번호','agencyBrno')+lookup('허가(등록,신고)번호','agencyLicense','agency'))+section('수입신고인(수입화주)',field('사업자등록번호','impOwrBrno')+lookup('허가(등록,신고)번호','impOwrPermDclrNo','importer')+field('휴대폰번호','ownerMobile'))+section('해외제조업소(해외작업장)',lookup('등록번호','mnfcCoPermDclrNo','manufacturer'))+section('검사(반입)장소',lookup('보관창고코드','inscBrngFdmcSfkpWrhsCd','warehouse')+lookup('검사기관','inspect','inspection'))+section('신고일반',lookup('용도','purpose','purpose')+lookup('생산국(제조국)','origin','country')+lookup('수출국','export','country')+field('선적일자','shpmDt')))}
 ${panel('items',section('신고품목공통정보',field('세번부호(HSK번호)','hsk')+lookup('총수량','unit','unit')+field('B/L번호','blNoCn'))+section('품목정보',['mdlStszEnglNmPrlst','mdlStszKoreNmPrlst','dclrQtyPrlst','mdlStszNtwgPrlst','mdlStszAmtPrlst','circPridStrtDtPrlst','circPridEndDtPrlst'].map(id=>field(id,id)).join('')+`<tr><th>대표품목여부</th><td><label><input type="radio" name="representative" id="yes" checked>예</label><label><input type="radio" name="representative" id="no">아니오</label></td></tr><tr><th>화물관리번호</th><td>${input('cargMtNoPrlst1')}${input('cargMtNoPrlst2')}${input('cargMtNoPrlst3')}<button data-lookup="cargo" title="조회">⌕</button></td></tr>`)+`<button id="add-item">추가</button>`+table('prlstTbl',['품목식별부호','화물관리번호','총수량','순중량','과세가격','선택']))}
 ${panel('types','<button id="add-type">행추가</button>'+table('typesFixture',['선택','순번','품목코드','품목명','이력번호']))}
 ${panel('labels','<button id="add-label">행추가</button>'+table('koreIndcMatrTbl',['선택','순번','표시사항','표시사항 명칭','표시사항 내용']))}
 ${panel('processes',section('제조/가공공정',`<tr><th>분류코드</th><td>${input('fdmcProcProgCd','',true)}</td></tr>`)+`<button data-lookup="process">일괄검색</button><button id="add-process">추가</button>`+table('mnfcProgTbl',['분류코드','분류명칭','선택']))}
 ${panel('ingredients','<button id="add-main">주성분등록</button><button id="add-mix">혼합성분등록</button>'+table('mnigTbl',['순번','상위순번','구분','성분코드','성분명','배합비율','제품 구분','품목 유형','추가']))}
 ${panel('attachments',`<table id="${P}attachTbl">${Array.from({length:19},(_,i)=>`<tr><td>${i+1}</td><td><select><option>--선택--</option><option>파일첨부</option></select><input type="file" disabled></td></tr>`).join('')}</table>`)}
 <button id="validate">오류검증</button><button id="send">전송</button>
 <script>(${fixtureScript.toString()})(${JSON.stringify(job)});</script></body>`;
}
function fixtureScript(job){
 const P='CSW0101001S_',get=id=>document.getElementById(P+id),row=(table,html)=>{const r=get(table).querySelector('tbody').insertRow();r.innerHTML=html;return r;};window.counts={items:0,ingredients:0,validation:0,send:0};
 for(const b of document.querySelectorAll('[data-tab]'))b.onclick=()=>{for(const p of document.querySelectorAll('[data-panel]'))p.hidden=p.dataset.panel!==b.dataset.tab;};
 document.getElementById('category').onchange=()=>confirm('신고제품구분을 변경하면 입력한 모든 정보가 초기화됩니다. 변경하시겠습니까?');
 const defs={agency:['사업자등록번호',job.basic.대행업체허가번호,''],importer:['사업자등록번호',job.basic.화주허가번호,''],manufacturer:['등록번호',job.basic.제조업소등록번호,job.basic.제조업소명],warehouse:['보관창고코드',job.basic.보관창고코드,''],inspection:['검사기관코드',job.basic.검사기관코드,''],purpose:['용도코드',job.basic.용도,''],country:['국가코드',job.basic.생산국,''],unit:['단위코드',job.items[0].수량단위,'개']};
 function open(kind,target,definition){
  window.fixtureDefinition={kind,...definition};if(!definition&&defs[kind])window.fixtureDefinition={kind,field:defs[kind][0],code:defs[kind][1],name:defs[kind][2]};
  window.fixtureApply=(code,name)=>{if(kind==='cargo'){const c=job.items[0];get('cargMtNoPrlst1').value=c.화물관리번호.slice(0,11);get('cargMtNoPrlst2').value=c.화물관리번호.slice(11,15);get('cargMtNoPrlst3').value=c.화물관리번호.slice(15);get('blNoCn').value=c.HBL;}else if(kind==='process')get('fdmcProcProgCd').value=code;else{document.getElementById(target).value=code;if(kind==='ingredient'){const tr=document.getElementById(target).closest('tr');tr.cells[3].textContent=code;document.getElementById(target).value=name;}}};
  const path=kind==='cargo'?'/csp/myc/comn/ComnCdCtr/openMYC0801008Q.do':kind==='process'?'/csp/csw/infomt/cdmt/openCSW0302013Q.do':'/csp/testLookup.do';window.open(path,'lookup','width=800,height=700');
 }
 for(const b of document.querySelectorAll('[data-lookup]'))b.onclick=()=>open(b.dataset.lookup,b.dataset.target);
 document.getElementById('add-item').onclick=()=>{const value=id=>get(id).value;const i=++counts.items;
  row('prlstTbl',`<td rowspan="2">P${i}</td><td>${['cargMtNoPrlst1','cargMtNoPrlst2','cargMtNoPrlst3'].map(value).join('')}</td><td>${value('dclrQtyPrlst')}</td><td>${value('mdlStszNtwgPrlst')} kg</td><td>${value('mdlStszAmtPrlst')} (US$)</td><td><input type="radio"></td>`);
  row('prlstTbl',`<td>${value('mdlStszEnglNmPrlst')}</td><td>${value('mdlStszKoreNmPrlst')}</td><td>${value('circPridStrtDtPrlst')} ~ ${value('circPridEndDtPrlst')}</td>`);
  for(const id of ['mdlStszEnglNmPrlst','mdlStszKoreNmPrlst','dclrQtyPrlst','mdlStszNtwgPrlst','mdlStszAmtPrlst','circPridStrtDtPrlst','circPridEndDtPrlst','cargMtNoPrlst1','cargMtNoPrlst2','cargMtNoPrlst3'])get(id).value='';
 };
 document.getElementById('add-type').onclick=()=>{const i=get('typesFixture').tBodies[0].rows.length;const r=row('typesFixture',`<td><input type="checkbox"></td><td>${i+1}</td><td><input id="type${i}" readonly><button title="조회">⌕</button></td><td><input readonly></td><td><input></td>`);r.querySelector('button').onclick=()=>open('type','type'+i,{field:'제품유형코드',code:job.types[i].제품유형코드,name:job.types[i].제품유형명});};
 document.getElementById('add-label').onclick=()=>row('koreIndcMatrTbl','<td><input type="checkbox"></td><td>1</td><td><select><option value="">선택</option><option value="101">제품명</option><option value="112">원재료명</option></select></td><td><input></td><td><textarea></textarea></td>');
 document.getElementById('add-process').onclick=()=>{for(const code of get('fdmcProcProgCd').value.split('-').filter(Boolean))row('mnfcProgTbl',`<td>${code}</td><td>공정</td><td><input type="radio"></td>`);get('fdmcProcProgCd').value='';};
 function ingredient(parent='',kind='주'){
  const i=++counts.ingredients,r=row('mnigTbl',`<td>${i}</td><td>${parent}</td><td>${kind}</td><td></td><td><input id="ingredient${i}"><button title="조회">⌕</button></td><td><input></td><td><select><option value="">선택</option><option>가공식품</option><option>식품첨가물</option></select></td><td><input readonly><button title="조회">⌕</button></td><td><button>부성분추가</button><button>부혼합성분추가</button></td>`);
  r.cells[4].querySelector('button').onclick=()=>open('ingredient','ingredient'+i,{field:'식약성분코드',code:job.ingredients[i-1].성분코드,name:job.ingredients[i-1].성분명});
  r.cells[8].children[0].onclick=()=>ingredient(String(i),'부');r.cells[8].children[1].onclick=()=>ingredient(String(i),'부혼합');
 }
 document.getElementById('add-main').onclick=()=>ingredient();document.getElementById('add-mix').onclick=()=>ingredient('','혼합');
 for(const s of get('attachTbl').querySelectorAll('select'))s.onchange=()=>s.parentElement.querySelector('input').disabled=false;
 document.getElementById('validate').onclick=()=>{counts.validation++;alert('오류검증 결과 오류가 존재하지 않습니다.');};document.getElementById('send').onclick=()=>counts.send++;
 window.fixtureJob=job;
}
export const popupFixture=`<body><script>(${function(){
 const d=opener.fixtureDefinition,j=opener.fixtureJob;
 if(d.kind==='cargo'){
  document.body.innerHTML='<h3>화물관리번호 조회</h3><input type="hidden" id="MYC0801008Q_reqForm" value="CSW0101001S_cargMtNoPrlst|CSW0101001S_blNoCn"><select id="MYC0801008Q_qryTp"><option value="2">M B/L - H B/L</option></select><input id="MYC0801008Q_mblNo"><input id="MYC0801008Q_hblNo"><select id="MYC0801008Q_year"><option value="2026">2026년</option></select><button id="query">조회</button><table id="MYC0801008Q_result"><thead><tr><th>No</th></tr></thead><tbody></tbody></table>';
  document.getElementById('query').onclick=()=>{const c=j.items[0];document.querySelector('tbody').innerHTML='<tr><td>1</td><td><a href="#">'+c.화물관리번호+'</a></td><td>'+c.MBL+' - '+c.HBL+'</td><td></td><td></td><td></td><td></td></tr>';document.querySelector('a').onclick=()=>{opener.fixtureApply();close();};};
 }else if(d.kind==='process'){
  document.body.innerHTML='<h3>식약제조가공공정 조회</h3>'+j.processes.map(r=>'<a href="#">'+r.공정코드+'</a>').join(' ')+'<button>확인</button>';const codes=[];for(const a of document.querySelectorAll('a'))a.onclick=()=>codes.push(a.textContent);document.querySelector('button').onclick=()=>{opener.fixtureApply(codes.join('-'));close();};
 }else{
  document.body.innerHTML='<table><tr><th>'+d.field+'</th><td><input></td></tr></table><button>조회</button><table><thead><tr><th>코드</th><th>명칭</th></tr></thead><tbody></tbody></table>';
  document.querySelector('button').onclick=()=>{document.querySelector('tbody:last-child');const t=document.querySelectorAll('table')[1].tBodies[0];t.innerHTML='<tr><td>'+(d.kind==='unit'?d.code:'<a href="#">'+d.code+'</a>')+'</td><td>'+(d.kind==='unit'?'<a href="#">개</a>':d.name)+'</td></tr>';t.querySelector('a').onclick=()=>{opener.fixtureApply(d.code,d.name);close();};};
 }
}.toString()})();</script></body>`;
