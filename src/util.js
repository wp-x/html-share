'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const UPPER_ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CUSTOM_SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/;
const RESERVED_SHARE_IDS = new Set(['admin', 'api', 'dashboard', 'health', 'login', 'logout']);
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function randomString(len, alphabet) {
  const chars = alphabet || UPPER_ALNUM;
  const bytes = crypto.randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  return out;
}

/** 分享 ID：nanoid 风格 10 位 */
function genShareId() {
  return randomString(10, ID_ALPHABET);
}

/** 超级管理员密钥：HS- + 32 位大写字母数字 */
function genAdminKey() {
  return 'HS-' + randomString(32);
}

/** 普通用户密钥：HS-USER- + 24 位 */
function genUserKey() {
  return 'HS-USER-' + randomString(24);
}

/** session token */
function genToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** 校验并规范化自定义分享后缀；空字符串表示使用随机 ID */
function normalizeCustomSlug(value) {
  const slug = String(value == null ? '' : value).trim().toLowerCase();
  if (!slug) return { slug: '', error: '' };
  if (!CUSTOM_SLUG_RE.test(slug)) {
    return { slug: '', error: '自定义后缀需为 3-64 位小写字母、数字或连字符，且首尾不能是连字符' };
  }
  if (RESERVED_SHARE_IDS.has(slug)) {
    return { slug: '', error: '该自定义后缀为系统保留名称，请更换' };
  }
  return { slug, error: '' };
}

/** 使用 scrypt 对分享密码加盐哈希 */
function hashSharePassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(String(password), salt, 32, SCRYPT_OPTIONS);
  return [
    'scrypt',
    SCRYPT_OPTIONS.N,
    SCRYPT_OPTIONS.r,
    SCRYPT_OPTIONS.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

function verifySharePassword(password, encoded) {
  const parts = String(encoded || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (N !== SCRYPT_OPTIONS.N || r !== SCRYPT_OPTIONS.r || p !== SCRYPT_OPTIONS.p) return false;
  try {
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');
    const actual = crypto.scryptSync(String(password), salt, expected.length, SCRYPT_OPTIONS);
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

/** 密码变更后旧解锁 Cookie 会自动失效 */
function shareAccessToken(shareId, passwordHash) {
  return crypto.createHmac('sha256', String(passwordHash)).update(String(shareId)).digest('base64url');
}

function timingSafeEqualText(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** HTML 转义 */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 目标路径是否安全地位于 base 之内（防路径穿越） */
function isPathInside(base, target) {
  const rel = path.relative(base, target);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** 递归计算目录占用字节数 */
function dirSize(dir) {
  let total = 0;
  let stack;
  try {
    stack = [dir];
  } catch {
    return 0;
  }
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(cur, e.name);
      try {
        if (e.isDirectory()) stack.push(p);
        else total += fs.statSync(p).size;
      } catch { /* ignore */ }
    }
  }
  return total;
}

/** dirSize 的 30 秒 TTL 缓存版（供后台统计等高频调用使用） */
const dirSizeCache = new Map(); // dir -> { size, at }
function dirSizeCached(dir) {
  const now = Date.now();
  const hit = dirSizeCache.get(dir);
  if (hit && now - hit.at < 30 * 1000) return hit.size;
  const size = dirSize(dir);
  dirSizeCache.set(dir, { size, at: now });
  return size;
}

function formatBytes(n) {
  if (!n || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return (n / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function rmrf(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch { /* ignore */ }
}

/**
 * 将 highlight.js 的样式/脚本复制为本地静态资源 public/vendor/highlight/。
 * 供 postinstall 与服务器启动时兜底调用。
 */
function ensureVendor(rootDir) {
  const destDir = path.join(rootDir, 'public', 'vendor', 'highlight');
  // 浏览器版构建来自 @highlightjs/cdn-assets，样式优先取官方 npm 包
  const sources = [
    {
      from: path.join(rootDir, 'node_modules', '@highlightjs', 'cdn-assets', 'highlight.min.js'),
      to: 'highlight.min.js',
    },
    {
      from: path.join(rootDir, 'node_modules', 'highlight.js', 'styles', 'github.css'),
      fallback: path.join(rootDir, 'node_modules', '@highlightjs', 'cdn-assets', 'styles', 'github.min.css'),
      to: 'github.css',
    },
    {
      from: path.join(rootDir, 'node_modules', 'highlight.js', 'styles', 'github-dark.css'),
      fallback: path.join(rootDir, 'node_modules', '@highlightjs', 'cdn-assets', 'styles', 'github-dark.min.css'),
      to: 'github-dark.css',
    },
  ];
  try {
    fs.mkdirSync(destDir, { recursive: true });
    for (const c of sources) {
      const d = path.join(destDir, c.to);
      const s = fs.existsSync(c.from) ? c.from : c.fallback;
      if (!fs.existsSync(d) && s && fs.existsSync(s)) {
        fs.copyFileSync(s, d);
      }
    }
  } catch { /* 缺依赖时静默跳过，页面仍能无高亮渲染 */ }
}

module.exports = {
  genShareId,
  genAdminKey,
  genUserKey,
  genToken,
  normalizeCustomSlug,
  hashSharePassword,
  verifySharePassword,
  shareAccessToken,
  timingSafeEqualText,
  escapeHtml,
  isPathInside,
  dirSize,
  dirSizeCached,
  formatBytes,
  rmrf,
  ensureVendor,
};
