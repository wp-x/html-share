'use strict';

const { genToken } = require('./util');

const SESSION_COOKIE = 'hs_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    let value = part.slice(idx + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      continue; // 畸形编码的 cookie 直接跳过
    }
    out[part.slice(0, idx).trim()] = value;
  }
  return out;
}

/** 解析 session cookie，把当前密钥挂到 req.key 上 */
function sessionMiddleware(db) {
  const findSession = db.prepare('SELECT token, key_id, created_at FROM sessions WHERE token = ?');
  const findKey = db.prepare('SELECT * FROM keys WHERE id = ?');
  const dropSession = db.prepare('DELETE FROM sessions WHERE token = ?');
  const touchKey = db.prepare('UPDATE keys SET last_used_at = ? WHERE id = ?');

  return (req, res, next) => {
    req.key = null;
    const token = parseCookies(req)[SESSION_COOKIE];
    if (token) {
      const sess = findSession.get(token);
      if (sess) {
        const age = Date.now() - Date.parse(sess.created_at);
        if (age > SESSION_TTL_MS) {
          dropSession.run(token);
        } else {
          const key = findKey.get(sess.key_id);
          if (key && !key.disabled) {
            req.key = key;
            req.sessionToken = token;
            // 每次 API 请求更新最近使用时间
            if (req.path.startsWith('/api')) {
              touchKey.run(new Date().toISOString(), key.id);
            }
          }
        }
      }
    }
    next();
  };
}

function createSession(db, keyId) {
  const token = genToken();
  db.prepare('INSERT INTO sessions (token, key_id, created_at) VALUES (?, ?, ?)')
    .run(token, keyId, new Date().toISOString());
  return token;
}

function setSessionCookie(res, token) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}${secure}`
  );
}

function destroySession(db, token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

/** API：要求登录 */
function requireAuth(req, res, next) {
  if (!req.key) return res.status(401).json({ error: '未登录或登录已过期' });
  next();
}

/** API：要求管理员 */
function requireAdmin(req, res, next) {
  if (!req.key) return res.status(401).json({ error: '未登录或登录已过期' });
  if (!req.key.is_admin) return res.status(403).json({ error: '需要管理员权限' });
  next();
}

/** 页面：要求登录，否则跳登录页 */
function requireAuthPage(req, res, next) {
  if (!req.key) return res.redirect('/login');
  next();
}

/** 页面：要求管理员，否则跳工作台 */
function requireAdminPage(req, res, next) {
  if (!req.key) return res.redirect('/login');
  if (!req.key.is_admin) return res.redirect('/dashboard');
  next();
}

/** 登录限流：同一 IP 每分钟最多 10 次 */
const attempts = new Map(); // ip -> { count, resetAt }（Map 保持插入顺序）
function loginRateLimiter(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();

  // 内存膨胀保护：先删过期记录，仍超限则按插入顺序删最旧
  if (attempts.size > 10000) {
    for (const [k, v] of attempts) {
      if (now > v.resetAt) attempts.delete(k);
    }
    while (attempts.size > 10000) {
      attempts.delete(attempts.keys().next().value);
    }
  }

  let rec = attempts.get(ip);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + 60 * 1000 };
    attempts.set(ip, rec);
  }
  rec.count += 1;
  if (rec.count > 10) {
    return res.status(429).json({ error: '尝试过于频繁，请一分钟后再试' });
  }
  next();
}

module.exports = {
  SESSION_COOKIE,
  sessionMiddleware,
  createSession,
  setSessionCookie,
  destroySession,
  requireAuth,
  requireAdmin,
  requireAuthPage,
  requireAdminPage,
  loginRateLimiter,
};
