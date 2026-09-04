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

const BRAND_WORD = 'HTML<i aria-hidden="true">/</i>SHARE';

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
    <a class="nav-logo" href="/" aria-label="HTML Share 首页"><span class="nav-logo-main">${BRAND_WORD}</span></a>
    <div class="nav-links">${authedLinks}</div>
  </div>
</nav>
<main id="main-content">${body}</main>
<footer class="site-footer" data-nav-theme-target="dark">
  <div class="site-footer-inner">
    <div class="footer-top">
      <a class="footer-brand" href="/"><span class="footer-brand-main">HTML SHARE<i aria-hidden="true">.</i></span><span class="footer-brand-sub">CONTENT IN / LINK OUT</span></a>
      <p class="footer-note">粘贴即发布，链接即作品。</p>
    </div>
    <div class="footer-bottom"><span>&copy; ${new Date().getFullYear()} HTML SHARE</span><span>MADE FOR CREATORS / SELF-HOSTED</span></div>
  </div>
</footer>
<script src="/vendor/highlight/highlight.min.js" defer></script>
${scripts}
</body>
</html>`;
}

function landingPage(key) {
  const ctaHref = key ? '/dashboard' : '/login';
  const marqueeItems = ['HTML', 'MARKDOWN', 'TEXT', 'CSV', 'JSON', 'ZIP SITE', 'PASSWORD LOCK', 'CUSTOM PATH'];
  const marqueeChunk = `<span class="marquee-chunk">${marqueeItems.map((t) => `<span>${t}</span><i aria-hidden="true">✦</i>`).join('')}</span>`;
  const shots = [
    { src: '/assets/product-dashboard.png', url: 'your.host/dashboard', name: 'WORKSPACE', desc: '创建与管理', alt: 'HTML Share 工作台界面截图' },
    { src: '/assets/product-doc.png', url: 'your.host/s/launch-notes', name: 'MARKDOWN', desc: '长文排版', alt: 'Markdown 分享页渲染效果截图' },
    { src: '/assets/product-table.png', url: 'your.host/s/q3-metrics', name: 'CSV TABLE', desc: '表头冻结表格', alt: 'CSV 表格分享页渲染效果截图' },
  ];
  const shotCards = shots.map((s, i) => `
      <figure class="shot-card">
        <div class="shot-bar" aria-hidden="true"><i></i><i></i><i></i><span class="shot-url mono">${s.url}</span></div>
        <div class="shot-body"><img src="${s.src}" alt="${s.alt}" loading="lazy" draggable="false"></div>
        <figcaption class="shot-cap"><span>0${i + 1} — ${s.name}</span><span>${s.desc}</span></figcaption>
      </figure>`).join('');
  const formats = [
    { n: '01', t: 'HTML', d: '完整页面，原样发布', c: '&lt;/&gt;' },
    { n: '02', t: 'Markdown', d: '长文排版，代码高亮', c: '# md' },
    { n: '03', t: 'Text', d: '片段高亮，一键复制', c: 'txt' },
    { n: '04', t: 'CSV', d: '冻结表头，自动截断', c: ',,,' },
    { n: '05', t: 'JSON', d: '校验格式化，易读易拷', c: '{ }' },
    { n: '06', t: 'ZIP Site', d: '整站解压，直接上线', c: '.zip' },
  ];
  const formatCards = formats.map((f) => `
      <article class="format-card" data-glass data-reveal>
        <div class="format-top"><span class="format-number">${f.n}</span><code>${f.c}</code></div>
        <h3>${f.t}</h3>
        <p>${f.d}</p>
      </article>`).join('');
  const stats = [
    { n: '06', label: '支持格式' },
    { n: '10s', label: '平均发布' },
    { n: '0', label: '部署配置' },
  ];
  const statItems = stats.map((s) => `
      <div class="stat-item"><span class="stat-value" data-count="${s.n}">${s.n}</span><span class="stat-tag mono">${s.label}</span></div>`).join('');
  const body = `
<div class="contour-bg" aria-hidden="true"><canvas data-contours></canvas><div class="contour-grain"></div></div>
<section class="hero-track" data-hero data-nav-theme-target="light">
  <div class="hero-pin">
    <div class="hero-inner">
      <div class="hero-copy" data-hero-copy>
        <p class="hero-badge" data-hero-fade><span class="hs-dot" aria-hidden="true"></span><span class="mono">CONTENT IN — LINK OUT</span><i aria-hidden="true">·</i>即贴即发</p>
        <h1 class="hero-title" data-hero-title>
          <span class="ht-line" lang="en">HTML<i aria-hidden="true">/</i>SHARE</span>
        </h1>
        <p class="hero-lede" data-hero-fade>粘贴内容，三秒出链接。</p>
        <div class="hero-cta-row" data-hero-fade>
          <a class="btn btn-primary btn-lg" data-magnetic href="${ctaHref}">${rollLabel(key ? '进入工作台' : '开始发布')}<span aria-hidden="true">&#8599;</span></a>
          <a class="hero-text-link" href="#formats">看看支持的格式</a>
        </div>
      </div>
      <div class="hero-stats" data-hero-fade>${statItems}
      </div>
    </div>
  </div>
