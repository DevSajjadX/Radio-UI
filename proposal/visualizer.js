// Hero visualizer, drawn on a canvas so it can use real gradients and glow:
// "wave"  — soft, layered waves in the channel colour with a bright signal line, fading out to both sides;
// "pulse" — gradient ripples that leave the core like sonar, faster while tuning.
// Motion eases between the idle, tuning and playing states instead of switching abruptly.

const TAU = Math.PI * 2;

// Close hue shifts keep the waves in one colour family instead of a rainbow.
const WAVES = [
  { hueShift: 0, freq: 1.1, speed: 0.55, amp: 1, seed: 0.4 },
  { hueShift: 16, freq: 1.5, speed: -0.7, amp: 0.78, seed: 1.9 },
  { hueShift: -18, freq: 0.9, speed: 0.42, amp: 0.88, seed: 3.3 },
];

// What each player state asks of the motion: overall energy and pace.
// Idle keeps half the height: squashed any lower, the layered lines collapse into a flat,
// glitchy-looking strip. It reads as "resting" through slower motion instead.
const TARGETS = {
  idle: { energy: 0.5, speed: 0.35 },
  loading: { energy: 0.72, speed: 1.9 },
  playing: { energy: 1, speed: 1 },
};

const RIPPLE_EVERY = 2.1;
const RIPPLE_LIFE = 15;

const ease = (current, target, dt, rate) => current + (target - current) * (1 - Math.exp(-dt * rate));
const hsla = (hue, s, l, a) => `hsla(${hue}, ${s}%, ${l}%, ${a})`;

