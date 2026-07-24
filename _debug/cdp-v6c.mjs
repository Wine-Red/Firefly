// CDP v6 回归：跨页回主页路径月亮 opacity 不变量验证
// 不变量：moon opacity === moonFadeAt(scrollY)（0.3vh 起淡，0.72vh 全隐）
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const EDGE = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const base = process.argv[2] || "http://localhost:4321";
const postPath = process.argv[3] || "/posts/2026-06-25-github-ai-trending-repos-2026-06-25/";
const port = 9400 + Math.floor(Math.random() * 200);
const udd = mkdtempSync(join(tmpdir(), "cdp-"));
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--user-data-dir=${udd}`, `--remote-debugging-port=${port}`, "--window-size=1600,900", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 30; i++) {
	try {
		const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
		const p = l.find((t) => t.type === "page");
		if (p) { ws = new WebSocket(p.webSocketDebuggerUrl); break; }
	} catch {}
	await sleep(300);
}
let id = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
	const m = JSON.parse(ev.data);
	if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
	if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result?.result?.value;
const SAMPLE = `(()=>{const m=document.querySelector('[data-ch3-moon]');const y=window.scrollY||0;const vh=window.innerHeight||1;const expect=1-Math.min(Math.max((y-vh*0.3)/(vh*0.42),0),1);const op=m?Number(getComputedStyle(m).opacity):null;return JSON.stringify({y:Math.round(y),op,expect:Number(expect.toFixed(2)),ok:op===null?null:Math.abs(op-expect)<0.12})})()`;
let failures = 0;
const sample = async (label) => {
	const r = JSON.parse((await ev(SAMPLE)) || "{}");
	const mark = r.ok === false ? "  <-- VIOLATION" : "";
	if (r.ok === false) failures++;
	console.log(`${label} y=${r.y} op=${r.op} expect≈${r.expect}${mark}`);
};
await new Promise((r) => { ws.onopen = r; });
await send("Runtime.enable");
await send("Page.enable");

// === 路径 1：文章页 → 点导航"主页"（轮询平滑滚动），滚动途中高频采样 ===
await send("Page.navigate", { url: base + postPath });
await sleep(6000); // 等 swup 就绪，确保走无刷新路径
await send("Runtime.evaluate", { expression: `document.querySelector('#navbar a[href$="#swup-container"]').click()` });
for (let i = 0; i < 20; i++) { await sleep(220); await sample(`nav-home t+${(i + 1) * 220}ms`); }
await send("Page.captureScreenshot", { format: "png" }).then((s) => s.result?.data && writeFileSync("_debug/redesign/v6/landed.png", Buffer.from(s.result.data, "base64")));

// === 路径 2：回顶再滚到底 ===
await send("Runtime.evaluate", { expression: `window.scrollTo({top:0,behavior:"instant"})` });
await sleep(1400); await sample("back-to-top");
await send("Runtime.evaluate", { expression: `window.scrollTo({top:900,behavior:"instant"})` });
await sleep(1400); await sample("scroll-900");

// === 路径 3：Swup 往返两次后重复路径 1 ===
await send("Runtime.evaluate", { expression: `document.querySelector('#post-list-container a[href^="/posts/"]').click()` });
await sleep(3500);
await send("Runtime.evaluate", { expression: `document.querySelector('#navbar a[href$="#swup-container"]').click()` });
for (let i = 0; i < 12; i++) { await sleep(250); await sample(`round2 t+${(i + 1) * 250}ms`); }

// === 路径 4：浏览器前进/回退（popstate） ===
await send("Runtime.evaluate", { expression: `history.back()` });
await sleep(3000);
await sample("popstate-back");
await send("Runtime.evaluate", { expression: `history.forward()` });
await sleep(3000);
await sample("popstate-fwd");

console.log(failures === 0 ? "ALL INVARIANTS HOLD" : `VIOLATIONS: ${failures}`);
if (errors.length) console.log("EXC:", errors.filter((e) => !e.includes("umami") && !e.includes("Swup") && !e.includes("Pagefind")).slice(0, 5).join(" | "));
ws.close(); edge.kill(); process.exit(0);
