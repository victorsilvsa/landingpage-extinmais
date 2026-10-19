/* ==========================================================================
   EXTINMAIS — MAIN SCRIPT (Alta Performance, Mobile Fluido & Sem Bugs de Scroll)
   ========================================================================== */
(function () {
  'use strict';

  // Configuração global do GSAP e ScrollTrigger contra quebras no mobile
  gsap.registerPlugin(ScrollTrigger);
  
  ScrollTrigger.config({
    ignoreMobileResize: true,
    autoRefreshEvents: "visibilitychange,DOMContentLoaded,load"
  });

  /* ------------------------------------------------------------------------
     0. CONFIG — HARDWARE PROFILER & ADAPTIVE INTELLIGENCE
     ------------------------------------------------------------------------ */
  const detectHardwareProfile = () => {
    let mem = 4;
    let cores = 4;
    try {
      mem = navigator.deviceMemory || 4;
      cores = navigator.hardwareConcurrency || 4;
    } catch (e) {}

    const conn = navigator.connection;
    const isDataSaver = !!(conn && (conn.saveData || /2g|3g/.test(conn.effectiveType)));
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    // Detecção forense de GPU de baixo rendimento via WebGL
    let isLowTierGPU = false;
    try {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
      if (gl) {
        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
        if (debugInfo) {
          const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL).toLowerCase();
          if (/mali-4|mali-t|adreno\s*(3|505|506|508|509)|powervr|swiftshader|llvmpipe|intel\s*hd\s*(2000|3000|4000)/i.test(renderer)) {
            isLowTierGPU = true;
          }
        }
      }
    } catch (e) {}

    const isUltraLowEnd = mem <= 2 || cores <= 2 || isDataSaver || isLowTierGPU;
    const isLowEnd = isUltraLowEnd || mem <= 3 || cores <= 4 || (isTouch && window.innerWidth <= 600);

    return {
      isUltraLowEnd,
      isLowEnd,
      mem,
      cores,
      isDataSaver,
      isTouch
    };
  };

  const hardwareProfile = detectHardwareProfile();

  // Garante a marcação visual de baixo hardware no elemento raiz
  if (hardwareProfile.isUltraLowEnd) {
    document.documentElement.classList.add('ultra-low-end');
  }
  if (hardwareProfile.isLowEnd) {
    document.documentElement.classList.add('low-perf');
  }

  // Configuração adaptativa de amostragem de frames e DPR
  // Ultra fraco: carrega 60 frames (1 a cada 4) => economiza 75% de RAM e previne crash OOM!
  // Moderado: carrega 120 frames (1 a cada 2) => economiza 50% de RAM!
  // Alto desempenho: carrega todos os 240 frames
  const frameStride = hardwareProfile.isUltraLowEnd ? 4 : (hardwareProfile.isLowEnd ? 2 : 1);
  const totalFrames = 240;
  const framePrefix = 'ezgif-frame-';
  const frameExt = '.jpg';
  const framePad = 3;

  const isTouchDevice = hardwareProfile.isTouch;
  const checkMobile = () => window.innerWidth <= 940;
  let isMobileSize = checkMobile();

  // Frames prioritários ajustados ao frameStride
  const rawPriorityIndices = [0, 1, 2, 3, 5, 10, 20, 40, 60, 90, 120, 150, 180, 210, 239];
  const priorityIndices = Array.from(new Set(
    rawPriorityIndices.map(idx => Math.min(totalFrames - 1, Math.round(idx / frameStride) * frameStride))
  )).sort((a, b) => a - b);

  /* ------------------------------------------------------------------------
     1. SMOOTH SCROLL (Lenis no Desktop Potente & Touch Nativo Fluido no Mobile / Low-End)
     ------------------------------------------------------------------------ */
  let lenis = null;
  if (!isTouchDevice && !hardwareProfile.isLowEnd && !hardwareProfile.isUltraLowEnd && typeof Lenis !== 'undefined') {
    lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 0.9,
      infinite: false
    });

    lenis.on('scroll', () => {
      ScrollTrigger.update();
      updateCanvasFrameTarget();
    });

    gsap.ticker.add((time) => {
      lenis.raf(time * 1000);
    });
  } else {
    // Touchscreen / Mobile / Ultra Low-End: rolagem nativa a 60-120Hz no compositor do navegador
    window.addEventListener('scroll', () => {
      ScrollTrigger.update();
      updateCanvasFrameTarget();
    }, { passive: true });
  }

  // Previne saltos e acúmulo de processamento no ticker em aparelhos fracos
  gsap.ticker.lagSmoothing(hardwareProfile.isUltraLowEnd ? 1000 : 500, hardwareProfile.isUltraLowEnd ? 16 : 33);

  /* ------------------------------------------------------------------------
     2. CANVAS BACKGROUND SEQUENCE (Amostragem Inteligente & Loop Reativo Sob Demanda)
     ------------------------------------------------------------------------ */
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas ? canvas.getContext('2d', { alpha: false, desynchronized: true }) : null;
  const images = new Array(totalFrames);

  const frameState = { current: 0 };
  let targetFrame = 0;
  let lastRenderedFrame = -1;
  let canvasRafId = null;
  let isCanvasActive = false;

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    
    // DPR adaptativo: 1.0 para aparelhos fracos (economiza 75% de fill-rate), até 2.0 para telas Retina
    let dpr = 1.0;
    if (!hardwareProfile.isUltraLowEnd) {
      dpr = hardwareProfile.isLowEnd 
        ? Math.min(window.devicePixelRatio || 1, 1.25)
        : Math.min(window.devicePixelRatio || 1, 2.0);
    }

    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = hardwareProfile.isUltraLowEnd ? 'low' : (hardwareProfile.isLowEnd ? 'medium' : 'high');

    drawFrame(Math.round(frameState.current));
  }

  function drawFrame(targetIndex) {
    if (!canvas || !ctx) return;

    // Alinha para o múltiplo de amostragem mais próximo
    const sampledIndex = Math.min(totalFrames - 1, Math.max(0, Math.round(targetIndex / frameStride) * frameStride));

    let img = images[sampledIndex];
    if (!img || !img.complete || !img.naturalWidth) {
      // Busca inteligente do frame renderizável mais próximo dentro da grade amostrada
      for (let offset = frameStride; offset <= 30 * frameStride; offset += frameStride) {
        const prev = images[sampledIndex - offset];
        if (prev && prev.complete && prev.naturalWidth) {
          img = prev;
          break;
        }
        const next = images[sampledIndex + offset];
        if (next && next.complete && next.naturalWidth) {
          img = next;
          break;
        }
      }
    }

    if (!img || !img.complete || !img.naturalWidth) return;

    const cw = canvas.width;
    const ch = canvas.height;
    const canvasRatio = cw / ch;
    const imgRatio = img.naturalWidth / img.naturalHeight;

    let drawW, drawH, offsetX, offsetY;
    if (imgRatio > canvasRatio) {
      drawH = ch;
      drawW = drawH * imgRatio;
      offsetX = (cw - drawW) / 2;
      offsetY = 0;
    } else {
      drawW = cw;
      drawH = drawW / imgRatio;
      offsetX = 0;
      offsetY = (ch - drawH) / 2;
    }

    ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
  }

  function requestCanvasUpdate() {
    if (!isCanvasActive) {
      isCanvasActive = true;
      canvasRafId = requestAnimationFrame(updateCanvas);
    }
  }

  function updateCanvasFrameTarget() {
    const scrollY = window.scrollY;
    
    // Altura do pin do hero onde a cortina opera (o fundo permanece estático até a cortina terminar)
    const heroPinDistance = window.innerHeight * (isMobileSize ? 1.8 : 2.5);
    
    if (scrollY <= heroPinDistance) {
      if (targetFrame !== 0) {
        targetFrame = 0;
        requestCanvasUpdate();
      }
      return;
    }

    const scrollAfterHero = scrollY - heroPinDistance;
    const maxScrollAfterHero = document.documentElement.scrollHeight - window.innerHeight - heroPinDistance;
    if (maxScrollAfterHero <= 0) return;

    const progress = Math.max(0, Math.min(1, scrollAfterHero / maxScrollAfterHero));
    const newTarget = progress * (totalFrames - 1);
    
    if (Math.abs(newTarget - targetFrame) > 0.05) {
      targetFrame = newTarget;
      requestCanvasUpdate();
    }
  }

  // Loop reativo sob demanda: para automaticamente quando atinge o alvo (0% CPU / 0% GPU em repouso)
  function updateCanvas() {
    const delta = targetFrame - frameState.current;
    const isMoving = Math.abs(delta) > 0.005;

    if (isMoving) {
      frameState.current += delta * (hardwareProfile.isUltraLowEnd ? 0.35 : 0.25);
    } else {
      frameState.current = targetFrame;
    }

    const roundedFrame = Math.round(frameState.current);
    if (roundedFrame !== lastRenderedFrame) {
      drawFrame(roundedFrame);
      lastRenderedFrame = roundedFrame;
    }

    if (isMoving) {
      canvasRafId = requestAnimationFrame(updateCanvas);
    } else {
      isCanvasActive = false;
      canvasRafId = null;
    }
  }

  /* ------------------------------------------------------------------------
     3. HERON AI ARCHITECTURAL PRELOADER & TELEMETRY CONTROLLER
     ------------------------------------------------------------------------ */
  const preloader = document.getElementById('preloader');
  const loadingPercent = document.getElementById('loadingPercent');
  const loadingMain = document.getElementById('loadingMain');
  const loadingLogoBrand = document.querySelector('.loading-logo-brand');

  let screenReleased = false;

  function getFrameUrl(index) {
    const n = String(index + 1).padStart(framePad, '0');
    return `frame/${framePrefix}${n}${frameExt}`;
  }

  function initHeronPreloader() {
    if (hardwareProfile.isUltraLowEnd) {
      // Dispositivos ultra-fracos: liberação instantânea sem travar a CPU calculando vetores SVG
      if (loadingLogoBrand) {
        gsap.to(loadingLogoBrand, { opacity: 1, scale: 1, duration: 0.35, ease: 'power2.out' });
      }
      gsap.to('.loading-content-sub-item-txt', { opacity: 1, y: 0, duration: 0.2, stagger: 0.02 });
      return;
    }

    // Prepare Blueprint SVG paths with exact stroke-dasharray
    const blueprintSvg = document.querySelector('.loading-blueprint-svg');
    const svgPaths = blueprintSvg ? blueprintSvg.querySelectorAll('line, path') : [];
    svgPaths.forEach(el => {
      let len = 2000;
      try {
        if (el.getTotalLength) len = Math.ceil(el.getTotalLength()) || 2000;
      } catch (e) {}
      gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
    });

    // Set initial states
    gsap.set('.loading-content-sub-item-txt', { opacity: 0, y: 6 });
    if (loadingLogoBrand) gsap.set(loadingLogoBrand, { opacity: 0, scale: 0.92 });

    // Animate blueprint vector drawing
    if (svgPaths.length > 0) {
      gsap.to(svgPaths, {
        strokeDashoffset: 0,
        duration: 1.4,
        stagger: { amount: 1.8, from: 'start' },
        ease: 'power2.out',
        delay: 0.1
      });
    }

    if (loadingLogoBrand) {
      gsap.to(loadingLogoBrand, {
        opacity: 1,
        scale: 1,
        duration: 0.9,
        ease: 'power2.out',
        delay: 0.4
      });
    }

    // Animate technical telemetry text stagger
    gsap.to('.loading-content-sub-item-txt', {
      opacity: 1,
      y: 0,
      duration: 0.28,
      stagger: 0.08,
      ease: 'power2.out',
      delay: 0.3
    });
  }

  function loadAssets() {
    initHeronPreloader();

    let priorityLoaded = 0;
    const totalPriority = priorityIndices.length;
    const progressState = { val: 0 };
    const loadDuration = hardwareProfile.isUltraLowEnd ? 0.7 : (hardwareProfile.isLowEnd ? 1.4 : 2.2);

    // Smooth counter animation interpolating between real load events and GSAP timeline
    const progressTween = gsap.to(progressState, {
      val: 100,
      duration: loadDuration,
      ease: 'power2.out',
      onUpdate: () => {
        const rounded = Math.round(progressState.val);
        if (loadingPercent) loadingPercent.textContent = rounded;
      },
      onComplete: () => {
        if (!screenReleased) {
          finishPreload();
          streamRemainingFrames();
        }
      }
    });

    priorityIndices.forEach(idx => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        priorityLoaded++;
        const targetPct = Math.min(100, Math.round((priorityLoaded / totalPriority) * 100));
        if (targetPct > progressState.val) {
          gsap.to(progressState, {
            val: targetPct,
            duration: 0.2,
            ease: 'power1.out'
          });
        }
        if (priorityLoaded === 1) {
          drawFrame(0);
        }
      };
      img.onerror = () => {
        priorityLoaded++;
      };
      img.src = getFrameUrl(idx);
      images[idx] = img;
    });

    // Safety fallback
    const safetyTimeout = hardwareProfile.isUltraLowEnd ? 1200 : 2800;
    setTimeout(() => {
      if (!screenReleased) {
        progressTween.progress(1);
        finishPreload();
        streamRemainingFrames();
      }
    }, safetyTimeout);
  }

  // Transmissão inteligente em lotes dos frames restantes respeitando o frameStride
  function streamRemainingFrames() {
    const remainingIndices = [];
    for (let i = 0; i < totalFrames; i += frameStride) {
      if (!images[i]) remainingIndices.push(i);
    }

    let cursor = 0;
    const batchSize = hardwareProfile.isUltraLowEnd ? 6 : (hardwareProfile.isLowEnd ? 10 : 14);
    const idleTimeout = hardwareProfile.isUltraLowEnd ? 160 : 100;

    function processBatch() {
      if (cursor >= remainingIndices.length) return;
      const batch = remainingIndices.slice(cursor, cursor + batchSize);
      cursor += batchSize;

      batch.forEach(idx => {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          images[idx] = img;
        };
        img.src = getFrameUrl(idx);
      });

      if (cursor < remainingIndices.length) {
        if ('requestIdleCallback' in window) {
          requestIdleCallback(processBatch, { timeout: idleTimeout });
        } else {
          setTimeout(processBatch, hardwareProfile.isUltraLowEnd ? 80 : 40);
        }
      }
    }

    if ('requestIdleCallback' in window) {
      requestIdleCallback(processBatch, { timeout: idleTimeout });
    } else {
      setTimeout(processBatch, hardwareProfile.isUltraLowEnd ? 90 : 50);
    }
  }

  // Authentic Seamless Aperture Curtain Split Reveal
  function finishPreload() {
    if (screenReleased) return;
    screenReleased = true;

    if (loadingPercent) loadingPercent.textContent = '100';

    // Step 1: Fade out technical typography and central logo
    gsap.to(['.loading-content', '.loading-logo-wrap'], {
      opacity: 0,
      duration: 0.3,
      ease: 'power2.out'
    });

    // Step 2: Camera push-in on hero to create cinematic visual emergence as curtains part
    gsap.fromTo('.hero-video-wrap', 
      { scale: 1.05 }, 
      { scale: 1, duration: 1.1, ease: 'power2.out' }
    );
    gsap.fromTo('.hero-big-wrap', 
      { opacity: 0.6, y: 15 }, 
      { opacity: 1, y: 0, duration: 0.85, ease: 'power2.out', delay: 0.1 }
    );

    // Step 3: Split aperture opening - reveals the hero in real-time as curtains part
    const apertureState = { top: 50, bot: 50 };

    gsap.to(apertureState, {
      top: 0,
      bot: 100,
      duration: 0.95,
      ease: 'cubic-bezier(0.77, 0, 0.175, 1)',
      onUpdate: () => {
        if (loadingMain) {
          const t = apertureState.top.toFixed(2);
          const b = apertureState.bot.toFixed(2);
          // Polygon aperture splitting from center outward:
          loadingMain.style.clipPath = `polygon(0% 0%, 100% 0%, 100% ${t}%, 0% ${t}%, 0% ${b}%, 100% ${b}%, 100% 100%, 0% 100%)`;
        }
      },
      onComplete: () => {
        if (preloader) {
          preloader.classList.add('loaded');
          preloader.style.display = 'none';
          if (preloader.parentNode) {
            preloader.parentNode.removeChild(preloader);
          }
        }
        document.body.style.overflow = '';
        initScrollAnimations();
      }
    });
  }

  /* ------------------------------------------------------------------------
     4. INICIALIZAÇÃO DE ANIMAÇÕES DE SCROLL E RESPONSIVIDADE
     ------------------------------------------------------------------------ */
  function initScrollAnimations() {
    isMobileSize = checkMobile();
    resizeCanvas();
    updateCanvasFrameTarget();
    requestCanvasUpdate();

    // Leve paralaxe no canvas (apenas em dispositivos capazes para evitar repaints de tela inteira)
    if (!hardwareProfile.isUltraLowEnd) {
      gsap.to('#bg-canvas', {
        yPercent: isMobileSize ? 2 : 4,
        ease: 'none',
        scrollTrigger: {
          trigger: 'body',
          start: 'top top',
          end: 'bottom bottom',
          scrub: true
        }
      });
    }

    // Elementos com atributo data-parallax
    gsap.utils.toArray('[data-parallax]').forEach(el => {
      const depth = parseFloat(el.getAttribute('data-parallax')) || 8;
      gsap.to(el, {
        yPercent: isMobileSize ? depth * 0.35 : depth,
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top bottom',
          end: 'bottom top',
          scrub: hardwareProfile.isUltraLowEnd ? 0.2 : true
        }
      });
    });

    initHeroCurtainTransition();
    initSobreWordByWordReveal();
    initSobreImageFocusReveal();
    initRevealAnimations();
    initBucksSauceShowcase();
    initCtaFooterTransition();
    initFooterVideoTransition();

    if (!isTouchDevice && !hardwareProfile.isLowEnd && !hardwareProfile.isUltraLowEnd) {
      initCardsAwwwardsAnimation();
    }

    requestAnimationFrame(() => {
      ScrollTrigger.refresh();
    });
  }

  /* ------------------------------------------------------------------------
     4.1 CORTINA DE TRANSIÇÃO (Ágil, sem tela preta travada)
     ------------------------------------------------------------------------ */
  function initHeroCurtainTransition() {
    const hero = document.querySelector('.hero');
    const curtain = document.getElementById('heroCurtain');
    const transitionText = document.getElementById('heroTransitionText');
    const pill = transitionText ? transitionText.querySelector('.hero-trans-pill') : null;
    const title = transitionText ? transitionText.querySelector('.letter-reveal-target') : null;
    const sub = transitionText ? transitionText.querySelector('.hero-transition-sub') : null;

    if (!hero || !curtain || !transitionText) return;

    const steps = gsap.utils.toArray('.curtain-step');
    const heroVideoWrap = document.querySelector('.hero-video-wrap');
    
    gsap.set(steps, { scaleY: 0, transformOrigin: 'top center' });
    gsap.set(transitionText, { opacity: 0, y: 0 });
    if (pill) gsap.set(pill, { opacity: 0, y: 15 });
    if (title) gsap.set(title, { opacity: 0, y: 22 });
    if (sub) gsap.set(sub, { opacity: 0, y: 15 });
    
    if (heroVideoWrap) {
      gsap.set(heroVideoWrap, { visibility: 'visible', opacity: 1 });
    }

    const tl = gsap.timeline();

    // 1. Textos e indicadores do hero desaparecem suavemente
    tl.to('.hero-big-wrap, .scroll-indicator', {
      opacity: 0,
      y: -30,
      duration: 0.5,
      ease: 'power1.out'
    }, 0)
    // 2. Os degraus descem cobrindo COMPLETAMENTE o hero (.hero-video-wrap permanece VISÍVEL por baixo!)
    .to(steps, {
      scaleY: 1,
      stagger: 0.045,
      ease: 'power2.inOut',
      duration: 1.1
    }, 0)
    // 3. SOMENTE quando os degraus cobrirem 100% da tela (tela totalmente preta), escondemos o hero
    .set('.hero-video-wrap', { visibility: 'hidden' }, 1.2)
    // 4. Revela o bloco editorial de transição sobre o fundo preto da cortina
    .set(transitionText, { opacity: 1 }, 1.25)
    .to(pill, {
      opacity: 1,
      y: 0,
      duration: 0.45,
      ease: 'power2.out'
    }, 1.3)
    .to(title, {
      opacity: 1,
      y: 0,
      duration: 0.65,
      ease: 'power2.out'
    }, 1.45)
    .to(sub, {
      opacity: 1,
      y: 0,
      duration: 0.55,
      ease: 'power2.out'
    }, 1.65)
    // Pausa confortável e estável para leitura (hold window)
    .to({}, { duration: 1.1 })
    // Fade out suave do texto
    .to(transitionText, {
      opacity: 0,
      y: -24,
      duration: 0.4,
      ease: 'power2.in'
    })
    // 5. A cortina abre de baixo para cima, e SOMENTE AGORA a seção #sobre e o fundo do canvas aparecem!
    .to(steps, {
      scaleY: 0,
      stagger: 0.035,
      ease: 'power2.inOut',
      duration: 1.0,
      transformOrigin: 'bottom center'
    });

    ScrollTrigger.create({
      trigger: hero,
      start: 'top top',
      end: () => isMobileSize ? '+=180%' : '+=250%',
      pin: true,
      pinSpacing: true,
      scrub: isMobileSize ? 0.6 : 1.0,
      invalidateOnRefresh: true,
      anticipatePin: 1,
      animation: tl,
      onLeave: () => {
        if (heroVideoWrap) gsap.set(heroVideoWrap, { visibility: 'hidden' });
      },
      onEnterBack: () => {
        if (heroVideoWrap) gsap.set(heroVideoWrap, { visibility: 'visible', opacity: 1 });
      }
    });
  }

  /* ------------------------------------------------------------------------
     5.1 REVELAÇÃO PROGRESSIVA DE PALAVRAS DA SEGUNDA SEÇÃO
     ------------------------------------------------------------------------ */
  function initSobreWordByWordReveal() {
    const textEl = document.querySelector('.sobre-text-trigger');
    if (!textEl) return;

    const rawText = textEl.textContent.trim();
    textEl.innerHTML = '';

    const words = rawText.split(' ');
    words.forEach(word => {
      const wordSpan = document.createElement('span');
      wordSpan.className = 'word-reveal';
      wordSpan.style.display = 'inline-block';
      wordSpan.style.opacity = '0.45';
      wordSpan.innerHTML = word + '&nbsp;';
      textEl.appendChild(wordSpan);
    });

    gsap.to('.word-reveal', {
      opacity: 1,
      color: '#FAF4EB',
      stagger: 0.02,
      ease: 'power1.out',
      scrollTrigger: {
        trigger: '.sobre-intro-grid',
        start: 'top 85%',
        end: 'bottom 65%',
        scrub: 0.25
      }
    });
  }

  /* ------------------------------------------------------------------------
     5.2 ANIMAÇÃO DE ENFOQUE & TELEMETRIA CAD (Zero Blur)
     ------------------------------------------------------------------------ */
  function initSobreImageFocusReveal() {
    const imgEl = document.querySelector('.sobre-clean-img, .sobre-blur-img');
    const badgeEl = document.querySelector('.cad-telemetry-badge');
    const crosshairs = document.querySelectorAll('.cad-crosshair');
    if (!imgEl) return;

    // Zoom cinematográfico suave sem borrões
    gsap.fromTo(imgEl, 
      { scale: 1.08 },
      {
        scale: 1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: '.sobre-intro-grid',
          start: 'top 85%',
          end: 'bottom 45%',
          scrub: 0.35
        }
      }
    );

    // Entrada elegante do badge de telemetria CAD
    if (badgeEl) {
      gsap.fromTo(badgeEl,
        { y: 20, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration: 0.8,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: '.sobre-intro-grid',
            start: 'top 75%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    }

    // Brilho dos crosshairs CAD
    if (crosshairs.length > 0) {
      gsap.fromTo(crosshairs,
        { opacity: 0.2, scale: 0.8 },
        {
          opacity: 0.7,
          scale: 1,
          duration: 0.9,
          stagger: 0.1,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: '.sobre-intro-grid',
            start: 'top 80%',
            toggleActions: 'play none none reverse'
          }
        }
      );
    }
  }

  /* ------------------------------------------------------------------------
     6. REVELAÇÃO GERAL DOS BLOCOS
     ------------------------------------------------------------------------ */
  function initRevealAnimations() {
    gsap.set('[data-reveal]', { opacity: 0, y: isMobileSize ? 18 : 32 });

    const groups = new Map();
    gsap.utils.toArray('[data-reveal]').forEach(el => {
      const parent = el.parentElement;
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent).push(el);
    });

    groups.forEach(els => {
      gsap.to(els, {
        opacity: 1,
        y: 0,
        duration: isMobileSize ? 0.7 : 1.0,
        ease: 'power3.out',
        stagger: 0.1,
        scrollTrigger: {
          trigger: els[0],
          start: isMobileSize ? 'top 92%' : 'top 88%',
          toggleActions: 'play none none reverse'
        }
      });
    });
  }

  /* ------------------------------------------------------------------------
     7. PROJETOS EM DESTAQUE — BUCK'S SAUCE TYPOGRAPHIC SHOWCASE
     ------------------------------------------------------------------------ */
  function initBucksSauceShowcase() {
    const section = document.getElementById('projetos');
    const track = document.getElementById('bucksCardsTrack');
    const cards = gsap.utils.toArray('.bucks-card');
    const digits = gsap.utils.toArray('.bucks-digit');

    if (!section || !track || cards.length === 0) return;

    const isMobile = window.innerWidth <= 940;

    // Geometria da Roda Radial Buck's Sauce
    // Desktop: Raio de 2000px, arco amplo | Mobile: Raio de 950px adaptado à largura da tela
    const R = isMobile ? 950 : 2000;
    const stepAngle = isMobile ? 26 : 22; // Espaçamento angular entre cada card (em graus)

    function applyWheelTransform(angle) {
      cards.forEach((card, i) => {
        const cardAngle = angle + (i * stepAngle);
        const rad = (cardAngle * Math.PI) / 180;
        const x = R * Math.sin(rad);
        const y = R * (1 - Math.cos(rad));
        const rot = cardAngle * (isMobile ? 0.75 : 1.0);
        const absAngle = Math.abs(cardAngle);

        let opacity = 0;
        let scale = 1;
        if (absAngle < 8) {
          opacity = 1;
          scale = 1;
        } else if (absAngle < 30) {
          const factor = (absAngle - 8) / 22;
          opacity = 1 - (factor * 0.65);
          scale = 1 - (factor * 0.12);
        } else if (absAngle < 55) {
          const factor = (absAngle - 30) / 25;
          opacity = 0.35 * (1 - factor);
          scale = 0.88 - (factor * 0.08);
        } else {
          opacity = 0;
        }

        const zIndex = Math.round(100 - absAngle);
        card.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        card.style.opacity = opacity.toFixed(3);
        card.style.zIndex = zIndex;
        card.style.pointerEvents = absAngle < 14 ? 'auto' : 'none';
      });

      // Inclinação dinâmica dos dígitos para expressividade tipográfica (apenas dispositivos capazes)
      if (!hardwareProfile.isUltraLowEnd) {
        digits.forEach((digit, dIdx) => {
          const dRot = (dIdx % 2 === 0 ? 4 : -4) * Math.sin((angle * Math.PI) / 180);
          digit.style.transform = `rotate(${dRot.toFixed(2)}deg)`;
        });
      }
    }

    // Inicialização imediata: Card 01 centralizado no topo do arco (0 deg)
    applyWheelTransform(0);

    const wheelState = { angle: 0 };

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top top",
        end: () => isMobile ? "+=260%" : "+=320%",
        pin: true,
        scrub: hardwareProfile.isUltraLowEnd ? 0.35 : 0.8,
        anticipatePin: 1,
        invalidateOnRefresh: true
      }
    });

    // Animação com paradas confortáveis em cada card e retenção do Card 04 no final
    tl.to({}, { duration: 0.15 }) // Pausa inicial no Card 01 (perfeitamente centralizado)
      .to(wheelState, {
        angle: -stepAngle,
        duration: 1.0,
        ease: "power2.inOut",
        onUpdate: () => applyWheelTransform(wheelState.angle)
      })
      .to({}, { duration: 0.25 }) // Pausa no Card 02 (centralizado)
      .to(wheelState, {
        angle: -stepAngle * 2,
        duration: 1.0,
        ease: "power2.inOut",
        onUpdate: () => applyWheelTransform(wheelState.angle)
      })
      .to({}, { duration: 0.25 }) // Pausa no Card 03 (centralizado)
      .to(wheelState, {
        angle: -stepAngle * 3,
        duration: 1.0,
        ease: "power2.inOut",
        onUpdate: () => applyWheelTransform(wheelState.angle)
      })
      .to({}, { duration: 0.35 }); // Pausa final no Card 04 (permanece centralizado antes do unpin)
  }

  /* ------------------------------------------------------------------------
     7.1 EXTINTOR 3D & REVELAÇÃO DO FOOTER (COBERTURA TOTAL DA TELA)
     ------------------------------------------------------------------------ */
  function initCtaFooterTransition() {
    const group = document.getElementById('ctaFooterGroup');
    const ctaSection = document.getElementById('ctaSection');
    const footer = document.getElementById('contato');
    const mv = document.getElementById('extintorModel');
    const stage = document.getElementById('ctaExtintorStage');
    const indicator = document.getElementById('footerIndicator');
    const veil = document.getElementById('extintorCoverVeil');

    if (!group || !ctaSection || !footer) return;

    const isMobile = window.innerWidth <= 940;

    // Configuração de fidelidade 3D adaptativa para não sobrecarregar GPUs fracas
    if (mv && hardwareProfile.isUltraLowEnd) {
      try {
        mv.setAttribute('render-scale', '0.65');
        mv.setAttribute('power-preference', 'low-power');
      } catch (e) {}
    }

    // Inicialização: Footer 100% invisível até cobertura total
    gsap.set(footer, { opacity: 0, pointerEvents: 'none', visibility: 'hidden' });
    if (veil) gsap.set(veil, { opacity: 0, scale: 0.08 });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: group,
        start: "top top",
        end: () => isMobile ? "+=180%" : "+=220%",
        pin: true,
        scrub: isMobile ? 0.7 : 1,
        anticipatePin: 1,
        invalidateOnRefresh: true
      }
    });

    const initialOrbitRadius = isMobile ? 230 : 200;
    const initialTargetY = isMobile ? 0.05 : 0.10;
    const initialFov = isMobile ? 54 : 48;
    const targetRadius = isMobile ? 12 : 16;
    const targetFov = isMobile ? 9 : 11;
    let cameraState = { 
      theta: 8, 
      radius: initialOrbitRadius, 
      fov: initialFov,
      targetY: initialTargetY 
    };

    // 1. Textos e indicadores do CTA esmaecem
    tl.to('.cta-content-top, .cta-content-bottom', {
      opacity: 0,
      y: -30,
      duration: 0.2,
      ease: "power2.out"
    }, 0);

    if (indicator) {
      tl.to(indicator, { opacity: 0, duration: 0.15 }, 0);
    }

    // 2. Extintor 3D aproxima e expande para COBERTURA TOTAL da tela (sem cortes em div)
    if (mv) {
      tl.to(cameraState, {
        theta: 270,
        radius: targetRadius,
        fov: targetFov,
        targetY: 0,
        duration: 0.75,
        ease: "power2.inOut",
        onUpdate: () => {
          if (mv.cameraOrbit) {
            mv.cameraOrbit = `${cameraState.theta.toFixed(1)}deg 82deg ${cameraState.radius.toFixed(1)}%`;
            mv.fieldOfView = `${cameraState.fov.toFixed(1)}deg`;
            mv.cameraTarget = `0m ${cameraState.targetY.toFixed(2)}m 0m`;
          }
        }
      }, 0.05);

      if (veil) {
        tl.to(veil, {
          opacity: 1,
          scale: 1.0,
          duration: 0.45,
          ease: "power1.in"
        }, 0.35);
      }

      // 3. Extintor dissolve suavemente no ápice da cobertura para o Footer
      if (stage) {
        tl.to(stage, {
          opacity: 0,
          duration: 0.12,
          ease: "power1.in"
        }, 0.78);
      }
    }

    // 4. Revelação do Footer 100% completo, opaco e interativo
    tl.set(footer, { visibility: 'visible' }, 0.80)
      .to(footer, {
        opacity: 1,
        pointerEvents: 'auto',
        duration: 0.2,
        ease: "power2.out"
      }, 0.82)
      .fromTo('.footer-brand, .footer-col, .footer-mobile-wa-bar', 
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, stagger: 0.03, duration: 0.18, ease: "power2.out" },
        0.84
      );
  }

  /* ------------------------------------------------------------------------
     7.2 FOOTER VIDEO
     ------------------------------------------------------------------------ */
  function initFooterVideoTransition() {
    const video = document.querySelector('.footer-video');
    const footer = document.getElementById('contato');
    if (!video || !footer) return;

    video.muted = true;
    video.playsInline = true;
    video.setAttribute('loop', 'true');

    if (hardwareProfile.isUltraLowEnd) {
      // Aparelhos ultra-fracos: pausa o vídeo para poupar canais de decodificação de hardware
      video.pause();
      return;
    }

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            video.play().catch(() => {});
          } else {
            video.pause();
          }
        });
      }, { rootMargin: '200px 0px' });
      observer.observe(footer);
    } else {
      video.play().catch(() => {});
    }
  }

  /* ------------------------------------------------------------------------
     8. CARD TILT & SPOTLIGHT GLARE (Apenas Desktop)
     ------------------------------------------------------------------------ */
  function initCardsAwwwardsAnimation() {
    if (hardwareProfile.isUltraLowEnd || hardwareProfile.isLowEnd) return;
    const cards = document.querySelectorAll('.service-card, .diff-card');

    cards.forEach(card => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left - (rect.width / 2);
        const y = e.clientY - rect.top - (rect.height / 2);

        gsap.to(card, {
          rotateY: x * 0.035,
          rotateX: -y * 0.035,
          transformPerspective: 1000,
          scale: 1.02,
          borderColor: 'rgba(200,164,107,0.4)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.6), 0 0 25px rgba(200,164,107,0.2)',
          duration: 0.4,
          ease: 'power2.out'
        });
      });

      card.addEventListener('mouseleave', () => {
        gsap.to(card, {
          rotateY: 0,
          rotateX: 0,
          scale: 1,
          borderColor: 'rgba(255,255,255,0.08)',
          boxShadow: 'var(--card-shadow)',
          duration: 0.6,
          ease: 'power3.out'
        });
      });
    });
  }

  /* ------------------------------------------------------------------------
     9. NAVEGAÇÃO SUAVE DE ÂNCORAS (#)
     ------------------------------------------------------------------------ */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const hash = this.getAttribute('href');
      if (!hash || hash === '#') return;
      const target = document.querySelector(hash);
      if (target) {
        e.preventDefault();

        // Fecha menu mobile se aberto
        if (mobileNav && mobileNav.classList.contains('active')) {
          hamburgerBtn.classList.remove('active');
          mobileNav.classList.remove('active');
          document.body.style.overflow = '';
        }

        if (lenis) {
          lenis.scrollTo(target, { offset: -70, duration: 1.15 });
        } else {
          const top = target.getBoundingClientRect().top + window.scrollY - 70;
          window.scrollTo({ top, behavior: 'smooth' });
        }
      }
    });
  });

  /* ------------------------------------------------------------------------
     10. HEADER SCROLL & BACK TO TOP
     ------------------------------------------------------------------------ */
  const header = document.getElementById('siteHeader');
  const backToTop = document.getElementById('back-to-top');

  function handleHeaderScroll() {
    if (!header) return;
    if (window.scrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }

  function handleBackToTop() {
    if (!backToTop) return;
    if (window.scrollY > 600) {
      backToTop.classList.add('visible');
    } else {
      backToTop.classList.remove('visible');
    }
  }

  if (backToTop) {
    backToTop.addEventListener('click', () => {
      if (lenis) {
        lenis.scrollTo(0, { duration: 1.1 });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  /* ------------------------------------------------------------------------
     11. MENU MOBILE
     ------------------------------------------------------------------------ */
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mobileNav = document.getElementById('mobileNav');

  if (hamburgerBtn && mobileNav) {
    hamburgerBtn.addEventListener('click', () => {
      hamburgerBtn.classList.toggle('active');
      mobileNav.classList.toggle('active');
      document.body.style.overflow = mobileNav.classList.contains('active') ? 'hidden' : '';
    });
  }

  /* ------------------------------------------------------------------------
     12. EVENTOS PASSIVOS DE SCROLL & RESIZE
     ------------------------------------------------------------------------ */
  let scrollPending = false;
  window.addEventListener('scroll', () => {
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => {
      handleHeaderScroll();
      handleBackToTop();
      scrollPending = false;
    });
  }, { passive: true });

  let resizeTimeout;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      isMobileSize = checkMobile();
      resizeCanvas();
      ScrollTrigger.refresh();
    }, 180);
  }, { passive: true });

  /* ------------------------------------------------------------------------
     13. FOOTER YEAR
     ------------------------------------------------------------------------ */
  const yearNow = document.getElementById('yearNow');
  if (yearNow) yearNow.textContent = new Date().getFullYear();

  /* ------------------------------------------------------------------------
     14. INICIALIZAÇÃO
     ------------------------------------------------------------------------ */
  document.body.style.overflow = 'hidden';
  resizeCanvas();
  loadAssets();
  handleHeaderScroll();

})();