import { useRef, useEffect } from 'react';

/* ── Type palette ── */
const T = {
  fire:     { r:255, g:90,  b:10,  style:'flame'     },
  water:    { r:20,  g:150, b:255, style:'jet'        },
  electric: { r:255, g:220, b:0,   style:'lightning'  },
  grass:    { r:50,  g:210, b:40,  style:'leaf'       },
  psychic:  { r:255, g:40,  b:170, style:'orb'        },
  ice:      { r:140, g:240, b:255, style:'crystal'    },
  dragon:   { r:130, g:50,  b:255, style:'orb'        },
  dark:     { r:60,  g:20,  b:90,  style:'shadow'     },
  ghost:    { r:100, g:50,  b:180, style:'shadow'     },
  rock:     { r:180, g:140, b:40,  style:'meteor'     },
  ground:   { r:210, g:150, b:40,  style:'meteor'     },
  fighting: { r:220, g:50,  b:30,  style:'wave'       },
  poison:   { r:180, g:40,  b:220, style:'orb'        },
  steel:    { r:180, g:200, b:220, style:'crystal'    },
  fairy:    { r:255, g:160, b:220, style:'sparkle'    },
  flying:   { r:160, g:180, b:255, style:'wave'       },
  bug:      { r:155, g:200, b:20,  style:'leaf'       },
  normal:   { r:200, g:200, b:200, style:'wave'       },
};

const rgba = (c, a=1, dr=0, dg=0, db=0) =>
  `rgba(${Math.min(255,c.r+dr)},${Math.min(255,c.g+dg)},${Math.min(255,c.b+db)},${a})`;

const clamp01 = (value) => Math.max(0, Math.min(1, value));

/* ═══════════════════════════════════════════════════════
   RENDERERS — cada um desenha um frame do seu efeito
   ctx, progress(0-1), cfg, W, H, fromPlayer, power, time
════════════════════════════════════════════════════════ */

