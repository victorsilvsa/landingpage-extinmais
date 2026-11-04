/* ==========================================================================
   EXTINMAIS — HIGH-PERFORMANCE CINEMATIC ENGINE
   Modular, Fluid, 60-120 FPS Architecture (Zero Reflow & GPU-Optimized)
   ========================================================================== */
(function () {
  'use strict';

  // 1. Force instant top reset on reload
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  window.scrollTo(0, 0);

  // 2. Register GSAP & ScrollTrigger
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({
    ignoreMobileResize: true,
    autoRefreshEvents: "visibilitychange,DOMContentLoaded,load"
  });

  /* ==========================================================================
     MODULE 1: HARDWARE PROFILER & ADAPTIVE INTELLIGENCE
     ========================================================================== */
  const Hardware = (() => {
    let mem = 4, cores = 4;
    try {
      mem = navigator.deviceMemory || 4;
      cores = navigator.hardwareConcurrency || 4;
    } catch (e) {}

    const conn = navigator.connection;
    const isDataSaver = !!(conn && (conn.saveData || /2g|3g/.test(conn.effectiveType)));
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobile = window.innerWidth <= 940;

    let isLowTierGPU = false;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        if (debug) {
          const renderer = gl.getParameter(debug.UNMASKED_RENDERER_WEBGL).toLowerCase();
          if (/mali-4|mali-t|adreno\s*(3|505|506|508|509)|powervr|swiftshader|intel\s*hd\s*(2000|3000)/i.test(renderer)) {
            isLowTierGPU = true;
          }
        }
      }
    } catch (e) {}

    const isUltraLowEnd = mem <= 2 || cores <= 2 || isDataSaver || isLowTierGPU;
    const isLowEnd = isUltraLowEnd || (mem <= 3 && cores <= 4);

    if (isUltraLowEnd) document.documentElement.classList.add('ultra-low-end');
    if (isLowEnd) document.documentElement.classList.add('low-perf');

    return {
      isTouch,
      isMobile,
      isLowEnd,
      isUltraLowEnd,
      // Cap DPR to 1.0 for mobile and low-perf, max 1.25 on high-end desktop (saves 75% GPU fillrate)
      dpr: isMobile || isLowEnd ? 1.0 : Math.min(window.devicePixelRatio || 1, 1.25),
      frameStride: isMobile ? 3 : (isLowEnd ? 2 : 1)
    };
  })();

  // Smoother lag smoothing to eliminate ticker hitches
  gsap.ticker.lagSmoothing(400, 33);

  /* ==========================================================================
     MODULE 2: CANVAS BACKGROUND ENGINE (Zero-Jank Stream & Smart Sampling)
     ========================================================================== */
  const CanvasEngine = (() => {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return { init: () => {}, updateTarget: () => {}, resize: () => {} };

    const ctx = canvas.getContext('2d', { alpha: false });
    const totalFrames = 240;
    const frameStride = Hardware.frameStride;
    const images = new Array(totalFrames);

    const frameState = { current: 0 };
    let targetFrame = 0;
    let lastRenderedFrame = -1;
    let rafId = null;
    let isLoopActive = false;

    // Cache of loaded indices for O(1) nearest-frame lookup
    const loadedIndices = [];

    function getFrameUrl(i) {
      const n = String(i + 1).padStart(3, '0');
      return `frame/ezgif-frame-${n}.jpg`;
    }

    function resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.round(w * Hardware.dpr);
      canvas.height = Math.round(h * Hardware.dpr);
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'medium'; // Fast bilinear (no expensive bicubic shader passes)
      }
      render(Math.round(frameState.current));
    }

    function render(index) {
      if (!ctx || !canvas.width) return;

      let img = images[index];
      // Fast fallback to nearest loaded frame
      if (!img || !img.complete || !img.naturalWidth) {
        if (loadedIndices.length === 0) return;
        let best = loadedIndices[0];
        let minDiff = Math.abs(best - index);
        for (let i = 1; i < loadedIndices.length; i++) {
          const diff = Math.abs(loadedIndices[i] - index);
          if (diff < minDiff) {
            minDiff = diff;
            best = loadedIndices[i];
          }
        }
        img = images[best];
        if (!img || !img.complete || !img.naturalWidth) return;
      }

      const cw = canvas.width;
      const ch = canvas.height;
      const canvasRatio = cw / ch;
      const imgRatio = img.naturalWidth / img.naturalHeight;

      let drawW, drawH, offsetX, offsetY;
      if (imgRatio > canvasRatio) {
        drawH = ch;
        drawW = drawH * imgRatio;
        offsetX = (cw - drawW) * 0.5;
        offsetY = 0;
      } else {
        drawW = cw;
        drawH = drawW / imgRatio;
        offsetX = 0;
        offsetY = (ch - drawH) * 0.5;
      }

      ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
    }

    function step() {
      const delta = targetFrame - frameState.current;
      if (Math.abs(delta) > 0.05) {
        frameState.current += delta * 0.35; // Snappy lerp, no trailing lag
        const rounded = Math.round(frameState.current);
        if (rounded !== lastRenderedFrame) {
          render(rounded);
          lastRenderedFrame = rounded;
        }
        rafId = requestAnimationFrame(step);
      } else {
        frameState.current = targetFrame;
        const rounded = Math.round(frameState.current);
        if (rounded !== lastRenderedFrame) {
          render(rounded);
          lastRenderedFrame = rounded;
        }
        isLoopActive = false;
        rafId = null;
      }
    }

    function requestTick() {
      if (!isLoopActive) {
        isLoopActive = true;
        rafId = requestAnimationFrame(step);
      }
    }

    function updateTarget(scrollY, maxScroll) {
      if (maxScroll <= 0) return;
      const progress = Math.max(0, Math.min(1, scrollY / maxScroll));
      const newTarget = progress * (totalFrames - 1);
      if (Math.abs(newTarget - targetFrame) > 0.1) {
        targetFrame = newTarget;
        requestTick();
      }
    }

    // Load initial critical frames
    function init(onFirstLoaded) {
      resize();

      // Key initial frames
      const initialIndices = [0, 5, 15, 30, 60, 90, 120, 180, 239];
      let loadedCount = 0;

      initialIndices.forEach(idx => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          images[idx] = img;
          loadedIndices.push(idx);
          loadedIndices.sort((a, b) => a - b);
          if (idx === 0) {
            render(0);
            if (onFirstLoaded) onFirstLoaded();
          }
        };
        img.src = getFrameUrl(idx);
      });
    }

    // Stream remaining frames quietly during idle time
    function streamRemaining() {
      const queue = [];
      for (let i = 0; i < totalFrames; i += frameStride) {
        if (!images[i]) queue.push(i);
      }

      let cursor = 0;
      const batchSize = Hardware.isMobile ? 4 : 8;

      function loadBatch() {
        if (cursor >= queue.length) return;
        const batch = queue.slice(cursor, cursor + batchSize);
        cursor += batchSize;

        batch.forEach(idx => {
          const img = new Image();
          img.decoding = 'async';
          img.onload = () => {
            images[idx] = img;
            loadedIndices.push(idx);
            loadedIndices.sort((a, b) => a - b);
          };
          img.src = getFrameUrl(idx);
        });

        if (cursor < queue.length) {
          if ('requestIdleCallback' in window) {
            requestIdleCallback(loadBatch, { timeout: 120 });
          } else {
            setTimeout(loadBatch, 60);
          }
        }
      }

      if ('requestIdleCallback' in window) {
        requestIdleCallback(loadBatch, { timeout: 200 });
      } else {
        setTimeout(loadBatch, 150);
      }
    }

    return { init, updateTarget, resize, streamRemaining };
  })();

  /* ==========================================================================
     MODULE 3: ARCHITECTURAL PRELOADER & COUNTER
     ========================================================================== */
  const Preloader = (() => {
    const el = document.getElementById('preloader');
    const percentEl = document.getElementById('loadingPercent');
    const mainEl = document.getElementById('loadingMain');
    const logoBrand = document.querySelector('.loading-logo-brand');
    let released = false;

    function initAnimation() {
      const svg = document.querySelector('.loading-blueprint-svg');
      const paths = svg ? Array.from(svg.querySelectorAll('line, path')) : [];

      paths.forEach(p => {
        let len = 0;
        try {
          if (typeof p.getTotalLength === 'function') len = Math.ceil(p.getTotalLength());
        } catch (e) {}
        if (!len || isNaN(len)) {
          if (p.tagName.toLowerCase() === 'line') {
            const x1 = parseFloat(p.getAttribute('x1')) || 0;
            const y1 = parseFloat(p.getAttribute('y1')) || 0;
            const x2 = parseFloat(p.getAttribute('x2')) || 0;
            const y2 = parseFloat(p.getAttribute('y2')) || 0;
            len = Math.ceil(Math.hypot(x2 - x1, y2 - y1));
          } else {
            len = 500;
          }
        }
        p.style.strokeDasharray = len;
        p.style.strokeDashoffset = len;
        p.setAttribute('vector-effect', 'non-scaling-stroke');
      });

      if (paths.length > 0) {
        gsap.to(paths, {
          strokeDashoffset: 0,
          duration: 1.2,
          stagger: { amount: 0.6, from: 'start' },
          ease: 'power2.out',
          delay: 0.05
        });
      }

      if (logoBrand) {
        gsap.fromTo(logoBrand,
          { opacity: 0, scale: 0.92 },
          { opacity: 1, scale: 1, duration: 0.7, ease: 'power2.out', delay: 0.3 }
        );
      }
    }

    function run(onCompleteCallback) {
      initAnimation();

      const state = { val: 0 };
      const duration = 1.8;

      const tween = gsap.to(state, {
        val: 100,
        duration: duration,
        ease: 'power1.inOut',
        onUpdate: () => {
          if (percentEl) percentEl.textContent = Math.round(state.val);
        },
        onComplete: () => dismiss(onCompleteCallback)
      });

      // Safety fallback (maximum 2.2s)
      setTimeout(() => {
        if (!released) {
          tween.progress(1);
          dismiss(onCompleteCallback);
        }
      }, 2200);
    }

    function dismiss(callback) {
      if (released) return;
      released = true;

      if (percentEl) percentEl.textContent = '100';

      // Split aperture curtain animation
      gsap.to(['.loading-content', '.loading-logo-wrap'], {
        opacity: 0,
        duration: 0.25,
        ease: 'power2.out'
      });

      const aperture = { top: 50, bot: 50 };
      gsap.to(aperture, {
        top: 0,
        bot: 100,
        duration: 0.65,
        ease: 'cubic-bezier(0.77, 0, 0.175, 1)',
        onUpdate: () => {
          if (mainEl) {
            const t = aperture.top.toFixed(2);
            const b = aperture.bot.toFixed(2);
            mainEl.style.clipPath = `polygon(0% 0%, 100% 0%, 100% ${t}%, 0% ${t}%, 0% ${b}%, 100% ${b}%, 100% 100%, 0% 100%)`;
          }
        },
        onComplete: () => {
          if (el) {
            el.classList.add('loaded');
            el.style.display = 'none';
            if (el.parentNode) el.parentNode.removeChild(el);
          }
          document.body.style.overflow = '';
          window.scrollTo(0, 0);
          if (callback) callback();
        }
      });
    }

    return { run };
  })();

  /* ==========================================================================
     MODULE 4: SCROLL & SECTION TRANSITIONS
     ========================================================================== */
  const ScrollOrchestrator = (() => {
    if (typeof ScrollTrigger !== 'undefined') {
      ScrollTrigger.config({ ignoreMobileResize: true });
    }
    let docH = 0;
    let winH = window.innerHeight;
    let maxScroll = 1;

    function updateMetrics() {
      winH = window.innerHeight;
      docH = Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0
      );
      maxScroll = Math.max(1, docH - winH);
    }

        // 4.1 Hero Curtain / Parallax Transition
    function initHeroTransition() {
      const hero = document.getElementById('hero');
      const curtain = document.getElementById('heroCurtain');
      const transitionText = document.getElementById('heroTransitionText');
      if (!hero) return;

      // Mobile: Native fluid parallax scroll (Zero jank, 100% fluid)
      if (Hardware.isMobile) {
        if (curtain) curtain.style.display = 'none';
        if (transitionText) transitionText.style.display = 'none';

        gsap.to('.hero-big-wrap', {
          opacity: 0,
          y: -40,
          ease: 'none',
          scrollTrigger: {
            trigger: hero,
            start: 'top top',
            end: 'bottom 40%',
            scrub: true
          }
        });
        return;
      }

      // Desktop: Clean, perfectly synchronized cinematic curtain transition
      if (!curtain || !transitionText) return;

      const steps = gsap.utils.toArray('.curtain-step');
      const title = transitionText.querySelector('.letter-reveal-target');
      const sub = transitionText.querySelector('.hero-transition-sub');

      gsap.set(steps, { scaleY: 0, transformOrigin: 'top center' });
      gsap.set(transitionText, { opacity: 0, visibility: 'hidden' });
      if (title) gsap.set(title, { opacity: 0, y: 20 });
      if (sub) gsap.set(sub, { opacity: 0, y: 15 });

      const tl = gsap.timeline();

      // Phase 1: Hero content fades and lifts
      tl.to('.hero-big-wrap, .scroll-indicator', {
        opacity: 0,
        y: -30,
        duration: 0.3,
        ease: 'power1.out'
      }, 0)
      // Phase 2: Curtain steps cascade down smoothly
      .to(steps, {
        scaleY: 1,
        stagger: 0.02,
        ease: 'power2.inOut',
        duration: 0.5,
        transformOrigin: 'top center'
      }, 0.1)
      .to('.hero-video-wrap', { opacity: 0.1, duration: 0.3 }, 0.4)
      // Phase 3: Transition text reveals with authority
      .set(transitionText, { visibility: 'visible' }, 0.45)
      .to(transitionText, { opacity: 1, duration: 0.25 }, 0.45)
      .to(title, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' }, 0.5)
      .to(sub, { opacity: 1, y: 0, duration: 0.25, ease: 'power2.out' }, 0.55)
      // Pause to read the message
      .to({}, { duration: 0.35 })
      // Phase 4: Clean dissolve and curtain exit
      .to(transitionText, { opacity: 0, y: -16, duration: 0.25, ease: 'power2.in' })
      .to(steps, {
        scaleY: 0,
        transformOrigin: 'bottom center',
        stagger: 0.02,
        ease: 'power2.inOut',
        duration: 0.5
      });

      ScrollTrigger.create({
        trigger: hero,
        start: 'top top',
        end: '+=100%',
        pin: true,
        pinSpacing: true,
        scrub: 0.5,
        invalidateOnRefresh: true,
        anticipatePin: 1,
        animation: tl,
        onLeave: () => {
          gsap.set([curtain, transitionText], { visibility: 'hidden' });
        },
        onEnterBack: () => {
          gsap.set([curtain, transitionText], { visibility: 'visible' });
        }
      });
    }

    // 4.2 Sobre Section Clean Reveals (Zero Stagger Reflows)
    function initSobreReveals() {
      const text = document.querySelector('.sobre-text-trigger');
      if (text) {
        gsap.fromTo(text,
          { opacity: 0.4, y: 15 },
          {
            opacity: 1,
            y: 0,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: text,
              start: 'top 85%',
              end: 'bottom 60%',
              scrub: 0.3
            }
          }
        );
      }

      const img = document.querySelector('.sobre-clean-img');
      if (img) {
        gsap.fromTo(img,
          { scale: 1.06 },
          {
            scale: 1,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: '.sobre-image-wrapper',
              start: 'top 85%',
              end: 'bottom 50%',
              scrub: 0.3
            }
          }
        );
      }
    }

    // 4.3 General Block Reveals with Clean Hardware Acceleration
    function initGeneralReveals() {
      const revealElements = gsap.utils.toArray('[data-reveal]');
      if (!revealElements.length) return;

      gsap.set(revealElements, { opacity: 0, y: Hardware.isMobile ? 15 : 24 });

      // Group elements by parent for single ScrollTrigger per card grid
      const groups = new Map();
      revealElements.forEach(el => {
        const p = el.parentElement;
        if (!groups.has(p)) groups.set(p, []);
        groups.get(p).push(el);
      });

      groups.forEach((els, parent) => {
        gsap.to(els, {
          opacity: 1,
          y: 0,
          duration: Hardware.isMobile ? 0.6 : 0.8,
          ease: 'power2.out',
          stagger: 0.08,
          clearProps: 'transform',
          scrollTrigger: {
            trigger: parent,
            start: Hardware.isMobile ? 'top 92%' : 'top 85%',
            toggleActions: 'play none none reverse'
          }
        });
      });
    }

    // 4.4 Buck's Sauce Project Showcase
    function initProjectsShowcase() {
      const section = document.getElementById('projetos');
      const cards = gsap.utils.toArray('.bucks-card');
      if (!section || !cards.length) return;

      if (Hardware.isMobile) {
        // Mobile: Clean horizontal or natural scroll
        return;
      }

      const R = 1800;
      const stepAngle = 24;

      function setWheel(angle) {
        cards.forEach((card, i) => {
          const cardAngle = angle + (i * stepAngle);
          const absAngle = Math.abs(cardAngle);
          const rad = (cardAngle * Math.PI) / 180;
          const x = R * Math.sin(rad);
          const y = R * (1 - Math.cos(rad)) + Math.pow(absAngle / stepAngle, 1.3) * 36;
          const rot = cardAngle * 0.45;

          let opacity = 0;
          let scale = 1;
          if (absAngle < 5) {
            opacity = 1;
          } else if (absAngle < stepAngle * 0.85) {
            opacity = 1 - ((absAngle - 5) / (stepAngle * 0.85 - 5)) * 0.85;
            scale = 0.94;
          } else if (absAngle < stepAngle * 1.25) {
            opacity = 0.12;
            scale = 0.88;
          }

          card.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${rot.toFixed(1)}deg) scale(${scale.toFixed(2)})`;
          card.style.opacity = opacity.toFixed(2);
          card.style.zIndex = Math.round(100 - absAngle);
          card.style.pointerEvents = absAngle < 10 ? 'auto' : 'none';
        });
      }

      setWheel(0);

      const state = { angle: 0 };
      const totalAngle = -stepAngle * (cards.length - 1);

      gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: '+=190%',
          pin: true,
          scrub: 0.5,
          anticipatePin: 1,
          invalidateOnRefresh: true
        }
      })
      .to({}, { duration: 0.25 })
      .to(state, {
        angle: totalAngle,
        duration: 2.2,
        ease: 'none',
        onUpdate: () => setWheel(state.angle)
      })
      .to({}, { duration: 0.25 });
    }

        // 4.5 CTA Strip & 3D Extintor Transition (Full Cinematic Zoom on Mobile & Desktop)
    function initCtaTransition() {
      const group = document.getElementById('ctaFooterGroup');
      const footer = document.getElementById('contato');
      const mv = document.getElementById('extintorModel');
      const stage = document.getElementById('ctaExtintorStage');
      if (!group || !footer) return;

      // Footer begins hidden behind the 3D extintor stage
      gsap.set(footer, { opacity: 0, pointerEvents: 'none', visibility: 'hidden' });

      // Initial clean camera settings
      if (mv) {
        mv.cameraOrbit = '0deg 84deg 105%';
        mv.fieldOfView = '45deg';
        gsap.set(mv, { scale: 1 });
      }

      const pinDistance = Hardware.isMobile ? '+=120%' : '+=130%';
      const scrubSpeed = Hardware.isMobile ? 0.35 : 0.5;

      const tl = gsap.timeline({
        scrollTrigger: {
          id: 'ctaPin',
          trigger: group,
          start: 'top top',
          end: pinDistance,
          pin: true,
          scrub: scrubSpeed,
          anticipatePin: 1,
          invalidateOnRefresh: true
        }
      });

      // 1. CTA Text and halo fade out cleanly
      tl.to('.cta-content-top', { opacity: 0, y: -24, duration: 0.25, ease: 'power1.out' }, 0)
        .to('.cta-content-bottom', { opacity: 0, y: 24, duration: 0.25, ease: 'power1.out' }, 0)
        .to('#extintorHalo', { opacity: 0, duration: 0.25 }, 0);

      // 2. Extinguisher approaches the viewer (zooming smoothly into camera)
      if (mv) {
        tl.to(mv, {
          scale: Hardware.isMobile ? 2.8 : 3.4,
          duration: 0.72,
          ease: 'power2.in'
        }, 0.05);
      }

      // 3. Stage dissolves smoothly at peak approach
      if (stage) {
        tl.to(stage, { opacity: 0, duration: 0.2, ease: 'power1.out' }, 0.70);
      }

      // 4. Footer dissolves in seamlessly
      tl.fromTo(footer,
        { opacity: 0, visibility: 'hidden', pointerEvents: 'none' },
        { opacity: 1, visibility: 'visible', pointerEvents: 'auto', duration: 0.25, ease: 'power2.out' },
        0.72
      );
    }

    // 4.6 Card Tilt on Mouse Move (Zero Forced Reflow via Cached Rects)
    function initCardTilt() {
      if (Hardware.isTouch || Hardware.isLowEnd) return;
      const cards = document.querySelectorAll('.service-card, .diff-card');

      cards.forEach(card => {
        let rect = null;
        let ticking = false;

        card.addEventListener('mouseenter', () => {
          rect = card.getBoundingClientRect(); // Cached once on hover enter
        });

        card.addEventListener('mousemove', (e) => {
          if (!rect || ticking) return;
          ticking = true;
          requestAnimationFrame(() => {
            if (!rect) { ticking = false; return; }
            const x = e.clientX - rect.left - (rect.width * 0.5);
            const y = e.clientY - rect.top - (rect.height * 0.5);

            card.style.transform = `perspective(1000px) rotateX(${(-y * 0.03).toFixed(2)}deg) rotateY(${(x * 0.03).toFixed(2)}deg) scale3d(1.02, 1.02, 1)`;
            card.style.borderColor = 'rgba(200, 164, 107, 0.4)';
            ticking = false;
          });
        });

        card.addEventListener('mouseleave', () => {
          rect = null;
          card.style.transform = '';
          card.style.borderColor = '';
        });
      });
    }

    return {
      init: () => {
        updateMetrics();
        ScrollTrigger.addEventListener('refresh', updateMetrics);

        initHeroTransition();
        initSobreReveals();
        initGeneralReveals();
        initProjectsShowcase();
        initCtaTransition();
        initCardTilt();

        requestAnimationFrame(() => {
          ScrollTrigger.refresh();
          updateMetrics();
        });
      },
      updateMetrics,
      getMaxScroll: () => maxScroll
    };
  })();

  /* ==========================================================================
     MODULE 5: NAVIGATION & ERGONOMICS
     ========================================================================== */
  function initNavigation() {
    const header = document.getElementById('siteHeader');
    const backToTop = document.getElementById('back-to-top');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mobileNav = document.getElementById('mobileNav');

    // Smooth anchor navigation supporting ScrollTrigger pins
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function (e) {
        const hash = this.getAttribute('href');
        if (!hash || hash === '#') return;
        const target = document.querySelector(hash);
        if (!target) return;

        e.preventDefault();

        if (mobileNav && mobileNav.classList.contains('active')) {
          hamburgerBtn.classList.remove('active');
          mobileNav.classList.remove('active');
          document.body.style.overflow = '';
        }

        if (hash === '#hero') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
          return;
        }

        // Scroll to revealed footer inside pinned ctaFooterGroup (Desktop & Mobile)
        if (hash === '#contato') {
          const ctaGroup = document.getElementById('ctaFooterGroup');
          const st = ctaGroup ? ScrollTrigger.getById('ctaPin') : null;
          if (st) {
            window.scrollTo({ top: st.end - 5, behavior: 'smooth' });
            return;
          }
        }

        const st = ScrollTrigger.getAll().find(s => s.trigger === target);
        if (st) {
          window.scrollTo({ top: Math.max(0, st.start + 2), behavior: 'smooth' });
          return;
        }

        const top = target.getBoundingClientRect().top + window.scrollY - 70;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      });
    });

    // Mobile Hamburger
    if (hamburgerBtn && mobileNav) {
      hamburgerBtn.addEventListener('click', () => {
        hamburgerBtn.classList.toggle('active');
        mobileNav.classList.toggle('active');
        document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
      });
    }

    // Back to top click
    if (backToTop) {
      backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }

    // Passive, single RAF-throttled scroll handler
    let scrollScheduled = false;
    window.addEventListener('scroll', () => {
      if (scrollScheduled) return;
      scrollScheduled = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;

        // Canvas frame update
        CanvasEngine.updateTarget(y, ScrollOrchestrator.getMaxScroll());

        // Header style toggle
        if (header) {
          if (y > 40) header.classList.add('scrolled');
          else header.classList.remove('scrolled');
        }

        // Back to top visibility
        if (backToTop) {
          if (y > 500) backToTop.classList.add('visible');
          else backToTop.classList.remove('visible');
        }

        scrollScheduled = false;
      });
    }, { passive: true });

    // Debounced Resize
    let resizeTimer = null;
    let lastW = window.innerWidth;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const currW = window.innerWidth;
        if (Math.abs(currW - lastW) > 5) {
          lastW = currW;
          CanvasEngine.resize();
          ScrollTrigger.refresh();
          ScrollOrchestrator.updateMetrics();
        }
      }, 200);
    }, { passive: true });

    // Footer Year
    const yearEl = document.getElementById('yearNow');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  /* ==========================================================================
     INITIALIZATION BOOTSTRAP
     ========================================================================== */
  document.body.style.overflow = 'hidden';

  CanvasEngine.init(() => {
    // First frame loaded: run preloader and orchestrator
    Preloader.run(() => {
      ScrollOrchestrator.init();
      CanvasEngine.streamRemaining();
    });
  });

  initNavigation();

})();
