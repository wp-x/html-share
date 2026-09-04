'use strict';

const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { once } = require('node:events');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const AdmZip = require('adm-zip');

const ROOT = path.join(__dirname, '..');
let server;
let serverOutput = '';
let tempRoot;
let baseUrl;
let sessionCookie;

before(async () => {
  const port = await getFreePort();
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'html-share-test-'));
  const dataDir = path.join(tempRoot, 'data');
  baseUrl = `http://127.0.0.1:${port}`;

  server = spawn(process.execPath, ['src/server.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DATA_DIR: dataDir,
      MAX_CONTENT_MB: '1',
      MAX_UPLOAD_MB: '5',
      MAX_SITE_TOTAL_MB: '10',
      MAX_SHARES_PER_KEY: '20',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
  server.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

  await waitForServer();
  const adminKey = fs.readFileSync(path.join(dataDir, 'INITIAL_ADMIN_KEY.txt'), 'utf8').trim().split(/\s+/).pop();
  const login = await fetch(baseUrl + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: adminKey }),
  });
  assert.equal(login.status, 200);
  sessionCookie = cookiePair(login.headers.get('set-cookie'));
  assert.match(sessionCookie, /^hs_session=/);
});

after(async () => {
  if (server && server.exitCode == null) {
    server.kill('SIGTERM');
    await once(server, 'exit');
  }
  if (tempRoot) fs.rmSync(tempRoot, { recursive: true, force: true });
});

test('text shares support a password and normalized custom suffix', async () => {
  const content = '<h1 id="secret">protected-content</h1>';
  const created = await jsonRequest('/api/shares', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      type: 'html',
      title: 'Protected page',
      content,
      custom_slug: 'My-Launch',
      password: 'open-sesame',
    },
  });
  assert.equal(created.response.status, 200);
  assert.equal(created.data.id, 'my-launch');
  assert.equal(created.data.url, '/s/my-launch');
  assert.equal(created.data.password_protected, true);

  const locked = await fetch(baseUrl + '/s/my-launch');
  assert.equal(locked.status, 200);
  const lockedHtml = await locked.text();
  assert.match(lockedHtml, /share-password-form/);
  assert.doesNotMatch(lockedHtml, /protected-content/);

  const wrong = await jsonRequest('/s/my-launch/unlock', {
    method: 'POST',
    body: { password: 'wrong-password' },
  });
  assert.equal(wrong.response.status, 401);
  assert.equal(wrong.data.error, '密码错误');

  const unlocked = await jsonRequest('/s/my-launch/unlock', {
    method: 'POST',
    body: { password: 'open-sesame' },
  });
  assert.equal(unlocked.response.status, 200);
  assert.equal(unlocked.data.url, '/s/my-launch');
  const accessCookie = cookiePair(unlocked.response.headers.get('set-cookie'));
  assert.match(accessCookie, /^hs_share_access=/);

  const visible = await fetch(baseUrl + '/s/my-launch', {
    headers: { Cookie: accessCookie },
    redirect: 'manual',
  });
  assert.equal(visible.status, 200);
  assert.equal(await visible.text(), content);

  const list = await jsonRequest('/api/shares', { cookie: sessionCookie });
  const row = list.data.shares.find((share) => share.id === 'my-launch');
  assert.equal(row.password_protected, 1);

  const duplicate = await jsonRequest('/api/shares', {
    method: 'POST',
    cookie: sessionCookie,
    body: { type: 'html', content: '<p>duplicate</p>', custom_slug: 'my-launch' },
  });
  assert.equal(duplicate.response.status, 409);

  const invalid = await jsonRequest('/api/shares', {
    method: 'POST',
    cookie: sessionCookie,
    body: { type: 'html', content: '<p>invalid</p>', custom_slug: '../bad' },
  });
  assert.equal(invalid.response.status, 400);

  const legacy = await jsonRequest('/api/shares', {
    method: 'POST',
    cookie: sessionCookie,
    body: { type: 'html', content: '<p>public-share</p>' },
  });
  assert.equal(legacy.response.status, 200);
  assert.match(legacy.data.id, /^[A-Za-z0-9]{10}$/);
  const publicPage = await fetch(baseUrl + legacy.data.url, { redirect: 'manual' });
  assert.equal(publicPage.status, 200);
  assert.equal(await publicPage.text(), '<p>public-share</p>');
});