function flame(ctx, p, c, W, H, fp, pw, time) {
  ctx.globalCompositeOperation = 'lighter';
  const count = Math.floor(7 + pw / 10);
  const sx = fp ? W * 0.18 : W * 0.82;
  const ex = fp ? W * 0.82 : W * 0.18;

  for (let i = 0; i < count; i++) {
    const phase = (p + i / count) % 1;
    const x = sx + (ex - sx) * phase;
    const flicker = Math.sin(time / 70 + i * 1.8) * (16 + pw / 14);
    const sz = (9 + pw / 9) * (1 - phase * 0.35);

    // Glow halo
    const g = ctx.createRadialGradient(x, H*.5+flicker, 0, x, H*.5+flicker, sz * 3);
    g.addColorStop(0, rgba(c, 0.5, 50, -60));
    g.addColorStop(0.45, rgba(c, 0.25));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, H*.5+flicker, sz*3, 0, Math.PI*2); ctx.fill();

    // Teardrop flame core
    ctx.save();
    ctx.translate(x, H*.5 + flicker);
    const fh = sz * 2.4;
    ctx.beginPath();
    ctx.moveTo(0, -fh);
    ctx.bezierCurveTo(sz*.65, -fh*.35, sz*.9, fh*.28, 0, fh*.6);
    ctx.bezierCurveTo(-sz*.9, fh*.28, -sz*.65, -fh*.35, 0, -fh);
    const fg = ctx.createLinearGradient(0, -fh, 0, fh*.6);
    fg.addColorStop(0, 'rgba(255,255,210,0.98)');
    fg.addColorStop(0.25, rgba(c, 0.95, 40));
    fg.addColorStop(0.7, rgba(c, 0.7));
    fg.addColorStop(1, rgba(c, 0, -10, -70));
    ctx.fillStyle = fg;
    ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function jet(ctx, p, c, W, H, fp, pw, time) {
  ctx.globalCompositeOperation = 'lighter';
  const sx = fp ? W*.18 : W*.82;
  const ex = fp ? W*.82 : W*.18;
  const tip = sx + (ex - sx) * p;
  const segs = Math.floor(28 + pw / 4);

  // Core stream
  for (let i = 0; i < segs; i++) {
    const st = i / segs;
    const cx2 = sx + (tip - sx) * st;
    const wave = Math.sin(st * Math.PI * 5 + time / 110) * (7 + pw / 18);
    const alpha = 0.65 - st * 0.2;
    const r = (5 + pw / 12) * (1 - st * 0.25);
    const g = ctx.createRadialGradient(cx2, H*.5+wave, 0, cx2, H*.5+wave, r*2.5);
    g.addColorStop(0, rgba(c, alpha+.2, 40, 40, 40));
    g.addColorStop(0.5, rgba(c, alpha));
    g.addColorStop(1, rgba(c, 0));
    ctx.beginPath(); ctx.arc(cx2, H*.5+wave, r*2.5, 0, Math.PI*2);
    ctx.fillStyle = g; ctx.fill();
  }

  // Tip burst + splash
  if (p > 0.82) {
    const sp = (p - 0.82) / 0.18;
    for (let s = 0; s < 14; s++) {
      const ang = (s / 14) * Math.PI * 2 + time / 300;
      const dist = sp * (40 + pw / 3.5);
      ctx.beginPath();
      ctx.arc(tip + Math.cos(ang)*dist, H*.5 + Math.sin(ang)*dist, 5*(1-sp), 0, Math.PI*2);
      ctx.fillStyle = rgba(c, (1-sp)*0.8);
      ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function lightning(ctx, p, c, W, H, fp, pw, time) {
  ctx.globalCompositeOperation = 'lighter';
  const sx = fp ? W*.15 : W*.85;
  const ex = fp ? W*.85 : W*.15;
  const bolts = Math.floor(1 + pw / 55);

  for (let b = 0; b < bolts; b++) {
    const yOff = (b - (bolts-1)/2) * 28;
    const segs = 12 + Math.floor(pw / 14);
    const pts = [{ x: sx, y: H*.5 + yOff }];
    for (let i = 1; i <= segs; i++) {
      const t2 = i / segs;
      if (t2 > p * 1.3) break;
      pts.push({
        x: sx + (ex - sx) * t2,
        y: H*.5 + yOff + Math.sin(time / 70 + i * 2.31 + b) * (12 + pw / 14),
      });
    }
    if (pts.length < 2) continue;

    // Fat glow
    ctx.shadowColor = rgba(c, 1);
    ctx.shadowBlur = 28 + pw / 4;
    ctx.strokeStyle = rgba(c, 0.55 + Math.sin(time / 90 + b) * 0.12);
    ctx.lineWidth = 7 + pw / 20;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let p2 = 1; p2 < pts.length; p2++) ctx.lineTo(pts[p2].x, pts[p2].y);
    ctx.stroke();

    // White core
    ctx.strokeStyle = 'rgba(255,255,255,0.97)';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let p2 = 1; p2 < pts.length; p2++) ctx.lineTo(pts[p2].x, pts[p2].y);
    ctx.stroke();

    // Branch sparks
    if (pw > 70 && pts.length > 4) {
      const bPt = pts[Math.floor(pts.length / 2)];
      ctx.strokeStyle = rgba(c, 0.5);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bPt.x, bPt.y);
      ctx.lineTo(
        bPt.x + Math.sin(time / 80 + b) * 38,
        bPt.y + Math.cos(time / 95 + b) * 32
      );
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function meteor(ctx, p, c, W, H, fp, pw, time) {
  ctx.globalCompositeOperation = 'lighter';
  const count = Math.floor(2 + pw / 28);
  for (let i = 0; i < count; i++) {
    const seed = i * 137.5;
    const delay = i * (0.75 / count);
    const lp = Math.max(0, Math.min(1, (p - delay) / 0.75));
    if (lp <= 0) continue;

    const sx2 = fp ? W * 0.1 : W * 0.9;
    const sy = H * 0.08 + (seed % 85);
    const ex = fp ? W * 0.87 : W * 0.13;
    const ey = H * 0.5 + (seed % 65);
    const mx = sx2 + (ex - sx2) * lp;
    const my = sy + (ey - sy) * lp;
    const sz = (12 + pw / 7) * (0.75 + (seed%40)/100);

    // Fire trail
    const trailLen = 14 + Math.floor(pw / 9);
    for (let j = trailLen; j >= 0; j--) {
      const tt = Math.max(0, lp - j * 0.013);
      const tx = sx2 + (ex - sx2) * tt;
      const ty = sy + (ey - sy) * tt;
      const a = (1 - j/trailLen) * 0.55;
      const ts2 = sz * (1 - j/trailLen) * 0.85;
      ctx.beginPath(); ctx.arc(tx, ty, ts2, 0, Math.PI*2);
      ctx.fillStyle = j < 3 ? `rgba(255,230,80,${a})` : j < 7 ? rgba(c, a, 30) : rgba(c, a*.45);
      ctx.fill();
    }

    // Rock core
    ctx.save();
    ctx.translate(mx, my);
    ctx.rotate(lp * Math.PI * 5 + seed + time / 520);
    ctx.beginPath();
    const faces = 7;
    for (let f = 0; f < faces; f++) {
      const ang = (f / faces) * Math.PI * 2;
      const r = sz * (0.72 + Math.sin(ang*2+seed) * 0.28);
      f === 0 ? ctx.moveTo(Math.cos(ang)*r, Math.sin(ang)*r)
              : ctx.lineTo(Math.cos(ang)*r, Math.sin(ang)*r);
    }
    ctx.closePath();
    const rg = ctx.createRadialGradient(0,0,0, 0,0,sz);
    rg.addColorStop(0, 'rgba(255,240,160,1)');
    rg.addColorStop(0.4, rgba(c, 1, 30));
    rg.addColorStop(1, rgba(c, 0.5, -25));
    ctx.fillStyle = rg;
    ctx.shadowColor = rgba(c, 1); ctx.shadowBlur = sz * 1.5;
    ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function orb(ctx, p, c, W, H, fp, pw, time) {
  ctx.globalCompositeOperation = 'lighter';
  const sx = fp ? W*.18 : W*.82;
  const ex = fp ? W*.82 : W*.18;
  const x = sx + (ex - sx) * p;
  const sz = 11 + pw / 7;
  const pulse = 1 + Math.sin(time / 75) * 0.18;

  // Outer rings
  for (let r = 4; r >= 1; r--) {
    ctx.beginPath(); ctx.arc(x, H*.5, sz * r * pulse, 0, Math.PI*2);
    ctx.fillStyle = rgba(c, 0.07 * r); ctx.fill();
  }

  // Core
  const g = ctx.createRadialGradient(x-sz*.3, H*.5-sz*.3, 0, x, H*.5, sz*1.3);
  g.addColorStop(0, 'rgba(255,255,255,0.97)');
  g.addColorStop(0.3, rgba(c, 1, 70, 70, 70));
  g.addColorStop(0.7, rgba(c, 0.9));
  g.addColorStop(1, rgba(c, 0));
  ctx.beginPath(); ctx.arc(x, H*.5, sz*pulse, 0, Math.PI*2);
  ctx.fillStyle = g;
  ctx.shadowColor = rgba(c, 1); ctx.shadowBlur = sz * 2.5;
  ctx.fill(); ctx.shadowBlur = 0;

  // Orbiting sparks
  const nSparks = Math.floor(5 + pw / 22);
  for (let s = 0; s < nSparks; s++) {
    const ang = (s/nSparks)*Math.PI*2 + p*Math.PI*7;
    const dist = sz * 2;
    ctx.beginPath();
    ctx.arc(x+Math.cos(ang)*dist, H*.5+Math.sin(ang)*dist, 3.5, 0, Math.PI*2);
    ctx.fillStyle = rgba(c, 0.85);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function shadow(ctx, p, c, W, H, fp, pw, time) {
  const sx = fp ? W*.18 : W*.82;
  const ex = fp ? W*.82 : W*.18;
  const x = sx + (ex - sx) * p;
  const wisps = Math.floor(4 + pw / 22);
  ctx.globalCompositeOperation = 'source-over';
  for (let w = 0; w < wisps; w++) {
    const wx = x + Math.sin(time/190 + w*2.2)*22;
    const wy = H*.5 + Math.cos(time/170 + w*1.8)*28;
    const sz = (13 + pw/9 + w*3.5) * (1 - p*.3);
    const g = ctx.createRadialGradient(wx, wy, 0, wx, wy, sz*2.2);
    g.addColorStop(0, rgba(c, 0.75, 60, 60, 90));
    g.addColorStop(0.45, rgba(c, 0.45));
    g.addColorStop(1, rgba(c, 0));
    ctx.beginPath(); ctx.arc(wx, wy, sz*2.2, 0, Math.PI*2);
    ctx.fillStyle = g; ctx.fill();
  }
}

function wave(ctx, p, c, W, H, fp, pw, time) {
  ctx.globalCompositeOperation = 'lighter';
  const cx2 = fp ? W * p : W * (1 - p);
  const waves = Math.floor(2 + pw / 38);
  for (let w = 0; w < waves; w++) {
    const off = w * 45 * (fp ? -1 : 1);
    const alpha = (0.75 - w*.2) * Math.min(1, (1-p)*4);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = rgba(c, 1);
    ctx.lineWidth = 5 + pw / 18 - w * 1.5;
    ctx.shadowColor = rgba(c, 1); ctx.shadowBlur = 12;
    ctx.beginPath();
    for (let px = -70; px <= 70; px += 2) {
      const py = Math.sin(px/11 + time/140) * (16 + pw/7);
      px === -70 ? ctx.moveTo(cx2+off+px, H*.5+py) : ctx.lineTo(cx2+off+px, H*.5+py);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function leaf(ctx, p, c, W, H, fp, pw, time) {
  const sx = fp ? W*.18 : W*.82;
  const ex = fp ? W*.82 : W*.18;
  const count = Math.floor(6 + pw / 13);
  for (let i = 0; i < count; i++) {
    const phase = (p + i/count) % 1;
    const x = sx + (ex - sx) * phase;
    const yOff = Math.sin(phase*Math.PI*3+i+time/200) * (22+pw/7);
    const angle = phase*Math.PI*5 + i;
    const sz = 9 + pw/10;
    ctx.save();
    ctx.translate(x, H*.5+yOff);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.ellipse(0, 0, sz, sz*.45, 0, 0, Math.PI*2);
    ctx.fillStyle = rgba(c, 0.88);
    ctx.fill();
    ctx.strokeStyle = rgba(c, 1, -25, 45, -25);
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-sz, 0); ctx.lineTo(sz, 0); ctx.stroke();
    ctx.restore();
  }
}

function crystal(ctx, p, c, W, H, fp, pw, time) {
  ctx.globalCompositeOperation = 'lighter';
  const sx = fp ? W*.18 : W*.82;
  const ex = fp ? W*.82 : W*.18;
  const count = Math.floor(5 + pw / 18);
  for (let i = 0; i < count; i++) {
    const phase = (p + i/count*0.85) % 1;
    const x = sx + (ex - sx) * phase;
    const yOff = ((i%3)-1)*28;
    const sz = 8 + pw/12;
    const spin = phase*Math.PI*4 + i + time/400;
    ctx.save();
    ctx.translate(x, H*.5+yOff);
    ctx.rotate(spin);
    ctx.beginPath();
    ctx.moveTo(0,-sz); ctx.lineTo(sz*.5,0); ctx.lineTo(0,sz); ctx.lineTo(-sz*.5,0);
    ctx.closePath();
    const g = ctx.createLinearGradient(-sz,-sz,sz,sz);
    g.addColorStop(0,'rgba(255,255,255,0.98)');
    g.addColorStop(0.45, rgba(c, 0.95, 50, 50, 50));
    g.addColorStop(1, rgba(c, 0.65));
    ctx.fillStyle = g;
    ctx.shadowColor = rgba(c, 1); ctx.shadowBlur = 15;
    ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

function sparkle(ctx, p, c, W, H, fp, pw, time) {
  ctx.globalCompositeOperation = 'lighter';
  const sx = fp ? W*.18 : W*.82;
  const ex = fp ? W*.82 : W*.18;
  const x = sx + (ex - sx) * p;
  const count = Math.floor(8 + pw / 12);
  for (let i = 0; i < count; i++) {
    const ang = (i/count)*Math.PI*2 + time/250;
    const dist = (15 + pw/8) * Math.sin(p*Math.PI);
    const sx2 = x + Math.cos(ang)*dist;
    const sy = H*.5 + Math.sin(ang)*dist*.6;
    const sz = 5 + pw/18;
    // 4-point star
    ctx.save();
    ctx.translate(sx2, sy);
    ctx.rotate(ang + time/300);
    ctx.beginPath();
    for (let pt = 0; pt < 8; pt++) {
      const a2 = (pt/8)*Math.PI*2;
      const r = pt%2===0 ? sz : sz*.35;
      pt===0 ? ctx.moveTo(Math.cos(a2)*r, Math.sin(a2)*r) : ctx.lineTo(Math.cos(a2)*r, Math.sin(a2)*r);
    }
    ctx.closePath();
    ctx.fillStyle = rgba(c, 0.9, 30, 30, 30);
    ctx.shadowColor = rgba(c, 1); ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
  }
  ctx.globalCompositeOperation = 'source-over';
}

const RENDERERS = { flame, jet, lightning, meteor, orb, shadow, wave, leaf, crystal, sparkle };

function drawCasterAura(ctx, p, c, W, H, fp, pw, time) {
  const charge = clamp01(1 - p / 0.28);
  if (charge <= 0) return;

  const x = fp ? W * 0.18 : W * 0.82;
  const y = fp ? H * 0.66 : H * 0.36;
  const pulse = 1 + Math.sin(time / 55) * 0.16;
  const radius = (42 + pw / 2.8) * pulse * charge;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let ring = 0; ring < 4; ring += 1) {
    ctx.beginPath();
    ctx.arc(x, y, radius * (0.35 + ring * 0.28), 0, Math.PI * 2);
    ctx.strokeStyle = rgba(c, 0.22 * charge * (1 - ring * 0.15), 60, 60, 60);
    ctx.lineWidth = 3 + ring * 1.2;
    ctx.shadowColor = rgba(c, 0.9);
    ctx.shadowBlur = 18 + pw / 4;
    ctx.stroke();
  }
  ctx.restore();
}

function drawSpeedLines(ctx, p, c, W, H, fp, pw, time) {
  const active = Math.sin(Math.PI * clamp01(p));
  if (active <= 0.02) return;

  const dir = fp ? 1 : -1;
  const count = 10 + Math.floor(pw / 12);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i += 1) {
    const lane = (i / count) * H;
    const drift = Math.sin(time / 90 + i) * 16;
    const x = fp ? W * (0.08 + p * 0.7) : W * (0.92 - p * 0.7);
    const len = (55 + pw / 2.2) * active;
    ctx.beginPath();
    ctx.moveTo(x - dir * len * 0.65, lane + drift);
    ctx.lineTo(x + dir * len, lane + drift * 0.35);
    ctx.strokeStyle = rgba(c, 0.08 + active * 0.18, 90, 90, 90);
    ctx.lineWidth = 1 + (i % 3) + pw / 48;
    ctx.shadowColor = rgba(c, 0.6);
    ctx.shadowBlur = 10;
    ctx.stroke();
  }
  ctx.restore();
}

function drawImpactBurst(ctx, p, c, W, H, fp, pw, time) {
  const ip = clamp01((p - 0.64) / 0.36);
  if (ip <= 0) return;

  const x = fp ? W * 0.78 : W * 0.22;
  const y = fp ? H * 0.38 : H * 0.63;
  const ease = 1 - Math.pow(1 - ip, 3);
  const fade = 1 - ip;
  const radius = (36 + pw / 1.9) * ease;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (let ring = 0; ring < 3; ring += 1) {
    ctx.beginPath();
    ctx.arc(x, y, radius * (0.45 + ring * 0.32), 0, Math.PI * 2);
    ctx.strokeStyle = ring === 0 ? `rgba(255,255,255,${0.78 * fade})` : rgba(c, 0.38 * fade, 70, 70, 70);
    ctx.lineWidth = (7 - ring * 1.7) * fade;
    ctx.shadowColor = rgba(c, 0.95);
    ctx.shadowBlur = 28;
    ctx.stroke();
  }

  const shards = 16 + Math.floor(pw / 8);
  for (let i = 0; i < shards; i += 1) {
    const angle = (i / shards) * Math.PI * 2 + Math.sin(time / 180 + i) * 0.18;
    const dist = radius * (0.35 + (i % 5) * 0.12);
    const sx = x + Math.cos(angle) * dist;
    const sy = y + Math.sin(angle) * dist * 0.72;
    const size = (3 + (i % 4) + pw / 35) * fade;

    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle + time / 260);
    ctx.beginPath();
    ctx.moveTo(size * 1.8, 0);
    ctx.lineTo(0, size * 0.42);
    ctx.lineTo(-size * 1.8, 0);
    ctx.lineTo(0, -size * 0.42);
    ctx.closePath();
    ctx.fillStyle = i % 3 === 0 ? `rgba(255,255,255,${0.88 * fade})` : rgba(c, 0.82 * fade, 45, 45, 45);
    ctx.shadowColor = rgba(c, 0.8);
    ctx.shadowBlur = 14;
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

/* ═══════════════════════════════════════════════════════
   AttackEffect component
════════════════════════════════════════════════════════ */

const AttackEffect = ({ move, fromPlayer, active, onComplete }) => {
  const canvasRef = useRef(null);
  const rafRef    = useRef(null);
  const startRef  = useRef(null);

  useEffect(() => {
    if (!active || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const width = canvas.offsetWidth || 800;
    const height = canvas.offsetHeight || 400;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cfg    = T[move?.type] || T.normal;
    const power  = move?.power  || 50;
    const render = RENDERERS[cfg.style] || orb;
    const duration = 820 + power * 5.8;

    const tick = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const t = Math.min((ts - startRef.current) / duration, 1);

      ctx.clearRect(0, 0, width, height);
      drawCasterAura(ctx, t, cfg, width, height, fromPlayer, power, ts);
      drawSpeedLines(ctx, t, cfg, width, height, fromPlayer, power, ts);
      render(ctx, t, cfg, width, height, fromPlayer, power, ts);
      drawImpactBurst(ctx, t, cfg, width, height, fromPlayer, power, ts);

      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, width, height);
        onComplete?.();
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      startRef.current = null;
    };
  }, [active, move, fromPlayer, onComplete]);

  return (
    <canvas
      ref={canvasRef}
      className="attack-canvas"
      style={{
        position: 'absolute', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 75,
        mixBlendMode: 'screen',
      }}
    />
  );
};

export default AttackEffect;
