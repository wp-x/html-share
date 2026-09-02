'use strict';

(function () {
  var form = document.getElementById('share-password-form');
  var input = document.getElementById('share-password-input');
  var error = document.getElementById('share-password-error');
  var button = document.getElementById('share-password-button');

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    error.textContent = '';
    button.disabled = true;
    button.textContent = '验证中...';

    fetch(form.getAttribute('data-unlock-url'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input.value })
    }).then(function (response) {
      return response.json().then(function (data) {
        return { ok: response.ok, data: data };
      });
    }).then(function (result) {
      if (!result.ok) throw new Error(result.data.error || '密码验证失败');
      location.replace(result.data.url || location.pathname);
    }).catch(function (err) {
      error.textContent = err.message;
      input.select();
      button.disabled = false;
      button.textContent = '解锁查看';
    });
  });
})();
