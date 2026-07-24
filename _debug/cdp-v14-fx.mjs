// CursorFX 验证：鼠标轨迹连线、点击迸发、空白长按流星雨（深浅两色）
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUTDIR = "_debug/redesign/v14-fx";
mkdirSync(OUTDIR, { recursive: true });
const udd = mkdtempSync(join(tmpdir(), "cdp-v14-"));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu",`--user-data-dir=${udd}`,"--remote-debugging-port=9562","--window-size=1600,900","about:blank"], { stdio: "ignore" });
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
async function getWs(){for(let i=0;i<30;i++){try{const l=await(await fetch("http://127.0.0.1:9562/json/list")).json();const p=l.find(t=>t.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(300);}throw new Error("no cdp");}
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
await evalJs(`localStorage.setItem('theme','dark');document.documentElement.classList.add('dark');window.scrollTo({top:700,behavior:'instant'})`);
await sleep(1200);

// 1. 轨迹：画一个圆弧
for (let i = 0; i <= 24; i++) {
  const a = (i / 24) * Math.PI;
  await mouse("mouseMoved", 500 + Math.cos(a) * 160, 400 - Math.sin(a) * 120);
  await sleep(16);
}
await shot("fx-trail-dark");
// 2. 点击迸发
await mouse("mousePressed", 620, 380, { clickCount: 1 });
await shot("fx-click-dark");
await mouse("mouseReleased", 620, 380, { clickCount: 1 });
// 3. 空白处长按（Hero 滚走后找页面空白——正文卡片间隙太窄，用顶部 hero 区域左侧）
await evalJs(`window.scrollTo({top:0,behavior:'instant'})`);
await sleep(2000);
await mouse("mouseMoved", 200, 650);
await mouse("mousePressed", 200, 650, { clickCount: 1 });
await sleep(1600); // 450ms 触发 + 累积几颗流星
await shot("fx-meteor-dark-hold");
const holdingState = await evalJs(`({active: document.getElementById('meteor-fx').classList.contains('active'), holding: document.documentElement.classList.contains('meteor-holding')})`);
console.log("hold state:", JSON.stringify(holdingState));
await mouse("mouseReleased", 200, 650, { clickCount: 1 });
await sleep(300);
const released = await evalJs(`({active: document.getElementById('meteor-fx').classList.contains('active')})`);
console.log("after release:", JSON.stringify(released));

// 4. 浅色模式流星雨
await evalJs(`localStorage.setItem('theme','light');document.documentElement.classList.remove('dark')`);
await sleep(500);
await mouse("mouseMoved", 300, 620);
await mouse("mousePressed", 300, 620, { clickCount: 1 });
await sleep(1600);
await shot("fx-meteor-light-hold");
await mouse("mouseReleased", 300, 620, { clickCount: 1 });

ws.close();edge.kill();process.exit(0);
