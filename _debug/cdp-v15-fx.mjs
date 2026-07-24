import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUTDIR = "_debug/redesign/v15-fx";
mkdirSync(OUTDIR, { recursive: true });
const udd = mkdtempSync(join(tmpdir(), "cdp-v15-"));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu",`--user-data-dir=${udd}`,"--remote-debugging-port=9565","--window-size=1600,900","about:blank"], { stdio: "ignore" });
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
async function getWs(){for(let i=0;i<30;i++){try{const l=await(await fetch("http://127.0.0.1:9565/json/list")).json();const p=l.find(t=>t.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(300);}throw new Error("no cdp");}
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

// 深色：星座网
await evalJs(`localStorage.setItem('theme','dark');document.documentElement.classList.add('dark');`);
await mouse("mouseMoved", 700, 420);
await sleep(1500); // 等节点场聚集
await mouse("mouseMoved", 760, 430);
await sleep(300);
await shot("constellation-dark");
// 深色：点击迸发
await mouse("mousePressed", 760, 430, { clickCount: 1 });
await sleep(200);
await shot("constellation-dark-click");
await mouse("mouseReleased", 760, 430, { clickCount: 1 });

// 浅色：星座网 + 背景星
await evalJs(`localStorage.setItem('theme','light');document.documentElement.classList.remove('dark')`);
await sleep(600);
await mouse("mouseMoved", 700, 420);
await sleep(1200);
await shot("constellation-light");

// 深色：流星雨（左→右，平缓）
await evalJs(`localStorage.setItem('theme','dark');document.documentElement.classList.add('dark')`);
await sleep(400);
await mouse("mouseMoved", 200, 650);
await mouse("mousePressed", 200, 650, { clickCount: 1 });
await sleep(2200);
await shot("meteor-dark-v15");
await mouse("mouseReleased", 200, 650, { clickCount: 1 });
// 浅色流星雨
await evalJs(`localStorage.setItem('theme','light');document.documentElement.classList.remove('dark')`);
await sleep(400);
await mouse("mouseMoved", 200, 650);
await mouse("mousePressed", 200, 650, { clickCount: 1 });
await sleep(2200);
await shot("meteor-light-v15");
await mouse("mouseReleased", 200, 650, { clickCount: 1 });

ws.close();edge.kill();process.exit(0);
