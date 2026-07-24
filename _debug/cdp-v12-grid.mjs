import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const OUTDIR = "_debug/redesign/v12-grid";
mkdirSync(OUTDIR, { recursive: true });
const udd = mkdtempSync(join(tmpdir(), "cdp-v12-"));
const edge = spawn(EDGE, ["--headless=new","--disable-gpu",`--user-data-dir=${udd}`,"--remote-debugging-port=9558","--window-size=1600,900","about:blank"], { stdio: "ignore" });
const sleep=(ms)=>new Promise((r)=>setTimeout(r,ms));
async function getWs(){for(let i=0;i<30;i++){try{const l=await(await fetch("http://127.0.0.1:9558/json/list")).json();const p=l.find(t=>t.type==="page");if(p)return p.webSocketDebuggerUrl;}catch{}await sleep(300);}throw new Error("no cdp");}
const ws=new WebSocket(await getWs());
let id=0;const pending=new Map();
ws.onmessage=(ev)=>{const m=JSON.parse(ev.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};
const send=(m,p={})=>new Promise((res)=>{const i=++id;pending.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
await new Promise((r)=>{ws.onopen=r;});
await send("Page.enable");await send("Runtime.enable");
const evalJs=async(e)=>{const r=await send("Runtime.evaluate",{expression:e,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)console.log("ERR",JSON.stringify(r.result.exceptionDetails).slice(0,200));return r.result?.result?.value;};
const shot=async(n)=>{const s=await send("Page.captureScreenshot",{format:"png"});if(s.result?.data){writeFileSync(`${OUTDIR}/${n}.png`,Buffer.from(s.result.data,"base64"));console.log("saved:",n);}};
await send("Page.navigate",{url:"http://localhost:4321/"});
await sleep(5000);
await evalJs(`localStorage.setItem('theme','dark');document.documentElement.classList.add('dark');`);
// 切到网格模式（与站点设置面板同一存储键，读不到就直接改 class）
const mode = await evalJs(`(() => {
  const c = document.getElementById('post-list-container');
  c.classList.remove('list-mode'); c.classList.add('grid-mode');
  return c.className;
})()`);
console.log("mode:", mode);
await evalJs(`window.scrollTo({top:700,behavior:'instant'})`);
await sleep(1500);
await shot("grid-dark");
// hover 第一张卡片
const pt = await evalJs(`(()=>{const el=document.querySelector('#post-list-container .post-card-wrapper');const r=el.getBoundingClientRect();return {x:r.x+r.width*0.5,y:r.y+r.height*0.4};})()`);
await send("Input.dispatchMouseEvent",{type:"mouseMoved",x:pt.x,y:pt.y});
await sleep(900);
const st = await evalJs(`(()=>{const el=document.querySelector('#post-list-container .post-card-wrapper');const img=el.querySelector('.post-card-image');const blend=el.querySelector('.cover-blend');return {clip:getComputedStyle(img).clipPath,blendDisplay:getComputedStyle(blend).display,transform:getComputedStyle(img).transform,cardH:el.getBoundingClientRect().height};})()`);
console.log("grid hover:", JSON.stringify(st));
await shot("grid-dark-hover");
ws.close();edge.kill();process.exit(0);
