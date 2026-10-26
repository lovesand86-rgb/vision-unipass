export const VERSION='1.0.2';
export const STORAGE='visionAssistStateV1';
export const emptyState=()=>({schema:1,revision:0,jobs:[],settings:{checkOnOpen:false},activeJob:null});
export function validateJob(job,{complete=false}={}){
 const issues=[];
 if(!job||typeof job!=='object'||Array.isArray(job))return ['작업 형식이 올바르지 않습니다.'];
 if(!['new','history'].includes(job.kind))issues.push('작업 종류를 확인하세요.');
 if(typeof job.title!=='string'||!job.title.trim()||job.title.length>160)issues.push('작업 이름을 입력하세요.');
 if(!Array.isArray(job.fields)||job.fields.length>200)return [...issues,'자료는 최대 200항목까지 입력할 수 있습니다.'];
 const keys=new Set();
 for(const f of job.fields){
  if(!f||typeof f.label!=='string'||!f.label.trim()||f.label.length>120||typeof f.value!=='string'||f.value.length>10000||typeof f.source!=='string'||f.source.length>500){issues.push('항목 이름·값·출처 형식을 확인하세요.');continue;}
  if(keys.has(f.id))issues.push('중복된 자료 항목이 있습니다.');keys.add(f.id);
  if(complete&&(f.required||f.value.trim())){
   if(!f.value.trim())issues.push(`${f.label}: 값이 필요합니다.`);
   if(!f.source.trim())issues.push(`${f.label}: 자료 출처를 적어주세요.`);
   if(!f.reviewed)issues.push(`${f.label}: 원문 확인이 필요합니다.`);
  }
 }
 return [...new Set(issues)];
}
export function newJob(kind='new'){
 const names=kind==='new'?['제품명','수입업체','제조업소','원재료','제조공정','수량','순중량','금액','제조일자','소비기한','B/L 번호']:[];
 return {id:crypto.randomUUID(),kind,title:'',fields:names.map(label=>({id:crypto.randomUUID(),label,value:'',source:'',reviewed:false,required:false})),mappings:{},attempts:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'draft'};
}
export function parseRows(text){
 if(text.length>1000000)throw Error('자료가 너무 큽니다.');
 const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim());
 if(lines.length>201)throw Error('자료는 최대 200항목까지 지원합니다.');
 if(lines[0]?.startsWith('항목\t'))lines.shift();
 return lines.map((line,i)=>{const [label,value='',source='',...rest]=line.split('\t');if(!label?.trim()||rest.length)throw Error(`${i+1}행을 항목·값·출처 3열로 정리해주세요.`);return {id:crypto.randomUUID(),label:label.trim(),value,source,reviewed:false,required:false};});
}
export function readImport(text){
 if(text.length>2000000)throw Error('파일은 2MB 이하만 지원합니다.');
 const value=JSON.parse(text);
 if(value?.format!=='vision-assist-job'||value.schema!==1)throw Error('비전 어시스트에서 내보낸 작업 파일을 선택해주세요.');
 const job=structuredClone(value.job);const issues=validateJob(job);if(issues.length)throw Error(issues.join('\n'));
 // Imported files are data, never scripts or pre-authorized executions.
 return {...job,id:crypto.randomUUID(),mappings:{},attempts:[],status:'draft',fields:job.fields.map(f=>({...f,id:crypto.randomUUID(),reviewed:false})),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
}
export function parseLegacy(text){
 if(text.length>500000)throw Error('기존 작업 파일이 너무 큽니다.');
 const value=JSON.parse(text);
 const names={'vision-unipass-search-copy':'searchTarget','vision-unipass-cargo-job':'cargoTarget','vision-unipass-item-job':'itemTarget','vision-unipass-common-job':'commonTarget'};
 const key=names[value?.format];
 if(!key||value.version!==1||!value.identity)throw Error('지원하는 기존 작업 파일이 아닙니다.');
 return {key,value};
}
export const cleanExport=job=>JSON.stringify({format:'vision-assist-job',schema:1,job:{kind:job.kind,title:job.title,fields:job.fields}},null,2);
