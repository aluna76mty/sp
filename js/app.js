/* ====================================
   MANOS DE SEDA — app.js
   Scroll-driven canvas frame renderer
   ==================================== */

(function () {
  "use strict";

  /* ── CONFIG ── */
  const FRAME_COUNT  = 192;
  const FRAME_SPEED  = 2.0;   // 1.8–2.2: higher = animation completes earlier
  const IMAGE_SCALE  = 1.20;  // zoom in 20% to crop watermark at edges
  const FRAME_PREFIX = "frames/frame_";
  const FRAME_EXT    = ".webp";
  const DARK_ENTER   = 0.57;
  const DARK_LEAVE   = 0.71;

  /* ── ELEMENTS ── */
  const loader      = document.getElementById("loader");
  const loaderBar   = document.getElementById("loader-bar");
  const loaderPct   = document.getElementById("loader-percent");
  const hero        = document.getElementById("hero");
  const canvasWrap  = document.getElementById("canvas-wrap");
  const canvas      = document.getElementById("canvas");
  const ctx         = canvas.getContext("2d");
  const darkOverlay = document.getElementById("dark-overlay");
  const scrollCont  = document.getElementById("scroll-container");
  const marquee1    = document.getElementById("marquee1");
  const header      = document.getElementById("site-header");

  /* ── STATE ── */
  const frames    = new Array(FRAME_COUNT).fill(null);
  let currentFrame  = 0;
  let bgColor       = "#080c17";
  let loadedCount   = 0;
  let allReady      = false;
  let lenis;

  /* ──────────────────────────────────────
     CANVAS RESIZE
  ────────────────────────────────────── */
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = window.innerWidth  * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width  = window.innerWidth  + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.scale(dpr, dpr);
    drawFrame(currentFrame);
  }

  window.addEventListener("resize", resizeCanvas);

  /* ──────────────────────────────────────
     CANVAS DRAW (padded-cover + zoom)
  ────────────────────────────────────── */
  function sampleBgColor(img) {
    // Sample corner pixel from a tiny offscreen canvas
    const tmp = document.createElement("canvas");
    tmp.width = tmp.height = 2;
    const tc  = tmp.getContext("2d");
    tc.drawImage(img, 0, 0, 2, 2);
    try {
      const d = tc.getImageData(0, 0, 1, 1).data;
      bgColor = `rgb(${d[0]},${d[1]},${d[2]})`;
    } catch (e) { /* cross-origin guard */ }
  }

  function drawFrame(index) {
    const img = frames[index];
    if (!img) return;

    const cw = window.innerWidth;
    const ch = window.innerHeight;
    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    // Cover scale then multiply by IMAGE_SCALE to zoom in and hide watermark
    const scale = Math.max(cw / iw, ch / ih) * IMAGE_SCALE;
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (cw - dw) / 2;
    const dy = (ch - dh) / 2;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, dx, dy, dw, dh);
  }

  /* ──────────────────────────────────────
     FRAME PRELOADER
  ────────────────────────────────────── */
  function padded(n) {
    return String(n).padStart(4, "0");
  }

  function loadFrame(index) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        frames[index] = img;
        loadedCount++;
        if (index % 20 === 0) sampleBgColor(img);
        const pct = Math.round((loadedCount / FRAME_COUNT) * 100);
        loaderBar.style.width = pct + "%";
        loaderPct.textContent = pct + "%";
        resolve();
      };
      img.onerror = resolve; // don't stall on missing frame
      img.src = FRAME_PREFIX + padded(index + 1) + FRAME_EXT;
    });
  }

  async function preloadFrames() {
    resizeCanvas();

    // Phase 1: first 10 frames fast (for first paint)
    const phase1 = [];
    for (let i = 0; i < Math.min(10, FRAME_COUNT); i++) phase1.push(loadFrame(i));
    await Promise.all(phase1);
    drawFrame(0);

    // Phase 2: remaining frames
    const phase2 = [];
    for (let i = 10; i < FRAME_COUNT; i++) phase2.push(loadFrame(i));
    await Promise.all(phase2);

    allReady = true;
    hideLoader();
    initScrollScene();
  }

  function hideLoader() {
    loader.classList.add("hidden");
  }

  /* ──────────────────────────────────────
     LENIS SMOOTH SCROLL
  ────────────────────────────────────── */
  function initLenis() {
    lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
    });
    window.__lenis = lenis; // expose for debugging
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  /* ──────────────────────────────────────
     HEADER SCROLL CLASS
  ────────────────────────────────────── */
  function initHeader() {
    window.addEventListener("scroll", () => {
      if (window.scrollY > 60) header.classList.add("scrolled");
      else header.classList.remove("scrolled");
    }, { passive: true });
  }

  /* ──────────────────────────────────────
     INIT ALL SCROLL SCENES
  ────────────────────────────────────── */
  function initScrollScene() {
    gsap.registerPlugin(ScrollTrigger);
    initLenis();
    initHeader();
    initHeroTransition();
    initFrameScrub();
    initDarkOverlay();
    initMarquee();
    initSections();
    initCounters();
  }

  /* ──────────────────────────────────────
     HERO → CANVAS CIRCLE WIPE
  ────────────────────────────────────── */
  function initHeroTransition() {
    ScrollTrigger.create({
      trigger: scrollCont,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate(self) {
        const p = self.progress;

        // Hero fades out quickly
        const heroOpacity = Math.max(0, 1 - p * 18);
        hero.style.opacity = heroOpacity;

        // Canvas reveals via expanding circle clip
        const wipeP = Math.min(1, Math.max(0, (p - 0.005) / 0.07));
        const radius = wipeP * 80;
        canvasWrap.style.clipPath = `circle(${radius}% at 50% 50%)`;
      },
    });
  }

  /* ──────────────────────────────────────
     FRAME SCRUBBING
  ────────────────────────────────────── */
  function initFrameScrub() {
    ScrollTrigger.create({
      trigger: scrollCont,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate(self) {
        const accelerated = Math.min(self.progress * FRAME_SPEED, 1);
        const index = Math.min(
          Math.floor(accelerated * FRAME_COUNT),
          FRAME_COUNT - 1
        );
        if (index !== currentFrame) {
          currentFrame = index;
          requestAnimationFrame(() => drawFrame(currentFrame));
        }
      },
    });
  }

  /* ──────────────────────────────────────
     DARK OVERLAY
  ────────────────────────────────────── */
  function initDarkOverlay() {
    const fadeRange = 0.04;
    ScrollTrigger.create({
      trigger: scrollCont,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate(self) {
        const p = self.progress;
        let opacity = 0;
        if (p >= DARK_ENTER - fadeRange && p <= DARK_ENTER) {
          opacity = (p - (DARK_ENTER - fadeRange)) / fadeRange;
        } else if (p > DARK_ENTER && p < DARK_LEAVE) {
          opacity = 0.91;
        } else if (p >= DARK_LEAVE && p <= DARK_LEAVE + fadeRange) {
          opacity = 0.91 * (1 - (p - DARK_LEAVE) / fadeRange);
        }
        darkOverlay.style.opacity = opacity;
      },
    });
  }

  /* ──────────────────────────────────────
     MARQUEE
  ────────────────────────────────────── */
  function initMarquee() {
    const speed = parseFloat(marquee1.dataset.scrollSpeed) || -30;
    gsap.to(marquee1.querySelector(".marquee-text"), {
      xPercent: speed,
      ease: "none",
      scrollTrigger: {
        trigger: scrollCont,
        start: "top top",
        end: "bottom bottom",
        scrub: true,
      },
    });

    // Fade marquee in/out
    ScrollTrigger.create({
      trigger: scrollCont,
      start: "top top",
      end: "bottom bottom",
      scrub: true,
      onUpdate(self) {
        const p = self.progress;
        let op = 0;
        if (p > 0.18 && p < 0.22) op = (p - 0.18) / 0.04;
        else if (p >= 0.22 && p <= 0.82) op = 1;
        else if (p > 0.82 && p < 0.86) op = 1 - (p - 0.82) / 0.04;
        marquee1.style.opacity = op;
      },
    });
  }

  /* ──────────────────────────────────────
     SECTION ANIMATIONS
  ────────────────────────────────────── */
  function positionSections() {
    const totalH = scrollCont.offsetHeight;
    document.querySelectorAll(".scroll-section").forEach((sec) => {
      const enter = parseFloat(sec.dataset.enter) / 100;
      const leave = parseFloat(sec.dataset.leave) / 100;
      const mid   = (enter + leave) / 2;
      sec.style.top = mid * 100 + "%";
    });
  }

  function setupSectionAnimation(section) {
    const type    = section.dataset.animation || "fade-up";
    const persist = section.dataset.persist === "true";
    const enter   = parseFloat(section.dataset.enter) / 100;
    const leave   = parseFloat(section.dataset.leave) / 100;

    const children = section.querySelectorAll(
      ".section-label, .section-heading, .section-body, .section-note, " +
      ".cta-button, .cta-phone, .stat, .service-item"
    );

    const tl = gsap.timeline({ paused: true });

    switch (type) {
      case "fade-up":
        tl.from(children, { y: 48, opacity: 0, stagger: 0.12, duration: 0.9, ease: "power3.out" });
        break;
      case "slide-left":
        tl.from(children, { x: -70, opacity: 0, stagger: 0.13, duration: 0.9, ease: "power3.out" });
        break;
      case "slide-right":
        tl.from(children, { x: 70, opacity: 0, stagger: 0.13, duration: 0.9, ease: "power3.out" });
        break;
      case "scale-up":
        tl.from(children, { scale: 0.86, opacity: 0, stagger: 0.12, duration: 1.0, ease: "power2.out" });
        break;
      case "rotate-in":
        tl.from(children, { y: 38, rotation: 2.5, opacity: 0, stagger: 0.1, duration: 0.9, ease: "power3.out" });
        break;
      case "stagger-up":
        tl.from(children, { y: 55, opacity: 0, stagger: 0.14, duration: 0.85, ease: "power3.out" });
        break;
      case "clip-reveal":
        tl.from(children, {
          clipPath: "inset(100% 0 0 0)",
          opacity: 0,
          stagger: 0.15,
          duration: 1.1,
          ease: "power4.inOut",
        });
        break;
      default:
        tl.from(children, { opacity: 0, stagger: 0.1, duration: 0.8, ease: "power2.out" });
    }

    let playedOnce = false;

    ScrollTrigger.create({
      trigger: scrollCont,
      start: "top top",
      end: "bottom bottom",
      scrub: false,
      onUpdate(self) {
        const p = self.progress;

        if (p >= enter && p <= leave) {
          section.classList.add("is-visible");
          section.style.opacity = "1";
          if (!playedOnce) {
            tl.restart();
            playedOnce = true;
          }
        } else {
          if (persist && playedOnce && p > leave) {
            // keep visible after leaving
            section.style.opacity = "1";
          } else {
            section.style.opacity = "0";
            section.classList.remove("is-visible");
            if (!persist) playedOnce = false;
          }
        }
      },
    });
  }

  function initSections() {
    positionSections();
    document.querySelectorAll(".scroll-section").forEach(setupSectionAnimation);
  }

  /* ──────────────────────────────────────
     COUNTER ANIMATIONS
  ────────────────────────────────────── */
  function initCounters() {
    document.querySelectorAll(".stat-number").forEach((el) => {
      const target   = parseFloat(el.dataset.value);
      const decimals = parseInt(el.dataset.decimals || "0");
      const section  = el.closest(".scroll-section");
      const enter    = parseFloat(section.dataset.enter) / 100;

      let triggered = false;

      ScrollTrigger.create({
        trigger: scrollCont,
        start: "top top",
        end: "bottom bottom",
        onUpdate(self) {
          if (self.progress >= enter && !triggered) {
            triggered = true;
            gsap.fromTo(
              el,
              { textContent: 0 },
              {
                textContent: target,
                duration: 2.2,
                ease: "power1.out",
                snap: { textContent: decimals === 0 ? 1 : 0.01 },
                onUpdate() {
                  el.textContent =
                    decimals === 0
                      ? Math.round(parseFloat(el.textContent))
                      : parseFloat(el.textContent).toFixed(decimals);
                },
              }
            );
          }
          if (self.progress < enter - 0.03) triggered = false;
        },
      });
    });
  }

  /* ──────────────────────────────────────
     BOOT
  ────────────────────────────────────── */
  preloadFrames();
})();
