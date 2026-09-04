'use strict';

(function () {
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hero = document.querySelector('[data-brand-hero]');

  // Hero 等高线背景随指针轻微漂移（reduced-motion 下完全关闭）
  if (hero && !reduceMotion) {
    var queued = false;
    var lastEvent = null;
    hero.addEventListener('pointermove', function (event) {
      lastEvent = event;
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        if (!lastEvent) return;
        var bounds = hero.getBoundingClientRect();
        var x = ((lastEvent.clientX - bounds.left) / Math.max(1, bounds.width)) - 0.5;
        var y = ((lastEvent.clientY - bounds.top) / Math.max(1, bounds.height)) - 0.5;
        hero.style.setProperty('--px', x.toFixed(3));
        hero.style.setProperty('--py', y.toFixed(3));
      });
    });
    hero.addEventListener('pointerleave', function () {
      lastEvent = null;
      hero.style.setProperty('--px', '0');
      hero.style.setProperty('--py', '0');
    });
  }

  // 滚动 reveal：仅在 JS 可用时通过 .reveal-ready 启用初始隐藏，避免无 JS 时内容不可见
  var revealTargets = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
  if (!revealTargets.length) return;
  if (reduceMotion || !('IntersectionObserver' in window)) {
    revealTargets.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }
  document.documentElement.classList.add('reveal-ready');
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
  revealTargets.forEach(function (el) { observer.observe(el); });
})();
