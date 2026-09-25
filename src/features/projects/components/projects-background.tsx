"use client";

import { useEffect, useRef } from "react";

const GOLD = "212, 170, 90";

// Half of the home content column's width (`max-w-2xl` = 672px in
// projects-view.tsx). Keep in sync so the pyramids stay beside the content.
const CONTENT_HALF_WIDTH = 336;

// #region Orion
// Positions in degrees relative to the constellation's center, derived from
// real RA/Dec (x = RA offset, flipped so east is left as seen in the sky;
// y = -Dec so north is up). `belt` marks the three stars matched to pyramids,
// ordered left→right to line up with Khufu, Khafre, Menkaure.
type Star = { x: number; y: number; r: number; color: string; belt?: number };

const ORION: Record<string, Star> = {
  meissa: { x: -0.3, y: -9.9, r: 1.2, color: "255, 255, 255" },
  betelgeuse: { x: -5.3, y: -7.4, r: 2.2, color: "255, 170, 120" },
  bellatrix: { x: 2.2, y: -6.3, r: 1.6, color: "220, 230, 255" },
  alnitak: { x: -1.7, y: 1.9, r: 1.8, color: GOLD, belt: 0 },
  alnilam: { x: -0.6, y: 1.2, r: 1.9, color: GOLD, belt: 1 },
  mintaka: { x: 0.5, y: 0.3, r: 1.7, color: GOLD, belt: 2 },
  saiph: { x: -3.4, y: 9.7, r: 1.6, color: "220, 230, 255" },
  rigel: { x: 4.9, y: 8.2, r: 2.1, color: "200, 220, 255" },
};

const ORION_LINES: [string, string][] = [
  ["meissa", "betelgeuse"],
  ["meissa", "bellatrix"],
  ["betelgeuse", "alnitak"],
  ["bellatrix", "mintaka"],
  ["alnitak", "alnilam"],
  ["alnilam", "mintaka"],
  ["alnitak", "saiph"],
  ["mintaka", "rigel"],
];
// #endregion

type BgStar = {
  x: number;
  y: number;
  r: number;
  alpha: number;
  phase: number;
  speed: number;
  tint: string;
  // ~7% of stars are "sparklers" that periodically flare with light spikes.
  sparkle: boolean;
};
type Pyramid = { cx: number; base: number; width: number; height: number };
type ShootingStar = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
};

