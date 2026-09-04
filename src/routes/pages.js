'use strict';

const express = require('express');
const { escapeHtml } = require('../util');
const {
  createSession,
  setSessionCookie,
  destroySession,
  requireAuthPage,
  requireAdminPage,
  loginRateLimiter,
} = require('../auth');

const BRAND_MARK = '<span class="brand-mark" aria-hidden="true">H/S</span>';

function rollLabel(text) {
  const safe = escapeHtml(text);
  return `<span class="roll-label" data-label="${safe}">${safe}</span>`;
}

function shell({ title, key, body, scripts = '', showLoginLink = true, pageClass = '', description = '' }) {
  const authedLinks = key
    ? `<a class="nav-link" href="/dashboard">${rollLabel('工作台')}</a>${key.is_admin ? `<a class="nav-link" href="/admin">${rollLabel('管理后台')}</a>` : ''}<a href="/logout" class="btn btn-primary nav-cta">${rollLabel('退出')}</a>`
    : (showLoginLink ? `<a href="/login" class="btn btn-primary nav-cta">${rollLabel('登录')}</a>` : '');
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="${escapeHtml(description || 'HTML Share，把 HTML、Markdown、Text、CSV、JSON 和 ZIP 静态站点变成可分享链接。')}">
<title>${escapeHtml(title)} · HTML Share</title>
<link rel="stylesheet" href="/css/style.css">
</head>
<body class="${escapeHtml(pageClass)}">
<a class="skip-link" href="#main-content">跳到主要内容</a>
<nav class="nav" aria-label="主导航">
  <div class="nav-inner">
    <a class="nav-logo" href="/" aria-label="HTML Share 首页"><span class="nav-logo-main">HTML</span><span class="nav-logo-sub">SHARE / PUBLISH</span></a>
    <a class="nav-center" href="/" aria-label="返回首页">${BRAND_MARK}</a>
    <div class="nav-links">${authedLinks}</div>
  </div>
</nav>
<main id="main-content">${body}</main>
<footer class="site-footer">
  <div class="site-footer-inner">
    <a class="footer-brand" href="/"><span class="footer-brand-main">HTML SHARE</span><span class="footer-brand-sub">CONTENT IN / LINK OUT</span></a>
    <p class="footer-note">HTML、Markdown、Text、CSV、JSON 与 ZIP 静态站点分享工具。粘贴即发布，链接即作品。</p>
  </div>
</footer>
<script src="/vendor/highlight/highlight.min.js" defer></script>
${scripts}
</body>
</html>`;
}

function landingPage(key) {
  const ctaHref = key ? '/dashboard' : '/login';
  const body = `
<section class="brand-hero" data-brand-hero>
  <div class="hero-meta" aria-hidden="true"><span>AI CONTENT DEPLOYMENT</span><span>NODE / READY</span></div>
  <div class="hero-inner">
    <p class="hero-kicker">CONTENT IN — LINK OUT</p>
    <h1 class="hero-title"><span lang="en">HTML</span><span lang="en">SHARE<i aria-hidden="true">.</i></span></h1>
    <p class="hero-lede">把 AI 生成的内容，从文件变成网址。粘贴代码或上传 ZIP，几秒内拿到一条可以直接发出去的链接——无需部署脚本，无需配置服务器。</p>
    <div class="hero-cta-row">
      <a class="btn btn-primary btn-lg" href="${ctaHref}">${rollLabel(key ? '进入工作台' : '开始发布')}<span aria-hidden="true">&#8599;</span></a>
      <a class="hero-text-link" href="#formats">了解支持的格式</a>
    </div>
  </div>
  <a class="hero-scroll" href="#formats"><span>SCROLL</span><span aria-hidden="true">&#8595;</span></a>
</section>

<section class="section formats-section" id="formats">
  <header class="section-head" data-reveal>
    <span class="kicker">01 / FORMATS</span>
    <h2>六条输入轨道，<em>同一个发布终点。</em></h2>
    <p class="section-lede">完整页面、结构化文档、代码片段、表格数据、整站打包——无论内容以什么形态交付，都走同一条发布路径。</p>
  </header>
  <div class="format-list">
    <article data-reveal><span class="format-number">01</span><h3>HTML</h3><p>完整页面原样输出，脚本、样式与交互保持不变，所见即所得。</p><code>&lt;/&gt;</code></article>
    <article data-reveal><span class="format-number">02</span><h3>Markdown</h3><p>服务端安全渲染，代码高亮与移动端排版自动就位，长文读起来也舒服。</p><code># md</code></article>
    <article data-reveal><span class="format-number">03</span><h3>Text</h3><p>纯文本与代码片段自动识别语言、语法高亮，带行号，复制下载一键完成。</p><code>txt</code></article>
    <article data-reveal><span class="format-number">04</span><h3>CSV</h3><p>表格数据解析为可阅读的表头冻结表格，超大文件自动截断并支持原文下载。</p><code>,,,</code></article>
    <article data-reveal><span class="format-number">05</span><h3>JSON</h3><p>先校验，再格式化，生成带行号、适合阅读、复制和下载的数据页。</p><code>{ }</code></article>
    <article data-reveal><span class="format-number">06</span><h3>ZIP Site</h3><p>校验并解压完整静态站点，站内相对资源路径原样部署、直接可用。</p><code>.zip</code></article>
  </div>
</section>

<section class="section control-section">
  <header class="section-head" data-reveal>
    <span class="kicker">02 / CONTROL</span>
    <h2>链接，<em>按你的方式抵达。</em></h2>
    <p class="section-lede">默认自动生成短链，速度优先；需要时，路径与访问权限都由你决定。</p>
  </header>
  <div class="control-grid">
    <article class="control-card" data-reveal>
      <span class="control-tag">CUSTOM PATH</span>
      <h3>自定义路径</h3>
      <p>把随机短链换成可读、可记、可以印在幻灯片上的地址。</p>
      <p class="control-demo mono">your.host/s/<b>launch-page</b></p>
    </article>
    <article class="control-card" data-reveal>
      <span class="control-tag">PASSWORD</span>
      <h3>密码保护</h3>
      <p>给只想小范围公开的内容加一道锁，访问者输入密码后才能查看。</p>
      <p class="control-demo mono">PROTECTED / <b>&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</b></p>
    </article>
  </div>
</section>

<section class="final-cta">
  <div data-reveal><span class="kicker">03 / PUBLISH</span><h2>下一条链接，<br>现在生成。</h2></div>
  <a class="btn btn-dark btn-lg" href="${ctaHref}">${rollLabel(key ? '打开工作台' : '使用访问密钥')}<span aria-hidden="true">&#8599;</span></a>
</section>`;
  return shell({
    title: '首页',
    key,
    body,
    pageClass: 'page-home',
    description: 'HTML Share，把 HTML、Markdown、Text、CSV、JSON 和 ZIP 静态站点快速变成可自定义路径、可加密码的分享链接。',
    scripts: '<script src="/js/landing.js" defer></script>',
  });
}

function loginPage() {
  const body = `
<section class="login-wrap">
  <div class="card login-card">
    <div class="login-logo">${BRAND_MARK}</div>
    <span class="auth-tag">ACCESS KEY</span>
    <h1>欢迎回来</h1>
    <p class="muted">请输入你的访问密钥</p>
    <form id="login-form">
      <input class="input input-mono" id="key-input" type="password" placeholder="HS-XXXX..." autocomplete="off" spellcheck="false" autofocus aria-label="访问密钥">
      <div class="form-error" id="login-error"></div>
      <button class="btn btn-primary btn-block" type="submit" id="login-btn">登 录</button>
    </form>
    <p class="login-hint">还没有密钥？请联系管理员获取。</p>
  </div>
</section>
<script>
(function(){
  var form = document.getElementById('login-form');
  var input = document.getElementById('key-input');
  var err = document.getElementById('login-error');
  var btn = document.getElementById('login-btn');
  form.addEventListener('submit', function(e){
    e.preventDefault();
    err.textContent = '';
    btn.disabled = true; btn.textContent = '登录中…';
    fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: input.value.trim() })
    }).then(function(r){ return r.json().then(function(d){ return { ok: r.ok, d: d }; }); })
    .then(function(res){
      if (res.ok) { location.href = '/dashboard'; }
      else {
        err.textContent = res.d.error || '登录失败，请重试';
        btn.disabled = false; btn.textContent = '登 录';
      }
    }).catch(function(){
      err.textContent = '网络错误，请重试';
      btn.disabled = false; btn.textContent = '登 录';
    });
  });
})();
</script>`;
  return shell({ title: '登录', key: null, body, showLoginLink: false, pageClass: 'page-auth' });
}

function dashboardPage(key) {
  const body = `
