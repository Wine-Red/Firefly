import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = "http://localhost:4322";
const OUT = "E:\\Program\\Firefly\\_debug\\redesign\\v6-nav";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu","--remote-debugging-port=9336","--window-size=1440,900","about:blank"], { stdio: "ignore" });
async function getWs(){for(let i=0;i<30;i++){try{const l=await(await fetch("http://localhost:9336/json")).json();const p=l.find(t=>t.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(500);}throw new Error("no cdp");}
const ws = new WebSocket(await getWs());
await new Promise(r=>ws.onopen=r);
let id=0;const pending=new Map();
ws.onmessage=(e)=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
function send(method,params={}){return new Promise(res=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method,params}));});}
async function ev(x){const r=await send("Runtime.evaluate",{expression:x,awaitPromise:true,returnByValue:true});return r.result?.result?.value;}
async function shot(n){const r=await send("Page.captureScreenshot",{format:"png"});writeFileSync(`${OUT}\\${n}.png`,Buffer.from(r.result.data,"base64"));}
await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});

const moonState = `(function(){const m=document.querySelector('[data-ch3-moon]');if(!m)return 'no-el';const cs=getComputedStyle(m);return JSON.stringify({opacity:cs.opacity,transform:cs.transform.slice(0,60)});})()`;

// 从文章页点主页 tab，观察落位过程与落位后的 Hero 月亮状态
await send("Page.navigate",{url:`${BASE}/posts/2026-06-25-github-ai-trending-repos-2026-06-25/`});
await sleep(3500);
await ev(`(function(){const a=Array.from(document.querySelectorAll('#navbar a[href]')).find(x=>{try{return new URL(x.getAttribute('href'),location.origin).hash==='#swup-container';}catch{return false;}});if(a)a.click();return!!a;})()`);
await sleep(2500);
console.log("滚动中月亮:", await ev(moonState), "scrollY:", await ev("Math.round(scrollY)"));
await sleep(2000);
console.log("落位后月亮:", await ev(moonState), "scrollY:", await ev("Math.round(scrollY)"));
await shot("v6-moon-after-landing");
// 回到顶部看月亮是否恢复
await ev(`document.getElementById('nav-logo-link').click()`);
await sleep(2500);
console.log("回顶后月亮:", await ev(moonState), "scrollY:", await ev("Math.round(scrollY)"));
await shot("v6-moon-back-top");
ws.close();edge.kill();console.log("DONE");process.exit(0);
