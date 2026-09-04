'use strict';

(function () {
  var TYPE_LABEL = { html: 'HTML', markdown: 'Markdown', text: 'Text', csv: 'CSV', json: 'JSON', site: '站点' };

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }

  function api(path, opts) {
    return fetch(path, opts).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.error || ('请求失败 (' + r.status + ')'));
        return d;
      });
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
      + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(function () {
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = '已复制';
      setTimeout(function () { btn.textContent = old; }, 1500);
    });
  }

  // ---------- 统计 ----------
  function loadStats() {
    return api('/api/admin/stats').then(function (d) {
      $('#st-shares').textContent = d.total_shares;
      $('#st-views').textContent = d.total_views;
      $('#st-keys').textContent = d.total_keys;
      $('#st-disk').textContent = d.disk_human;
    });
  }

  // ---------- 密钥管理 ----------
  var keysTbody = $('#keys-table tbody');
  var filterKey = $('#filter-key');

  function loadKeys() {
    return api('/api/admin/keys').then(function (d) {
      keysTbody.innerHTML = d.keys.map(function (k) {
        var role = k.is_admin ? '<span class="pill pill-admin">管理员</span>' : '<span class="pill pill-user">用户</span>';
        var status = k.disabled ? '<span class="pill pill-off">已禁用</span>' : '<span class="pill pill-ok">正常</span>';
        var ops = k.is_admin
          ? '<span class="muted">—</span>'
          : '<div class="ops">'
            + '<button class="btn btn-secondary btn-small" data-toggle="' + k.id + '">' + (k.disabled ? '启用' : '禁用') + '</button>'
            + '<button class="btn btn-danger-outline btn-small" data-del-key="' + k.id + '">删除</button>'
            + '</div>';
        return '<tr>'
          + '<td class="mono">' + esc(k.key_prefix) + '…</td>'
          + '<td>' + esc(k.label || '—') + '</td>'
          + '<td>' + role + '</td>'
          + '<td>' + status + '</td>'
          + '<td>' + fmtTime(k.created_at) + '</td>'
          + '<td>' + fmtTime(k.last_used_at) + '</td>'
          + '<td>' + k.share_count + '</td>'
          + '<td>' + ops + '</td>'
          + '</tr>';
      }).join('');

      // 更新筛选下拉（label 截断 20 字，防移动端溢出）
      var current = filterKey.value;
      filterKey.innerHTML = '<option value="">全部密钥</option>' + d.keys.map(function (k) {
        var name = k.label || (k.is_admin ? '管理员' : '密钥 #' + k.id);
        if (name.length > 20) name = name.slice(0, 20) + '…';
        return '<option value="' + k.id + '">' + esc(name)
          + '（' + esc(k.key_prefix) + '…）</option>';
      }).join('');
      filterKey.value = current;
    });
  }

  var keyResult = $('#key-result');
  var keyResultLabel = $('#key-result-label');
  var keyResultValue = $('#key-result-value');

  function showKeyResult(label, value) {
    keyResultLabel.textContent = label;
    keyResultValue.value = value;
    keyResult.classList.remove('hidden');
  }

  $('#copy-key-result').addEventListener('click', function () {
    copyText(keyResultValue.value, this);
  });

  $('#btn-create-key').addEventListener('click', function () {
    var label = $('#new-key-label').value;
    api('/api/admin/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label })
    }).then(function (d) {
      showKeyResult('新密钥（仅显示一次，请立即妥善保存）', d.key);
      $('#new-key-label').value = '';
      loadKeys(); loadStats();
    }).catch(function (e) { alert(e.message); });
  });

  $('#btn-reset-admin').addEventListener('click', function () {
    if (!confirm('确定重置超级管理员密钥吗？\n\n旧密钥将立即失效，新密钥仅显示一次。')) return;
    var current = prompt('请输入当前超级管理员密钥以确认身份：');
    if (current === null) return;
    api('/api/admin/reset-admin-key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_key: current.trim() })
    }).then(function (d) {
      showKeyResult('新的超级管理员密钥（仅显示一次，旧密钥已失效）', d.key);
      loadKeys();
    }).catch(function (e) { alert(e.message); });
  });

  keysTbody.addEventListener('click', function (e) {
    var toggle = e.target.closest('[data-toggle]');
    if (toggle) {
      api('/api/admin/keys/' + toggle.getAttribute('data-toggle') + '/toggle', { method: 'POST' })
        .then(loadKeys)
        .catch(function (err) { alert(err.message); });
      return;
    }
    var del = e.target.closest('[data-del-key]');
    if (del) {
      if (!confirm('确定删除该密钥吗？其名下的全部分享与站点文件将一并删除，不可恢复。')) return;
      api('/api/admin/keys/' + del.getAttribute('data-del-key'), { method: 'DELETE' })
        .then(function () { loadKeys(); loadShares(); loadStats(); })
        .catch(function (err) { alert(err.message); });
    }
  });

  // ---------- 全局分享管理 ----------
  var sharesTbody = $('#admin-shares-table tbody');
  var sharesEmpty = $('#admin-shares-empty');
  var filterQ = $('#filter-q');
  var batchBtn = $('#btn-batch-delete');
  var checkAll = $('#check-all');

  function loadShares() {
    var params = new URLSearchParams();
    if (filterKey.value) params.set('key_id', filterKey.value);
    if (filterQ.value.trim()) params.set('q', filterQ.value.trim());
    return api('/api/admin/shares?' + params.toString()).then(function (d) {
      var shares = d.shares;
      sharesEmpty.classList.toggle('hidden', shares.length > 0);
      checkAll.checked = false;
      updateBatchBtn();
      sharesTbody.innerHTML = shares.map(function (s) {
        return '<tr>'
          + '<td><input type="checkbox" class="row-check" value="' + s.id + '"></td>'
          + '<td class="mono">' + esc(s.id) + '</td>'
          + '<td><span class="pill pill-' + s.type + '">' + (TYPE_LABEL[s.type] || s.type) + '</span></td>'
          + '<td>' + esc(s.title) + '</td>'
          + '<td>' + esc(s.owner_label || '—') + ' <span class="muted mono">' + esc(s.owner_key_prefix) + '…</span></td>'
          + '<td>' + s.views + '</td>'
          + '<td>' + fmtTime(s.created_at) + '</td>'
          + '<td><div class="ops">'
          + '<a class="btn btn-secondary btn-small" href="/s/' + s.id + '" target="_blank" data-open="' + s.type + '">打开</a>'
          + '<button class="btn btn-danger-outline btn-small" data-del-share="' + s.id + '">删除</button>'
          + '</div></td>'
          + '</tr>';
      }).join('');
    });
  }

  function selectedIds() {
    return $$('.row-check:checked').map(function (c) { return c.value; });
  }

  function updateBatchBtn() {
    var n = selectedIds().length;
    batchBtn.classList.toggle('hidden', n === 0);
    batchBtn.textContent = '删除所选（' + n + '）';
  }

  sharesTbody.addEventListener('change', function (e) {
    if (e.target.classList.contains('row-check')) updateBatchBtn();
  });

  checkAll.addEventListener('change', function () {
    $$('.row-check').forEach(function (c) { c.checked = checkAll.checked; });
    updateBatchBtn();
  });

  batchBtn.addEventListener('click', function () {
    var ids = selectedIds();
    if (!ids.length) return;
    if (!confirm('确定批量删除 ' + ids.length + ' 个分享吗？不可恢复。')) return;
    api('/api/admin/shares/batch-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ids })
    }).then(function () { loadShares(); loadStats(); })
      .catch(function (e) { alert(e.message); });
  });

  sharesTbody.addEventListener('click', function (e) {
    var openLink = e.target.closest('[data-open]');
    if (openLink) {
      var t = openLink.getAttribute('data-open');
      if ((t === 'html' || t === 'site') &&
          !confirm('该分享包含用户原始 HTML，可能执行任意脚本，确定打开？')) {
        e.preventDefault();
        return;
      }
    }
    var del = e.target.closest('[data-del-share]');
    if (!del) return;
    if (!confirm('确定删除该分享吗？')) return;
    api('/api/shares/' + del.getAttribute('data-del-share'), { method: 'DELETE' })
      .then(function () { loadShares(); loadStats(); })
      .catch(function (err) { alert(err.message); });
  });

  $('#btn-refresh-shares').addEventListener('click', loadShares);
  filterKey.addEventListener('change', loadShares);
  var qTimer = null;
  filterQ.addEventListener('input', function () {
    clearTimeout(qTimer);
    qTimer = setTimeout(loadShares, 300);
  });

  // ---------- 初始化 ----------
  Promise.all([loadStats(), loadKeys(), loadShares()]).catch(function (e) {
    if (/未登录/.test(e.message)) location.href = '/login';
    else if (/管理员/.test(e.message)) location.href = '/dashboard';
  });
})();