</section>

<div class="marquee-band" data-marquee data-nav-theme-target="light" aria-hidden="true">
  <div class="marquee-track">${marqueeChunk.repeat(4)}</div>
</div>

<section class="section formats-section" id="formats" data-nav-theme-target="light">
  <header class="section-head">
    <span class="kicker" data-reveal>01 // FORMATS</span>
    <h2 data-highlines><span class="ml-line" lang="en">PASTE</span><span class="ml-line" lang="en"><em>ANYTHING.</em></span></h2>
    <p class="section-lede-cn" data-reveal>六种格式，一条链接。</p>
  </header>
  <div class="formats-grid">${formatCards}
  </div>
</section>

<section class="showcase" id="showcase" data-hscroll data-nav-theme-target="light">
  <header class="section-head showcase-head">
    <span class="kicker" data-reveal>02 // SHOWCASE</span>
    <div class="showcase-title">
      <h2 data-highlines><span class="ml-line" lang="en">REAL</span><span class="ml-line" lang="en"><em>SCREENS.</em></span></h2>
      <p class="section-lede-cn" data-reveal>发布之后，长这样。</p>
    </div>
    <div class="hs-arrows">
      <button class="hs-arrow" type="button" data-hs-prev aria-label="上一张界面截图" title="上一张" disabled>&#8249;</button>
      <button class="hs-arrow" type="button" data-hs-next aria-label="下一张界面截图" title="下一张" disabled>&#8250;</button>
    </div>
  </header>
  <div class="hs-viewport" tabindex="0" role="region" aria-label="界面截图横向浏览" data-lenis-prevent-wheel>
    <div class="hs-track">${shotCards}
    </div>
  </div>
  <div class="hs-footer">
    <p class="hs-hint">DRAG / SCROLL<i aria-hidden="true">&#8594;</i>按住拖拽，或点箭头</p>
    <div class="hs-progress" aria-hidden="true"><i class="hs-progress-fill"></i></div>
    <span class="hs-count mono" aria-live="polite"><b data-hs-current>01</b><span> / ${String(shots.length).padStart(2, '0')}</span></span>
  </div>
</section>

<section class="control-section" data-nav-theme-target="dark">
  <img class="control-bg" src="/assets/visual-control-dark.jpg" alt="" width="2400" height="1600" loading="lazy" aria-hidden="true">
  <div class="control-inner">
    <header class="section-head">
      <span class="kicker" data-reveal>03 // CONTROL</span>
      <h2 data-highlines><span class="ml-line" lang="en">YOUR</span><span class="ml-line" lang="en"><em>RULES.</em></span></h2>
      <p class="section-lede-cn" data-reveal>链接，按你的方式抵达。</p>
    </header>
    <div class="control-grid">
      <article class="control-card" data-glass data-stagger-col>
        <span class="control-tag">CUSTOM PATH</span>
        <h3>自定义路径</h3>
        <p>随机短链，换成可读的地址。</p>
        <p class="control-demo mono">your.host/s/<b>launch-page</b></p>
      </article>
      <article class="control-card" data-glass data-stagger-col>
        <span class="control-tag">PASSWORD</span>
        <h3>密码保护</h3>
        <p>加一道锁，小范围可见。</p>
        <p class="control-demo mono">PROTECTED / <b>&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;&#8226;</b></p>
      </article>
    </div>
  </div>
</section>

<section class="final-cta" data-nav-theme-target="light">
  <div class="final-cta-inner">
    <div>
      <span class="kicker" data-reveal>04 // PUBLISH</span>
      <h2 data-highlines><span class="ml-line">下一条链接，</span><span class="ml-line">现在生成。</span></h2>
    </div>
    <a class="btn btn-dark btn-lg" data-magnetic href="${ctaHref}">${rollLabel(key ? '打开工作台' : '使用访问密钥')}<span aria-hidden="true">&#8599;</span></a>
  </div>
</section>`;
  return shell({
    title: '首页',
    key,
    body,
    pageClass: 'page-home',
    description: 'HTML Share，把 HTML、Markdown、Text、CSV、JSON 和 ZIP 静态站点快速变成可自定义路径、可加密码的分享链接。',
    scripts: '<script src="/vendor/gsap/gsap.min.js" defer></script>\n<script src="/vendor/gsap/ScrollTrigger.min.js" defer></script>\n<script src="/vendor/lenis/lenis.min.js" defer></script>\n<script src="/js/landing.js" defer></script>',
  });
}

function loginPage() {
  const body = `
<section class="login-wrap">
  <div class="card login-card">
    <div class="login-logo"><span class="brand-word">${BRAND_WORD}</span></div>
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
