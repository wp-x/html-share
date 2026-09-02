# HTML Share

把 AI 生成的内容，一键变成可以分享的链接。

粘贴 HTML、Markdown、JSON，或上传一个 ZIP 静态站点包，立即生成专属短链接，所见即所得渲染 —— 相当于一个免费的私人虚拟空间。

> 界面截图：启动后可截取落地页 `/`、工作台 `/dashboard`、管理后台 `/admin` 与 Markdown 分享页 `/s/:id` 放在此处（本仓库暂未内置截图文件）。

## 功能一览

- **HTML 即时渲染**：粘贴完整 HTML，原样输出，效果与本地打开完全一致
- **Markdown 精美排版**：服务端渲染为优雅排版页面，代码块语法高亮（highlight.js 本地资源，无 CDN 依赖），自适应暗色模式
- **JSON 查看器**：自动校验、美化缩进、行号 + 语法高亮，支持一键复制与下载
- **ZIP 整站托管**：上传含 `index.html` 的 ZIP，自动校验（zip-slip / 大小 / 条目数）、解压部署、删除临时文件；相对路径的 css/js/图片均可正常访问
- **多用户密钥体系**：超级管理员生成用户密钥（可备注），每个分享可溯源到归属密钥；支持启用/禁用、删除（级联清理其分享与站点文件）、重置管理员密钥
- **管理后台**：全局统计（分享数 / 访问量 / 密钥数 / 磁盘占用）、密钥管理、全局分享管理（筛选 / 搜索 / 批量删除）
- **安全设计**：httpOnly session（7 天）、登录限流（每 IP 每分钟 10 次）、安全响应头、路径穿越防护、内容大小限制

## 快速开始

### 方式一：Docker（推荐）

```bash
docker build -t html-share .
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data --name html-share html-share
```

### 方式二：docker-compose

```bash
docker compose up -d
```

挂载的 `./data` 目录无需手动创建：不存在时 Docker 会自动创建，容器入口脚本（entrypoint）会自动把属主修正为应用用户后再降权启动。

### 方式三：本地 Node.js（需 Node 20+）

```bash
npm install
npm start
```

打开 http://localhost:3000 即可。

## 首次启动：获取超级管理员密钥

首次启动时，系统会自动生成一枚超级管理员密钥，做两件事：

1. 在控制台用醒目边框打印（仅显示一次）
2. 写入 `data/INITIAL_ADMIN_KEY.txt`

请立即复制并妥善保管该密钥，确认保存后建议删除 `INITIAL_ADMIN_KEY.txt`。之后登录后台随时可以**重置超级管理员密钥**（旧密钥立即失效，新密钥仅显示一次）。

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 服务监听端口 |
| `DATA_DIR` | `./data`（Docker 中为 `/app/data`） | 数据目录（SQLite 数据库 + 站点解压目录） |
| `MAX_UPLOAD_MB` | `50` | ZIP 上传大小上限（MB） |
| `MAX_CONTENT_MB` | `5` | 文本内容（HTML/MD/JSON）大小上限（MB） |
| `MAX_SITE_TOTAL_MB` | `300` | ZIP 解压后总大小上限（MB），防 zip bomb |
| `MAX_SHARES_PER_KEY` | `200` | 每个密钥可创建的分享数量上限 |
| `TRUST_PROXY` | 不启用 | 置于反向代理后时设置（如 `1` 或 `loopback`），用于获取真实 IP（登录限流依赖它） |
| `COOKIE_SECURE` | 不启用 | 设为 `1` 时 session cookie 附加 `Secure`（仅 HTTPS 下传输），HTTPS 部署时建议开启 |

## 使用指南

### 创建分享

1. 在 `/login` 输入密钥登录，进入工作台 `/dashboard`
2. 选择 Tab：HTML / Markdown / JSON 直接粘贴内容；ZIP 站点选择 `.zip` 文件上传
3. 点击「生成链接」，复制生成的 `/s/xxxx` 链接发给任何人（访问者无需登录）

### ZIP 包要求

- 根目录包含 `index.html`；或**唯一一个**一级子目录中包含 `index.html`
- 仅接受 `.zip` 后缀；单文件 ≤ 100MB；总条目 ≤ 5000；上传包 ≤ `MAX_UPLOAD_MB`
- 包内相对路径资源（css/js/图片）会被原样部署，通过 `/s/:id/资源路径` 访问
- 含绝对路径或 `..` 穿越的恶意包会被直接拒绝

### 后台管理（仅管理员）

访问 `/admin`：

- **密钥管理**：生成用户密钥（填备注便于溯源）、启用/禁用、删除（会级联删除该密钥名下的全部分享与站点文件）、重置超级管理员密钥
- **全局分享管理**：查看所有分享及其归属密钥（备注 + 密钥前缀），支持按密钥筛选、按标题/ID 搜索、多选批量删除

## 安全注意事项

> **重要：`/s/` 分享页与登录后台同源。HTML 分享与 ZIP 站点为原样输出，可执行任意 JavaScript —— 请勿分享或打开来源不可信的内容，密钥只发给信任的人。**

- HTML 分享与 ZIP 站点为**原样输出**（这是"所见即所得"的前提），不会做任何内容过滤。管理后台打开 html/site 类型分享前会有确认提示。
- Markdown 分享经**服务端消毒**（sanitize-html，仅允许安全标签与 http/https/mailto 协议）并附加 **CSP**（`script-src 'none'`）；JSON 查看器同样有 CSP 保护。
- ZIP 上传有多重防护：zip-slip 路径校验、单文件 100MB、条目 5000、解压总量熔断（`MAX_SITE_TOTAL_MB`，按声明大小与实际大小双重校验）。
- 管理后台密钥列表只展示前缀，完整密钥仅在创建时显示一次；重置超级管理员密钥需输入当前密钥确认。
- 密钥即账号，请像密码一样保管；密钥泄露后立即在后台禁用或删除。
- 生产环境请置于 HTTPS 反向代理之后（如 Caddy / Nginx），并设置 `TRUST_PROXY=1` 与 `COOKIE_SECURE=1`。
- 数据都在 `data/` 目录，备份/迁移只需复制该目录。

## GitHub Actions 多平台构建

推送 `main` 分支或 `v*` 标签（也可手动触发 workflow_dispatch）时，`.github/workflows/docker.yml` 会自动构建 `linux/amd64` 与 `linux/arm64` 双平台镜像并推送到 GHCR：

- `ghcr.io/<owner>/<repo>:latest`（main 分支）
- `ghcr.io/<owner>/<repo>:<版本号>`（推送 `v1.2.3` 这类标签时）

镜像拉取示例：

```bash
docker pull ghcr.io/<owner>/<repo>:latest
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data ghcr.io/<owner>/<repo>:latest
```

## 技术栈

Node.js 20 · Express 4 · better-sqlite3 · multer · adm-zip · marked + sanitize-html · highlight.js（本地静态资源，零 CDN）· 原生 CSS/JS（无前端构建步骤）

## License

MIT