<section class="page container">
  <div class="page-head">
    <div>
      <span class="kicker">WORKSPACE</span>
      <h1>工作台</h1>
      <p class="muted">你好，${escapeHtml(key.label || (key.is_admin ? '管理员' : '创作者'))}。把内容粘贴进来，马上生成链接。</p>
    </div>
  </div>

  <div class="stat-grid stat-grid-2">
    <div class="stat-card"><div class="stat-num" id="stat-count">–</div><div class="stat-label">我的分享</div></div>
    <div class="stat-card"><div class="stat-num" id="stat-views">–</div><div class="stat-label">总访问量</div></div>
  </div>

  <section class="card create-card">
    <div class="workspace-head"><div><span class="section-kicker">CREATE / SHARE</span><h2 class="card-title">创建分享</h2></div><p>选择内容格式，设定链接访问方式，然后发布。</p></div>
    <div class="tabs" id="tabs" role="tablist" aria-label="分享内容类型">
      <button class="tab active" data-tab="html" role="tab" aria-selected="true">HTML</button>
      <button class="tab" data-tab="markdown" role="tab" aria-selected="false">Markdown</button>
      <button class="tab" data-tab="text" role="tab" aria-selected="false">Text</button>
      <button class="tab" data-tab="csv" role="tab" aria-selected="false">CSV</button>
      <button class="tab" data-tab="json" role="tab" aria-selected="false">JSON</button>
      <button class="tab" data-tab="site" role="tab" aria-selected="false">ZIP 站点</button>
    </div>

    <div class="share-options" aria-label="链接选项">
      <label class="option-field" for="custom-slug"><span>自定义后缀</span><small>留空时自动生成 10 位短链</small><span class="slug-control"><b>/s/</b><input id="custom-slug" type="text" maxlength="64" inputmode="url" autocomplete="off" spellcheck="false" placeholder="launch-page" aria-describedby="custom-slug-help"></span><em id="custom-slug-help">3-64 位小写字母、数字或连字符</em></label>
      <div class="option-field password-field"><div class="option-toggle"><div><span>密码保护</span><small>访问者输入密码后才能查看</small></div><label class="switch"><input id="password-toggle" type="checkbox" aria-controls="share-password"><span aria-hidden="true"></span><b>启用</b></label></div><input class="input input-mono hidden" id="share-password" type="password" minlength="4" maxlength="128" autocomplete="new-password" placeholder="输入 4-128 个字符" aria-label="分享密码"></div>
    </div>
    <div class="form-error" id="create-error" role="alert"></div>

    <div class="tab-panel" data-panel="html" role="tabpanel">
      <input class="input" data-role="title" placeholder="页面标题（可选）" aria-label="页面标题（可选）">
      <textarea class="textarea textarea-code" data-role="content" rows="12" placeholder="粘贴完整的 HTML 代码..." aria-label="HTML 内容"></textarea>
      <button class="btn btn-primary" data-action="create" data-type="html">生成链接</button>
    </div>
    <div class="tab-panel hidden" data-panel="markdown" role="tabpanel">
      <input class="input" data-role="title" placeholder="文档标题（可选）" aria-label="文档标题（可选）">
      <textarea class="textarea textarea-code" data-role="content" rows="12" placeholder="粘贴 Markdown 文本..." aria-label="Markdown 内容"></textarea>
      <button class="btn btn-primary" data-action="create" data-type="markdown">生成链接</button>
    </div>
    <div class="tab-panel hidden" data-panel="text" role="tabpanel">
      <input class="input" data-role="title" placeholder="片段标题（可选）" aria-label="片段标题（可选）">
      <textarea class="textarea textarea-code" data-role="content" rows="12" placeholder="粘贴纯文本或代码片段，自动识别语言并高亮..." aria-label="文本内容"></textarea>
      <button class="btn btn-primary" data-action="create" data-type="text">生成链接</button>
    </div>
    <div class="tab-panel hidden" data-panel="csv" role="tabpanel">
      <input class="input" data-role="title" placeholder="表格标题（可选）" aria-label="表格标题（可选）">
      <textarea class="textarea textarea-code" data-role="content" rows="12" placeholder="粘贴 CSV 数据，首行将作为表头，例如：name,age" aria-label="CSV 内容"></textarea>
      <button class="btn btn-primary" data-action="create" data-type="csv">生成链接</button>
    </div>
    <div class="tab-panel hidden" data-panel="json" role="tabpanel">
      <input class="input" data-role="title" placeholder="数据标题（可选）" aria-label="数据标题（可选）">
      <textarea class="textarea textarea-code" data-role="content" rows="12" placeholder='粘贴 JSON，例如 {"name": "example"}' aria-label="JSON 内容"></textarea>
      <button class="btn btn-primary" data-action="create" data-type="json">生成链接</button>
    </div>
    <div class="tab-panel hidden" data-panel="site" role="tabpanel">
      <input class="input" data-role="title" placeholder="站点标题（可选）" aria-label="站点标题（可选）">
      <div class="file-drop" id="file-drop">
        <input type="file" id="zip-input" accept=".zip" hidden aria-label="选择 ZIP 静态站点包">
        <strong>ZIP STATIC SITE</strong><p>包含 index.html，站内相对资源将原样部署。</p>
        <button class="btn btn-secondary" id="pick-file" type="button">选择文件</button>
        <p class="muted file-name" id="file-name"></p>
      </div>
      <button class="btn btn-primary" data-action="create-site">上传并部署</button>
    </div>

    <div class="result-box hidden" id="result-box">
      <div class="result-label" id="result-label">分享链接已生成</div>
      <div class="result-row">
        <input class="input input-mono" id="result-link" readonly aria-label="已生成的分享链接">
        <button class="btn btn-primary btn-small" id="copy-result">复制</button>
      </div>
    </div>
  </section>

  <section class="card share-list-card">
    <span class="section-kicker">MY SHARES</span>
    <h2 class="card-title">我的分享</h2>
    <div class="table-wrap">
      <table class="table" id="shares-table">
        <thead><tr><th>类型</th><th>标题</th><th>链接</th><th>访问量</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="empty hidden" id="shares-empty">还没有分享，从上方创建第一个吧。</div>
  </section>
