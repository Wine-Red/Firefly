import { spawn } from "node:child_process";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:4322";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--remote-debugging-port=9335","--window-size=1440,900","about:blank"], { stdio: "ignore" });
async function getWs() {
  for (let i=0;i<30;i++){ try { const l = await (await fetch("http://localhost:9335/json")).json(); const p=l.find(t=>t.type==="page"); if(p) return p.webSocketDebuggerUrl; } catch{} await sleep(500);} throw new Error("no cdp");
}
const ws = new WebSocket(await getWs());
await new Promise(r=>ws.onopen=r);
let id=0; const pending=new Map();
ws.onmessage=(e)=>{const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);} else if(m.method==="Runtime.consoleAPICalled"){console.log("CONSOLE:", m.params.args.map(a=>a.value??a.description??"").join(" ").slice(0,200));} else if(m.method==="Runtime.exceptionThrown"){console.log("EXC:", JSON.stringify(m.params.exceptionDetails).slice(0,300));}};
function send(method,params={}){return new Promise(res=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});}
async function ev(x){const r=await send("Runtime.evaluate",{expression:x,awaitPromise:true,returnByValue:true});return r.result?.result?.value;}
await send("Runtime.enable"); await send("Page.enable");
for (let i=1;i<=8;i++){
  await send("Page.navigate",{url:`${BASE}/posts/2026-06-25-github-ai-trending-repos-2026-06-25/`});
  await sleep(3500);
  const info = await ev(`JSON.stringify({swupType: typeof window.swup, navType: typeof window.swup?.navigate})`);
  const clicked = await ev(`(function(){const a=Array.from(document.querySelectorAll('#navbar a[href]')).find(x=>{try{return new URL(x.getAttribute('href'),location.origin).hash==='#swup-container';}catch{return false;}}); if(a){a.click();return true;} return false;})()`);
  await sleep(4000);
  const m = await ev(`JSON.stringify({path:location.pathname, scrollY:Math.round(scrollY), flag:sessionStorage.getItem('firefly:nav-scroll-target')})`);
  console.log(`#${i} swup=${info} clicked=${clicked} -> ${m}`);
}
ws.close(); edge.kill(); process.exit(0);
