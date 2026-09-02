'use strict';

(function () {
  var TYPE_LABEL = { html: 'HTML', markdown: 'Markdown', json: 'JSON', site: '站点' };

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

  // ---------- Tabs ----------
  $$('#tabs .tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      $$('#tabs .tab').forEach(function (t) {
        var active = t === tab;
        t.classList.toggle('active', active);
        t.setAttribute('aria-selected', active ? 'true' : 'false');
      });
      $$('.tab-panel').forEach(function (p) {
        p.classList.toggle('hidden', p.getAttribute('data-panel') !== tab.getAttribute('data-tab'));
      });
      hideResult();
    });
  });

  var resultBox = $('#result-box');
  var resultLink = $('#result-link');
  var resultLabel = $('#result-label');
  var createError = $('#create-error');
  var customSlug = $('#custom-slug');
  var passwordToggle = $('#password-toggle');
  var sharePassword = $('#share-password');

  sharePassword.disabled = true;
  passwordToggle.addEventListener('change', function () {
    var enabled = passwordToggle.checked;
    sharePassword.disabled = !enabled;
    sharePassword.classList.toggle('hidden', !enabled);
    if (enabled) sharePassword.focus();
    else sharePassword.value = '';
    createError.textContent = '';
  });

  customSlug.addEventListener('input', function () {
    customSlug.value = customSlug.value.toLowerCase();
  });

  function readShareOptions() {
    var slug = customSlug.value.trim().toLowerCase();
    var password = passwordToggle.checked ? sharePassword.value : '';
    if (slug && !/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/.test(slug)) {
      createError.textContent = '自定义后缀需为 3-64 位小写字母、数字或连字符，且首尾不能是连字符';
      customSlug.focus();
      return null;
    }
    if (passwordToggle.checked && (password.trim() === '' || password.length < 4 || password.length > 128)) {
      createError.textContent = '分享密码需为 4-128 个字符';
      sharePassword.focus();
      return null;
    }
    return { custom_slug: slug, password: password };
  }

  function resetShareOptions() {
    customSlug.value = '';
    passwordToggle.checked = false;
    sharePassword.value = '';
    sharePassword.disabled = true;
    sharePassword.classList.add('hidden');
  }

  function hideResult() { resultBox.classList.add('hidden'); createError.textContent = ''; }

  function showResult(url, passwordProtected) {
    var full = location.origin + url;
    resultLink.value = full;
    resultLabel.textContent = passwordProtected ? '受密码保护的分享链接已生成' : '分享链接已生成';
    resultBox.classList.remove('hidden');
    createError.textContent = '';
    resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  $('#copy-result').addEventListener('click', function () {
    copyText(resultLink.value, this);
  });

  // ---------- 创建文本分享 ----------
  $$('[data-action="create"]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var panel = btn.closest('.tab-panel');
      var type = btn.getAttribute('data-type');
      var title = $('[data-role="title"]', panel).value;
      var content = $('[data-role="content"]', panel).value;
      var options = readShareOptions();
      if (!options) return;
      btn.disabled = true;
      api('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type,
          title: title,
          content: content,
          custom_slug: options.custom_slug,
          password: options.password
        })
      }).then(function (d) {
        showResult(d.url, d.password_protected);
        $('[data-role="content"]', panel).value = '';
        resetShareOptions();
        loadShares();
      }).catch(function (e) {
        hideResult();
        createError.textContent = e.message;
      }).finally(function () { btn.disabled = false; });
    });
  });

  // ---------- ZIP 上传 ----------
  var zipInput = $('#zip-input');
  var fileName = $('#file-name');
  $('#pick-file').addEventListener('click', function () { zipInput.click(); });
  zipInput.addEventListener('change', function () {
    fileName.textContent = zipInput.files.length ? '已选择：' + zipInput.files[0].name : '';
  });

  $('[data-action="create-site"]').addEventListener('click', function () {
    var btn = this;
    if (!zipInput.files.length) {
      hideResult();
      createError.textContent = '请先选择一个 .zip 文件';
      return;
    }
    var panel = btn.closest('.tab-panel');
    var options = readShareOptions();
    if (!options) return;
    var fd = new FormData();
    fd.append('title', $('[data-role="title"]', panel).value);
    fd.append('custom_slug', options.custom_slug);
    fd.append('password', options.password);
    fd.append('file', zipInput.files[0]);
    btn.disabled = true; btn.textContent = '上传部署中...';
    fetch('/api/shares/site', { method: 'POST', body: fd })
      .then(function (r) {
        return r.json().then(function (d) {
          if (!r.ok) throw new Error(d.error || ('上传失败 (' + r.status + ')'));
          return d;
        });
      })
      .then(function (d) {
        showResult(d.url, d.password_protected);
        zipInput.value = ''; fileName.textContent = '';
        resetShareOptions();
        loadShares();
      })
      .catch(function (e) { hideResult(); createError.textContent = e.message; })
      .finally(function () { btn.disabled = false; btn.textContent = '上传并部署'; });
  });

  // ---------- 我的分享列表 ----------
  var tbody = $('#shares-table tbody');
  var emptyTip = $('#shares-empty');

  function loadShares() {
    return api('/api/shares').then(function (d) {
      var shares = d.shares;
      var views = 0;
      shares.forEach(function (s) { views += s.views; });
      $('#stat-count').textContent = shares.length;
      $('#stat-views').textContent = views;

      emptyTip.classList.toggle('hidden', shares.length > 0);
      tbody.innerHTML = shares.map(function (s) {
        var safeId = esc(s.id);
        var url = location.origin + '/s/' + s.id;
        return '<tr>'
          + '<td><span class="pill pill-' + s.type + '">' + (TYPE_LABEL[s.type] || s.type) + '</span>' + (s.password_protected ? '<span class="protection-tag">LOCK</span>' : '') + '</td>'
          + '<td>' + esc(s.title) + '</td>'
          + '<td><a href="/s/' + safeId + '" target="_blank" rel="noopener" class="mono">/s/' + safeId + '</a></td>'
          + '<td>' + s.views + '</td>'
          + '<td>' + fmtTime(s.created_at) + '</td>'
          + '<td><div class="ops">'
          + '<button class="btn btn-secondary btn-small" data-copy="' + esc(url) + '">复制链接</button>'
          + '<button class="btn btn-danger-outline btn-small" data-del="' + s.id + '">删除</button>'
          + '</div></td>'
          + '</tr>';
      }).join('');
    });
  }

  tbody.addEventListener('click', function (e) {
    var copyBtn = e.target.closest('[data-copy]');
    if (copyBtn) { copyText(copyBtn.getAttribute('data-copy'), copyBtn); return; }
    var delBtn = e.target.closest('[data-del]');
    if (delBtn) {
      if (!confirm('确定删除该分享吗？此操作不可恢复。')) return;
      api('/api/shares/' + encodeURIComponent(delBtn.getAttribute('data-del')), { method: 'DELETE' })
        .then(loadShares)
        .catch(function (err) { alert(err.message); });
    }
  });

  loadShares().catch(function (e) {
    if (/未登录/.test(e.message)) location.href = '/login';
  });
})();
