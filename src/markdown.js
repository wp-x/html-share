'use strict';

const { marked } = require('marked');
const hljs = require('highlight.js');
const sanitizeHtml = require('sanitize-html');
const { escapeHtml } = require('./util');
const { parseCsv } = require('./csv');

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
  --bg:#f2efe9; --bg-soft:#eae6dc; --card:#faf8f3;
  --text:#151513; --text-2:#6f6b60;
  --border:rgba(21,21,19,.13); --lime:#d4ff3e; --lime-deep:#b8e62e;
  --accent-ink:#4d5b00; --code-bg:#eae6dc;
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:#181713; --bg-soft:#211f19; --card:#211f19;
    --text:#f2efe9; --text-2:#9b978b;
    --border:rgba(242,239,233,.15); --lime:#d4ff3e; --lime-deep:#d4ff3e;
    --accent-ink:#d4ff3e; --code-bg:#211f19;
  }
}
*{box-sizing:border-box}
body{
  margin:0; background:var(--bg); color:var(--text);
  font-family:"Helvetica Neue",Helvetica,-apple-system,BlinkMacSystemFont,"PingFang SC","Hiragino Sans GB","Noto Sans SC","Microsoft YaHei",Arial,sans-serif;
  -webkit-font-smoothing:antialiased; line-height:1.75;
}
::selection{ background:var(--lime); color:#151513; }
.brandbar{
  position:sticky; top:0; z-index:10;
  backdrop-filter:saturate(160%) blur(14px); -webkit-backdrop-filter:saturate(160%) blur(14px);
  background:color-mix(in srgb, var(--bg) 88%, transparent);
  border-bottom:1px solid var(--border);
}
.brandbar .inner{
  max-width:880px; margin:0 auto; padding:13px 24px;
  display:flex; align-items:center; gap:14px; flex-wrap:wrap;
}
.brandbar .logo{
  font-weight:900; font-size:15px; letter-spacing:-.02em; text-transform:uppercase;
  text-decoration:none; color:var(--text);
}
.brandbar .logo span{
  background:var(--lime); color:#151513;
  padding:1px 7px 2px; border-radius:6px; margin-left:2px;
}
.brandbar .doc-title{
  font-size:12.5px; color:var(--text-2);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.brandbar .doc-title::before{
  content:"/"; margin-right:10px; color:var(--lime-deep); font-weight:700;
}
.wrap{ max-width:880px; margin:0 auto; padding:56px 24px 40px; }
h1{
  font-size:clamp(30px,4.4vw,44px); font-weight:900; letter-spacing:-.03em;
  line-height:1.12; margin:0 0 10px;
}
.meta{
  color:var(--text-2); font-size:12px; margin-bottom:36px;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  letter-spacing:.06em; text-transform:uppercase;
}
.meta::before{
  content:""; display:inline-block; width:8px; height:8px; margin-right:9px;
  background:var(--lime); border:1.5px solid var(--text); border-radius:2px; vertical-align:-1px;
}
.md-body h1,.md-body h2,.md-body h3,.md-body h4{
  font-weight:800; letter-spacing:-.02em; line-height:1.28; margin:1.7em 0 .6em;
}
.md-body h1{ font-size:29px; padding-bottom:.32em; border-bottom:1px solid var(--border); }
.md-body h2{ font-size:23px; padding-bottom:.28em; border-bottom:1px solid var(--border); }
.md-body h3{ font-size:18.5px; }
.md-body h4{ font-size:16px; }
.md-body p{ margin:0 0 16px; }
.md-body a{
  color:var(--text); text-decoration:none;
  border-bottom:2px solid var(--lime-deep);
  transition:background-color .15s ease;
}
.md-body a:hover{ background:var(--lime); color:#151513; }
.md-body ul,.md-body ol{ padding-left:1.6em; margin:0 0 16px; }
.md-body li+li{ margin-top:4px; }
.md-body li>ul,.md-body li>ol{ margin:4px 0 0; }
.md-body input[type=checkbox]{ margin-right:6px; }
.md-body blockquote{
  margin:0 0 16px; padding:14px 20px; color:var(--text-2);
  border-left:3px solid var(--lime-deep); background:var(--bg-soft); border-radius:0 14px 14px 0;
}
.md-body blockquote p:last-child{ margin-bottom:0; }
.md-body code{
  font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace;
  font-size:.88em; background:var(--code-bg); padding:.15em .45em; border-radius:6px;
}
.md-body pre{
  background:var(--code-bg); border:1px solid var(--border); border-radius:16px;
  padding:18px 20px; overflow-x:auto; margin:0 0 20px;
}
.md-body pre code{ background:none; padding:0; font-size:13.5px; line-height:1.65; }
.md-body img{ max-width:100%; border-radius:14px; }
.md-body table{ border-collapse:collapse; width:100%; margin:0 0 20px; font-size:14px; }
.md-body th,.md-body td{ border:1px solid var(--border); padding:8px 14px; text-align:left; }
.md-body th{ background:var(--bg-soft); font-weight:700; }
.md-body hr{ border:none; border-top:1px solid var(--border); margin:34px 0; }
.hosted{
  max-width:880px; margin:0 auto; padding:26px 24px;
  display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;
  color:var(--text-2); font-size:12px; border-top:1px solid var(--border);
}
.hosted a{
  color:var(--text); text-decoration:none; font-weight:700;
  border-bottom:2px solid var(--lime-deep);
}
.hosted a:hover{ background:var(--lime); color:#151513; }

/* JSON 查看器 */
.json-toolbar{ display:flex; gap:10px; margin-bottom:20px; flex-wrap:wrap; }
.jbtn{
  font:inherit; font-size:12.5px; font-weight:800; padding:9px 22px; border-radius:980px; cursor:pointer;
  border:1.5px solid var(--text); background:transparent; color:var(--text);
  transition:background-color .18s ease, color .18s ease, transform .18s ease;
}
.jbtn:hover{ background:var(--lime); color:#151513; border-color:var(--lime); transform:translateY(-1px); }
.json-box{
  border:1px solid var(--border); border-radius:16px; background:var(--card);
  overflow:auto; max-height:none;
}
.json-box table{ border-collapse:collapse; width:100%; font-family:ui-monospace,SFMono-Regular,"SF Mono",Menlo,Consolas,monospace; font-size:13px; line-height:1.6; }
.json-box td{ padding:1px 0; vertical-align:top; white-space:pre; }
.json-box td.ln{
  width:1%; min-width:46px; text-align:right; padding-right:14px; padding-left:16px;
  color:var(--text-2); user-select:none; border-right:1px solid var(--border);
  background:var(--bg-soft);
}
.json-box td.lc{ padding-left:16px; padding-right:16px; }

/* CSV 表格 */
.csv-note{
  color:var(--text-2); font-size:12px; margin-bottom:14px;
  font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; letter-spacing:.04em;
}
.csv-box{
  border:1px solid var(--border); border-radius:16px; background:var(--card);
  overflow:auto; max-height:72vh;
}
.csv-table{ border-collapse:collapse; width:100%; font-size:13.5px; line-height:1.6; }
.csv-table th,.csv-table td{
  padding:8px 14px; text-align:left; vertical-align:top;
  border-bottom:1px solid var(--border);
  white-space:pre-wrap; word-break:break-word;
}
.csv-table thead th{
  position:sticky; top:0; z-index:1;
  background:var(--bg-soft); font-weight:700;
  border-bottom:1px solid var(--border);
}
.csv-table tbody tr:nth-child(even) td{ background:color-mix(in srgb, var(--bg-soft) 45%, transparent); }
.csv-table tbody tr:last-child td{ border-bottom:none; }
.csv-empty{
  padding:34px 20px; text-align:center; color:var(--text-2); font-size:13.5px;
}

@media (max-width:560px){
  .wrap{ padding:40px 18px 28px; }
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

/** Text 分享页（highlightAuto 服务端高亮 + 行号 + 复制/下载） */
function renderTextPage(share) {
  const raw = share.content || '';
  let highlighted;
  try {
    // highlightAuto 会拿全部语言逐一对全文匹配，大文本会长时间阻塞事件循环（公开页面每次访问都重算），超阈值直接按纯文本输出
    highlighted = Buffer.byteLength(raw, 'utf8') > 128 * 1024
      ? escapeHtml(raw)
      : hljs.highlightAuto(raw).value;
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
  <div class="meta">${date} · ${share.views} 次访问 · Text</div>
  <div class="json-toolbar">
    <button class="jbtn" id="btn-copy">复制内容</button>
    <button class="jbtn" id="btn-download">下载 .txt</button>
  </div>
  <div class="json-box"><table><tbody>${rows}</tbody></table></div>
</main>`,
    extraScript: `
<script>
(function(){
  var raw = ${jsStringLiteral(raw)};
  var name = ${jsStringLiteral((share.title || 'snippet').replace(/[^\w一-龥-]+/g, '-'))} + '.txt';
  document.getElementById('btn-copy').addEventListener('click', function(){
    navigator.clipboard.writeText(raw).then(function(){
      var b = document.getElementById('btn-copy'); b.textContent = '已复制';
      setTimeout(function(){ b.textContent = '复制内容'; }, 1500);
    });
  });
  document.getElementById('btn-download').addEventListener('click', function(){
    var blob = new Blob([raw], {type:'text/plain;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    URL.revokeObjectURL(a.href);
  });
})();
</script>`,
  });
}

const CSV_MAX_ROWS = 1000;
const CSV_MAX_COLS = 100;

/** CSV 分享页（首行表头，全部单元格转义，超限量截断） */
function renderCsvPage(share) {
  const raw = share.content || '';
  let rows;
  try {
    rows = parseCsv(raw);
  } catch {
    rows = [];
  }
  const totalRows = rows.length;
  const totalCols = rows.reduce((max, r) => Math.max(max, r.length), 0);
  const truncated = totalRows > CSV_MAX_ROWS || totalCols > CSV_MAX_COLS;
  const shown = rows.slice(0, CSV_MAX_ROWS).map((r) => r.slice(0, CSV_MAX_COLS));

  let table;
  if (shown.length === 0) {
    table = '<div class="csv-box"><div class="csv-empty">该 CSV 没有可显示的数据行</div></div>';
  } else {
    const [head, ...bodyRows] = shown;
    const headCells = head
      .map((cell, i) => `<th scope="col">${escapeHtml(cell) || `<span class="csv-note">列 ${i + 1}</span>`}</th>`)
      .join('');
    const bodyHtml = bodyRows
      .map((r) => `<tr>${r.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`)
      .join('');
    table = `<div class="csv-box"><table class="csv-table"><thead><tr>${headCells}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`;
  }

  const date = (share.created_at || '').slice(0, 10);
  return pageShell({
    title: share.title,
    inner: `
<main class="wrap">
  <h1>${escapeHtml(share.title)}</h1>
  <div class="meta">${date} · ${share.views} 次访问 · ${totalRows} 行 × ${totalCols} 列 · CSV</div>
  <div class="json-toolbar">
    <button class="jbtn" id="btn-download">下载 .csv</button>
  </div>
  ${truncated ? `<p class="csv-note">数据超出渲染上限，仅显示前 ${Math.min(totalRows, CSV_MAX_ROWS)} 行${totalCols > CSV_MAX_COLS ? `、前 ${CSV_MAX_COLS} 列` : ''}。</p>` : ''}
  ${table}
</main>`,
    extraScript: `
<script>
(function(){
  var raw = ${jsStringLiteral(raw)};
  var name = ${jsStringLiteral((share.title || 'data').replace(/[^\w一-龥-]+/g, '-'))} + '.csv';
  document.getElementById('btn-download').addEventListener('click', function(){
    var blob = new Blob([raw], {type:'text/csv;charset=utf-8'});
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    URL.revokeObjectURL(a.href);
  });
})();
</script>`,
  });
}

module.exports = { renderMarkdownPage, renderJsonPage, renderTextPage, renderCsvPage };
