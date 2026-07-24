// 月亮连续性验证：① 摆入结束帧无瞬移 ② 摆入中滚动接管无生硬跳变
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const udd = mkdtempSync(join(tmpdir(), "cdp-v13-"));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu",`--user-data-dir=${udd}`,"--remote-debugging-port=9559","--window-size=1600,900","about:blank"], { stdio: "ignore" });
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
async function getWs(){for(let i=0;i<30;i++){try{const l=await(await fetch("http://127.0.0.1:9559/json/list")).json();const p=l.find(t=>t.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(300);}throw new Error("no cdp");}
const ws=new WebSocket(await getWs());
let id=0;const pending=new Map();
ws.onmessage=(ev)=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
const send=(m,p={})=>new Promise((res)=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
await new Promise((r)=>{ws.onopen=r;});
await send("Page.enable");await send("Runtime.enable");
const evalJs=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)console.log("ERR",JSON.stringify(r.result.exceptionDetails).slice(0,300));return r.result?.result?.value;};

// 采样器：rAF 逐帧记录月亮位置，返回相邻帧最大跳变
const sampler = (durMs) => `new Promise((resolve) => {
  const moon = document.querySelector('[data-ch3-moon]');
  const frames = [];
  const t0 = performance.now();
  let last = null;
  function tick() {
    const r = moon.getBoundingClientRect();
    const cur = { t: performance.now() - t0, x: r.x, y: r.y };
    if (last) frames.push({ dt: cur.t - last.t, jump: Math.hypot(cur.x - last.x, cur.y - last.y), x: cur.x, y: cur.y, t: cur.t });
    last = cur;
    if (cur.t < ${durMs}) requestAnimationFrame(tick);
    else {
      frames.sort((a,b)=>b.jump-a.jump);
      resolve({ maxJump: frames[0], top5: frames.slice(0,5).map(f=>({t:Math.round(f.t),jump:Math.round(f.jump*10)/10})), frames: frames.length });
    }
  }
  requestAnimationFrame(tick);
})`;

// 场景 1：完整摆入（不滚动），监测结束时刻瞬移
await send("Page.navigate",{url:"http://localhost:4321/"});
await sleep(1500);
const r1 = await evalJs(sampler(9000));
console.log("场景1 完整摆入:", JSON.stringify(r1));

// 场景 2：摆入 1.2s 时滚动到 400，监测接管跳变
await send("Page.navigate",{url:"http://localhost:4321/"});
await sleep(1200);
await evalJs(`window.scrollTo({top: 400, behavior: 'instant'})`);
const r2 = await evalJs(sampler(3000));
console.log("场景2 摆入中滚动接管:", JSON.stringify(r2));

ws.close();edge.kill();process.exit(0);
