import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import bangumiConfig from "../src/config/bangumiConfig.json" with {
	type: "json",
};

const API_URL = "https://api.bgm.tv";
const OUTPUT_ROOT = path.resolve("public/assets/bangumi");
const TEMP_ROOT = `${OUTPUT_ROOT}.tmp`;
const USER_AGENT = "WineRed Firefly/6.10.3 (https://winered-0v0.com)";
const CATEGORY_TYPES = {
	book: 1,
	anime: 2,
	music: 3,
	game: 4,
	real: 6,
};

async function bangumiRequest(url) {
	const response = await fetch(url, {
		headers: {
			Accept: "application/json",
			"User-Agent": USER_AGENT,
		},
		signal: AbortSignal.timeout(20_000),
	});
	if (!response.ok) {
		throw new Error(`Bangumi 请求失败：${response.status} ${url}`);
	}
	return response;
}

async function fetchCategory(userId, subjectType) {
	const { limit, delay, maxTotal } = bangumiConfig.pagination;
	const items = [];
	let offset = 0;

	for (;;) {
		const query = new URLSearchParams({
			subject_type: String(subjectType),
			limit: String(limit),
			offset: String(offset),
		});
		const response = await bangumiRequest(
			`${API_URL}/v0/users/${userId}/collections?${query.toString()}`,
		);
		const payload = await response.json();
		if (!Array.isArray(payload?.data)) {
			throw new Error("Bangumi 收藏接口返回了无效数据");
		}
		items.push(...payload.data);

		if (
			payload.data.length < limit ||
			(maxTotal > 0 && items.length >= maxTotal)
		) {
			break;
		}
		offset += limit;
		await new Promise((resolve) => setTimeout(resolve, delay));
	}

	return maxTotal > 0 ? items.slice(0, maxTotal) : items;
}

async function downloadCover(item, coverRoot) {
	const source = item.subject?.images?.medium;
	if (!source) return item;

	const response = await fetch(source, {
		headers: { "User-Agent": USER_AGENT },
		signal: AbortSignal.timeout(20_000),
	});
	if (!response.ok) {
		throw new Error(`Bangumi 封面下载失败：${response.status} ${source}`);
	}
	const contentType = response.headers.get("content-type") || "";
	if (!contentType.startsWith("image/")) {
		throw new Error(
			`Bangumi 封面响应不是图片：${contentType || "unknown"} ${source}`,
		);
	}

	const buffer = Buffer.from(await response.arrayBuffer());
	if (buffer.length < 1024) {
		throw new Error(`Bangumi 封面文件异常小：${buffer.length} bytes ${source}`);
	}

	const fileName = `${item.subject.id}.webp`;
	await sharp(buffer)
		.webp({ quality: 82 })
		.toFile(path.join(coverRoot, fileName));
	const localUrl = `/assets/bangumi/covers/${fileName}`;
	return {
		...item,
		subject: {
			...item.subject,
			images: Object.fromEntries(
				Object.keys(item.subject.images).map((key) => [key, localUrl]),
			),
		},
	};
}

async function mapConcurrent(items, concurrency, mapper) {
	const results = new Array(items.length);
	let cursor = 0;
	async function worker() {
		for (;;) {
			const index = cursor++;
			if (index >= items.length) return;
			results[index] = await mapper(items[index]);
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(concurrency, items.length) }, worker),
	);
	return results;
}

async function main() {
	const enabledCategories = Object.entries(bangumiConfig.categories).filter(
		([, enabled]) => enabled,
	);
	if (!bangumiConfig.userId || enabledCategories.length === 0) {
		throw new Error("Bangumi 用户 ID 或分类配置为空");
	}

	await rm(TEMP_ROOT, { recursive: true, force: true });
	const coverRoot = path.join(TEMP_ROOT, "covers");
	await mkdir(coverRoot, { recursive: true });

	try {
		const categories = {};
		let total = 0;
		for (const [category] of enabledCategories) {
			const subjectType = CATEGORY_TYPES[category];
			if (!subjectType) throw new Error(`未知的 Bangumi 分类：${category}`);
			const items = await fetchCategory(bangumiConfig.userId, subjectType);
			categories[category] = await mapConcurrent(items, 5, (item) =>
				downloadCover(item, coverRoot),
			);
			total += items.length;
			console.log(`[Bangumi] ${category}：已同步 ${items.length} 条收藏及封面`);
		}

		if (total === 0 && process.env.BANGUMI_ALLOW_EMPTY !== "true") {
			throw new Error(
				"Bangumi 没有返回任何收藏；为防止空数据覆盖线上页面，已终止同步。",
			);
		}

		await writeFile(
			path.join(TEMP_ROOT, "data.json"),
			`${JSON.stringify(
				{
					version: 1,
					userId: bangumiConfig.userId,
					syncedAt: new Date().toISOString(),
					categories,
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		await rm(OUTPUT_ROOT, { recursive: true, force: true });
		await rename(TEMP_ROOT, OUTPUT_ROOT);
		console.log(
			`[Bangumi] 同步完成，共 ${total} 条收藏，生成内容不会提交到 Git。`,
		);
	} catch (error) {
		await rm(TEMP_ROOT, { recursive: true, force: true });
		throw error;
	}
}

await main();
