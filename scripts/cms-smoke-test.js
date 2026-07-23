import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import http from "node:http";
import path from "node:path";

const outputRoot = path.resolve("src/content/.cms-posts");
const keepOutput = process.env.CMS_SMOKE_KEEP === "true";
const server = http.createServer((request, response) => {
	if (!request.url?.startsWith("/items/posts?")) {
		response.writeHead(404).end();
		return;
	}
	response.setHeader("Content-Type", "application/json");
	response.end(
		JSON.stringify({
			data: [
				{
					id: 1,
					status: "published",
					slug: "smoke/nested-post",
					title: "CMS smoke test",
					published: "2026-07-23T00:00:00.000Z",
					updated: null,
					description: "generated only during the smoke test",
					image: "/assets/cover-id",
					tags: ["cms"],
					category: "Test",
					lang: "zh_CN",
					pinned: false,
					author: "",
					source_link: "",
					license_name: "",
					license_url: "",
					comment: true,
					password: "",
					password_hint: "",
					content: "![asset](/assets/body-id)",
				},
			],
		}),
	);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address !== "string");

try {
	await new Promise((resolve, reject) => {
		const child = spawn(process.execPath, ["scripts/cms-sync.js"], {
			stdio: "inherit",
			env: {
				...process.env,
				DIRECTUS_URL: `http://127.0.0.1:${address.port}`,
				DIRECTUS_TOKEN: "smoke-token",
			},
		});
		child.on("error", reject);
		child.on("exit", (code) =>
			code === 0
				? resolve()
				: reject(new Error(`cms-sync exited with ${code}`)),
		);
	});

	const generated = await readFile(
		path.join(outputRoot, "smoke", "nested-post.md"),
		"utf8",
	);
	assert.match(
		generated,
		/image: '?http:\/\/127\.0\.0\.1:\d+\/assets\/cover-id'?/,
	);
	assert.match(
		generated,
		/!\[asset\]\(http:\/\/127\.0\.0\.1:\d+\/assets\/body-id\)/,
	);
	console.log("CMS 同步冒烟测试通过。 ");
} finally {
	server.close();
	if (!keepOutput) await rm(outputRoot, { recursive: true, force: true });
}