const NightSky = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let width = 0;
    let height = 0;
    let horizon = 0;
    let groupX = 0;
    let scale = 0;
    let orionY = 0;
    let stars: BgStar[] = [];
    let pyramids: Pyramid[] = [];
    let shooting: ShootingStar[] = [];
    let nextShootingAt = 1.5;
    let frame = 0;

    const orionPoint = (s: Star) => ({
      x: groupX + s.x * scale,
      y: orionY + s.y * scale,
    });

    // #region Layout
    // Everything is laid out relative to the viewport. On desktop the
    // Orion + pyramids group is sized to fit the free space to the right of
    // the centered content column (CONTENT_HALF_WIDTH) so the cards never
    // cover the pyramids. When that space is too narrow (small laptops,
    // phones) the group falls back to the middle, behind the content.
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      horizon = height;
      // The pyramids overlap like in photos of Giza, so the group is compact:
      // Khufu's peak sits 0.5b left of groupX and Menkaure's right edge
      // 1.08b right of it. Only Khufu's peak must clear the content column
      // (its lower left slope may tuck behind the cards); Menkaure's right
      // edge must stay on screen. Solve for the largest b meeting both.
      const peakMinX = width / 2 + CONTENT_HALF_WIDTH + 40;
      const fitB = (width - 16 - peakMinX) / 1.58;
      const fitsBeside = fitB >= 180;
      const b = fitsBeside
        ? Math.min(460, fitB)
        : Math.max(160, Math.min(width * 0.2, 360));
      groupX = fitsBeside
        ? width - 16 - b * 1.08
        : width < 768
          ? width * 0.5
          : Math.min(width * 0.78, width - b * 1.08 - 16);
      scale = Math.min(width, height) * 0.02;
      orionY = height * 0.34;

      const count = Math.min(500, Math.floor((width * horizon) / 3000));
      stars = Array.from({ length: count }, () => {
        const roll = Math.random();
        return {
          x: Math.random() * width,
          y: Math.random() * horizon,
          r: Math.random() * 0.9 + 0.2,
          alpha: Math.random() * 0.5 + 0.15,
          phase: Math.random() * Math.PI * 2,
          speed: Math.random() * 0.8 + 0.2,
          tint:
            roll < 0.08
              ? "255, 220, 180"
              : roll < 0.16
                ? "200, 215, 255"
                : "255, 255, 255",
          sparkle: Math.random() < 0.07,
        };
      });

      // A bit steeper than the real ~0.62 height/base so they read as more
      // monumental; Menkaure is slightly enlarged (real ≈ 0.45 of Khufu) so it
      // holds its own at the right edge. Khafre stands on higher ground, so it reads nearly as
      // tall as Khufu; each pyramid is drawn after (in front of) the previous.
      pyramids = [
        { cx: groupX - b * 0.5, base: horizon, width: b, height: b * 0.78 },
        {
          cx: groupX + b * 0.25,
          base: horizon,
          width: b * 0.93,
          height: b * 0.75,
        },
        {
          cx: groupX + b * 0.83,
          base: horizon,
          width: b * 0.5,
          height: b * 0.5 * 0.78,
        },
      ];
    };
    // #endregion

    const drawPyramid = (p: Pyramid) => {
      const apexX = p.cx;
      const apexY = p.base - p.height;
      const left = p.cx - p.width / 2;
      const right = p.cx + p.width / 2;
      // The visible corner edge, slightly right of center (we see two faces).
      const edgeX = p.cx + p.width * 0.12;

      // Lit face (left), catching the gold horizon light.
      const lit = ctx.createLinearGradient(apexX, apexY, apexX, p.base);
      lit.addColorStop(0, "rgb(74, 60, 46)");
      lit.addColorStop(1, "rgb(36, 30, 30)");
      ctx.fillStyle = lit;
      ctx.beginPath();
      ctx.moveTo(apexX, apexY);
      ctx.lineTo(left, p.base);
      ctx.lineTo(edgeX, p.base);
      ctx.closePath();
      ctx.fill();

      // Shadow face (right).
      ctx.fillStyle = "rgb(20, 18, 24)";
      ctx.beginPath();
      ctx.moveTo(apexX, apexY);
      ctx.lineTo(edgeX, p.base);
      ctx.lineTo(right, p.base);
      ctx.closePath();
      ctx.fill();

      // Moonlit ridges fading towards the ground.
      const ridge = ctx.createLinearGradient(apexX, apexY, apexX, p.base);
      ridge.addColorStop(0, `rgba(${GOLD}, 0.7)`);
      ridge.addColorStop(1, `rgba(${GOLD}, 0)`);
      ctx.strokeStyle = ridge;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(left, p.base);
      ctx.lineTo(apexX, apexY);
      ctx.lineTo(edgeX, p.base);
      ctx.stroke();
    };

    // #region Sparkle
    // A four-point "glint": a halo plus two thin crossing spikes whose length
    // and brightness scale with `flash` (0–1). Used for the shiny flashes on
    // Orion's stars and on the sparkler stars in the field.
    const drawSparkle = (
      x: number,
      y: number,
      size: number,
      color: string,
      flash: number,
    ) => {
      if (flash <= 0.01) return;
      const halo = ctx.createRadialGradient(x, y, 0, x, y, size * 0.6);
      halo.addColorStop(0, `rgba(${color}, ${0.5 * flash})`);
      halo.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
      ctx.fill();

      const spike = size * flash;
      ctx.lineWidth = 1;
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
      ]) {
        const g = ctx.createLinearGradient(
          x - dx * spike,
          y - dy * spike,
          x + dx * spike,
          y + dy * spike,
        );
        g.addColorStop(0, `rgba(${color}, 0)`);
        g.addColorStop(0.5, `rgba(255, 255, 255, ${0.9 * flash})`);
        g.addColorStop(1, `rgba(${color}, 0)`);
        ctx.strokeStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - dx * spike, y - dy * spike);
        ctx.lineTo(x + dx * spike, y + dy * spike);
        ctx.stroke();
      }
    };
    // #endregion

    const draw = (time: number) => {
      const t = time / 1000;
      ctx.clearRect(0, 0, width, height);

      // Starfield — each star twinkles on its own slow sine wave.
      for (const s of stars) {
        const twinkle = reducedMotion
          ? 1
          : 0.6 + 0.4 * Math.sin(t * s.speed + s.phase);
        ctx.fillStyle = `rgba(${s.tint}, ${s.alpha * twinkle})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();

        // Sparklers: sin^24 gives a brief flare roughly every 5–15s.
        if (s.sparkle && !reducedMotion) {
          const flash =
            Math.max(0, Math.sin(t * s.speed * 0.5 + s.phase)) ** 24;
          drawSparkle(s.x, s.y, 12, s.tint, flash);
        }
      }

      // Orion's figure lines.
      ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
      ctx.lineWidth = 0.7;
      for (const [a, b] of ORION_LINES) {
        const pa = orionPoint(ORION[a]);
        const pb = orionPoint(ORION[b]);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y);
        ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }

      // Orion's stars, with a soft halo; the belt pulses gently in gold and
      // the others flash shiny glints in turn (staggered by index).
      for (const [index, star] of Object.values(ORION).entries()) {
        const { x, y } = orionPoint(star);
        const isBelt = star.belt !== undefined;
        const pulse =
          isBelt && !reducedMotion
            ? 1 + 0.25 * Math.sin(t * 0.8 + (star.belt ?? 0))
            : 1;
        const haloR = star.r * 7 * pulse;
        const halo = ctx.createRadialGradient(x, y, 0, x, y, haloR);
        halo.addColorStop(0, `rgba(${star.color}, ${isBelt ? 0.35 : 0.2})`);
        halo.addColorStop(1, `rgba(${star.color}, 0)`);
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(x, y, haloR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = `rgba(${star.color}, 0.95)`;
        ctx.beginPath();
        ctx.arc(x, y, star.r, 0, Math.PI * 2);
        ctx.fill();

        if (!isBelt && !reducedMotion) {
          const flash = Math.max(0, Math.sin(t * 0.9 + index * 2.1)) ** 16;
          drawSparkle(x, y, star.r * 12, star.color, flash);
        }
      }

      // #region Shooting stars
      // Spawned in the upper sky every 3–7s (at most two alive), travelling
      // down-left with a bright head and a long fading tail.
      if (!reducedMotion) {
        if (shooting.length < 2 && t > nextShootingAt) {
          shooting.push({
            x: width * (0.2 + Math.random() * 0.8),
            y: height * Math.random() * 0.4,
            vx: -(9 + Math.random() * 6),
            vy: 3.5 + Math.random() * 3,
            life: 1,
          });
          nextShootingAt = t + 3 + Math.random() * 4;
        }
        shooting = shooting.filter((s) => {
          const tailX = s.x - s.vx * 24;
          const tailY = s.y - s.vy * 24;
          const tail = ctx.createLinearGradient(s.x, s.y, tailX, tailY);
          tail.addColorStop(0, `rgba(255, 255, 255, ${0.95 * s.life})`);
          tail.addColorStop(0.3, `rgba(${GOLD}, ${0.4 * s.life})`);
          tail.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.strokeStyle = tail;
          ctx.lineWidth = 1.6;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(tailX, tailY);
          ctx.stroke();

          const head = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 6);
          head.addColorStop(0, `rgba(255, 255, 255, ${s.life})`);
          head.addColorStop(1, "rgba(255, 255, 255, 0)");
          ctx.fillStyle = head;
          ctx.beginPath();
          ctx.arc(s.x, s.y, 6, 0, Math.PI * 2);
          ctx.fill();

          s.x += s.vx;
          s.y += s.vy;
          s.life -= 0.012;
          return s.life > 0 && s.y < horizon && s.x > -300;
        });
      }
      // #endregion

      // Warm glow rising off the horizon.
      const glowTop = horizon - height * 0.3;
      const glow = ctx.createLinearGradient(0, glowTop, 0, horizon);
      glow.addColorStop(0, `rgba(${GOLD}, 0)`);
      glow.addColorStop(1, `rgba(${GOLD}, 0.07)`);
      ctx.fillStyle = glow;
      ctx.fillRect(0, glowTop, width, height * 0.3);

      // Pyramids, back to front (Menkaure is the nearest).
      for (const p of pyramids) drawPyramid(p);

      // #region Energy streams
      // Each belt star feeds its pyramid through a straight channel. Every 4.5s a pulse
      // leaves the star, accelerates down the curve (ease-in, as if pulled by
      // the pyramid), and on arrival the whole stream and the peak flash,
      // then decay exponentially. Streams are staggered by a third of a cycle.
      const CYCLE = 4.5;
      const TRAVEL = 0.55;
      for (const star of Object.values(ORION)) {
        if (star.belt === undefined) continue;
        const p = pyramids[star.belt];
        const from = orionPoint(star);
        const to = { x: p.cx, y: p.base - p.height };
        const at = (u: number) => ({
          x: from.x + (to.x - from.x) * u,
          y: from.y + (to.y - from.y) * u,
        });

        const phase = reducedMotion ? 1 : (t / CYCLE + star.belt / 3) % 1;
        const travelling = phase < TRAVEL;
        const progress = travelling ? (phase / TRAVEL) ** 2 : 1;
        const flash = travelling
          ? 0
          : Math.exp(-(phase - TRAVEL) * 14) * (reducedMotion ? 0.3 : 1);

        // The channel itself: barely there, lighting up on arrival.
        ctx.strokeStyle = `rgba(${GOLD}, ${0.06 + 0.35 * flash})`;
        ctx.lineWidth = 1 + 1.5 * flash;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();

        // The travelling pulse: a short comet whose tail fades behind it.
        if (travelling && !reducedMotion) {
          const STEPS = 14;
          const tailSpan = 0.2;
          for (let i = 0; i < STEPS; i++) {
            const u0 = progress - tailSpan * (1 - i / STEPS);
            const u1 = progress - tailSpan * (1 - (i + 1) / STEPS);
            if (u1 <= 0) continue;
            const a = at(Math.max(0, u0));
            const b = at(u1);
            ctx.strokeStyle = `rgba(255, 225, 160, ${((i + 1) / STEPS) ** 2 * 0.9})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
          const head = at(progress);
          const headGlow = ctx.createRadialGradient(
            head.x,
            head.y,
            0,
            head.x,
            head.y,
            7,
          );
          headGlow.addColorStop(0, "rgba(255, 240, 200, 0.95)");
          headGlow.addColorStop(1, `rgba(${GOLD}, 0)`);
          ctx.fillStyle = headGlow;
          ctx.beginPath();
          ctx.arc(head.x, head.y, 7, 0, Math.PI * 2);
          ctx.fill();
        }

        // The peak: a dim ember that flares when the energy lands.
        const glowR = 6 + 26 * flash;
        const peak = ctx.createRadialGradient(to.x, to.y, 0, to.x, to.y, glowR);
        peak.addColorStop(0, `rgba(255, 235, 180, ${0.35 + 0.65 * flash})`);
        peak.addColorStop(1, `rgba(${GOLD}, 0)`);
        ctx.fillStyle = peak;
        ctx.beginPath();
        ctx.arc(to.x, to.y, glowR, 0, Math.PI * 2);
        ctx.fill();
      }
      // #endregion

      if (!reducedMotion) frame = requestAnimationFrame(draw);
    };

    // Stop the loop while the tab is hidden instead of drawing into the void.
    const onVisibility = () => {
      cancelAnimationFrame(frame);
      if (!document.hidden && !reducedMotion) {
        frame = requestAnimationFrame(draw);
      }
    };
    // With reduced motion there is no loop, so redraw the still frame.
    const onResize = () => {
      resize();
      if (reducedMotion) draw(0);
    };

    resize();
    frame = requestAnimationFrame(draw);
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0" />;
};

export const ProjectsBackground = () => {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 overflow-hidden bg-[linear-gradient(to_bottom,oklch(0.09_0.015_264),oklch(0.14_0.02_264)_70%,oklch(0.16_0.02_60))]"
    >
      {/* Milky Way haze */}
      <div className="absolute left-1/2 top-1/2 h-[30vmax] w-[160vmax] -translate-x-1/2 -translate-y-1/2 -rotate-35 rounded-[100%] bg-white/3 blur-[80px]" />

      <NightSky />

      {/* Vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_45%,oklch(0.06_0.01_264/0.8)_100%)]" />
    </div>
  );
};
