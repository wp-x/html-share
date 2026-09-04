'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const { initDb } = require('./db');
const { genAdminKey, ensureVendor } = require('./util');
const { sessionMiddleware } = require('./auth');

const ROOT = path.join(__dirname, '..');
const config = {
  PORT: parseInt(process.env.PORT || '3000', 10),
  DATA_DIR: process.env.DATA_DIR || path.join(ROOT, 'data'),
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB || '50', 10),
  MAX_CONTENT_MB: parseInt(process.env.MAX_CONTENT_MB || '5', 10),
  MAX_SITE_TOTAL_MB: parseInt(process.env.MAX_SITE_TOTAL_MB || '300', 10),
  MAX_SHARES_PER_KEY: parseInt(process.env.MAX_SHARES_PER_KEY || '200', 10),
};

ensureVendor(ROOT);
const db = initDb(config.DATA_DIR);

// ---- 首次启动：生成超级管理员密钥 ----
const hasAdmin = db.prepare('SELECT id FROM keys WHERE is_admin = 1 LIMIT 1').get();
if (!hasAdmin) {
  const key = genAdminKey();
  db.prepare("INSERT INTO keys (key, label, is_admin, disabled, created_at) VALUES (?, '超级管理员', 1, 0, ?)")
    .run(key, new Date().toISOString());
  const line = '═'.repeat(56);
  console.log(`
╔${line}╗
║           HTML Share · 超级管理员密钥（仅显示一次）           ║
╠${line}╣
║  ${key}  ║
╠${line}╣
║  请立即妥善保管。该密钥也已写入：                              ║
║  ${path.join(config.DATA_DIR, 'INITIAL_ADMIN_KEY.txt').padEnd(50)}║
║  确认保存后可删除该文件。                                      ║
╚${line}╝
`);
  fs.writeFileSync(
    path.join(config.DATA_DIR, 'INITIAL_ADMIN_KEY.txt'),
    `HTML Share 超级管理员密钥（首次启动生成，请妥善保管，确认保存后可删除本文件）\n\n${key}\n`,
    { mode: 0o600 }
  );
} else if (fs.existsSync(path.join(config.DATA_DIR, 'INITIAL_ADMIN_KEY.txt'))) {
  console.log('[安全提示] INITIAL_ADMIN_KEY.txt 仍存在于数据目录，建议确认已妥善保存后删除该文件。');
}

const app = express();
app.disable('x-powered-by');

// 反向代理部署时设置 TRUST_PROXY（如 1 或 loopback），使限流与日志拿到真实 IP
if (process.env.TRUST_PROXY) {
  const tp = process.env.TRUST_PROXY;
  app.set('trust proxy', /^\d+$/.test(tp) ? parseInt(tp, 10) : tp);
}

// 安全头：/s/ 下的用户内容原样输出，不加限制；其余页面加保护头
app.use((req, res, next) => {
  if (req.path.toLowerCase().startsWith('/s/')) return next();
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use(express.json({ limit: config.MAX_CONTENT_MB + 'mb' }));
app.use(sessionMiddleware(db));
app.use(express.static(path.join(ROOT, 'public'), { maxAge: '1h', index: false }));

// 健康检查
app.get('/api/health', (req, res) => res.json({ ok: true }));

// 路由
const pagesRouter = require('./routes/pages')(db);
const sharesRouter = require('./routes/shares')(db, config);
const adminRouter = require('./routes/admin')(db, config, sharesRouter.deleteShare);

app.use(pagesRouter);
app.use(sharesRouter);
app.use('/api/admin', adminRouter);

// 404
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: '接口不存在' });
  }
  res.redirect('/');
});

// 统一错误处理
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.too.large') {
    return res.status(413).json({ error: `内容超过 ${config.MAX_CONTENT_MB}MB 上限` });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: '请求体不是合法的 JSON' });
  }
  if (err instanceof URIError) {
    // 畸形 URL 编码（如 /s/:id/%）
    return res.status(400).type('html').send(notFoundPage('无效的请求路径'));
  }
  console.error('[server error]', err);
  res.status(500).json({ error: '服务器内部错误' });
});

function notFoundPage(text) {
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${text}</title><link rel="stylesheet" href="/css/style.css"></head><body class="page-auth"><section class="login-wrap"><div class="card login-card"><div class="login-logo" aria-hidden="true"><span class="brand-mark">H/S</span></div><span class="auth-tag">Error / 400</span><h1>400</h1><p class="muted">${text}</p><a class="btn btn-primary" href="/">返回首页</a></div></section></body></html>`;
}

app.listen(config.PORT, () => {
  console.log(`HTML Share 已启动: http://localhost:${config.PORT}`);
  console.log(`数据目录: ${config.DATA_DIR}`);
});
