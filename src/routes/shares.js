'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const AdmZip = require('adm-zip');
const {
  genShareId,
  normalizeCustomSlug,
  hashSharePassword,
  verifySharePassword,
  shareAccessToken,
  timingSafeEqualText,
  escapeHtml,
  isPathInside,
  rmrf,
} = require('../util');
const { renderMarkdownPage, renderJsonPage } = require('../markdown');
const { requireAuth } = require('../auth');

const MAX_ZIP_ENTRIES = 5000;
const MAX_ZIP_FILE_BYTES = 100 * 1024 * 1024; // 单文件 100MB
const MIN_SHARE_PASSWORD_LENGTH = 4;
const MAX_SHARE_PASSWORD_LENGTH = 128;
const SHARE_ACCESS_COOKIE = 'hs_share_access';
const SHARE_ACCESS_TTL_SECONDS = 7 * 24 * 60 * 60;
const PASSWORD_ATTEMPT_LIMIT = 10;
const PASSWORD_ATTEMPT_WINDOW_MS = 5 * 60 * 1000;
const CSP_PASSWORD = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

// Markdown / JSON 分享页的 CSP（html/site 类型保持原样不加）
const CSP_MARKDOWN = "default-src 'self'; script-src 'none'; style-src 'self' 'unsafe-inline'; img-src http: https: data:";
const CSP_JSON = "default-src 'self'; script-src 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src http: https: data:";