test('Markdown and JSON shares keep non-directory URLs', async () => {
  const markdown = await jsonRequest('/api/shares', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      type: 'markdown',
      title: 'Markdown page',
      content: '# markdown-content',
      custom_slug: 'md-launch',
    },
  });
  assert.equal(markdown.response.status, 200);
  assert.equal(markdown.data.url, '/s/md-launch');
  const markdownPage = await fetch(baseUrl + markdown.data.url, { redirect: 'manual' });
  assert.equal(markdownPage.status, 200);
  assert.match(await markdownPage.text(), /markdown-content/);

  const json = await jsonRequest('/api/shares', {
    method: 'POST',
    cookie: sessionCookie,
    body: {
      type: 'json',
      title: 'JSON page',
      content: '{"message":"json-content"}',
      custom_slug: 'json-launch',
    },
  });
  assert.equal(json.response.status, 200);
  assert.equal(json.data.url, '/s/json-launch');
  const jsonPage = await fetch(baseUrl + json.data.url, { redirect: 'manual' });
  assert.equal(jsonPage.status, 200);
  assert.match(await jsonPage.text(), /json-content/);
});

test('ZIP sites protect both the index and static assets', async () => {
  const zip = new AdmZip();
  zip.addFile('index.html', Buffer.from('<!doctype html><link rel="stylesheet" href="assets/site.css"><h1>private-site</h1>'));
  zip.addFile('assets/site.css', Buffer.from('body { color: rgb(1, 2, 3); }'));

  const form = new FormData();
  form.append('title', 'Private site');
  form.append('custom_slug', 'private-site');
  form.append('password', 'site-pass');
  form.append('file', new Blob([zip.toBuffer()], { type: 'application/zip' }), 'site.zip');

  const createdResponse = await fetch(baseUrl + '/api/shares/site', {
    method: 'POST',
    headers: { Cookie: sessionCookie },
    body: form,
  });
  const created = await createdResponse.json();
  assert.equal(createdResponse.status, 200);
  assert.equal(created.id, 'private-site');
  assert.equal(created.url, '/s/private-site/');

  const lockedIndex = await fetch(baseUrl + '/s/private-site/');
  assert.equal(lockedIndex.status, 200);
  assert.match(await lockedIndex.text(), /share-password-form/);

  const lockedLegacyIndex = await fetch(baseUrl + '/s/private-site?view=mobile', { redirect: 'manual' });
  assert.equal(lockedLegacyIndex.status, 200);
  const lockedLegacyHtml = await lockedLegacyIndex.text();
  assert.match(lockedLegacyHtml, /share-password-form/);
  assert.match(lockedLegacyHtml, /data-unlock-url="\/s\/private-site\/unlock\?view=mobile"/);
  assert.doesNotMatch(lockedLegacyHtml, /assets\/site\.css/);

  const lockedAsset = await fetch(baseUrl + '/s/private-site/assets/site.css');
  assert.equal(lockedAsset.status, 401);
  const lockedShares = await jsonRequest('/api/shares', { cookie: sessionCookie });
  assert.equal(lockedShares.data.shares.find((share) => share.id === 'private-site').views, 0);

  const unlocked = await jsonRequest('/s/private-site/unlock?view=mobile', {
    method: 'POST',
    body: { password: 'site-pass' },
  });
  assert.equal(unlocked.response.status, 200);
  assert.equal(unlocked.data.url, '/s/private-site/?view=mobile');
  const accessCookie = cookiePair(unlocked.response.headers.get('set-cookie'));

  const legacyIndex = await fetch(baseUrl + '/s/private-site?view=mobile', {
    headers: { Cookie: accessCookie },
    redirect: 'manual',
  });
  assert.equal(legacyIndex.status, 308);
  assert.equal(legacyIndex.headers.get('location'), '/s/private-site/?view=mobile');

  const index = await fetch(baseUrl + '/s/private-site/', { headers: { Cookie: accessCookie } });
  assert.equal(index.status, 200);
  assert.match(await index.text(), /private-site/);

  const assetUrl = new URL('assets/site.css', baseUrl + '/s/private-site/');
  assert.equal(assetUrl.pathname, '/s/private-site/assets/site.css');
  const asset = await fetch(assetUrl, {
    headers: { Cookie: accessCookie },
  });
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), 'body { color: rgb(1, 2, 3); }');
  const finalShares = await jsonRequest('/api/shares', { cookie: sessionCookie });
  assert.equal(finalShares.data.shares.find((share) => share.id === 'private-site').views, 1);
});

