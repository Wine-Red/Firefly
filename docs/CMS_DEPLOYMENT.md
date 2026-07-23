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

## 2. 初始化字段和访问权限

仅在新建或恢复 Directus 实例时，创建一个临时静态管理员 Token，然后在本地 PowerShell 中运行：

```powershell
$env:DIRECTUS_URL = "https://cms.winered-0v0.com"
$env:DIRECTUS_TOKEN = "你的临时管理员Token"
pnpm cms:setup
```

集合初始化完成后撤销管理员 Token。文章统一在 Directus 后台创建和维护，不再从仓库中的 Markdown 导入。

随后创建一个只对 `posts` 集合拥有读取权限的角色和静态 Token。优先将读取规则限制为 `status = published`；如果当前 Core 界面不提供自定义过滤，则只开启 `posts` 的 `Read: All Access`，其余写入、更新、删除和分享权限全部关闭。构建脚本仍会显式请求 `status = published`，但该 Token 必须只保存在 GitHub Secrets 中，因为它本身仍能读取草稿。

## 3. 配置 GitHub Actions

在 GitHub 仓库的 Settings → Secrets and variables → Actions 中新增：

- `DIRECTUS_URL`：`https://cms.winered-0v0.com`
- `DIRECTUS_TOKEN`：上一步创建的只读 Token

Actions 会复用既有的 `SERVER_HOST`、`SERVER_USERNAME`、`SERVER_KEY` 和 `SERVER_PORT`，建立仅在构建期间存在的 SSH 隧道，通过服务器本机的 `127.0.0.1:8055` 拉取文章。这样不需要为 GitHub Runner 放开 CMS 的海外公网访问；文章中的 Directus 资源地址仍使用 `DIRECTUS_URL` 对应的公开 HTTPS 域名。

构建完成后使用同一组 SSH 凭据通过 `rsync` 增量部署到宝塔站点目录，因此服务器需要安装 `rsync`。

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

Directus 是文章的唯一数据源。请将服务器上的 `database`、`uploads` 和相关配置纳入定期备份；仓库不再保存文章副本。

本地需要预览后台内容时：

```powershell
Copy-Item .env.example .env
# 在 .env 中填写 DIRECTUS_URL 和只读 DIRECTUS_TOKEN
pnpm dev
```

`pnpm dev` 每次启动都会重新同步后台文章；同步失败会停止，避免误以为看到的是最新内容。本地没有 CMS 连接时可以修改代码，但无法加载文章页面。

开发服务器运行期间在后台改了文章，可以另开一个终端运行 `pnpm cms:sync`；Astro 会检测生成内容的变化并刷新页面。

需要验证生产构建时可运行 `pnpm build && pnpm preview`。
