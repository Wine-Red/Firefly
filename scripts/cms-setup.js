import { directusRequest, getCmsConfig } from "./cms-lib.js";

const { baseUrl, token } = getCmsConfig({ requireToken: true });

const field = (name, type, options = {}) => ({
	field: name,
	type,
	meta: {
		interface: options.interface || (type === "boolean" ? "boolean" : "input"),
		width: options.width || "full",
		required: Boolean(options.required),
		...(options.options ? { options: options.options } : {}),
	},
	schema: {
		is_nullable: !options.required,
		...(options.defaultValue !== undefined
			? { default_value: options.defaultValue }
			: {}),
		...(options.unique ? { is_unique: true } : {}),
	},
});

// Directus 12 intentionally responds with 403 for a missing collection to
// avoid leaking schema names. List the collections instead of probing the
// missing endpoint, otherwise a clean installation can never be initialized.
const collections = await directusRequest(`${baseUrl}/collections`, { token });
const exists = Array.isArray(collections.data)
	? collections.data.some((item) => item.collection === "posts")
	: false;

if (exists) {
	console.log("Directus 中已存在 posts 集合，未修改现有结构。");
	process.exit(0);
}

await directusRequest(`${baseUrl}/collections`, {
	method: "POST",
	token,
	body: JSON.stringify({
		collection: "posts",
		schema: { name: "posts" },
		meta: {
			icon: "article",
			note: "Firefly 博客文章",
			display_template: "{{title}}",
			archive_field: "status",
			archive_value: "archived",
			unarchive_value: "draft",
			archive_app_filter: true,
			versioning: true,
		},
		fields: [
			field("status", "string", {
				interface: "select-dropdown",
				required: true,
				defaultValue: "draft",
				options: {
					choices: [
						{ text: "草稿", value: "draft", color: "#A2B5CD" },
						{ text: "已发布", value: "published", color: "#2ECDA7" },
						{ text: "已归档", value: "archived", color: "#E35169" },
					],
				},
			}),
			field("slug", "string", { required: true, unique: true }),
			field("title", "string", { required: true }),
			field("published", "timestamp", {
				required: true,
				interface: "datetime",
			}),
			field("updated", "timestamp", { interface: "datetime" }),
			field("description", "text", { interface: "input-multiline" }),
			field("image", "string"),
			field("tags", "json", { interface: "tags" }),
			field("category", "string", { width: "half" }),
			field("lang", "string", { width: "half", defaultValue: "zh_CN" }),
			field("pinned", "boolean", { width: "half", defaultValue: false }),
			field("comment", "boolean", { width: "half", defaultValue: true }),
			field("author", "string", { width: "half" }),
			field("source_link", "string", { width: "half" }),
			field("license_name", "string", { width: "half" }),
			field("license_url", "string", { width: "half" }),
			field("password", "string", { width: "half" }),
			field("password_hint", "string", { width: "half" }),
			field("content", "text", {
				interface: "input-rich-text-md",
				required: true,
			}),
		],
	}),
});

console.log("Directus posts 集合已创建。下一步运行 pnpm cms:import。 ");
