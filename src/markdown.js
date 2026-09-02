'use strict';

const { marked } = require('marked');
const hljs = require('highlight.js');
const sanitizeHtml = require('sanitize-html');
const { escapeHtml } = require('./util');

marked.setOptions({
  gfm: true,
  breaks: false,
  headerIds: false,
  mangle: false,
  highlight(code, lang) {
    try {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    } catch {
      return escapeHtml(code);
    }
  },
});

/** marked 输出的服务端消毒配置（覆盖 GFM 全量标签） */
const SANITIZE_OPTIONS = {
  allowedTags: [
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'p', 'a', 'ul', 'ol', 'li', 'blockquote',
    'code', 'pre', 'span', 'em', 'strong', 'del',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'img', 'hr', 'br', 'input',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title'],
    code: ['class'],
    span: ['class'],
    pre: ['class'],
    input: ['type', 'disabled', 'checked'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  // input 仅允许任务列表复选框
  exclusiveFilter(frame) {
    return frame.tag === 'input' && frame.attribs.type !== 'checkbox';
  },
};

/** 消毒 + 强制复选框只读 */
function sanitizeMarkdown(html) {
  const clean = sanitizeHtml(html, SANITIZE_OPTIONS);
  return clean.replace(/<input(?![^>]*disabled)/g, '<input disabled');
}

const PAGE_CSS = `
:root{
  color-scheme: light dark;
  --bg:#ffffff; --bg-soft:#f5f5f7; --text:#1d1d1f; --text-2:#6e6e73;
  --border:rgba(0,0,0,.08); --accent:#0071e3; --code-bg:#f5f5f7;
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:#000000; --bg-soft:#161617; --text:#f5f5f7; --text-2:#86868b;
    --border:rgba(255,255,255,.14); --accent:#2997ff; --code-bg:#1c1c1e;
  }
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--bg); color:var(--text);
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","PingFang SC","Segoe UI",sans-serif;
  -webkit-font-smoothing:antialiased; line-height:1.7;
}
.brandbar{
  position:sticky; top:0; z-index:10;
  backdrop-filter:saturate(180%) blur(20px); -webkit-backdrop-filter:saturate(180%) blur(20px);
  background:color-mix(in srgb, var(--bg) 80%, transparent);
  border-bottom:1px solid var(--border);
}
.brandbar .inner{
  max-width:860px; margin:0 auto; padding:14px 24px;
  display:flex; align-items:baseline; gap:14px; flex-wrap:wrap;
}
.brandbar .logo{ font-weight:700; font-size:15px; letter-spacing:.2px; text-decoration:none; color:var(--text); }
.brandbar .logo span{ color:var(--accent); }
.brandbar .doc-title{ font-size:14px; color:var(--text-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wrap{ max-width:860px; margin:0 auto; padding:48px 24px 32px; }
h1{ font-size:clamp(28px,4vw,40px); font-weight:700; letter-spacing:-.02em; line-height:1.2; margin:0 0 8px; }
.meta{ color:var(--text-2); font-size:13px; margin-bottom:32px; }
.md-body h1,.md-body h2,.md-body h3,.md-body h4{ font-weight:600; letter-spacing:-.01em; line-height:1.3; margin:1.6em 0 .6em; }
.md-body h1{ font-size:30px; padding-bottom:.3em; border-bottom:1px solid var(--border); }
.md-body h2{ font-size:24px; padding-bottom:.25em; border-bottom:1px solid var(--border); }
.md-body h3{ font-size:19px; }
.md-body h4{ font-size:16px; }
.md-body p{ margin:0 0 16px; }
.md-body a{ color:var(--accent); text-decoration:none; }
.md-body a:hover{ text-decoration:underline; }
.md-body ul,.md-body ol{ padding-left:1.6em; margin:0 0 16px; }
.md-body li+li{ margin-top:4px; }
.md-body li>ul,.md-body li>ol{ margin:4px 0 0; }
.md-body input[type=checkbox]{ margin-right:6px; }
.md-body blockquote{
  margin:0 0 16px; padding:12px 20px; color:var(--text-2);
  border-left:3px solid var(--accent); background:var(--bg-soft); border-radius:0 12px 12px 0;
}
.md-body blockquote p:last-child{ margin-bottom:0; }
.md-body code{
  font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  font-size:.88em; background:var(--code-bg); padding:.15em .4em; border-radius:6px;
}
.md-body pre{
  background:var(--code-bg); border:1px solid var(--border); border-radius:14px;
  padding:18px 20px; overflow-x:auto; margin:0 0 20px;
}
.md-body pre code{ background:none; padding:0; font-size:13.5px; line-height:1.65; }
.md-body img{ max-width:100%; border-radius:12px; }
.md-body table{ border-collapse:collapse; width:100%; margin:0 0 20px; font-size:14.5px; }
.md-body th,.md-body td{ border:1px solid var(--border); padding:8px 14px; text-align:left; }
.md-body th{ background:var(--bg-soft); font-weight:600; }
.md-body hr{ border:none; border-top:1px solid var(--border); margin:32px 0; }
.hosted{
  max-width:860px; margin:0 auto; padding:24px; text-align:center;
  color:var(--text-2); font-size:12px; border-top:1px solid var(--border);
}
.hosted a{ color:inherit; text-decoration:none; }
.hosted a:hover{ color:var(--accent); }

/* JSON 查看器 */
.json-toolbar{ display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap; }
.jbtn{
  font:inherit; font-size:13px; padding:7px 18px; border-radius:980px; cursor:pointer;
  border:1px solid var(--border); background:var(--bg-soft); color:var(--text);
  transition:opacity .2s ease, transform .2s ease;
}
.jbtn:hover{ opacity:.85; transform:translateY(-1px); }
.json-box{
  border:1px solid var(--border); border-radius:14px; background:var(--code-bg);
  overflow:auto; max-height:none;
}
.json-box table{ border-collapse:collapse; width:100%; font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace; font-size:13px; line-height:1.6; }
.json-box td{ padding:1px 0; vertical-align:top; white-space:pre; }
.json-box td.ln{
  width:1%; min-width:44px; text-align:right; padding-right:14px; padding-left:14px;
  color:var(--text-2); user-select:none; border-right:1px solid var(--border);
  background:color-mix(in srgb, var(--bg-soft) 60%, transparent);
}
.json-box td.lc{ padding-left:14px; padding-right:14px; }

@media (max-width:560px){
  .md-body table{ display:block; overflow-x:auto; }
}
@media (prefers-reduced-motion: reduce){
  html{ scroll-behavior:auto; }
  .jbtn{ transition:none; }
}
`;

function pageShell({ title, inner, extraHead = '', extraScript = '' }) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · HTML Share</title>
<link rel="stylesheet" href="/vendor/highlight/github.css" media="(prefers-color-scheme: light)">
<link rel="stylesheet" href="/vendor/highlight/github-dark.css" media="(prefers-color-scheme: dark)">
<style>${PAGE_CSS}</style>
${extraHead}
</head>
<body>
<header class="brandbar">
  <div class="inner">
    <a class="logo" href="/">HTML <span>Share</span></a>
    <span class="doc-title">${escapeHtml(title)}</span>
  </div>
</header>
${inner}
<footer class="hosted">Hosted on <a href="/">HTML Share</a></footer>
${extraScript}
</body>
</html>`;
}

/** Markdown 分享页（marked 渲染后经 sanitize-html 消毒） */
function renderMarkdownPage(share) {
  const body = sanitizeMarkdown(marked(share.content || ''));
  const date = (share.created_at || '').slice(0, 10);
  return pageShell({
    title: share.title,
    inner: `
<main class="wrap">
  <h1>${escapeHtml(share.title)}</h1>
  <div class="meta">${date} · ${share.views} 次访问</div>
  <article class="md-body">${body}</article>
</main>`,
  });
}

/** 嵌入 <script> 的 JS 字符串字面量：转义 < 防止 </script> 提前闭合 */
function jsStringLiteral(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/** JSON 分享页（服务端高亮 + 行号 + 复制/下载） */
function renderJsonPage(share) {
  const raw = share.content || '';
  let highlighted;
  try {
    highlighted = hljs.highlight(raw, { language: 'json' }).value;
  } catch {
    highlighted = escapeHtml(raw);
  }
  const rows = highlighted
    .split('\n')
    .map((line, i) => `<tr><td class="ln">${i + 1}</td><td class="lc">${line || ' '}</td></tr>`)
    .join('');
  const date = (share.created_at || '').slice(0, 10);
  return pageShell({
    title: share.title,
    inner: `
<main class="wrap">
  <h1>${escapeHtml(share.title)}</h1>
  <div class="meta">${date} · ${share.views} 次访问 · JSON</div>
  <div class="json-toolbar">
    <button class="jbtn" id="btn-copy">复制内容</button>
    <button class="jbtn" id="btn-download">下载 .json</button>
  </div>
  <div class="json-box"><table><tbody>${rows}</tbody></table></div>
</main>`,
    extraScript: `
<script>
(function(){
  var raw = ${jsStringLiteral(raw)};
  var name = ${jsStringLiteral((share.title || 'data').replace(/[^\w一-龥-]+/g, '-'))} + '.json';
  document.getElementById('btn-copy').addEventListener('click', function(){
    navigator.clipboard.writeText(raw).then(function(){
      var b = document.getElementById('btn-copy'); b.textContent = '已复制';
      setTimeout(function(){ b.textContent = '复制内容'; }, 1500);
    });
  });
  document.getElementById('btn-download').addEventListener('click', function(){
    var blob = new Blob([raw], {type:'application/json'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    URL.revokeObjectURL(a.href);
  });
})();
</script>`,
  });
}

module.exports = { renderMarkdownPage, renderJsonPage };
