import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUTDIR = "_debug/redesign/v14-fx";
mkdirSync(OUTDIR, { recursive: true });
const udd = mkdtempSync(join(tmpdir(), "cdp-v14b-"));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu",`--user-data-dir=${udd}`,"--remote-debugging-port=9563","--window-size=1600,900","about:blank"], { stdio: "ignore" });
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
async function getWs(){for(let i=0;i<30;i++){try{const l=await(await fetch("http://127.0.0.1:9563/json/list")).json();const p=l.find(t=>t.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(300);}throw new Error("no cdp");}
const ws=new WebSocket(await getWs());
let id=0;const pending=new Map();
ws.onmessage=(ev)=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
const send=(m,p={})=>new Promise((res)=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
await new Promise((r)=>{ws.onopen=r;});
await send("Page.enable");await send("Runtime.enable");
const evalJs=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)console.log("ERR",JSON.stringify(r.result.exceptionDetails).slice(0,300));return r.result?.result?.value;};
const shot=async(n)=>{const s=await send("Page.captureScreenshot",{format:"png"});if(s.result?.data){writeFileSync(`${OUTDIR}/${n}.png`,Buffer.from(s.result.data,"base64"));console.log("saved:",n);}};
const mouse=(type,x,y,extra={})=>send("Input.dispatchMouseEvent",{type,x,y,button:"left",...extra});

await send("Page.navigate",{url:"http://localhost:4321/"});
await sleep(5000);
await evalJs(`localStorage.setItem('theme','dark');document.documentElement.classList.add('dark');`);
// 探测候选空白点
const probe = await evalJs(`(() => {
  const pts = [[200,650],[800,760],[1400,800],[500,800],[60,450],[1500,450]];
  return pts.map(([x,y]) => {
    const el = document.elementFromPoint(x,y);
    const INTERACTIVE = "a,button,input,textarea,select,label,img,video,iframe,[role='button'],[contenteditable],nav,.post-card-wrapper,.float-panel,.ch3-scrollcue";
    return { x, y, tag: el?.tagName, cls: (el?.className||'').toString().slice(0,50), interactive: !!el?.closest(INTERACTIVE) };
  });
})()`);
console.log("probe:", JSON.stringify(probe, null, 1));
ws.close();edge.kill();process.exit(0);
