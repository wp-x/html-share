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

  initRollLabels();
  initNavTheme();

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

  /* ---------- Hero：clip 椭圆揭示 + 字符级入场 + 200vh sticky 视差 ---------- */
  function splitChars(line) {
    var frag = document.createDocumentFragment();
    Array.prototype.forEach.call(line.childNodes, function (node) {
      var text = node.textContent;
      var dot = node.nodeType === 1; // <i>.</i> 保持柠檬绿
      for (var i = 0; i < text.length; i++) {
        var s = document.createElement('span');
        s.className = dot ? 'ht-char ht-dot' : 'ht-char';
        s.textContent = text[i] === ' ' ? ' ' : text[i];
        if (dot) s.style.color = 'var(--lime-deep)';
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
    var visual = track.querySelector('[data-hero-visual]');
    var fades = track.querySelectorAll('[data-hero-fade]');

    var allChars = [];
    lines.forEach(function (line) { allChars.push(splitChars(line)); });

    // 初始状态（仅 JS 设置，无 JS 时页面完整可见）
    gsap.set(lines, { clipPath: 'ellipse(20% 0% at 50% 0%)' });
    allChars.forEach(function (chars) { gsap.set(chars, { yPercent: 120 }); });
    if (visual) gsap.set(visual, { clipPath: 'ellipse(20% 0% at 50% 0%)' });
    gsap.set(fades, { y: 28, opacity: 0 });

    var tl = gsap.timeline({ defaults: { ease: EASE_INOUT } });
    tl.to(lines, { clipPath: 'ellipse(100% 120% at 50% 0%)', duration: 1.5, stagger: 0.15 }, 0.15);
    allChars.forEach(function (chars, i) {
      tl.to(chars, {
        yPercent: 0,
        duration: 1.15,
        ease: 'power3.out',
        stagger: { each: 0.015, from: 'center' },
      }, 0.3 + i * 0.15);
    });
    if (visual) tl.to(visual, { clipPath: 'ellipse(100% 120% at 50% 0%)', duration: 1.5 }, 0.45);
    tl.to(fades, { y: 0, opacity: 1, duration: 0.9, ease: 'power2.out', stagger: 0.09 }, 0.9);

    // sticky 视差：文字渐隐上移，视觉图缓速放大
    var st = {
      trigger: track,
      start: 'top top',
      end: 'bottom bottom',
      scrub: true,
    };
    gsap.to(track.querySelector('[data-hero-copy]'), { y: -90, opacity: 0, ease: 'none', scrollTrigger: st });
    gsap.to(track.querySelector('.hero-status'), { opacity: 0, ease: 'none', scrollTrigger: st });
    if (visual) {
      gsap.fromTo(visual.querySelector('img'),
        { scale: 1, yPercent: 0 },
        { scale: 1.12, yPercent: 5, ease: 'none', scrollTrigger: st });
    }
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
    gsap.ticker.add(function () {
      var target = dir * (1 + boost);
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

  /* ---------- 双列对开 + 视差大图（FORMATS） ---------- */
  function initSplitColumns() {
    var left = document.querySelector('[data-split-left]');
    var right = document.querySelector('[data-split-right]');
    if (left) {
      gsap.fromTo(left, { x: '-20rem' }, {
        x: 0, ease: 'none',
        scrollTrigger: { trigger: left, start: 'top 95%', end: 'top 35%', scrub: true },
      });
      var img = left.querySelector('img');
      if (img) {
        gsap.fromTo(img, { y: '-20vh', scale: 1.1 }, {
          y: 0, scale: 1, ease: 'none',
          scrollTrigger: { trigger: left, start: 'top bottom', end: 'top 25%', scrub: true },
        });
      }
    }
    if (right) {
      gsap.fromTo(right, { x: '5rem' }, {
        x: 0, ease: 'none',
        scrollTrigger: { trigger: right, start: 'top 95%', end: 'top 35%', scrub: true },
      });
    }
  }

  /* ---------- SHOWCASE 横向滚动（仅 ≥992px）+ 图内反向视差 ---------- */
  function initHorizontal() {
    var section = document.querySelector('[data-hscroll]');
    if (!section || !window.matchMedia('(min-width: 992px)').matches) return;
    var track = section.querySelector('.hs-track');
    if (!track) return;
    var distance = function () { return Math.max(0, track.scrollWidth - window.innerWidth); };
    var tween = gsap.to(track, {
      x: function () { return -distance(); },
      ease: 'none',
      scrollTrigger: {
        trigger: section,
        start: 'top top',
        end: function () { return '+=' + distance(); },
        pin: true,
        scrub: true,
        invalidateOnRefresh: true,
        anticipatePin: 1,
      },
    });
    Array.prototype.forEach.call(track.querySelectorAll('.shot-card'), function (card) {
      var img = card.querySelector('.shot-body img');
      if (!img) return;
      gsap.fromTo(img, { x: '-4rem' }, {
        x: '4rem',
        ease: 'none',
        scrollTrigger: {
          trigger: card,
          containerAnimation: tween,
          start: 'left right',
          end: 'right left',
          scrub: true,
        },
      });
    });
  }

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

  /* ---------- 通用小元素 reveal ---------- */
  function initReveals() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-reveal]'), function (el) {
      gsap.fromTo(el, { y: 22, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.7, ease: 'power2.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      });
    });
  }

  initHero();
  initMarquee();
  initHighLines();
  initSplitColumns();
  initHorizontal();
  initStaggerColumns();
  initReveals();

  window.addEventListener('load', function () { ScrollTrigger.refresh(); });
})();
