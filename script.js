/* ==========================================================================
   EXTINMAIS — HIGH-PERFORMANCE KINETIC & 3D SYSTEM
   Awwwards Caliber Architecture, 60-120 FPS Fluid Motion, Zero Console Violations
   ========================================================================== */

(function () {
  'use strict';

  // 1. Reset scroll restoration on manual reload
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  window.scrollTo(0, 0);

  // 2. Register GSAP & ScrollTrigger
  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({
    ignoreMobileResize: true,
    autoRefreshEvents: "visibilitychange,DOMContentLoaded,load,resize"
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
      get isMobile() { return window.matchMedia('(max-width: 940px)').matches; },
      isLowEnd,
      isUltraLowEnd,
      dpr: isTouch || isLowEnd ? 1.0 : Math.min(window.devicePixelRatio || 1, 1.25),
      frameStride: isTouch ? 3 : (isLowEnd ? 2 : 1)
    };
  })();

  // Smoother lag smoothing to eliminate ticker hitches
  gsap.ticker.lagSmoothing(400, 33);

  /* ==========================================================================
     MODULE 2: CANVAS BACKGROUND ENGINE (Zero-Jank GSAP Stream)
     ========================================================================== */
  const CanvasEngine = (() => {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) return { init: () => {}, render: () => {}, resize: () => {}, streamRemaining: () => {} };

    const ctx = canvas.getContext('2d', { alpha: false });
    const totalFrames = 240;
    const frameStride = Hardware.frameStride;
    const images = new Array(totalFrames);
    const loadedIndices = [];
    let lastRenderedFrame = -1;

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
        ctx.imageSmoothingQuality = 'medium';
      }
      if (lastRenderedFrame >= 0) {
        render(lastRenderedFrame);
      }
    }

    function render(index) {
      if (!ctx || !canvas.width) return;
      if (index === lastRenderedFrame) return;

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
      lastRenderedFrame = index;
    }

    // Load initial critical frames
    function init(onFirstLoaded) {
      resize();

      const initialIndices = [0, 5, 15, 30, 60, 90, 120, 180, 239];
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

    return { init, render, resize, streamRemaining, totalFrames };
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
      const duration = 2.0;

      // 3D Extinguisher Preloading: Eagerly load before preloader finishes
      let modelReady = false;
      const mv = document.getElementById('extintorModel');

      const markReady = () => {
        modelReady = true;
      };

      if (mv) {
        if (mv.loaded) {
          modelReady = true;
        } else {
          mv.addEventListener('load', markReady, { once: true });
          mv.addEventListener('error', markReady, { once: true });
        }
      }

      // Also directly preload the GLB binary buffer via fetch into memory
      fetch('glb/extintor.glb')
        .then(res => res.blob())
        .then(() => {
          modelReady = true;
        })
        .catch(() => {
          modelReady = true;
        });

      const tween = gsap.to(state, {
        val: 100,
        duration: duration,
        ease: 'power1.inOut',
        onUpdate: () => {
          if (percentEl) percentEl.textContent = Math.round(state.val);
        },
        onComplete: () => {
          if (modelReady) {
            dismiss(onCompleteCallback);
          } else {
            // Keep at 100% until model finishes, max safety check 3.0s
            const interval = setInterval(() => {
              if (modelReady || released) {
                clearInterval(interval);
                dismiss(onCompleteCallback);
              }
            }, 60);
            setTimeout(() => {
              clearInterval(interval);
              dismiss(onCompleteCallback);
            }, 3000);
          }
        }
      });

      // Safety fallback (maximum 3.8s so preloader never hangs)
      setTimeout(() => {
        if (!released) {
          modelReady = true;
          tween.progress(1);
          dismiss(onCompleteCallback);
        }
      }, 3800);
    }

    function dismiss(callback) {
      if (released) return;
      released = true;

      if (percentEl) percentEl.textContent = '100';

      gsap.to(['.loading-content', '.loading-logo-wrap'], {
        opacity: 0,
        duration: 0.25,
        ease: 'power2.out'
      });

      // Camera push-in on hero to create cinematic visual emergence as curtains part (from yesterday's commit)
      gsap.fromTo('.hero-video-wrap', 
        { scale: 1.05 }, 
        { scale: 1, duration: 0.95, ease: 'power2.out' }
      );
      gsap.fromTo('.hero-big-wrap', 
        { opacity: 0.6, y: 15 }, 
        { opacity: 1, y: 0, duration: 0.80, ease: 'power2.out', delay: 0.08 }
      );

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
          if (callback) callback();
        }
      });
    }

    return { run };
  })();

  /* ==========================================================================
     MODULE 4: SCROLL & SECTION ORCHESTRATION
     ========================================================================== */
  const ScrollOrchestrator = (() => {

    // 4.1 Hero Curtain & Transition Text (Exact SOTD implementation from yesterday's commit)
    function initHeroTransition() {
      const hero = document.getElementById('hero') || document.querySelector('.hero');
      const curtain = document.getElementById('heroCurtain');
      const transitionText = document.getElementById('heroTransitionText');
      const pill = transitionText ? transitionText.querySelector('.hero-trans-pill') : null;
      const title = transitionText ? transitionText.querySelector('.letter-reveal-target') : null;
      const sub = transitionText ? transitionText.querySelector('.hero-transition-sub') : null;

      if (!hero || !curtain || !transitionText) return;

      const steps = gsap.utils.toArray('.curtain-step');
      const heroVideoWrap = document.querySelector('.hero-video-wrap');
      const isMob = window.innerWidth <= 940;

      gsap.set(steps, { scaleY: 0, yPercent: 0, transformOrigin: 'top center' });
      gsap.set(transitionText, { opacity: 0, y: 0 });
      if (pill) gsap.set(pill, { opacity: 0, y: 15 });
      if (title) gsap.set(title, { opacity: 0, y: 20 });
      if (sub) gsap.set(sub, { opacity: 0, y: 15 });

      if (heroVideoWrap) {
        gsap.set(heroVideoWrap, { opacity: 1 });
      }

      const tl = gsap.timeline();

      // 1. Textos e indicadores do hero desaparecem suavemente
      tl.to('.hero-big-wrap, .scroll-indicator', {
        opacity: 0,
        y: -25,
        duration: 0.45,
        ease: 'power1.out'
      }, 0)
      // 2. Os degraus descem cobrindo COMPLETAMENTE o hero de cima para baixo
      .to(steps, {
        scaleY: 1,
        stagger: 0.035,
        ease: 'power2.inOut',
        duration: 1.0,
        transformOrigin: 'top center'
      }, 0.1)
      // 3. Suavização da visibilidade do hero sob a cortina
      .to(heroVideoWrap, { opacity: 0, duration: 0.35, ease: 'none' }, 0.85)
      // 4. Revela o bloco editorial de transição sobre o fundo preto da cortina
      .to(transitionText, { opacity: 1, duration: 0.25 }, 1.0)
      .to(pill, {
        opacity: 1,
        y: 0,
        duration: 0.4,
        ease: 'power2.out'
      }, 1.05)
      .to(title, {
        opacity: 1,
        y: 0,
        duration: 0.5,
        ease: 'power2.out'
      }, 1.15)
      .to(sub, {
        opacity: 1,
        y: 0,
        duration: 0.45,
        ease: 'power2.out'
      }, 1.25)
      // Pausa confortável e estável para leitura
      .to({}, { duration: 0.9 })
      // Fade out suave do texto
      .to(transitionText, {
        opacity: 0,
        y: -18,
        duration: 0.35,
        ease: 'power2.in'
      })
      // 5. A cortina abre suavemente em direção ao fundo
      .to(steps, {
        yPercent: 100,
        stagger: 0.03,
        ease: 'power2.inOut',
        duration: 0.95
      });

      ScrollTrigger.create({
        id: 'heroPin',
        trigger: hero,
        start: 'top top',
        end: () => (window.innerWidth <= 940) ? '+=180%' : '+=240%',
        pin: true,
        pinSpacing: true,
        scrub: 0.6,
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

    // 4.2 Background Canvas Stream (Driven Directly by GSAP, Zero Competing RAF Loops)
    function initCanvasScroll() {
      const target = { frame: 0 };
      const total = CanvasEngine.totalFrames || 240;

      gsap.to(target, {
        frame: total - 1,
        ease: 'none',
        scrollTrigger: {
          id: 'canvasScrub',
          trigger: '#sobre',
          start: 'top bottom',
          endTrigger: '#ctaFooterGroup',
          end: 'top top',
          scrub: 0.35,
          onUpdate: () => {
            CanvasEngine.render(Math.round(target.frame));
          }
        }
      });
    }

    // 4.3 Sobre Section Clean Reveals
    function initSobreReveals() {
      const text = document.querySelector('.sobre-text-trigger');
      if (text) {
        gsap.fromTo(text,
          { opacity: 0, y: 24 },
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

      const imgWrapper = document.querySelector('.sobre-image-wrapper');
      if (imgWrapper) {
        gsap.fromTo(imgWrapper,
          { opacity: 0.3, scale: 0.94 },
          {
            opacity: 1,
            scale: 1,
            ease: 'power2.out',
            scrollTrigger: {
              trigger: imgWrapper,
              start: 'top 85%',
              end: 'bottom 50%',
              scrub: 0.3
            }
          }
        );
      }
    }

    // 4.4 General Block Reveals with Clean Hardware Acceleration
    function initGeneralReveals() {
      const revealElements = gsap.utils.toArray('[data-reveal]');
      if (!revealElements.length) return;

      gsap.set(revealElements, { opacity: 0, y: Hardware.isMobile ? 15 : 24 });

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
          duration: Hardware.isMobile ? 0.5 : 0.7,
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

    // 4.5 Buck's Sauce Project Showcase (Responsive MatchMedia: Desktop Wheel + Mobile Horizontal Snap)
    function initProjectsShowcase() {
      const section = document.getElementById('projetos');
      const cards = gsap.utils.toArray('.bucks-card');
      const track = document.getElementById('bucksCardsTrack');
      if (!section || !cards.length) return;

      const mm = gsap.matchMedia();

      // DESKTOP: True Circular Wheel Radial Showcase (Buck's Sauce caliber)
      mm.add("(min-width: 941px)", () => {
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

        const tl = gsap.timeline({
          scrollTrigger: {
            id: 'projectsWheel',
            trigger: section,
            start: 'top top',
            end: '+=160%',
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

        return () => {
          cards.forEach(card => {
            card.style.transform = '';
            card.style.opacity = '';
            card.style.zIndex = '';
            card.style.pointerEvents = '';
          });
        };
      });

      // MOBILE: Fluid Natural Horizontal Snap Carousel (Zero scroll traps, 100% fluid)
      mm.add("(max-width: 940px)", () => {
        cards.forEach(card => {
          card.style.transform = 'none';
          card.style.opacity = '1';
          card.style.zIndex = '1';
          card.style.pointerEvents = 'auto';
        });

        let indicatorWrap = document.getElementById('bucksMobileDots');
        if (!indicatorWrap && track) {
          indicatorWrap = document.createElement('div');
          indicatorWrap.id = 'bucksMobileDots';
          indicatorWrap.className = 'bucks-mobile-dots';
          indicatorWrap.innerHTML = cards.map((_, i) => `<span class="bucks-dot ${i === 0 ? 'active' : ''}" data-index="${i}"></span>`).join('');
          track.parentElement.appendChild(indicatorWrap);
        }

        if (track && indicatorWrap) {
          const dots = indicatorWrap.querySelectorAll('.bucks-dot');
          const onTrackScroll = () => {
            const scrollLeft = track.scrollLeft;
            const cardWidth = (cards[0] ? cards[0].offsetWidth : 300) + 16;
            const activeIndex = Math.min(cards.length - 1, Math.max(0, Math.round(scrollLeft / cardWidth)));
            dots.forEach((dot, idx) => {
              dot.classList.toggle('active', idx === activeIndex);
            });
          };
          track.addEventListener('scroll', onTrackScroll, { passive: true });
        }
      });
    }

    // 4.6 CTA Strip & 3D Extintor Transition (Spinning, Zooming to 100% Screen & Seamless Footer)
    function initCtaTransition() {
      const group = document.getElementById('ctaFooterGroup');
      const footer = document.getElementById('contato');
      const mv = document.getElementById('extintorModel');
      const stage = document.getElementById('ctaExtintorStage');
      if (!group || !footer || !mv) return;

      // Footer begins hidden behind the 3D extintor stage
      gsap.set(footer, { opacity: 0, pointerEvents: 'none', visibility: 'hidden' });
      if (stage) gsap.set(stage, { opacity: 1, visibility: 'visible' });

      // Clean, imposing, perfectly proportioned start camera
      const isMob = Hardware.isMobile;
      const startRadius = isMob ? 210 : 220;
      const startTargetY = isMob ? 0.14 : 0.16;
      const startFov = 45;

      const cam = {
        theta: 0,
        radius: startRadius,
        targetY: startTargetY,
        fov: startFov
      };

      mv.cameraOrbit = `0deg 84deg ${startRadius}%`;
      mv.cameraTarget = `0m ${startTargetY.toFixed(2)}m 0m`;
      mv.fieldOfView = `${startFov}deg`;
      gsap.set(mv, { scale: 1 });

      // Safe camera snap once model is fully loaded in memory (prevents rAF timeout)
      if (mv.loaded && typeof mv.jumpCameraToGoal === 'function') {
        mv.jumpCameraToGoal();
      } else {
        mv.addEventListener('load', () => {
          if (typeof mv.jumpCameraToGoal === 'function') {
            mv.jumpCameraToGoal();
          }
        }, { once: true });
      }

      const pinDistance = isMob ? '+=120%' : '+=140%';
      const scrubSpeed = isMob ? 0.35 : 0.5;

      const tl = gsap.timeline({
        scrollTrigger: {
          id: 'ctaPin',
          trigger: group,
          start: 'top top',
          end: pinDistance,
          pin: true,
          pinSpacing: true,
          scrub: scrubSpeed,
          anticipatePin: 1,
          invalidateOnRefresh: true
        }
      });

      // 1. CTA Text and halo fade out cleanly as scroll starts
      tl.to('.cta-content-top', { opacity: 0, y: -24, duration: 0.22, ease: 'power1.out' }, 0)
        .to('.cta-content-bottom', { opacity: 0, y: 24, duration: 0.22, ease: 'power1.out' }, 0)
        .to('#extintorHalo', { opacity: 0, duration: 0.22 }, 0);

      // 2. Extinguisher ROTATES and APPROACHES the screen (zooming to COVER THE WHOLE SCREEN)
      // theta: 0 -> 240 deg (spins dynamically in 3D)
      // radius: 210% -> 12% (rushes directly toward camera)
      // fov: 45deg -> 3.5deg (super zoom: red cylinder completely covers screen)
      // targetY: 0.14m -> 0m (smoothly centers onto red body)
      // scale: 1 -> 3.2 (guarantees red cylinder covers 100% of the screen with zero gaps)
      tl.to(cam, {
        theta: 240,
        radius: 12,
        fov: 3.5,
        targetY: 0,
        duration: 0.72,
        ease: 'power2.in',
        onUpdate: () => {
          mv.cameraOrbit = `${cam.theta.toFixed(1)}deg 84deg ${cam.radius.toFixed(1)}%`;
          mv.cameraTarget = `0m ${cam.targetY.toFixed(2)}m 0m`;
          mv.fieldOfView = `${cam.fov.toFixed(1)}deg`;
          if (mv.loaded && typeof mv.jumpCameraToGoal === 'function') {
            mv.jumpCameraToGoal();
          }
        }
      }, 0.02);

      tl.to(mv, {
        scale: isMob ? 3.0 : 3.5,
        transformOrigin: 'center center',
        duration: 0.72,
        ease: 'power2.in'
      }, 0.02);

      // 3. Stage dissolves smoothly as the red body covers the whole viewport
      if (stage) {
        tl.to(stage, { opacity: 0, duration: 0.18, ease: 'power1.out' }, 0.70);
      }

      // 4. Unified footer dissolves in seamlessly with video background and interactive channels
      tl.fromTo(footer,
        { opacity: 0, visibility: 'hidden', pointerEvents: 'none' },
        { opacity: 1, visibility: 'visible', pointerEvents: 'auto', duration: 0.26, ease: 'power2.out' },
        0.72
      );
    }

    // 4.7 Card Tilt on Mouse Move (Zero Forced Reflow via Cached Rects)
    function initCardTilt() {
      if (Hardware.isTouch || Hardware.isLowEnd) return;
      const cards = document.querySelectorAll('.service-card, .diff-card');

      cards.forEach(card => {
        let rect = null;
        let ticking = false;

        card.addEventListener('mouseenter', () => {
          rect = card.getBoundingClientRect();
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
        initHeroTransition();
        initCanvasScroll();
        initSobreReveals();
        initGeneralReveals();
        initProjectsShowcase();
        initCtaTransition();
        initCardTilt();
      }
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

    // Passive, single RAF-throttled scroll handler for UI classes only
    let scrollScheduled = false;
    window.addEventListener('scroll', () => {
      if (scrollScheduled) return;
      scrollScheduled = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;

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
        }
      }, 200);
    }, { passive: true });

    // Footer Year
    const yearEl = document.getElementById('yearNow');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  /* ==========================================================================
     INITIALIZATION BOOTSTRAP (Rock-Solid Order: Fonts -> Preloader -> Refresh)
     ========================================================================== */
  document.body.style.overflow = 'hidden';

  CanvasEngine.init(() => {
    // When first canvas frame is ready: run preloader
    Preloader.run(() => {
      // Initialize all ScrollTriggers
      ScrollOrchestrator.init();
      CanvasEngine.streamRemaining();

      // Refresh ScrollTrigger once fonts and DOM are 100% resolved
      if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => {
          requestAnimationFrame(() => {
            ScrollTrigger.refresh();
          });
        });
      } else {
        setTimeout(() => {
          ScrollTrigger.refresh();
        }, 100);
      }
    });
  });

  initNavigation();

})();
