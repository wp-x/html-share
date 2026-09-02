'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const { genAdminKey, genUserKey, dirSizeCached, formatBytes } = require('../util');
const { requireAdmin } = require('../auth');

module.exports = function adminRouter(db, config, deleteShare) {
  const router = express.Router();
  router.use(requireAdmin);

  // 全局统计
  router.get('/stats', (req, res) => {
    const totalShares = db.prepare('SELECT COUNT(*) AS c FROM shares').get().c;
    const totalViews = db.prepare('SELECT COALESCE(SUM(views),0) AS v FROM shares').get().v;
    const totalKeys = db.prepare('SELECT COUNT(*) AS c FROM keys').get().c;
    const disk = dirSizeCached(path.join(config.DATA_DIR, 'sites'));
    res.json({
      total_shares: totalShares,
      total_views: totalViews,
      total_keys: totalKeys,
      disk_bytes: disk,
      disk_human: formatBytes(disk),
    });
  });

  // 密钥列表（含分享数；只返回前缀，不泄露完整密钥）
  router.get('/keys', (req, res) => {
    const rows = db.prepare(`
      SELECT k.id, substr(k.key, 1, 12) AS key_prefix, k.label, k.is_admin, k.disabled, k.created_at, k.last_used_at,
             (SELECT COUNT(*) FROM shares s WHERE s.owner_key_id = k.id) AS share_count
      FROM keys k ORDER BY k.id ASC
    `).all();
    res.json({ keys: rows });
  });

  // 生成新用户密钥
  router.post('/keys', (req, res) => {
    const label = String((req.body && req.body.label) || '').trim().slice(0, 50);
    const key = genUserKey();
    db.prepare('INSERT INTO keys (key, label, is_admin, disabled, created_at) VALUES (?, ?, 0, 0, ?)')
      .run(key, label, new Date().toISOString());
    res.json({ key, label });
  });

  // 启用 / 禁用
  router.post('/keys/:id/toggle', (req, res) => {
    const row = db.prepare('SELECT * FROM keys WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: '密钥不存在' });
    if (row.is_admin) return res.status(400).json({ error: '不能禁用管理员密钥' });
    const next = row.disabled ? 0 : 1;
    db.prepare('UPDATE keys SET disabled = ? WHERE id = ?').run(next, row.id);
    if (next) db.prepare('DELETE FROM sessions WHERE key_id = ?').run(row.id);
    res.json({ ok: true, disabled: !!next });
  });

  // 删除密钥（级联删除其分享、站点文件与 session）
  router.delete('/keys/:id', (req, res) => {
    const row = db.prepare('SELECT * FROM keys WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: '密钥不存在' });
    if (row.is_admin) return res.status(400).json({ error: '不能删除管理员密钥' });
    const shares = db.prepare('SELECT * FROM shares WHERE owner_key_id = ?').all(row.id);
    for (const s of shares) deleteShare(s);
    db.prepare('DELETE FROM sessions WHERE key_id = ?').run(row.id);
    db.prepare('DELETE FROM keys WHERE id = ?').run(row.id);
    res.json({ ok: true, deleted_shares: shares.length });
  });

  // 重置超级管理员密钥（需确认当前密钥；新密钥仅展示一次）
  router.post('/reset-admin-key', (req, res) => {
    const row = db.prepare('SELECT * FROM keys WHERE is_admin = 1 ORDER BY id LIMIT 1').get();
    if (!row) return res.status(500).json({ error: '未找到管理员密钥' });
    const currentKey = String((req.body && req.body.current_key) || '').trim();
    if (!currentKey || currentKey !== row.key) {
      return res.status(403).json({ error: '当前密钥不正确' });
    }
    const newKey = genAdminKey();
    db.prepare('UPDATE keys SET key = ? WHERE id = ?').run(newKey, row.id);
    // 旧 session 全部失效（保留当前登录态）
    db.prepare('DELETE FROM sessions WHERE key_id = ? AND token != ?').run(row.id, req.sessionToken || '');
    // 首启密钥文件已失效，删除
    try {
      fs.rmSync(path.join(config.DATA_DIR, 'INITIAL_ADMIN_KEY.txt'), { force: true });
    } catch { /* ignore */ }
    res.json({ key: newKey });
  });

  // 全局分享列表（支持按密钥筛选、按标题/ID 搜索）
  router.get('/shares', (req, res) => {
    const keyId = parseInt(req.query.key_id || '', 10);
    const q = String(req.query.q || '').trim();
    let sql = `
      SELECT s.id, s.type, s.title, s.views, s.created_at,
             k.id AS key_id, k.label AS owner_label, substr(k.key, 1, 12) AS owner_key_prefix
      FROM shares s JOIN keys k ON k.id = s.owner_key_id
    `;
    const where = [];
    const params = [];
    if (Number.isInteger(keyId)) {
      where.push('s.owner_key_id = ?');
      params.push(keyId);
    }
    if (q) {
      where.push('(s.title LIKE ? OR s.id LIKE ?)');
      params.push(`%${q}%`, `%${q}%`);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY s.created_at DESC LIMIT 500';
    res.json({ shares: db.prepare(sql).all(...params) });
  });

  // 批量删除
  router.post('/shares/batch-delete', (req, res) => {
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids.slice(0, 200) : [];
    if (!ids.length) return res.status(400).json({ error: '未选择任何分享' });
    const stmt = db.prepare('SELECT * FROM shares WHERE id = ?');
    let deleted = 0;
    for (const id of ids) {
      const share = stmt.get(id);
      if (share) {
        deleteShare(share);
        deleted += 1;
      }
    }
    res.json({ ok: true, deleted });
  });

  return router;
};
