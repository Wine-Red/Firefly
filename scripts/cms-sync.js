import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import {
	absoluteCmsAssets,
	CMS_FIELDS,
	cmsPostFile,
	directusRequest,
	getCmsConfig,
} from "./cms-lib.js";

const outputRoot = path.resolve("src/content/.cms-posts");
const { baseUrl, publicUrl, token } = getCmsConfig();

async function fetchPublishedPosts() {
	const posts = [];
	const limit = 100;
	for (let page = 1; ; page += 1) {
		const query = new URLSearchParams({
			fields: CMS_FIELDS.join(","),
			"filter[status][_eq]": "published",
			sort: "-published",
			limit: String(limit),
			page: String(page),
		});
		const payload = await directusRequest(
			`${baseUrl}/items/posts?${query.toString()}`,
			{ token },
		);
		const batch = payload?.data ?? [];
		posts.push(...batch);
		if (batch.length < limit) break;
	}
	return posts;
}

function toFrontmatter(post) {
	const published = new Date(post.published);
	if (Number.isNaN(published.getTime())) {
		throw new Error(`文章 ${post.slug} 的 published 日期无效`);
	}
	const updated = post.updated ? new Date(post.updated) : null;
	if (updated && Number.isNaN(updated.getTime())) {
		throw new Error(`文章 ${post.slug} 的 updated 日期无效`);
	}
	return {
		title: post.title,
		published,
		...(updated ? { updated } : {}),
		draft: false,
		description: post.description || "",
		image: absoluteCmsAssets(post.image || "", publicUrl),
		tags: Array.isArray(post.tags) ? post.tags : [],
		category: post.category || "",
		lang: post.lang || "",
		pinned: Boolean(post.pinned),
		author: post.author || "",
		sourceLink: post.source_link || "",
		licenseName: post.license_name || "",
		licenseUrl: post.license_url || "",
		comment: post.comment !== false,
		password: post.password || "",
		passwordHint: post.password_hint || "",
	};
}

const posts = await fetchPublishedPosts();
if (posts.length === 0 && process.env.CMS_ALLOW_EMPTY !== "true") {
	throw new Error(
		"Directus 没有返回已发布文章；为防止误部署空站点，已终止构建。确需空站请设置 CMS_ALLOW_EMPTY=true。",
	);
}

const tempRoot = `${outputRoot}.tmp`;
await rm(tempRoot, { recursive: true, force: true });
await mkdir(tempRoot, { recursive: true });

for (const post of posts) {
	const target = cmsPostFile(tempRoot, post.slug);
	await mkdir(path.dirname(target), { recursive: true });
	const content = absoluteCmsAssets(post.content || "", publicUrl);
	await writeFile(
		target,
		matter.stringify({ content, data: {} }, toFrontmatter(post)),
		"utf8",
	);
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(path.dirname(outputRoot), { recursive: true });
await import("node:fs/promises").then(({ rename }) =>
	rename(tempRoot, outputRoot),
);
console.log(`已从 Directus 同步 ${posts.length} 篇已发布文章。`);
