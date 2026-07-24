import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const udd = mkdtempSync(join(tmpdir(), "cdp-v13b-"));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu",`--user-data-dir=${udd}`,"--remote-debugging-port=9560","--window-size=1600,900","about:blank"], { stdio: "ignore" });
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
async function getWs(){for(let i=0;i<30;i++){try{const l=await(await fetch("http://127.0.0.1:9560/json/list")).json();const p=l.find(t=>t.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(300);}throw new Error("no cdp");}
const ws=new WebSocket(await getWs());
let id=0;const pending=new Map();
ws.onmessage=(ev)=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
const send=(m,p={})=>new Promise((res)=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
await new Promise((r)=>{ws.onopen=r;});
await send("Page.enable");await send("Runtime.enable");
const evalJs=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)console.log("ERR",JSON.stringify(r.result.exceptionDetails).slice(0,300));return r.result?.result?.value;};
await send("Page.navigate",{url:"http://localhost:4321/"});
await sleep(1500);
const r = await evalJs(`new Promise((resolve) => {
  const moon = document.querySelector('[data-ch3-moon]');
  let last = null; const frames = [];
  const t0 = performance.now();
  function tick() {
    const b = moon.getBoundingClientRect();
    const cur = { t: performance.now() - t0, x: b.x, y: b.y };
    if (last && cur.t > 3500) frames.push({ t: Math.round(cur.t), jump: Math.round(Math.hypot(cur.x-last.x, cur.y-last.y)*100)/100 });
    last = cur;
    if (cur.t < 10000) requestAnimationFrame(tick);
    else { frames.sort((a,b)=>b.jump-a.jump); resolve(frames.slice(0,6)); }
  }
  requestAnimationFrame(tick);
})`);
console.log("稳定段(>3.5s)最大帧间位移:", JSON.stringify(r));
ws.close();edge.kill();process.exit(0);
