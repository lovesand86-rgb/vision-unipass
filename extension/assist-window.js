// Resize only the dedicated app window, never an ordinary Chrome window.
export async function sizeAssistWindow(home=false){
 try{
  if(!globalThis.chrome?.windows)return;
  const win=await chrome.windows.getCurrent();
  if(!['popup','app'].includes(win.type)||win.state==='minimized'||win.state==='fullscreen')return;
  const width=Math.min(home?460:620,screen.availWidth),height=Math.min(home?560:740,screen.availHeight);
  const left=Math.max(screen.availLeft||0,Math.min(win.left,(screen.availLeft||0)+screen.availWidth-width));
  const top=Math.max(screen.availTop||0,Math.min(win.top,(screen.availTop||0)+screen.availHeight-height));
  await chrome.windows.update(win.id,{state:'normal',width,height,left,top});
 }catch{/* Sizing must not block the user's work. */}
}
