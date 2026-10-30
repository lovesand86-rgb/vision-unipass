// Minimal OOXML reader. Local files only; reject macros, formulas and external links.
export async function readWorkbook(file){
 if(!/\.xlsx$/i.test(file.name)||file.size>10000000)throw Error('10MB 이하 .xlsx 양식을 선택해주세요.');
 const bytes=new Uint8Array(await file.arrayBuffer()),view=new DataView(bytes.buffer),entries=new Map();
 let eocd=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){eocd=i;break;}
 if(eocd<0)throw Error('엑셀 ZIP 구조를 읽을 수 없습니다.');
 let offset=view.getUint32(eocd+16,true),count=view.getUint16(eocd+10,true),total=0;if(count>500)throw Error('엑셀 내부 파일이 너무 많습니다.');
 const decoder=new TextDecoder();
 for(let i=0;i<count;i++){
  if(view.getUint32(offset,true)!==0x02014b50)throw Error('엑셀 파일이 손상됐습니다.');
  const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),packed=view.getUint32(offset+20,true),size=view.getUint32(offset+24,true),nl=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true);
  const name=decoder.decode(bytes.subarray(offset+46,offset+46+nl));offset+=46+nl+extra+comment;
  if(flags&1||!['0','8'].includes(String(method))||name.includes('..')||entries.has(name)||/vbaProject|externalLinks/i.test(name))throw Error('암호·매크로·외부 연결이 없는 전용 양식이 필요합니다.');
  total+=size;if(total>20000000)throw Error('압축 해제한 엑셀이 너무 큽니다.');
  if(view.getUint32(local,true)!==0x04034b50)throw Error('엑셀 파일이 손상됐습니다.');
  const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);if(start+packed>bytes.length)throw Error('엑셀 파일이 잘렸습니다.');
  let data=bytes.subarray(start,start+packed);
  if(method===8){const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();const parts=[];let length=0;for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>size||length>20000000){await reader.cancel();throw Error('엑셀 압축 크기가 다릅니다.');}parts.push(value);}data=new Uint8Array(length);let p=0;for(const part of parts){data.set(part,p);p+=part.length;}}
  if(data.length!==size)throw Error('엑셀 파일 크기가 다릅니다.');entries.set(name,decoder.decode(data));
 }
 const xml=name=>{const raw=entries.get(name);if(!raw||/<!DOCTYPE|<!ENTITY/i.test(raw))throw Error('엑셀 구성 파일이 없습니다: '+name);const d=new DOMParser().parseFromString(raw,'application/xml');if(d.querySelector('parsererror'))throw Error('엑셀 XML 형식이 다릅니다.');return d;};
 const shared=entries.has('xl/sharedStrings.xml')?[...xml('xl/sharedStrings.xml').getElementsByTagName('si')].map(e=>[...e.getElementsByTagName('t')].map(t=>t.textContent).join('')):[];
 const rels=new Map([...xml('xl/_rels/workbook.xml.rels').getElementsByTagName('Relationship')].map(e=>{if(e.getAttribute('TargetMode')==='External')throw Error('외부 연결 엑셀은 지원하지 않습니다.');return [e.getAttribute('Id'),e.getAttribute('Target')];}));
 const result={};for(const sheet of xml('xl/workbook.xml').getElementsByTagName('sheet')){
  const name=sheet.getAttribute('name'),target=rels.get(sheet.getAttribute('r:id'));if(!target)throw Error('시트 연결이 없습니다.');
  const path=target.startsWith('/')?target.slice(1):'xl/'+target;if(path.includes('..'))throw Error('시트 경로가 다릅니다.');
  const rows=[];for(const row of xml(path).getElementsByTagName('row')){
   const values=[];for(const c of row.getElementsByTagName('c')){
    if(c.getElementsByTagName('f').length)throw Error(name+': 수식 대신 값을 넣어주세요.');
    const ref=c.getAttribute('r'),col=ref?.match(/^[A-Z]+/)?.[0];if(!col)throw Error('셀 위치가 없습니다.');let n=0;for(const char of col)n=n*26+char.charCodeAt(0)-64;if(n>60)throw Error('전용 양식의 열 범위를 넘었습니다.');
    const type=c.getAttribute('t'),v=c.getElementsByTagName('v')[0]?.textContent||'';
    if(type==='e')throw Error(name+': 오류 셀이 있습니다.');
    values[n-1]=type==='s'?shared[Number(v)]:type==='inlineStr'?[...c.getElementsByTagName('t')].map(t=>t.textContent).join(''):v;
   }if(values.some(v=>v!==undefined&&v!==''))rows.push(Array.from({length:values.length},(_,i)=>values[i]??''));
  }result[name]=rows;
 }
 return result;
}
