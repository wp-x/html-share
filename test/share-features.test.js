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
  const accessCookie = cookiePair(unlocked.response.headers.get('set-cookie'));
  assert.match(accessCookie, /^hs_share_access=/);

  const visible = await fetch(baseUrl + '/s/my-launch', {
    headers: { Cookie: accessCookie },
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
  const publicPage = await fetch(baseUrl + legacy.data.url);
  assert.equal(await publicPage.text(), '<p>public-share</p>');
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

  const lockedAsset = await fetch(baseUrl + '/s/private-site/assets/site.css');
  assert.equal(lockedAsset.status, 401);

  const unlocked = await jsonRequest('/s/private-site/unlock', {
    method: 'POST',
    body: { password: 'site-pass' },
  });
  const accessCookie = cookiePair(unlocked.response.headers.get('set-cookie'));

  const index = await fetch(baseUrl + '/s/private-site', { headers: { Cookie: accessCookie } });
  assert.equal(index.status, 200);
  assert.match(await index.text(), /private-site/);

  const asset = await fetch(baseUrl + '/s/private-site/assets/site.css', {
    headers: { Cookie: accessCookie },
  });
  assert.equal(asset.status, 200);
  assert.equal(await asset.text(), 'body { color: rgb(1, 2, 3); }');
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