</section>
<script src="/js/dashboard.js"></script>`;
  return shell({ title: '工作台', key, body, pageClass: 'page-app' });
}

function adminPage(key) {
  const body = `
<section class="page container">
  <div class="page-head">
    <div>
      <span class="kicker">ADMIN</span>
      <h1>管理后台</h1>
      <p class="muted">全局统计、密钥管理与分享溯源。</p>
    </div>
  </div>

  <div class="stat-grid stat-grid-4">
    <div class="stat-card"><div class="stat-num" id="st-shares">–</div><div class="stat-label">总分享数</div></div>
    <div class="stat-card"><div class="stat-num" id="st-views">–</div><div class="stat-label">总访问量</div></div>
    <div class="stat-card"><div class="stat-num" id="st-keys">–</div><div class="stat-label">密钥总数</div></div>
    <div class="stat-card"><div class="stat-num" id="st-disk">–</div><div class="stat-label">站点磁盘占用</div></div>
  </div>

  <div class="card">
    <span class="section-kicker">ACCESS KEYS</span>
    <h2 class="card-title">密钥管理</h2>
    <div class="key-create-row">
      <input class="input" id="new-key-label" placeholder="新密钥备注（如：张三）" aria-label="新密钥备注">
      <button class="btn btn-primary" id="btn-create-key">生成用户密钥</button>
      <button class="btn btn-danger-outline" id="btn-reset-admin">重置超级管理员密钥</button>
    </div>
    <div class="result-box hidden" id="key-result">
      <div class="result-label" id="key-result-label">新密钥（仅显示一次，请立即妥善保存）</div>
      <div class="result-row">
        <input class="input input-mono" id="key-result-value" readonly>
        <button class="btn btn-primary btn-small" id="copy-key-result">复制</button>
      </div>
    </div>
    <div class="table-wrap">
      <table class="table" id="keys-table">
        <thead><tr><th>密钥</th><th>备注</th><th>角色</th><th>状态</th><th>创建时间</th><th>最近使用</th><th>分享数</th><th>操作</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
  </div>

  <div class="card">
    <span class="section-kicker">ALL SHARES</span>
    <h2 class="card-title">全局分享管理</h2>
    <div class="filter-row">
      <select class="input select" id="filter-key" aria-label="按密钥筛选"><option value="">全部密钥</option></select>
      <input class="input" id="filter-q" placeholder="按标题或 ID 搜索…" aria-label="按标题或 ID 搜索">
      <button class="btn btn-secondary btn-small" id="btn-refresh-shares">刷新</button>
      <button class="btn btn-danger-outline btn-small hidden" id="btn-batch-delete">删除所选</button>
    </div>
    <div class="table-wrap">
      <table class="table" id="admin-shares-table">
        <thead><tr><th><input type="checkbox" id="check-all" aria-label="全选"></th><th>ID</th><th>类型</th><th>标题</th><th>归属密钥</th><th>访问量</th><th>创建时间</th><th>操作</th></tr></thead>
        <tbody></tbody>
      </table>
    </div>
    <div class="empty hidden" id="admin-shares-empty">暂无分享。</div>
  </div>
