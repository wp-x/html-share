'use strict';

(function () {
  var canvas = document.getElementById('share-visual');
  var hero = document.querySelector('[data-brand-hero]');
  if (!canvas || !hero) return;

  var context = canvas.getContext('2d');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  var width = 0;
  var height = 0;
  var pointerX = 0;
  var pointerY = 0;
  var scrollQueued = false;
  var animationFrame = 0;
  var heroVisible = true;

  function resize() {
    var bounds = hero.getBoundingClientRect();
    width = Math.max(320, Math.round(bounds.width));
    height = Math.max(560, Math.round(bounds.height));
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    if (reduceMotion) draw(performance.now());
    else queueDraw();
  }

  function queueDraw() {
    if (!animationFrame && heroVisible) animationFrame = requestAnimationFrame(draw);
  }

  function draw(time) {
    animationFrame = 0;
    context.clearRect(0, 0, width, height);
    drawGrid();
    if (width >= 700) drawPipeline(time);
    if (!reduceMotion) queueDraw();
  }

  function drawGrid() {
    context.strokeStyle = 'rgba(210, 255, 0, 0.075)';
    context.lineWidth = 1;
    var gap = width < 700 ? 44 : 64;
    for (var x = -gap + (pointerX * 6); x < width + gap; x += gap) {
      context.beginPath();
      context.moveTo(Math.round(x) + 0.5, 0);
      context.lineTo(Math.round(x) + 0.5, height);
      context.stroke();
    }
    for (var y = -gap + (pointerY * 6); y < height + gap; y += gap) {
      context.beginPath();
      context.moveTo(0, Math.round(y) + 0.5);
      context.lineTo(width, Math.round(y) + 0.5);
      context.stroke();
    }
  }

  function drawPipeline(time) {
    var compact = width < 760;
    var left = compact ? 28 : width * 0.12;
    var right = compact ? width - 150 : width * 0.76;
    var centerY = compact ? height * 0.45 : height * 0.49;
    var sourceWidth = compact ? 112 : 150;
    var sourceHeight = compact ? 34 : 40;
    var outputWidth = compact ? 122 : 184;
    var labels = ['HTML', 'MARKDOWN', 'JSON', 'ZIP SITE'];
    var spacing = compact ? 46 : 54;
    var startY = centerY - (spacing * 1.5);
    var hubX = compact ? width * 0.53 : width * 0.53;

    context.font = (compact ? '700 10px' : '700 11px') + ' Arial, sans-serif';
    context.textBaseline = 'middle';

    labels.forEach(function (label, index) {
      var y = startY + (index * spacing);
      drawBox(left, y - (sourceHeight / 2), sourceWidth, sourceHeight, label, false);
      drawRoute(left + sourceWidth, y, hubX, centerY);
      drawParticle(left + sourceWidth, y, hubX, centerY, time, index);
    });

    drawBox(hubX - 38, centerY - 23, 76, 46, 'BUILD', true);
    drawRoute(hubX + 38, centerY, right, centerY);
    drawParticle(hubX + 38, centerY, right, centerY, time, 4);
    drawBox(right, centerY - 33, outputWidth, 66, 'LIVE LINK', true);

    context.fillStyle = 'rgba(244, 244, 237, 0.62)';
    context.font = (compact ? '600 9px' : '600 10px') + ' ui-monospace, monospace';
    context.fillText('/s/launch-page', right + 12, centerY + 16);
  }

  function drawBox(x, y, boxWidth, boxHeight, label, active) {
    context.fillStyle = active ? 'rgba(210, 255, 0, 0.13)' : 'rgba(40, 44, 32, 0.74)';
    context.fillRect(x, y, boxWidth, boxHeight);
    context.strokeStyle = active ? '#d2ff00' : 'rgba(244, 244, 237, 0.42)';
    context.lineWidth = active ? 1.5 : 1;
    context.strokeRect(x + 0.5, y + 0.5, boxWidth - 1, boxHeight - 1);
    context.fillStyle = active ? '#d2ff00' : 'rgba(244, 244, 237, 0.82)';
    context.fillText(label, x + 12, y + (boxHeight / 2));
  }

  function drawRoute(x1, y1, x2, y2) {
    var middle = x1 + ((x2 - x1) * 0.55);
    context.strokeStyle = 'rgba(210, 255, 0, 0.28)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(x1, y1);
    context.lineTo(middle, y1);
    context.lineTo(middle, y2);
    context.lineTo(x2, y2);
    context.stroke();
  }

  function drawParticle(x1, y1, x2, y2, time, index) {
    var phase = reduceMotion ? 0.72 : ((time * 0.00018) + (index * 0.19)) % 1;
    var x = x1 + ((x2 - x1) * phase);
    var y = y1 + ((y2 - y1) * phase);
    context.fillStyle = '#d2ff00';
    context.fillRect(Math.round(x) - 2, Math.round(y) - 2, 4, 4);
  }

  function updateScrollState() {
    scrollQueued = false;
    var rect = hero.getBoundingClientRect();
    var progress = Math.max(0, Math.min(1, -rect.top / Math.max(1, rect.height * 0.72)));
    hero.style.setProperty('--hero-shift-y', (-34 * progress).toFixed(2) + 'px');
    hero.style.setProperty('--hero-opacity', (1 - (progress * 0.42)).toFixed(3));

    var light = false;
    document.querySelectorAll('[data-nav-theme]').forEach(function (section) {
      var sectionRect = section.getBoundingClientRect();
      if (sectionRect.top <= 78 && sectionRect.bottom > 78) {
        light = section.getAttribute('data-nav-theme') === 'light';
      }
    });
    document.body.classList.toggle('nav-on-light', light);
  }

  hero.addEventListener('pointermove', function (event) {
    if (reduceMotion) return;
    var bounds = hero.getBoundingClientRect();
    pointerX = ((event.clientX - bounds.left) / bounds.width) - 0.5;
    pointerY = ((event.clientY - bounds.top) / bounds.height) - 0.5;
    hero.style.setProperty('--pointer-shift-neg', (-8 * pointerX).toFixed(2) + 'px');
    hero.style.setProperty('--pointer-shift-pos', (10 * pointerX).toFixed(2) + 'px');
    hero.style.setProperty('--pointer-shift-y', (6 * pointerY).toFixed(2) + 'px');
  });

  if ('IntersectionObserver' in window && !reduceMotion) {
    new IntersectionObserver(function (entries) {
      heroVisible = entries[0].isIntersecting;
      if (heroVisible) queueDraw();
    }, { rootMargin: '120px' }).observe(hero);
  }

  window.addEventListener('scroll', function () {
    if (scrollQueued) return;
    scrollQueued = true;
    requestAnimationFrame(updateScrollState);
  }, { passive: true });
  window.addEventListener('resize', resize);

  resize();
  updateScrollState();
})();