module.exports = function sharesRouter(db, config) {
  const router = express.Router();
  const sitesDir = path.join(config.DATA_DIR, 'sites');
  const tmpDir = path.join(config.DATA_DIR, 'tmp');
  const passwordAttempts = new Map();

  const upload = multer({
    dest: tmpDir,
    limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024 },
    fileFilter(req, file, cb) {
      if (!/\.zip$/i.test(file.originalname || '')) {
        return cb(new Error('仅支持 .zip 文件'));
      }
      cb(null, true);
    },
  });

  // ---------- API ----------

  router.get('/api/me', requireAuth, (req, res) => {
    res.json({
      label: req.key.label,
      is_admin: !!req.key.is_admin,
      key_prefix: req.key.key.slice(0, 12),
    });
  });

  router.get('/api/shares', requireAuth, (req, res) => {
    const rows = db.prepare(
      `SELECT id, type, title, views, created_at,
              CASE WHEN password_hash IS NULL THEN 0 ELSE 1 END AS password_protected
       FROM shares WHERE owner_key_id = ? ORDER BY created_at DESC`
    ).all(req.key.id);
    res.json({ shares: rows });
  });

  // 创建文本类分享（html / markdown / json）
  router.post('/api/shares', requireAuth, (req, res) => {
    const { type, title, content } = req.body || {};
    if (!['html', 'markdown', 'json'].includes(type)) {
      return res.status(400).json({ error: '不支持的类型' });
    }
    if (typeof content !== 'string' || content.trim() === '') {
      return res.status(400).json({ error: '内容不能为空' });
    }
    if (Buffer.byteLength(content, 'utf8') > config.MAX_CONTENT_MB * 1024 * 1024) {
      return res.status(413).json({ error: `内容超过 ${config.MAX_CONTENT_MB}MB 上限` });
    }
    const count = db.prepare('SELECT COUNT(*) AS c FROM shares WHERE owner_key_id = ?').get(req.key.id).c;
    if (count >= config.MAX_SHARES_PER_KEY) {
      return res.status(429).json({ error: '分享数量已达上限' });
    }

    let stored = content;
    if (type === 'json') {
      try {
        stored = JSON.stringify(JSON.parse(content), null, 2);
      } catch {
        return res.status(400).json({ error: 'JSON 格式无效，请检查语法' });
      }
    }

    const options = buildShareOptions(db, req.body);
    if (options.error) return res.status(options.status).json({ error: options.error });
    try {
      db.prepare(
        'INSERT INTO shares (id, owner_key_id, type, title, content, password_hash, views, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?)'
      ).run(
        options.id,
        req.key.id,
        type,
        (String(title || '').trim() || defaultTitle(type)).slice(0, 200),
        stored,
        options.passwordHash,
        new Date().toISOString()
      );
    } catch (error) {
      if (isUniqueConstraint(error)) {
        return res.status(409).json({ error: '该自定义后缀已被使用，请更换' });
      }
      throw error;
    }
    res.json({ id: options.id, url: '/s/' + options.id, password_protected: !!options.passwordHash });
  });

  // 上传 ZIP 静态站点
  router.post('/api/shares/site', requireAuth, (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        const msg = err.code === 'LIMIT_FILE_SIZE'
          ? `ZIP 超过 ${config.MAX_UPLOAD_MB}MB 上限`
          : (err.message || '上传失败');
        return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: msg });
      }
      if (!req.file) return res.status(400).json({ error: '请选择 .zip 文件' });

      const count = db.prepare('SELECT COUNT(*) AS c FROM shares WHERE owner_key_id = ?').get(req.key.id).c;
      if (count >= config.MAX_SHARES_PER_KEY) {
        rmrf(req.file.path);
        return res.status(429).json({ error: '分享数量已达上限' });
      }

      const options = buildShareOptions(db, req.body);
      if (options.error) {
        rmrf(req.file.path);
        return res.status(options.status).json({ error: options.error });
      }

      const tmpPath = req.file.path;
      let destDir = null;
      try {
        const zip = new AdmZip(tmpPath);
        const entries = zip.getEntries();

        // 逐条校验：zip-slip / 单文件大小 / 条目数 / 解压总量（按头部声明）
        if (entries.length > MAX_ZIP_ENTRIES) {
          return fail(400, `ZIP 条目数超过 ${MAX_ZIP_ENTRIES} 上限`);
        }
        const maxSiteTotal = config.MAX_SITE_TOTAL_MB * 1024 * 1024;
        let declaredTotal = 0;
        for (const e of entries) {
          const name = e.entryName;
          if (path.isAbsolute(name) || name.split(/[\\/]+/).includes('..')) {
            return fail(400, 'ZIP 包含非法路径，已拒绝');
          }
          if (!e.isDirectory) {
            if (e.header.size > MAX_ZIP_FILE_BYTES) {
              return fail(400, 'ZIP 内单个文件超过 100MB 上限');
            }
            declaredTotal += e.header.size;
          }
        }
        if (declaredTotal > maxSiteTotal) {
          return fail(400, `ZIP 解压后总大小超过 ${config.MAX_SITE_TOTAL_MB}MB 上限`);
        }

        // 定位 index.html：根目录优先；否则唯一一级子目录
        let root = '';
        const hasRootIndex = entries.some((e) => e.entryName === 'index.html');
        if (!hasRootIndex) {
          const topDirs = new Set();
          for (const e of entries) {
            const seg = e.entryName.split('/').filter(Boolean);
            if (seg.length >= 1) topDirs.add(seg[0]);
          }
          const candidates = [...topDirs].filter((d) =>
            entries.some((e) => e.entryName === d + '/index.html'));
          if (candidates.length === 1) {
            root = candidates[0] + '/';
          } else {
            return fail(400, 'ZIP 中未找到 index.html');
          }
        }

        // 解压到 data/sites/<id>/（按实际字节数再熔断一次，防伪造头）
        const id = options.id;
        const candidateDir = path.join(sitesDir, id);
        if (fs.existsSync(candidateDir)) {
          return fail(409, '该自定义后缀已被使用，请更换');
        }
        destDir = candidateDir;
        fs.mkdirSync(destDir, { recursive: true });
        let actualTotal = 0;
        for (const e of entries) {
          if (!e.entryName.startsWith(root)) continue;
          const rel = e.entryName.slice(root.length);
          if (!rel) continue;
          const target = path.join(destDir, rel);
          if (!isPathInside(destDir, target)) continue;
          if (e.isDirectory) {
            fs.mkdirSync(target, { recursive: true });
          } else {
            const data = e.getData();
            actualTotal += data.length;
            if (actualTotal > maxSiteTotal) {
              rmrf(destDir);
              destDir = null;
              return fail(400, `ZIP 解压后总大小超过 ${config.MAX_SITE_TOTAL_MB}MB 上限`);
            }
            fs.mkdirSync(path.dirname(target), { recursive: true });
            fs.writeFileSync(target, data);
          }
        }

        const title = (String((req.body && req.body.title) || '').trim() || '静态站点').slice(0, 200);
        try {
          db.prepare(
            "INSERT INTO shares (id, owner_key_id, type, title, content, password_hash, views, created_at) VALUES (?, ?, 'site', ?, NULL, ?, 0, ?)"
          ).run(id, req.key.id, title, options.passwordHash, new Date().toISOString());
        } catch (dbError) {
          if (isUniqueConstraint(dbError)) {
            return fail(409, '该自定义后缀已被使用，请更换');
          }
          throw dbError;
        }
        res.json({ id, url: '/s/' + id + '/', password_protected: !!options.passwordHash });
      } catch (e2) {
        if (destDir) rmrf(destDir);
        fail(400, 'ZIP 解析失败：' + (e2.message || '文件损坏'));
      } finally {
        rmrf(tmpPath); // 无条件删除 ZIP 临时文件
      }

      function fail(status, message) {
        if (destDir) rmrf(destDir);
        res.status(status).json({ error: message });
      }
    });
  });

  // 删除分享（所有者或管理员）
  router.delete('/api/shares/:id', requireAuth, (req, res) => {
    const share = db.prepare('SELECT * FROM shares WHERE id = ?').get(req.params.id);
    if (!share) return res.status(404).json({ error: '分享不存在' });
    if (share.owner_key_id !== req.key.id && !req.key.is_admin) {
      return res.status(403).json({ error: '无权删除该分享' });
    }
    deleteShare(share);
    res.json({ ok: true });
  });

  // ---------- 分享渲染 ----------

  router.post('/s/:id/unlock', (req, res) => {
    const share = db.prepare('SELECT id, type, password_hash FROM shares WHERE id = ?').get(req.params.id);
    if (!share) return res.status(404).json({ error: '分享不存在或已被删除' });
    const url = '/s/' + share.id + (share.type === 'site' ? '/' : '') + getQueryString(req);
    if (!share.password_hash) return res.json({ ok: true, url });

    const attemptKey = `${req.ip || req.socket.remoteAddress || 'unknown'}:${share.id}`;
    const attempt = getPasswordAttempt(passwordAttempts, attemptKey);
    if (attempt.count >= PASSWORD_ATTEMPT_LIMIT) {
      return res.status(429).json({ error: '密码尝试过于频繁，请稍后再试' });
    }

    const password = String((req.body && req.body.password) || '');
    if (!password || !verifySharePassword(password, share.password_hash)) {
      attempt.count += 1;
      return res.status(401).json({ error: '密码错误' });
    }

    passwordAttempts.delete(attemptKey);
    setShareAccessCookie(res, share);
    res.json({ ok: true, url });
  });

  router.get('/s/:id', (req, res) => {
    const share = db.prepare('SELECT * FROM shares WHERE id = ?').get(req.params.id);
    if (!share) {
      return res.status(404).type('html').send(notFoundPage());
    }
    if (!hasShareAccess(req, share)) {
      return res
        .status(200)
        .setHeader('Cache-Control', 'no-store')
        .setHeader('Content-Security-Policy', CSP_PASSWORD)
        .type('html')
        .send(passwordPage(share, getQueryString(req)));
    }
    if (share.type === 'site' && !req.path.endsWith('/')) {
      // ZIP 站点是目录，尾斜杠用于正确解析相对资源路径。
      return res.redirect(308, '/s/' + share.id + '/' + getQueryString(req));
    }
    db.prepare('UPDATE shares SET views = views + 1 WHERE id = ?').run(share.id);
    share.views += 1;

    if (share.type === 'html') {
      return res.type('html').send(share.content); // 原样输出，所见即所得
    }
    if (share.type === 'markdown') {
      return res.setHeader('Content-Security-Policy', CSP_MARKDOWN).type('html').send(renderMarkdownPage(share));
    }
    if (share.type === 'json') {
      return res.setHeader('Content-Security-Policy', CSP_JSON).type('html').send(renderJsonPage(share));
    }
    // site
    const index = path.join(sitesDir, share.id, 'index.html');
    if (!fs.existsSync(index)) {
      return res.status(404).type('html').send(notFoundPage());
    }
    res.sendFile(index);
  });

  // site 类型的静态资源
  router.get('/s/:id/*', (req, res) => {
    const share = db.prepare('SELECT id, type, password_hash FROM shares WHERE id = ?').get(req.params.id);
    if (!share || share.type !== 'site') {
      return res.status(404).type('html').send(notFoundPage());
    }
    if (!hasShareAccess(req, share)) {
      return res.status(401).type('text').send('该分享需要密码，请先访问分享首页完成解锁');
    }
    const base = path.join(sitesDir, share.id);
    const rel = req.params[0] || ''; // Express 已完成 URL 解码
    const target = rel ? path.join(base, rel) : path.join(base, 'index.html');
    if (!isPathInside(base, target)) {
      return res.status(403).type('html').send(notFoundPage('无权访问该路径'));
    }
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      return res.status(404).type('html').send(notFoundPage());
    }
    res.sendFile(target);
  });

  function deleteShare(share) {
    if (share.type === 'site') {
      rmrf(path.join(sitesDir, share.id));
    }
    db.prepare('DELETE FROM shares WHERE id = ?').run(share.id);
  }

  router.deleteShare = deleteShare;

  return router;
};

