/* ==========================================================================
   EXTINMAIS — MAIN SCRIPT (Alta Performance, Mobile Fluido & Rolagem Nativa)
   ========================================================================== */
(function () {
  'use strict';

  // F5 Reload — Garantir restauração manual e reinício sempre no topo
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }
  window.scrollTo(0, 0);
  window.addEventListener('beforeunload', () => {
    window.scrollTo(0, 0);
  });

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
    const isLowEnd = isUltraLowEnd || (mem <= 3 && cores <= 4);

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
  const frameStride = hardwareProfile.isUltraLowEnd ? 2 : 1;
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
     1. SCROLL CONTROLLER & CACHED METRICS (Zero Forced Reflow)
     ------------------------------------------------------------------------ */
  let cachedWinH = window.innerHeight;
  let cachedHeroPinDist = cachedWinH * (isMobileSize ? 1.8 : 2.4);
  let cachedMaxScrollAfterHero = 3000;

  function updateCachedScrollMetrics() {
    cachedWinH = window.innerHeight;
    cachedHeroPinDist = cachedWinH * (isMobileSize ? 1.8 : 2.4);
    const docH = Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0
    );
    cachedMaxScrollAfterHero = Math.max(1, docH - cachedWinH - cachedHeroPinDist);
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
    
    // Suporte de alta definição a telas Retina / OLED no mobile
    const nativeDpr = window.devicePixelRatio || 1;
    let dpr = Math.min(Math.max(nativeDpr, 1.5), 2.25);
    if (hardwareProfile.isUltraLowEnd) {
      dpr = Math.min(nativeDpr, 1.25);
    }

    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    drawFrame(Math.round(frameState.current));
  }

  function drawFrame(targetIndex) {
    if (!canvas || !ctx) return;

    // Alinha para o múltiplo de amostragem mais próximo
    const sampledIndex = Math.min(totalFrames - 1, Math.max(0, Math.round(targetIndex / frameStride) * frameStride));

    let img = images[sampledIndex];
    if (!img || !img.complete || !img.naturalWidth) {
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

    // Garante interpolação bicúbica nítida de alta precisão em cada renderização
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

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
    
    if (scrollY <= cachedHeroPinDist) {
      if (targetFrame !== 0) {
        targetFrame = 0;
        requestCanvasUpdate();
      }
      return;
    }

    const scrollAfterHero = scrollY - cachedHeroPinDist;
    const progress = Math.max(0, Math.min(1, scrollAfterHero / cachedMaxScrollAfterHero));
    const newTarget = progress * (totalFrames - 1);
    
    if (Math.abs(newTarget - targetFrame) > 0.15) {
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

    if (loadingLogoBrand) gsap.set(loadingLogoBrand, { opacity: 0, scale: 0.92 });

    // Animação acelerada e dinâmica dos traços técnicos (~0.65s)
    if (svgPaths.length > 0) {
      gsap.to(svgPaths, {
        strokeDashoffset: 0,
        duration: 0.65,
        stagger: { amount: 0.35, from: 'start' },
        ease: 'power2.out',
        delay: 0.05
      });
    }

    if (loadingLogoBrand) {
      gsap.to(loadingLogoBrand, {
        opacity: 1,
        scale: 1,
        duration: 0.45,
        ease: 'power2.out',
        delay: 0.15
      });
    }
  }

  function loadAssets() {
    initHeronPreloader();

    const progressState = { val: 0 };
    const loadDuration = 0.85; // Entrada veloz e ultra-fluida (< 1 segundo)

    // Renderiza o frame inicial imediatamente para desenhar no canvas sem tela branca
    const firstImg = new Image();
    firstImg.decoding = 'async';
    firstImg.onload = () => {
      images[0] = firstImg;
      drawFrame(0);
    };
    firstImg.src = getFrameUrl(0);

    // Carrega frames prioritários em paralelo de forma assíncrona
    let priorityLoaded = 0;
    const totalPriority = priorityIndices.length;
    priorityIndices.forEach(idx => {
      if (idx === 0) return;
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        priorityLoaded++;
        images[idx] = img;
      };
      img.onerror = () => {
        priorityLoaded++;
      };
      img.src = getFrameUrl(idx);
    });

    // Contador visual dinâmico (0% a 100% em ~0.85s)
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

    // Fallback de segurança ultra-rápido (máximo 1.2s sob qualquer conexão)
    setTimeout(() => {
      if (!screenReleased) {
        progressTween.progress(1);
        finishPreload();
        streamRemainingFrames();
      }
    }, 1200);
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
      duration: 0.2,
      ease: 'power2.out'
    });

    // Step 2: Camera push-in on hero to create cinematic visual emergence as curtains part
    gsap.fromTo('.hero-video-wrap', 
      { scale: 1.04 }, 
      { scale: 1, duration: 0.75, ease: 'power2.out' }
    );
    gsap.fromTo('.hero-big-wrap', 
      { opacity: 0.6, y: 12 }, 
      { opacity: 1, y: 0, duration: 0.65, ease: 'power2.out', delay: 0.05 }
    );

    // Step 3: Split aperture opening - reveals the hero in real-time as curtains part
    const apertureState = { top: 50, bot: 50 };

    gsap.to(apertureState, {
      top: 0,
      bot: 100,
      duration: 0.60,
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
        window.scrollTo(0, 0);
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
    updateCachedScrollMetrics();
    updateCanvasFrameTarget();
    requestCanvasUpdate();

    ScrollTrigger.addEventListener('refresh', updateCachedScrollMetrics);

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
      updateCachedScrollMetrics();
    });
  }

  /* ------------------------------------------------------------------------
     4.1 CORTINA DE TRANSIÇÃO (Transição Bidirecional Fluida e Simétrica)
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
      trigger: hero,
      start: 'top top',
      end: () => isMobileSize ? '+=180%' : '+=240%',
      pin: true,
      pinSpacing: true,
      scrub: 0.6,
      invalidateOnRefresh: true,
      anticipatePin: 1,
      animation: tl
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
      wordSpan.style.opacity = '0.38';
      wordSpan.style.color = '#FAF4EB';
      wordSpan.innerHTML = word + '&nbsp;';
      textEl.appendChild(wordSpan);
    });

    gsap.to('.word-reveal', {
      opacity: 1,
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
        { y: 20 },
        {
          y: 0,
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

    // Geometria da Roda Radial Buck's Sauce — Cards rodam no meio da tela sem subir para o título
    const R = isMobile ? 950 : 1850;
    const stepAngle = isMobile ? 28 : 24;

    function applyWheelTransform(angle) {
      cards.forEach((card, i) => {
        const cardAngle = angle + (i * stepAngle);
        const absAngle = Math.abs(cardAngle);
        const rad = (cardAngle * Math.PI) / 180;
        const x = R * Math.sin(rad);
        // Curva descendente reforçada nas laterais para que os cards ao girar NUNCA subam em cima do título
        const y = R * (1 - Math.cos(rad)) + Math.pow(absAngle / stepAngle, 1.35) * (isMobile ? 28 : 44);
        const rot = cardAngle * (isMobile ? 0.35 : 0.45);

        let opacity = 0;
        let scale = 1;
        if (absAngle < 5) {
          opacity = 1;
          scale = 1;
        } else if (absAngle < stepAngle * 0.85) {
          const factor = (absAngle - 5) / (stepAngle * 0.85 - 5);
          opacity = 1 - (factor * 0.85);
          scale = 1 - (factor * 0.12);
        } else if (absAngle < stepAngle * 1.25) {
          const factor = (absAngle - stepAngle * 0.85) / (stepAngle * 0.4);
          opacity = 0.15 * (1 - factor);
          scale = 0.88 - (factor * 0.08);
        } else {
          opacity = 0;
        }

        const zIndex = Math.round(100 - absAngle);
        card.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        card.style.opacity = opacity.toFixed(3);
        card.style.zIndex = zIndex;
        card.style.pointerEvents = absAngle < 10 ? 'auto' : 'none';
      });

      if (!hardwareProfile.isUltraLowEnd) {
        digits.forEach((digit, dIdx) => {
          const dRot = (dIdx % 2 === 0 ? 2 : -2) * Math.sin((angle * Math.PI) / 180);
          digit.style.transform = `rotate(${dRot.toFixed(2)}deg)`;
        });
      }
    }

    // Inicialização imediata: Card 01 centralizado no meio da tela (0 deg)
    applyWheelTransform(0);

    const wheelState = { angle: 0 };
    const totalAngle = -stepAngle * (cards.length - 1);

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "center center",
        end: () => isMobile ? "+=260%" : "+=320%",
        pin: true,
        scrub: 0.6,
        anticipatePin: 1,
        invalidateOnRefresh: true
      }
    });

    // Pausa inicial quando a seção trava no meio da tela antes de iniciar o giro dos cards
    tl.to({}, { duration: 0.45 })
      .to(wheelState, {
        angle: totalAngle,
        duration: 3.0,
        ease: "none",
        onUpdate: () => applyWheelTransform(wheelState.angle)
      })
      .to({}, { duration: 0.45 });
  }

  /* ------------------------------------------------------------------------
     7.1 EXTINTOR 3D & REVELAÇÃO DO FOOTER (IMPACTO REAL NA TELA SEM CÍRCULO)
     ------------------------------------------------------------------------ */
  function initCtaFooterTransition() {
    const group = document.getElementById('ctaFooterGroup');
    const ctaSection = document.getElementById('ctaSection');
    const footer = document.getElementById('contato');
    const mv = document.getElementById('extintorModel');
    const stage = document.getElementById('ctaExtintorStage');
    const halo = document.getElementById('extintorHalo');

    if (!group || !ctaSection || !footer) return;

    const isMobile = window.innerWidth <= 940;

    // Inicialização: Footer 100% invisível até o extintor preencher toda a tela
    gsap.set(footer, { opacity: 0, pointerEvents: 'none', visibility: 'hidden' });

    const initialOrbitRadius = isMobile ? 350 : 320;
    const initialFov = isMobile ? 50 : 46;
    const restingY = isMobile ? 28 : 34;

    let cameraState = {
      theta: 0,
      radius: initialOrbitRadius,
      fov: initialFov
    };

    if (mv) {
      mv.cameraOrbit = `0deg 84deg ${initialOrbitRadius}%`;
      mv.fieldOfView = `${initialFov}deg`;
      mv.cameraTarget = `0m 0m 0m`;
    }

    if (stage) {
      gsap.set(stage, { y: restingY, scale: 1, opacity: 1 });
    }

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: group,
        start: "top top",
        end: () => isMobile ? "+=190%" : "+=230%",
        pin: true,
        scrub: isMobile ? 0.55 : 0.85,
        anticipatePin: 1,
        invalidateOnRefresh: true
      }
    });

    // 1. Textos superiores e botão inferior saem suavemente
    tl.to('.cta-content-top', {
      opacity: 0,
      y: -24,
      duration: 0.20,
      ease: "power2.out"
    }, 0)
    .to('.cta-content-bottom', {
      opacity: 0,
      y: 24,
      duration: 0.20,
      ease: "power2.out"
    }, 0);

    if (halo) {
      tl.to(halo, {
        opacity: 0,
        duration: 0.25,
        ease: "power1.out"
      }, 0.05);
    }

    // 2. O Extintor 3D aproxima de verdade até bater/preencher 100% da tela (sem círculo vermelho)
    if (mv) {
      tl.to(cameraState, {
        theta: 180,
        radius: 5,
        fov: 2,
        duration: 0.76,
        ease: "power2.in",
        onUpdate: () => {
          mv.cameraOrbit = `${cameraState.theta.toFixed(1)}deg 84deg ${cameraState.radius.toFixed(1)}%`;
          mv.fieldOfView = `${cameraState.fov.toFixed(1)}deg`;
        }
      }, 0.02);
    }

    if (stage) {
      tl.to(stage, {
        y: 0,
        scale: isMobile ? 4.8 : 5.8,
        duration: 0.76,
        ease: "power2.in"
      }, 0.02);

      // 3. No exato momento em que o extintor preenche a tela inteira, dissolve para revelar o Footer
      tl.to(stage, {
        opacity: 0,
        duration: 0.16,
        ease: "power1.inOut"
      }, 0.78);
    }

    // 4. Revelação suave do Footer (bidirecional)
    tl.fromTo(footer, 
      { opacity: 0, visibility: 'hidden', pointerEvents: 'none' },
      { opacity: 1, visibility: 'visible', pointerEvents: 'auto', duration: 0.20, ease: "power2.out" },
      0.78
    )
    .fromTo('.footer-brand, .footer-col, .footer-mobile-wa-bar', 
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, stagger: 0.03, duration: 0.18, ease: "power2.out" },
      0.80
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

        const top = target.getBoundingClientRect().top + window.scrollY - 70;
        window.scrollTo({ top, behavior: 'smooth' });
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
     12. EVENTOS PASSIVOS UNIFICADOS DE SCROLL & RESIZE (Zero Forced Reflow)
     ------------------------------------------------------------------------ */
  let scrollPending = false;
  window.addEventListener('scroll', () => {
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => {
      updateCanvasFrameTarget();
      handleHeaderScroll();
      handleBackToTop();
      scrollPending = false;
    });
  }, { passive: true });

  let resizeTimeout;
  let lastWinWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const currentWidth = window.innerWidth;
      // Ignora variações apenas de barra de endereço no mobile para evitar recalcular pins pesados durante o scroll
      if (Math.abs(currentWidth - lastWinWidth) > 2) {
        lastWinWidth = currentWidth;
        isMobileSize = checkMobile();
        resizeCanvas();
        ScrollTrigger.refresh();
        updateCachedScrollMetrics();
      }
    }, 220);
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