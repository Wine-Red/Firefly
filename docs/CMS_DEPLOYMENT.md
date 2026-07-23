# Firefly 内容后台部署

改造后的发布方式分成两条：

- 前端样式或代码：运行 `pnpm dev` 时先自动拉取后台最新文章；本地修改样式，推送到 `master` 后 GitHub Actions 自动构建并部署。
- 博客文章：在 Directus 网页后台编辑，将状态改为“已发布”；Directus Flow 通知 GitHub，自动拉取文章、构建并部署。文章不再需要提交到 Git。

博客仍然输出静态文件，因此原有 Markdown 插件、RSS、站内搜索、分页和访问速度不会改变。后台发布到线上通常需要等待一次 GitHub Actions 构建。

## 1. 在服务器启动 Directus

将 `deploy/directus` 上传到服务器，建议放在 `/opt/firefly-directus`。复制环境变量模板并填写随机密钥、后台邮箱和密码：

```bash
cd /opt/firefly-directus
cp .env.example .env
docker compose pull
docker compose up -d
```

容器只监听服务器本机的 `127.0.0.1:8055`。在宝塔中为 `cms.winered-0v0.com` 新建站点，反向代理到 `http://127.0.0.1:8055`，申请并强制使用 HTTPS。

`database`、`uploads`、`extensions` 和 `.env` 必须纳入服务器备份，但不要提交到 Git。

## 2. 初始化字段并迁移旧文章

在 Directus 后台创建一个仅用于初始化和迁移的静态管理员 Token，然后在本地 PowerShell 中运行：

```powershell
$env:DIRECTUS_URL = "https://cms.winered-0v0.com"
$env:DIRECTUS_TOKEN = "你的临时管理员Token"
pnpm cms:setup
pnpm cms:import -- --dry-run
pnpm cms:import
```

迁移是按 `slug` 更新或新增，可重复执行。迁移完成后撤销管理员 Token。

随后创建一个只对 `posts` 集合拥有读取权限的角色和静态 Token。优先将读取规则限制为 `status = published`；如果当前 Core 界面不提供自定义过滤，则只开启 `posts` 的 `Read: All Access`，其余写入、更新、删除和分享权限全部关闭。构建脚本仍会显式请求 `status = published`，但该 Token 必须只保存在 GitHub Secrets 中，因为它本身仍能读取草稿。

## 3. 配置 GitHub Actions

在 GitHub 仓库的 Settings → Secrets and variables → Actions 中新增：

- `DIRECTUS_URL`：`https://cms.winered-0v0.com`
- `DIRECTUS_TOKEN`：上一步创建的只读 Token

没有配置 `DIRECTUS_URL` 时，工作流会继续使用仓库里的旧文章，避免切换过程中断站点。

## 4. 配置文章发布触发器

创建一个仅拥有当前仓库 `Contents: Read and write` 权限的 fine-grained GitHub Token。在 Directus 的 Settings → Flows 中创建 Flow：

1. Trigger 选 Event Hook，Scope 选 `items.create`、`items.update` 和 `items.delete`，Collection 选 `posts`。
2. 直接添加 Webhook / Request URL 操作（不要只检查事件 payload 里的 `status`；编辑已发布文章时 payload 不一定包含该字段）：
   - Method：`POST`
   - URL：`https://api.github.com/repos/<GitHub用户名>/<仓库名>/dispatches`
   - Header：`Authorization: Bearer <GitHub Token>`
   - Header：`Accept: application/vnd.github+json`
   - Body：`{"event_type":"cms-publish"}`

所有文章变更都触发一次构建，这样发布、修改、撤回和删除都会正确反映到线上。GitHub Token 只保存在 Directus Flow 中，不要写入仓库。

## 5. 切换检查

先手动运行一次 Actions。确认首页文章数、文章详情、归档、RSS 和搜索都正常后，再停止从 `src/content/posts` 发布新文章。旧目录可以暂留作离线备份；生产构建在配置 `DIRECTUS_URL` 后不会读取它。

本地需要预览后台内容时：

```powershell
Copy-Item .env.example .env
# 在 .env 中填写 DIRECTUS_URL 和只读 DIRECTUS_TOKEN
pnpm dev
```

`pnpm dev` 每次启动都会重新同步后台文章；同步失败会停止，避免误以为看到的是最新内容。确实需要离线开发时使用 `pnpm dev:local`，它会读取仓库内的旧文章备份。

开发服务器运行期间在后台改了文章，可以另开一个终端运行 `pnpm cms:sync`；Astro 会检测生成内容的变化并刷新页面。

需要验证生产构建时可运行 `pnpm build:cms && pnpm preview`。