export function createVisualizer(panel) {
  const canvas = panel.querySelector('.visualizer-canvas');
  const core = panel.querySelector('.signal-core');
  const ctx = canvas.getContext('2d');
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let width = 0;
  let height = 0;
  let scale = 1;
  let cx = 0;
  let cy = 0;
  let coreRadius = 50;
  let frame = 0;
  let last = 0;
  let time = 0;
  let onScreen = true;
  let nextRipple = 0;
  const ripples = [];
  const live = { energy: 0.5, speed: 0.35, waveMix: panel.dataset.visualizer === 'pulse' ? 0 : 1 };

  const playerState = () => document.body.classList.contains('loading') ? 'loading'
    : document.body.classList.contains('playing') ? 'playing' : 'idle';

  function measure() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Scale strokes with the panel so phones and desktops feel equally bold.
    scale = Math.max(0.7, Math.min(1.25, Math.min(width, height) / 300));
    cx = core.offsetLeft + core.offsetWidth / 2;
    cy = core.offsetTop + core.offsetHeight / 2;
    coreRadius = core.offsetWidth / 2;
  }

  function drawWave(hue, alpha) {
    const amplitude = Math.min(height * 0.17, width * 0.2) * live.energy;
    const step = 3;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'screen';

    // a quiet baseline so the idle state still reads as a signal
    const base = ctx.createLinearGradient(0, 0, width, 0);
    base.addColorStop(0, 'rgba(255,255,255,0)');
    base.addColorStop(0.5, `rgba(255,255,255,${0.35 * (1 - live.energy) + 0.12})`);
    base.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = base;
    ctx.fillRect(0, cy - 0.75 * scale, width, 1.5 * scale);

    for (const wave of WAVES) {
      const breathe = 0.78 + 0.22 * Math.sin(time * 0.5 + wave.seed * 2.1);
      const amp = amplitude * wave.amp * breathe;
      const phase = time * wave.speed + wave.seed;
      const color = hue + wave.hueShift;
      const yAt = (x) => {
        const u = x / width;
        const envelope = Math.sin(Math.PI * u) ** 0.7;
        return amp * envelope * Math.sin(TAU * wave.freq * u + phase);
      };

      // the lens between the wave and its mirror, filled with a gradient that glows at the crests
      ctx.beginPath();
      for (let x = 0; x <= width; x += step) ctx.lineTo(x, cy - yAt(x));
      for (let x = width; x >= 0; x -= step) ctx.lineTo(x, cy + yAt(x));
      ctx.closePath();
      const fill = ctx.createLinearGradient(0, cy - amp, 0, cy + amp);
      fill.addColorStop(0, hsla(color, 50, 90, 0.17));
      fill.addColorStop(0.5, hsla(color, 40, 82, 0.025));
      fill.addColorStop(1, hsla(color, 50, 90, 0.17));
      ctx.fillStyle = fill;
      // a slight blur keeps the bodies soft, so only the lines read clearly
      ctx.filter = `blur(${1.5 * scale}px)`;
      ctx.fill();
      ctx.filter = 'none';

      // crisp edges, fading out toward both ends
      const edge = ctx.createLinearGradient(0, 0, width, 0);
      edge.addColorStop(0, hsla(color, 60, 92, 0));
      edge.addColorStop(0.5, hsla(color, 55, 95, 0.3));
      edge.addColorStop(1, hsla(color, 60, 92, 0));
      ctx.strokeStyle = edge;
      ctx.lineWidth = 2.2 * scale;
      for (const sign of [-1, 1]) {
        ctx.beginPath();
        for (let x = 0; x <= width; x += step) ctx.lineTo(x, cy + sign * yAt(x));
        ctx.stroke();
      }
    }

    // the bright signal line running through the middle
    const line = ctx.createLinearGradient(0, 0, width, 0);
    line.addColorStop(0, 'rgba(255,255,255,0)');
    line.addColorStop(0.3, 'rgba(255,255,255,0.38)');
    line.addColorStop(0.7, 'rgba(255,255,255,0.38)');
    line.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = line;
    ctx.lineWidth = 3 * scale;
    ctx.lineCap = 'round';
    ctx.shadowColor = hsla(hue, 60, 90, 0.4);
    ctx.shadowBlur = 10 * scale;
    ctx.beginPath();
    for (let x = 0; x <= width; x += step) {
      const u = x / width;
      const y = amplitude * 0.6 * Math.sin(Math.PI * u) ** 0.8 * Math.sin(TAU * 1.25 * u - time * 1.1);
      ctx.lineTo(x, cy - y);
    }
    ctx.stroke();

    // fade everything out toward the left and right edges
    const sides = ctx.createLinearGradient(0, 0, width, 0);
    // a long, gradual fade so the wave dissolves into the panel rather than ending
    sides.addColorStop(0, 'rgba(0,0,0,0)');
    sides.addColorStop(0.08, 'rgba(0,0,0,0.15)');
    sides.addColorStop(0.28, 'rgba(0,0,0,1)');
    sides.addColorStop(0.72, 'rgba(0,0,0,1)');
    sides.addColorStop(0.92, 'rgba(0,0,0,0.15)');
    sides.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = sides;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }

  function drawRipples(hue, alpha) {
    const maxRadius = Math.hypot(width, height) / 2;
    const base = coreRadius + 6 * scale;

    if (time >= nextRipple || nextRipple - time > RIPPLE_EVERY) {
      ripples.push(time);
      nextRipple = time + RIPPLE_EVERY;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    for (let i = ripples.length - 1; i >= 0; i -= 1) {
      const progress = (time - ripples[i]) / RIPPLE_LIFE;
      if (progress >= 1 || progress < 0) { ripples.splice(i, 1); continue; }
      // a gentle ease out: leaves the core unhurried and slows a little toward the edges
      const radius = base + (maxRadius - base) * (1 - (1 - progress) ** 1.5);
      const fade = (1 - progress) ** 1.6 * Math.min(1, progress * 8);
      const strength = fade * (0.35 + 0.65 * live.energy);
      const band = (14 + 22 * progress) * scale;

      // a soft gradient band...
      const glow = ctx.createRadialGradient(cx, cy, Math.max(0, radius - band), cx, cy, radius + band);
      glow.addColorStop(0, hsla(hue, 70, 90, 0));
      glow.addColorStop(0.55, hsla(hue, 70, 92, 0.4 * strength));
      glow.addColorStop(0.62, `rgba(255,255,255,${0.55 * strength})`);
      glow.addColorStop(1, hsla(hue, 70, 90, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + band, 0, TAU);
      ctx.fill();

      // ...with a crisp leading edge
      ctx.strokeStyle = `rgba(255,255,255,${0.42 * strength})`;
      ctx.lineWidth = 2.6 * scale;
      ctx.beginPath();
      ctx.arc(cx, cy, radius + band * 0.24, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  // settle: jump straight to the target state (used for the reduced-motion still frame)
  function draw(dt, settle = false) {
    const target = TARGETS[playerState()];
    const waveTarget = panel.dataset.visualizer === 'pulse' ? 0 : 1;
    if (settle) {
      Object.assign(live, target, { waveMix: waveTarget });
    } else {
      live.energy = ease(live.energy, target.energy, dt, 3.2);
      live.speed = ease(live.speed, target.speed, dt, 3.2);
      live.waveMix = ease(live.waveMix, waveTarget, dt, 6);
    }
    time += dt * live.speed;

    const hue = parseFloat(getComputedStyle(root).getPropertyValue('--active-hue')) || 16;
    ctx.clearRect(0, 0, width, height);
    if (live.waveMix > 0.01) drawWave(hue, live.waveMix);
    if (live.waveMix < 0.99) drawRipples(hue, 1 - live.waveMix);
  }

  function loop(now) {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    draw(dt);
    frame = window.requestAnimationFrame(loop);
  }

  function start() {
    if (frame || reducedMotion.matches || !onScreen || document.hidden) return;
    last = 0;
    frame = window.requestAnimationFrame(loop);
  }

  function stop() {
    window.cancelAnimationFrame(frame);
    frame = 0;
  }

  // With reduced motion, draw a single settled frame whenever something changes.
  function refresh() {
    if (reducedMotion.matches) {
      stop();
      time = 5;
      // a still frame needs ripples already on their way out
      ripples.splice(0, ripples.length, time - 0.8, time - 2.2);
      nextRipple = time + RIPPLE_EVERY / 2;
      draw(0, true);
    } else {
      start();
    }
  }

  new ResizeObserver(() => { measure(); refresh(); if (frame) draw(0); }).observe(panel);
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    if (onScreen) refresh(); else stop();
  }).observe(panel);
  new MutationObserver(refresh).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(refresh).observe(panel, { attributes: true, attributeFilter: ['data-visualizer'] });
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : refresh()));
  reducedMotion.addEventListener('change', refresh);
  // the hue cross-fades over 700ms; keep the still frame in step with it
  root.addEventListener('transitionend', () => reducedMotion.matches && draw(0, true));

  measure();
  refresh();
}
