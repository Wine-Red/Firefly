import { existsSync } from "node:fs";
import path from "node:path";

if (existsSync(".env")) process.loadEnvFile(".env");

export const CMS_FIELDS = [
	"id",
	"status",
	"slug",
	"title",
	"published",
	"updated",
	"description",
	"image",
	"tags",
	"category",
	"lang",
	"pinned",
	"author",
	"source_link",
	"license_name",
	"license_url",
	"comment",
	"password",
	"password_hint",
	"content",
];

export function getCmsConfig({ requireToken = false } = {}) {
	const baseUrl = process.env.DIRECTUS_URL?.trim().replace(/\/$/, "");
	const token = process.env.DIRECTUS_TOKEN?.trim();

	if (!baseUrl) {
		throw new Error("缺少 DIRECTUS_URL，例如 https://cms.example.com");
	}
	if (requireToken && !token) {
		throw new Error("此操作需要 DIRECTUS_TOKEN");
	}

	return { baseUrl, token };
}

export async function directusRequest(url, options = {}) {
	const token = options.token;
	const headers = new Headers(options.headers);
	if (token) headers.set("Authorization", `Bearer ${token}`);
	if (options.body && !(options.body instanceof FormData)) {
		headers.set("Content-Type", "application/json");
	}

	const response = await fetch(url, { ...options, headers });
	const payload = await response.json().catch(() => null);
	if (!response.ok) {
		const message = payload?.errors?.map((error) => error.message).join("; ");
		throw new Error(
			`${response.status} ${response.statusText}: ${message || url}`,
		);
	}
	return payload;
}

export function safeSlug(value) {
	const slug = String(value ?? "")
		.trim()
		.replace(/^\/+|\/+$/g, "");
	if (!slug || slug.includes("..") || /[\\?#]/.test(slug)) {
		throw new Error(`非法文章 slug: ${JSON.stringify(value)}`);
	}
	return slug;
}

export function cmsPostFile(root, slug) {
	const normalized = safeSlug(slug);
	return `${path.join(root, ...normalized.split("/"))}.md`;
}

export function absoluteCmsAssets(value, baseUrl) {
	if (typeof value !== "string" || !value) return value ?? "";
	const normalized = value.startsWith("/assets/")
		? `${baseUrl}${value}`
		: value;
	return normalized
		.replace(/(["'(=:]\s*)\/assets\//g, `$1${baseUrl}/assets/`)
		.replace(/(\]\()\/assets\//g, `$1${baseUrl}/assets/`);
}
