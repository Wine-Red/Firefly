import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");

function run(command, args, options = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { stdio: "inherit", ...options });
		child.on("error", reject);
		child.on("exit", (code, signal) => {
			if (signal) reject(new Error(`${command} 被信号 ${signal} 终止`));
			else resolve(code ?? 1);
		});
	});
}

if (!process.env.DIRECTUS_URL) {
	console.error("未配置 DIRECTUS_URL。请在 .env 中配置 Directus 后台地址。");
	process.exit(1);
}

console.log("正在从 Directus 刷新本地文章…");
const syncCode = await run(process.execPath, ["scripts/cms-sync.js"], {
	env: process.env,
});
if (syncCode !== 0) process.exit(syncCode);

const pnpmCli = process.env.npm_execpath;
if (!pnpmCli) throw new Error("无法定位 pnpm，请通过 pnpm dev 启动开发环境");

const devCode = await run(process.execPath, [
	pnpmCli,
	"exec",
	"astro",
	"dev",
	...process.argv.slice(2),
]);
process.exit(devCode);
