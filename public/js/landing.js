'use strict';

/* Landing motion system — GSAP + ScrollTrigger + Lenis（全部本地 vendor）。
   降级原则：任何"初始隐藏"状态只由 JS 在运行时设置（或仅在 html.reveal-ready 下生效），
   无 JS / GSAP 缺失 / prefers-reduced-motion 时，页面内容完整可见。 */
(function () {
  var docEl = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 导航/按钮文字逐字符翻滚（CSS 驱动，无 GSAP 也可用） ---------- */
  function initRollLabels() {
    var labels = document.querySelectorAll('.roll-label');
    Array.prototype.forEach.call(labels, function (el) {
      var text = el.textContent;
      el.textContent = '';
      el.setAttribute('aria-label', text);
      el.classList.add('roll-chars');
      for (var i = 0; i < text.length; i++) {
        var ch = text[i] === ' ' ? ' ' : text[i];
        var rc = document.createElement('span');
        rc.className = 'rc';
        rc.style.setProperty('--i', i);
        rc.setAttribute('aria-hidden', 'true');
        var a = document.createElement('span');
        a.className = 'rc-a';
        a.textContent = ch;
        var b = document.createElement('span');
        b.className = 'rc-b';
        b.textContent = ch;
        rc.appendChild(a);
        rc.appendChild(b);
        el.appendChild(rc);
      }
    });
  }

  /* ---------- 导航明暗主题随 section 切换（无 GSAP 也可用） ---------- */
  function initNavTheme() {
    var nav = document.querySelector('.nav');
    var targets = document.querySelectorAll('[data-nav-theme-target]');
    if (!nav || !targets.length) return;
    var ticking = false;
    function update() {
      ticking = false;
      var probe = 90; // 导航条底缘附近的采样线
      var dark = false;
      Array.prototype.forEach.call(targets, function (el) {
        var r = el.getBoundingClientRect();
        if (r.top <= probe && r.bottom > probe) {
          dark = el.getAttribute('data-nav-theme-target') === 'dark';
        }
      });
      nav.classList.toggle('nav-dark', dark);
      nav.classList.toggle('nav-glass', window.scrollY > 24); // 滚动后切换为液态玻璃条
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  /* ---------- 等高线全景背景：参数化"山峰"同心环 + 呼吸 + 指针视差 ----------
     无 GSAP 也可用；reduced-motion 只渲一帧静态。 */
  function initContours() {
    var canvas = document.querySelector('[data-contours]');
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var W = 0;
    var H = 0;
    var peaks = [
      { fx: 0.14, fy: 0.22, rings: 9, spacing: 34, par: 0.014 },
      { fx: 0.5, fy: 0.08, rings: 7, spacing: 46, par: 0.022 },
      { fx: 0.85, fy: 0.28, rings: 10, spacing: 30, par: 0.032, hl: 4 },
      { fx: 0.3, fy: 0.74, rings: 6, spacing: 54, par: 0.045 },
      { fx: 0.68, fy: 0.84, rings: 8, spacing: 40, par: 0.06, hl: 2 },
    ];
    var mouse = { x: 0, y: 0 };
    var cam = { x: 0, y: 0 };
    var raf = null;
    var last = 0;
    var t = 0;
    var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var unit = Math.max(0.62, Math.min(1.25, Math.min(W, H) / 820));
      for (var p = 0; p < peaks.length; p++) {
        var pk = peaks[p];
        var cx = pk.fx * W + cam.x * pk.par * 900;
        var cy = pk.fy * H + cam.y * pk.par * 900;
        for (var r = 0; r < pk.rings; r++) {
          var base = (r + 1) * pk.spacing * unit;
          var phase = t * 0.25 + r * 0.3;
          var highlight = pk.hl === r;
          ctx.beginPath();
          for (var a = 0; a <= Math.PI * 2 + 0.001; a += Math.PI / 60) {
            var rad = base * (1 + 0.16 * Math.sin(3 * a + phase) + 0.09 * Math.sin(5 * a + phase) + 0.12 * Math.sin(2 * a - phase));
            var x = cx + Math.cos(a) * rad;
            var y = cy + Math.sin(a) * rad * 0.82;
            if (a === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.strokeStyle = highlight ? 'rgba(184, 217, 0, 0.55)' : 'rgba(12, 12, 10, 0.14)';
          ctx.lineWidth = highlight ? 1.6 : 1.1;
          ctx.stroke();
        }
      }
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      var dt = Math.min(50, now - last);
      last = now;
      t += dt / 1000;
      cam.x += (mouse.x - cam.x) * 0.03;
      cam.y += (mouse.y - cam.y) * 0.03;
      draw();
    }

    resize();
    if (reduceMotion) {
      draw();
      window.addEventListener('resize', function () { resize(); draw(); });
      return;
    }
    if (finePointer) {
      window.addEventListener('pointermove', function (e) {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = (e.clientY / window.innerHeight) * 2 - 1;
      }, { passive: true });
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = null;
      } else if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    });
    window.addEventListener('resize', resize);
    raf = requestAnimationFrame(function (now) { last = now; frame(now); });
  }

  /* ---------- 玻璃卡指针光斑（写 --mx/--my，CSS 侧 radial-gradient 呈现） ---------- */
  function initSpotlight() {
    if (reduceMotion) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-glass]'), function (el) {
      el.addEventListener('pointermove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 100).toFixed(2) + '%');
        el.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 100).toFixed(2) + '%');
      });
    });
  }

  /* ---------- SHOWCASE 原生横向滚动：拖拽、滚轮、键盘与分页控制 ----------
     滚动本体由 CSS overflow-x + scroll-snap 完成，无 JS 也完整可用。 */
  function initShowcaseScroll() {
    var section = document.querySelector('[data-hscroll]');
    if (!section) return;
    var viewport = section.querySelector('.hs-viewport');
    var fill = section.querySelector('.hs-progress-fill');
    var current = section.querySelector('[data-hs-current]');
    var prev = section.querySelector('[data-hs-prev]');
    var next = section.querySelector('[data-hs-next]');
    var cards = Array.prototype.slice.call(section.querySelectorAll('.shot-card'));
    if (!viewport || !cards.length) return;

    var activeIndex = 0;
    var ticking = false;

    function cardTarget(index) {
      var card = cards[index];
      var target = card.offsetLeft - ((viewport.clientWidth - card.offsetWidth) / 2);
      var max = viewport.scrollWidth - viewport.clientWidth;
      return Math.min(max, Math.max(0, target));
    }

    function setActive(index) {
      activeIndex = Math.min(cards.length - 1, Math.max(0, index));
      cards.forEach(function (card, i) {
        card.classList.toggle('is-current', i === activeIndex);
      });
      if (current) current.textContent = ('0' + (activeIndex + 1)).slice(-2);
      if (prev) prev.disabled = activeIndex === 0;
      if (next) next.disabled = activeIndex === cards.length - 1;
    }

    function updateUi() {
      ticking = false;
      var viewportCenter = viewport.scrollLeft + (viewport.clientWidth / 2);
      var nearestIndex = 0;
      var nearestDistance = Infinity;
      cards.forEach(function (card, i) {
        var cardCenter = card.offsetLeft + (card.offsetWidth / 2);
        var distance = Math.abs(cardCenter - viewportCenter);
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = i;
        }
      });
      setActive(nearestIndex);

      if (fill) {
        var max = viewport.scrollWidth - viewport.clientWidth;
        var ratio = max > 0 ? viewport.scrollLeft / max : 1;
        var minRatio = viewport.clientWidth / Math.max(viewport.scrollWidth, 1);
        var shown = Math.max(ratio, 0) * (1 - minRatio) + minRatio;
        fill.style.transform = 'scaleX(' + Math.min(1, Math.max(minRatio, shown)) + ')';
      }
    }

    function requestUiUpdate() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateUi);
    }

    function goTo(index) {
      index = Math.min(cards.length - 1, Math.max(0, index));
      viewport.scrollTo({
        left: cardTarget(index),
        behavior: reduceMotion ? 'auto' : 'smooth'
      });
      setActive(index);
    }

    viewport.addEventListener('scroll', requestUiUpdate, { passive: true });
    window.addEventListener('resize', requestUiUpdate);
    window.addEventListener('load', requestUiUpdate);

    if (prev) prev.addEventListener('click', function () { goTo(activeIndex - 1); });
    if (next) next.addEventListener('click', function () { goTo(activeIndex + 1); });

    viewport.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goTo(activeIndex - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goTo(activeIndex + 1);
      } else if (e.key === 'Home') {
        e.preventDefault();
        goTo(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        goTo(cards.length - 1);
      }
    });

    viewport.addEventListener('wheel', function (e) {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      var max = viewport.scrollWidth - viewport.clientWidth;
      var atStart = viewport.scrollLeft <= 1;
      var atEnd = viewport.scrollLeft >= max - 1;
      if ((atStart && e.deltaY < 0) || (atEnd && e.deltaY > 0)) return;
      e.preventDefault();
      viewport.scrollLeft += e.deltaY;
    }, { passive: false });

    // 鼠标拖拽横向浏览，触屏仍使用浏览器原生滑动。
    viewport.addEventListener('pointerdown', function (e) {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      var startX = e.clientX;
      var startScroll = viewport.scrollLeft;
      var moved = false;
      viewport.classList.add('hs-dragging');
      viewport.setPointerCapture(e.pointerId);
      function onMove(ev) {
        var dx = ev.clientX - startX;
        if (Math.abs(dx) > 4) moved = true;
        viewport.scrollLeft = startScroll - dx;
      }
      function onUp() {
        viewport.classList.remove('hs-dragging');
        viewport.removeEventListener('pointermove', onMove);
        viewport.removeEventListener('pointerup', onUp);
        viewport.removeEventListener('pointercancel', onUp);
        requestUiUpdate();
        if (moved) {
          viewport.addEventListener('click', function (ce) {
            ce.preventDefault();
            ce.stopPropagation();
          }, { capture: true, once: true });
        }
      }
      viewport.addEventListener('pointermove', onMove);
      viewport.addEventListener('pointerup', onUp);
      viewport.addEventListener('pointercancel', onUp);
    });

    updateUi();
  }

  initContours();
  initSpotlight();
  initRollLabels();
  initNavTheme();
  initShowcaseScroll();

  /* ---------- 降级出口：reduced-motion 保持静态；GSAP 缺失时退回 IO reveal ---------- */
  if (reduceMotion) return;
  if (!window.gsap || !window.ScrollTrigger) {
    var revealTargets = Array.prototype.slice.call(document.querySelectorAll('[data-reveal]'));
    if (!revealTargets.length || !('IntersectionObserver' in window)) return;
    docEl.classList.add('reveal-ready');
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.08 });
    revealTargets.forEach(function (el) { observer.observe(el); });
    return;
  }

  var gsap = window.gsap;
  var ScrollTrigger = window.ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);

  /* ---------- Lenis 平滑滚动（lerp 0.1），与 ScrollTrigger 同步 ---------- */
  var lenis = null;
  if (window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  /* 锚点跳转走 Lenis，保留平滑滚动感 */
  Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), function (link) {
    link.addEventListener('click', function (e) {
      var target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(target, { offset: -20 });
      else target.scrollIntoView();
    });
  });

  var EASE_INOUT = 'power2.inOut'; // ≈ cubic-bezier(.455,.03,.515,.955)

  /* ---------- Hero：字符级入场 + 200vh sticky 视差 ---------- */
  function splitChars(line) {
    var frag = document.createDocumentFragment();
    Array.prototype.forEach.call(line.childNodes, function (node) {
      var text = node.textContent;
      var accent = node.nodeType === 1; // <i>/</i> 保持柠檬绿
      for (var i = 0; i < text.length; i++) {
        var s = document.createElement('span');
        s.className = accent ? 'ht-char ht-accent' : 'ht-char';
        s.textContent = text[i] === ' ' ? ' ' : text[i];
        if (accent) s.style.color = 'var(--lime-deep)';
        frag.appendChild(s);
      }
    });
    line.textContent = '';
    line.appendChild(frag);
    return line.querySelectorAll('.ht-char');
  }

  function initHero() {
    var track = document.querySelector('[data-hero]');
    if (!track) return;
    var lines = Array.prototype.slice.call(track.querySelectorAll('.ht-line'));
    var fades = track.querySelectorAll('[data-hero-fade]');

    var allChars = [];
    lines.forEach(function (line) { allChars.push(splitChars(line)); });

    // 初始状态（仅 JS 设置，无 JS 时页面完整可见）
    gsap.set(lines, { clipPath: 'ellipse(20% 0% at 50% 0%)' });
    allChars.forEach(function (chars) { gsap.set(chars, { yPercent: 120 }); });
    gsap.set(fades, { y: 28, opacity: 0 });

    var tl = gsap.timeline({ defaults: { ease: EASE_INOUT } });
    tl.to(lines, { clipPath: 'ellipse(130% 140% at 50% 0%)', duration: 1.5 }, 0.15);
    allChars.forEach(function (chars, i) {
      tl.to(chars, {
        yPercent: 0,
        duration: 1.15,
        ease: 'power3.out',
        stagger: { each: 0.02, from: 'center' },
      }, 0.3 + i * 0.15);
    });
    tl.to(fades, { y: 0, opacity: 1, duration: 0.9, ease: 'power2.out', stagger: 0.09 }, 0.9);

    // sticky 视差：标题区与统计带渐隐上移
    var st = {
      trigger: track,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
    };
    gsap.to(track.querySelector('[data-hero-copy]'), { y: -90, opacity: 0, ease: 'none', scrollTrigger: st });
    var stats = track.querySelector('.hero-stats');
    if (stats) gsap.to(stats, { y: -40, opacity: 0, ease: 'none', scrollTrigger: st });
  }

  /* ---------- 跑马灯：无限循环 + 滚动方向反转 + 速度视差 ---------- */
  function initMarquee() {
    var band = document.querySelector('[data-marquee]');
    if (!band) return;
    var track = band.querySelector('.marquee-track');
    var tween = gsap.to(track, { xPercent: -25, ease: 'none', duration: 22, repeat: -1 });

    var dir = 1;
    var boost = 0;
    var lastY = window.scrollY;
    function onScrollDelta(deltaY, velocity) {
      if (deltaY > 0) dir = 1;
      else if (deltaY < 0) dir = -1;
      boost = Math.min(2, Math.abs(velocity || deltaY) / 300);
    }
    if (lenis) {
      lenis.on('scroll', function (e) { onScrollDelta(e.velocity, e.velocity * 18); });
    } else {
      window.addEventListener('scroll', function () {
        var y = window.scrollY;
        onScrollDelta(y - lastY, y - lastY);
        lastY = y;
      }, { passive: true });
    }
    var current = 1;
    var paused = 1; // 1 = 正常速度，0 = hover 暂停（平滑过渡）
    var pauseTarget = 1;
    if (window.matchMedia('(hover: hover)').matches) {
      band.addEventListener('pointerenter', function () { pauseTarget = 0; });
      band.addEventListener('pointerleave', function () { pauseTarget = 1; });
    }
    gsap.ticker.add(function () {
      paused += (pauseTarget - paused) * 0.12;
      var target = dir * (1 + boost) * paused;
      current += (target - current) * 0.08;
      boost *= 0.92;
      tween.timeScale(current);
    });
  }

  /* ---------- high-lines：绿块扫过 + 文字划线揭示 ---------- */
  function initHighLines() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-highlines]'), function (container) {
      var lines = Array.prototype.slice.call(container.querySelectorAll('.ml-line'));
      if (!lines.length) return;
      var masks = [];
      var blocks = [];
      lines.forEach(function (line) {
        var mask = document.createElement('span');
        mask.className = 'ml-mask';
        while (line.firstChild) mask.appendChild(line.firstChild);
        line.appendChild(mask);
        var block = document.createElement('span');
        block.className = 'ml-block';
        block.setAttribute('aria-hidden', 'true');
        line.appendChild(block);
        masks.push(mask);
        blocks.push(block);
      });
      gsap.set(masks, { clipPath: 'inset(0 100% 0 0)' });
      gsap.set(blocks, { scaleX: 1 });
      var tl = gsap.timeline({
        scrollTrigger: { trigger: container, start: 'top 80%', once: true },
      });
      tl.to(masks, { clipPath: 'inset(0 0% 0 0)', duration: 0.6, ease: 'power2.out', stagger: 0.15 }, 0)
        .to(blocks, { scaleX: 0, duration: 0.6, ease: EASE_INOUT, stagger: 0.15 }, 0.3);
    });
  }

  /* ---------- 磁性按钮：指针吸附 ≤6px + 内部文字反向补偿 + 弹性回位 ---------- */
  function initMagnetic() {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    Array.prototype.forEach.call(document.querySelectorAll('[data-magnetic]'), function (btn) {
      var xTo = gsap.quickTo(btn, 'x', { duration: 0.3, ease: 'power2.out' });
      var yTo = gsap.quickTo(btn, 'y', { duration: 0.3, ease: 'power2.out' });
      var inner = Array.prototype.slice.call(btn.children);
      var innerTo = inner.map(function (el) {
        return {
          x: gsap.quickTo(el, 'x', { duration: 0.3, ease: 'power2.out' }),
          y: gsap.quickTo(el, 'y', { duration: 0.3, ease: 'power2.out' }),
        };
      });
      btn.addEventListener('pointermove', function (e) {
        var r = btn.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        var mx = Math.max(-6, Math.min(6, dx * 6));
        var my = Math.max(-6, Math.min(6, dy * 6));
        xTo(mx);
        yTo(my);
        innerTo.forEach(function (q) { q.x(-mx * 0.5); q.y(-my * 0.5); });
      });
      btn.addEventListener('pointerleave', function () {
        gsap.to(btn, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.5)' });
        inner.forEach(function (el) { gsap.to(el, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.5)' }); });
      });
    });
  }

  /* ---------- 统计带数字滚动计数（0 → 目标，1.2s power2.out） ---------- */
  function initStats() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-count]'), function (el) {
      var raw = el.getAttribute('data-count');
      var m = /^(\d+)(.*)$/.exec(raw);
      if (!m) return;
      var target = parseInt(m[1], 10);
      var suffix = m[2];
      var pad = m[1].length;
      var state = { v: 0 };
      function render() {
        var n = String(Math.round(state.v));
        while (n.length < pad) n = '0' + n;
        el.textContent = n + suffix;
      }
      render();
      gsap.to(state, {
        v: target,
        duration: 1.2,
        ease: 'power2.out',
        onUpdate: render,
        scrollTrigger: { trigger: el, start: 'top 95%', once: true },
      });
    });
  }

  /* ---------- 通用小元素 reveal（同父元素间错峰 (i%6)*70ms） ---------- */
  function initReveals() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-reveal]'), function (el) {
      var siblings = el.parentNode ? el.parentNode.children : [el];
      var idx = 0;
      var seen = 0;
      for (var i = 0; i < siblings.length; i++) {
        if (siblings[i].hasAttribute && siblings[i].hasAttribute('data-reveal')) {
          if (siblings[i] === el) { idx = seen; break; }
          seen++;
        }
      }
      gsap.fromTo(el, { y: 22, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.7, ease: 'power2.out', delay: (idx % 6) * 0.07,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });
  }

  initHero();
  initMarquee();
  initHighLines();
  initStaggerColumns();
  initMagnetic();
  initStats();
  initReveals();

  /* ---------- 网格错位视差（CONTROL 卡片，列序 × 5rem scrub 归位） ---------- */
  function initStaggerColumns() {
    var cards = document.querySelectorAll('[data-stagger-col]');
    Array.prototype.forEach.call(cards, function (card, i) {
      if (i === 0) return;
      gsap.fromTo(card, { y: i * 80 }, {
        y: 0, ease: 'none',
        scrollTrigger: { trigger: card, start: 'top 100%', end: 'top 45%', scrub: true },
      });
    });
  }

  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