function buildShareOptions(db, body) {
  const slugResult = normalizeCustomSlug(body && body.custom_slug);
  if (slugResult.error) return { status: 400, error: slugResult.error };

  const password = String((body && body.password) || '');
  if (password && (password.trim() === '' || password.length < MIN_SHARE_PASSWORD_LENGTH || password.length > MAX_SHARE_PASSWORD_LENGTH)) {
    return {
      status: 400,
      error: `分享密码需为 ${MIN_SHARE_PASSWORD_LENGTH}-${MAX_SHARE_PASSWORD_LENGTH} 个字符`,
    };
  }

  let id = slugResult.slug;
  if (id) {
    if (db.prepare('SELECT 1 FROM shares WHERE id = ?').get(id)) {
      return { status: 409, error: '该自定义后缀已被使用，请更换' };
    }
  } else {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = genShareId();
      if (!db.prepare('SELECT 1 FROM shares WHERE id = ?').get(candidate)) {
        id = candidate;
        break;
      }
    }
    if (!id) return { status: 503, error: '暂时无法生成分享链接，请重试' };
  }

  return {
    id,
    passwordHash: password ? hashSharePassword(password) : null,
  };
}

function isUniqueConstraint(error) {
  return !!(error && String(error.code || '').startsWith('SQLITE_CONSTRAINT'));
}

function parseCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1 || part.slice(0, idx).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(idx + 1).trim());
    } catch {
      return '';
    }
  }
  return '';
}

function hasShareAccess(req, share) {
  if (!share.password_hash) return true;
  const actual = parseCookie(req, SHARE_ACCESS_COOKIE);
  const expected = shareAccessToken(share.id, share.password_hash);
  return timingSafeEqualText(actual, expected);
}

function setShareAccessCookie(res, share) {
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  const token = shareAccessToken(share.id, share.password_hash);
  res.append(
    'Set-Cookie',
    `${SHARE_ACCESS_COOKIE}=${token}; Path=/s/${share.id}; HttpOnly; SameSite=Lax; Max-Age=${SHARE_ACCESS_TTL_SECONDS}${secure}`
  );
}

function getPasswordAttempt(attempts, key) {
  const now = Date.now();
  if (attempts.size > 10000) {
    for (const [storedKey, stored] of attempts) {
      if (now > stored.resetAt) attempts.delete(storedKey);
    }
  }
  let attempt = attempts.get(key);
  if (!attempt || now > attempt.resetAt) {
    attempt = { count: 0, resetAt: now + PASSWORD_ATTEMPT_WINDOW_MS };
    attempts.set(key, attempt);
  }
  return attempt;
}

function getQueryString(req) {
  const queryStart = req.originalUrl.indexOf('?');
  return queryStart === -1 ? '' : req.originalUrl.slice(queryStart);
}

function passwordPage(share, query = '') {
  const title = escapeHtml(share.title || '受保护的分享');
  const unlockUrl = escapeHtml('/s/' + share.id + '/unlock' + query);
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} · 请输入密码</title><link rel="stylesheet" href="/css/style.css"></head><body><section class="login-wrap"><div class="card login-card"><div class="login-logo" aria-hidden="true">&#128274;</div><h1>${title}</h1><p class="muted">此分享受密码保护</p><form id="share-password-form" data-unlock-url="${unlockUrl}"><input class="input input-mono" id="share-password-input" type="password" autocomplete="current-password" placeholder="输入分享密码" aria-label="分享密码" autofocus><div class="form-error" id="share-password-error" role="alert"></div><button class="btn btn-primary btn-block" type="submit" id="share-password-button">解锁查看</button></form></div></section><script src="/js/share-unlock.js"></script></body></html>`;
}

function defaultTitle(type) {
  return { html: 'HTML 页面', markdown: 'Markdown 文档', json: 'JSON 数据' }[type] || '未命名';
}

function notFoundPage(msg) {
  const text = msg || '分享不存在或已被删除';
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${text}</title><link rel="stylesheet" href="/css/style.css"></head><body><section class="login-wrap"><div class="card login-card"><h1>404</h1><p class="muted">${escapeHtml(text)}</p><a class="btn btn-primary" href="/">返回首页</a></div></section></body></html>`;
}