</section>
<script src="/js/admin.js"></script>`;
  return shell({ title: '管理后台', key, body, pageClass: 'page-app' });
}

module.exports = function pagesRouter(db) {
  const router = express.Router();

  router.get('/', (req, res) => {
    res.type('html').send(landingPage(req.key));
  });

  router.get('/login', (req, res) => {
    if (req.key) return res.redirect('/dashboard');
    res.type('html').send(loginPage());
  });

  router.post('/login', loginRateLimiter, (req, res) => {
    const key = String((req.body && req.body.key) || '').trim();
    if (!key) return res.status(400).json({ error: '请输入密钥' });
    const row = db.prepare('SELECT * FROM keys WHERE key = ?').get(key);
    if (!row || row.disabled) {
      return res.status(401).json({ error: '密钥无效或已被禁用' });
    }
    const token = createSession(db, row.id);
    setSessionCookie(res, token);
    db.prepare('UPDATE keys SET last_used_at = ? WHERE id = ?').run(new Date().toISOString(), row.id);
    res.json({ ok: true, is_admin: !!row.is_admin });
  });

  router.get('/logout', (req, res) => {
    destroySession(db, req.sessionToken);
    res.setHeader('Set-Cookie', 'hs_session=; Path=/; HttpOnly; Max-Age=0');
    res.redirect('/');
  });

  router.get('/dashboard', requireAuthPage, (req, res) => {
    res.type('html').send(dashboardPage(req.key));
  });

  router.get('/admin', requireAdminPage, (req, res) => {
    res.type('html').send(adminPage(req.key));
  });

  return router;
};