test('Text shares render highlighted lines with line numbers and CSP', async () => {
  const content = 'const x = 1;\nfunction add(a, b) {\n  return a + b;\n}';
  const created = await jsonRequest('/api/shares', {
    method: 'POST',
    cookie: sessionCookie,
    body: { type: 'text', content, custom_slug: 'text-launch' },
  });
  assert.equal(created.response.status, 200);
  assert.equal(created.data.url, '/s/text-launch');

  const page = await fetch(baseUrl + created.data.url, { redirect: 'manual' });
  assert.equal(page.status, 200);
  const csp = page.headers.get('content-security-policy');
  assert.ok(csp && csp.includes("script-src 'unsafe-inline'"));
  const html = await page.text();
  assert.match(html, /<td class="ln">1<\/td>/);
  assert.match(html, /<td class="ln">4<\/td>/);
  assert.match(html, /hljs-[a-z]+/);
  assert.match(html, /btn-copy/);
  assert.match(html, /btn-download/);
  // 内联脚本中的 < 必须被转义，避免 </script> 提前闭合
  assert.doesNotMatch(html, /return a \+ b;<\/script>/);
});

test('CSV shares render an escaped table with header and CSP', async () => {
  const content = 'name,note\r\n"hello, world","<script>alert(1)</script>"\nplain,"say ""hi"""';
  const created = await jsonRequest('/api/shares', {
    method: 'POST',
    cookie: sessionCookie,
    body: { type: 'csv', title: 'CSV page', content, custom_slug: 'csv-launch' },
  });
  assert.equal(created.response.status, 200);
  assert.equal(created.data.url, '/s/csv-launch');

  const page = await fetch(baseUrl + created.data.url, { redirect: 'manual' });
  assert.equal(page.status, 200);
  const csp = page.headers.get('content-security-policy');
  assert.ok(csp && csp.includes("script-src 'unsafe-inline'"));
  const html = await page.text();
  assert.match(html, /<th scope="col">name<\/th>/);
  assert.match(html, /<th scope="col">note<\/th>/);
  assert.match(html, /hello, world/);
  assert.match(html, /say &quot;hi&quot;/);
  // XSS 单元格必须被转义，原始 <script> 不得出现
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /3 行 × 2 列/);
  assert.match(html, /btn-download/);
});

test('invalid CSV content is rejected with 400', async () => {
  const created = await jsonRequest('/api/shares', {
    method: 'POST',
    cookie: sessionCookie,
    body: { type: 'csv', content: 'a,b\n"unclosed,quote' },
  });
  assert.equal(created.response.status, 400);
  assert.match(created.data.error, /CSV 格式无效/);

  const bad = await jsonRequest('/api/shares', {
    method: 'POST',
    cookie: sessionCookie,
    body: { type: 'csv', content: 'a,b\n"x"y,2' },
  });
  assert.equal(bad.response.status, 400);
});

async function jsonRequest(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.cookie) headers.Cookie = options.cookie;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(baseUrl + url, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { response, data: await response.json() };
}

function cookiePair(setCookie) {
  return String(setCookie || '').split(';', 1)[0];
}

async function getFreePort() {
  const listener = net.createServer();
  listener.listen(0, '127.0.0.1');
  await once(listener, 'listening');
  const port = listener.address().port;
  listener.close();
  await once(listener, 'close');
  return port;
}

async function waitForServer() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode != null) throw new Error('server exited during startup\n' + serverOutput);
    try {
      const response = await fetch(baseUrl + '/api/health');
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('server did not become ready\n' + serverOutput);
}
