/**
 * AttackTimeline — Orquestra todas as fases de um ataque com timing cinematográfico.
 * Fases: anticipation → charge → strike → impact → hitReaction → recovery
 */

const wait = (ms) => new Promise(r => setTimeout(r, ms));

// Easing functions
const easeInCubic  = t => t * t * t;
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInOutQuart = t => t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;

export class AttackTimeline {
  /**
   * @param {Object} cfg
   * @param {CameraDirector} cfg.camera
   * @param {Function} cfg.setAttackerAnim   (animClass: string) => void
   * @param {Function} cfg.setDefenderAnim   (animClass: string) => void
   * @param {Function} cfg.setScreenFX       (fx: string|null) => void  - e.g. 'flash-white', 'shockwave'
   * @param {Function} cfg.setCurrentEffect  (effect: {move, fromPlayer}|null) => void
   * @param {Function} cfg.showDamageNumber  (dmg, isCrit) => void
   * @param {Function} cfg.applyDamage       (dmg) => void
   * @param {Function} cfg.addLog            (msg) => void
   */
  constructor(cfg) {
    this.camera = cfg.camera;
    this.setAttackerAnim  = cfg.setAttackerAnim;
    this.setDefenderAnim  = cfg.setDefenderAnim;
    this.setScreenFX      = cfg.setScreenFX;
    this.setCurrentEffect = cfg.setCurrentEffect;
    this.showDamageNumber = cfg.showDamageNumber;
    this.applyDamage      = cfg.applyDamage;
    this.addLog           = cfg.addLog;
  }

  async execute({ attacker, defender, move, isPlayer, damage }) {
    const isCrit = damage > this._expectedDamage(attacker, defender, move) * 1.3;
    const isHeavy = (move.power || 50) >= 100;
    const isSuper = (move.power || 50) >= 140;

    // ─── 1. ANTICIPATION ───
    this.addLog(`${attacker.name.toUpperCase()} preparou ${move.name.replace(/-/g,' ')}!`);
    this.setAttackerAnim(isPlayer ? 'anim-anticipate-player' : 'anim-anticipate-enemy');
    await wait(isHeavy ? 550 : 380);

    // ─── 2. CHARGE ───
    this.setAttackerAnim(isPlayer ? 'anim-charge-player' : 'anim-charge-enemy');
    if (isHeavy) {
      this.camera.zoomTo(1.04, 400);
      this.setScreenFX('charge-glow');
    }
    await wait(isHeavy ? 500 : 280);

    // ─── 3. STRIKE / DASH ───
    this.setAttackerAnim(isPlayer ? 'anim-strike-player' : 'anim-strike-enemy');
    this.setScreenFX(null);
    // Lança o projectile/FX
    this.setCurrentEffect({ move, fromPlayer: isPlayer });
    if (isHeavy) this.camera.shake(isSuper ? 5 : 3, 200, 1.5);
    await wait(isSuper ? 700 : isHeavy ? 550 : 400);

    // ─── 4. IMPACT ───
    this.setCurrentEffect(null);
    this.setAttackerAnim('');

    // Screen FX
    this.setScreenFX(isSuper ? 'impact-super' : isHeavy ? 'impact-heavy' : 'impact-normal');
    this.camera.brightnessFlash(isSuper ? 3.5 : isHeavy ? 2.5 : 1.8, isSuper ? 220 : 160);
    this.camera.shake(isSuper ? 20 : isHeavy ? 13 : 7, isSuper ? 600 : isHeavy ? 450 : 280, 2.5);
    if (move.type === 'electric') this.camera.hueFlash(80, 200);
    if (isCrit) this.camera.chromaticFlash(10, 300);

    // HIT STOP — pausa breve para dar peso ao golpe
    const hitStopMs = isSuper ? 100 : isHeavy ? 70 : 40;
    await wait(hitStopMs);

    // ─── 5. DEFENDER HIT REACTION ───
    this.setDefenderAnim(isPlayer ? 'anim-hit-enemy' : 'anim-hit-player');
    this.applyDamage(damage);
    this.addLog(`${defender.name.toUpperCase()} perdeu ${damage} HP!`);
    this.showDamageNumber(damage, isCrit);
    if (isCrit) this.addLog('⚡ Golpe Crítico!');

    await wait(isHeavy ? 700 : 500);
    this.setScreenFX(null);

    // ─── 6. RECOVERY ───
    this.setDefenderAnim('');
    if (isHeavy) {
      this.camera.zoomTo(1, 500);
    }
    await wait(200);
  }

  _expectedDamage(attacker, defender, move) {
    const getStat = (p, n) => p.stats.find(s => s.stat.name === n)?.base_stat || 80;
    const atk = move.damageClass === 'special' ? getStat(attacker, 'special-attack') : getStat(attacker, 'attack');
    const def = move.damageClass === 'special' ? getStat(defender, 'special-defense') : getStat(defender, 'defense');
    return (((2 * 50) / 5 + 2) * (move.power || 50) * (atk / def)) / 50 + 2;
  }
}
