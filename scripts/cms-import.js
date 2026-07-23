import { readFile } from "node:fs/promises";
import path from "node:path";
import { glob } from "glob";
import matter from "gray-matter";
import { directusRequest, getCmsConfig, safeSlug } from "./cms-lib.js";

const dryRun = process.argv.includes("--dry-run");
const { baseUrl, token } = dryRun
	? {
			baseUrl: process.env.DIRECTUS_URL || "http://localhost:8055",
			token: null,
		}
	: getCmsConfig({ requireToken: true });
const files = await glob("src/content/posts/**/*.{md,mdx}", { nodir: true });

function isoDate(value, field, file) {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime()))
		throw new Error(`${file} 的 ${field} 日期无效`);
	return date.toISOString();
}

let imported = 0;
for (const file of files.sort()) {
	const source = await readFile(file, "utf8");
	const parsed = matter(source);
	const data = parsed.data;
	const slug = safeSlug(
		path
			.relative("src/content/posts", file)
			.replace(/\\/g, "/")
			.replace(/\.(md|mdx)$/i, ""),
	);
	const item = {
		status: data.draft === true ? "draft" : "published",
		slug,
		title: data.title,
		published: isoDate(data.published, "published", file),
		updated: isoDate(data.updated, "updated", file),
		description: data.description || "",
		image: data.image || "",
		tags: Array.isArray(data.tags) ? data.tags : [],
		category: data.category || "",
		lang: data.lang || "",
		pinned: Boolean(data.pinned),
		author: data.author || "",
		source_link: data.sourceLink || "",
		license_name: data.licenseName || "",
		license_url: data.licenseUrl || "",
		comment: data.comment !== false,
		password: data.password || "",
		password_hint: data.passwordHint || "",
		content: parsed.content.replace(/^\s+/, ""),
	};

	if (!item.title || !item.published)
		throw new Error(`${file} 缺少 title 或 published`);
	if (!dryRun) {
		const query = new URLSearchParams({
			"filter[slug][_eq]": slug,
			fields: "id",
			limit: "1",
		});
		const existing = await directusRequest(`${baseUrl}/items/posts?${query}`, {
			token,
		});
		if (existing.data.length > 0) {
			await directusRequest(`${baseUrl}/items/posts/${existing.data[0].id}`, {
				method: "PATCH",
				token,
				body: JSON.stringify(item),
			});
		} else {
			await directusRequest(`${baseUrl}/items/posts`, {
				method: "POST",
				token,
				body: JSON.stringify(item),
			});
		}
	}
	imported += 1;
}

console.log(`${dryRun ? "迁移演练通过" : "迁移完成"}：${imported} 篇文章。`);
