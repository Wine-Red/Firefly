import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const udd = mkdtempSync(join(tmpdir(), "cdp-v10d-"));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu",`--user-data-dir=${udd}`,"--remote-debugging-port=9557","--window-size=1600,900","about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getWs() { for (let i=0;i<30;i++){ try { const l = await (await fetch("http://127.0.0.1:9557/json/list")).json(); const p=l.find(t=>t.type==="page"); if(p) return p.webSocketDebuggerUrl; } catch{} await sleep(300);} throw new Error("no cdp"); }
const ws = new WebSocket(await getWs());
let id=0; const pending=new Map();
ws.onmessage=(ev)=>{const m=JSON.parse(ev.data); if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
const send=(m,p={})=>new Promise((res)=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
await new Promise((r)=>{ws.onopen=r;});
await send("Page.enable"); await send("Runtime.enable");
const evalJs=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true}); if(r.result?.exceptionDetails) console.log("ERR",JSON.stringify(r.result.exceptionDetails).slice(0,200)); return r.result?.result?.value;};
await send("Page.navigate",{url:"http://localhost:4321/"});
await sleep(5000);
await evalJs(`window.scrollTo({top:700,behavior:'instant'})`);
await sleep(1500);
const info = await evalJs(`(() => {
  const el = document.querySelector('#post-list-container .post-card-wrapper');
  const img = el.querySelector('.post-card-image');
  const cs = getComputedStyle(img);
  const listMode = !!document.querySelector('.list-mode');
  return {
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    minWidth768: matchMedia('(min-width: 768px)').matches,
    listMode,
    classes: document.querySelector('#post-list-container')?.className,
    imgClasses: img.className,
    width: cs.width, transform: cs.transform, clip: cs.clipPath,
    position: cs.position,
  };
})()`);
console.log(JSON.stringify(info, null, 1));
ws.close(); edge.kill(); process.exit(0);
