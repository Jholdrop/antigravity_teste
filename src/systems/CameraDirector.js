/**
 * CameraDirector — Controla shake, zoom, aberração cromática e outros efeitos de câmera.
 * Funciona atualizando CSS custom properties num elemento wrapper.
 */

const lerp = (a, b, t) => a + (b - a) * t;

export class CameraDirector {
  constructor(containerRef) {
    this.el = containerRef;
    this.state = {
      shakeX: 0, shakeY: 0,
      zoom: 1,
      aberration: 0,
      brightness: 1,
      hue: 0,
    };
    this.impulses = [];
    this._raf = null;
    this._tick = this._tick.bind(this);
  }

  start() {
    this._raf = requestAnimationFrame(this._tick);
  }

  stop() {
    cancelAnimationFrame(this._raf);
  }

  // ── Shake ──
  shake(intensity = 12, duration = 400, decayPower = 2) {
    this.impulses.push({ type: 'shake', intensity, duration, elapsed: 0, decayPower });
  }

  // ── Zoom ──
  zoomTo(scale, duration = 300) {
    this.impulses.push({ type: 'zoom', target: scale, duration, elapsed: 0, from: this.state.zoom });
  }

  // ── Chromatic aberration flash ──
  chromaticFlash(intensity = 6, duration = 250) {
    this.impulses.push({ type: 'aberration', intensity, duration, elapsed: 0 });
  }

  // ── Brightness flash (hit flash) ──
  brightnessFlash(peak = 2.5, duration = 180) {
    this.impulses.push({ type: 'brightness', peak, duration, elapsed: 0 });
  }

  // ── Hue rotate (electric hit etc) ──
  hueFlash(deg = 60, duration = 200) {
    this.impulses.push({ type: 'hue', deg, duration, elapsed: 0 });
  }

  _tick(ts) {
    if (!this._lastTs) this._lastTs = ts;
    const dt = Math.min(ts - this._lastTs, 50);
    this._lastTs = ts;

    // Reset per-frame volatile state
    let shakeX = 0, shakeY = 0, zoomDelta = 1, aberration = 0, brightness = 1, hue = 0;

    this.impulses = this.impulses.filter(imp => {
      imp.elapsed += dt;
      const p = Math.min(imp.elapsed / imp.duration, 1); // 0..1

      if (imp.type === 'shake') {
        const decay = Math.pow(1 - p, imp.decayPower);
        shakeX += (Math.random() - 0.5) * 2 * imp.intensity * decay;
        shakeY += (Math.random() - 0.5) * 2 * imp.intensity * decay;
        return p < 1;
      }

      if (imp.type === 'zoom') {
        const eased = easeOutBack(p);
        zoomDelta = lerp(imp.from, imp.target, eased);
        this.state.zoom = zoomDelta;
        return p < 1;
      }

      if (imp.type === 'aberration') {
        const curve = Math.sin(p * Math.PI); // peaks in middle
        aberration = imp.intensity * curve;
        return p < 1;
      }

      if (imp.type === 'brightness') {
        const curve = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
        brightness = lerp(1, imp.peak, curve);
        return p < 1;
      }

      if (imp.type === 'hue') {
        const curve = p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8;
        hue = imp.deg * curve;
        return p < 1;
      }

      return false;
    });

    if (this.el?.current) {
      const el = this.el.current;
      const transform = `translate(${shakeX.toFixed(2)}px, ${shakeY.toFixed(2)}px) scale(${this.state.zoom.toFixed(4)})`;
      let filter = `brightness(${brightness.toFixed(3)})`;
      if (hue !== 0) filter += ` hue-rotate(${hue.toFixed(1)}deg)`;
      el.style.transform = transform;
      el.style.filter = filter;

      // Chromatic aberration via pseudo-element CSS var
      el.style.setProperty('--aberration', `${aberration.toFixed(2)}px`);
    }

    this._raf = requestAnimationFrame(this._tick);
  }
}

// ── Easings ──
function easeOutBack(t) {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
