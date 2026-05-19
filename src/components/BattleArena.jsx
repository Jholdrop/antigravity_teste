import { useState, useEffect, useRef, useCallback } from 'react';
import { generateNPCTeam, fetchMovesForPokemon, calculateDamage } from '../utils/battleEngine';
import { CameraDirector } from '../systems/CameraDirector';
import { AttackTimeline } from '../systems/AttackTimeline';
import AttackEffect from './AttackEffect';
import DamageNumber from './DamageNumber';
import './BattleArena.css';
import '@google/model-viewer';

const wait = ms => new Promise(r => setTimeout(r, ms));

const BattleArena = ({ team, onExit }) => {
  /* ── State ── */
  const [playerTeam,     setPlayerTeam]     = useState([]);
  const [enemyTeam,      setEnemyTeam]      = useState([]);
  const [activeP,        setActiveP]        = useState(0);
  const [activeE,        setActiveE]        = useState(0);
  const [logs,           setLogs]           = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [loadMsg,        setLoadMsg]        = useState('');
  const [animating,      setAnimating]      = useState(false);
  const [attackerAnim,   setAttackerAnim]   = useState('');
  const [defenderAnim,   setDefenderAnim]   = useState('');
  const [screenFX,       setScreenFX]       = useState(null);
  const [currentEffect,  setCurrentEffect]  = useState(null);
  const [damageNumbers,  setDamageNumbers]  = useState([]);
  const [battleResult,   setBattleResult]   = useState(null);
  const [entryState,     setEntryState]     = useState('entering'); // entering | battle

  /* ── Refs ── */
  const arenaRef   = useRef(null);
  const cameraRef  = useRef(null);
  const logRef     = useRef(null);
  const activePRef = useRef(0);
  const activeERef = useRef(0);
  const ptRef      = useRef([]);
  const etRef      = useRef([]);

  /* Sync refs */
  const syncPTeam = (t) => { ptRef.current = t; setPlayerTeam(t); };
  const syncETeam = (t) => { etRef.current = t; setEnemyTeam(t); };

  const addLog = useCallback(msg => setLogs(p => [...p, msg]), []);

  /* ── Camera director ── */
  useEffect(() => {
    const cam = new CameraDirector(arenaRef);
    cameraRef.current = cam;
    cam.start();
    return () => cam.stop();
  }, []);

  /* Auto-scroll log */
  useEffect(() => { logRef.current?.scrollTo({ top: 99999, behavior: 'smooth' }); }, [logs]);

  /* ── Init ── */
  useEffect(() => { initBattle(); }, []);

  const getStat = (poke, n) => poke.stats.find(s => s.stat.name === n)?.base_stat || 50;
  const getModelUrl    = id => `https://raw.githubusercontent.com/Pokemon-3D-api/assets/refs/heads/main/models/opt/regular/${id}.glb`;
  const getFallbackImg = p  => p.sprites.other['official-artwork'].front_default || p.sprites.front_default;

  const initBattle = async () => {
    setLoading(true);
    setLoadMsg('Preparando seu time...');
    const prepP = await Promise.all(team.map(async p => ({
      ...p,
      moves: await fetchMovesForPokemon(p),
      maxHp: getStat(p,'hp')*3, currentHp: getStat(p,'hp')*3
    })));
    syncPTeam(prepP);

    setLoadMsg('Gerando oponente...');
    const npcRaw = await generateNPCTeam(team);
    setLoadMsg('Preparando ataques do rival...');
    const prepE = await Promise.all(npcRaw.map(async p => ({
      ...p,
      moves: await fetchMovesForPokemon(p),
      maxHp: getStat(p,'hp')*3, currentHp: getStat(p,'hp')*3
    })));
    syncETeam(prepE);

    setLoading(false);

    // Entrada cinematográfica
    setEntryState('entering');
    await wait(400);
    addLog('⚔️  Treinador Rival quer batalhar!');
    await wait(600);
    setEntryState('battle');
    addLog(`Vai, ${prepP[0].name.toUpperCase()}!`);
  };

  /* ── Damage numbers ── */
  const spawnDamageNumber = (damage, isCrit, isPlayer) => {
    const id = Date.now() + Math.random();
    const x = isPlayer ? '62%' : '30%';
    const y = isPlayer ? '40%' : '25%';
    setDamageNumbers(p => [...p, { id, damage, isCrit, x, y }]);
    setTimeout(() => setDamageNumbers(p => p.filter(e => e.id !== id)), 1600);
  };

  /* ── Execute turn ── */
  const executeTurn = async (playerMove) => {
    if (animating || battleResult) return;
    setAnimating(true);

    const pIdx = activePRef.current;
    const eIdx = activeERef.current;
    let pt = ptRef.current.map(p => ({ ...p }));
    let et = etRef.current.map(p => ({ ...p }));

    const pPoke = pt[pIdx];
    const ePoke = et[eIdx];
    const enemyMove = ePoke.moves[Math.floor(Math.random() * ePoke.moves.length)];
    const pFirst = getStat(pPoke, 'speed') >= getStat(ePoke, 'speed');

    const doAttack = async (attacker, defender, move, isPlayerAttacking, curPt, curEt, pI, eI) => {
      const damage = calculateDamage(attacker, defender, move);
      const isHeavy = (move.power || 50) >= 100;
      const isSuper = (move.power || 50) >= 140;
      const isCrit  = damage > calculateDamage(attacker, defender, move) * 1.15 || Math.random() < 0.1;

      addLog(`${attacker.name.toUpperCase()} usou ${move.name.replace(/-/g,' ').toUpperCase()}!`);

      // ─ Anticipation ─
      setAttackerAnim(isPlayerAttacking ? 'anim-anticipate-player' : 'anim-anticipate-enemy');
      if (isHeavy) cameraRef.current?.zoomTo(1.05, 350);
      await wait(isHeavy ? 520 : 350);

      // ─ Charge ─
      setAttackerAnim(isPlayerAttacking ? 'anim-charge-player' : 'anim-charge-enemy');
      setScreenFX(isHeavy ? 'charge-glow' : null);
      if (isHeavy) cameraRef.current?.shake(3, 180, 1.5);
      await wait(isHeavy ? 460 : 260);

      // ─ Strike ─
      setAttackerAnim(isPlayerAttacking ? 'anim-strike-player' : 'anim-strike-enemy');
      setScreenFX(null);
      setCurrentEffect({ move, fromPlayer: isPlayerAttacking });
      await wait(isSuper ? 680 : isHeavy ? 520 : 380);

      // ─ Impact + Hit Stop ─
      setCurrentEffect(null);
      setAttackerAnim('');
      setScreenFX(isSuper ? 'impact-super' : isHeavy ? 'impact-heavy' : 'impact-normal');
      cameraRef.current?.brightnessFlash(isSuper ? 3.8 : isHeavy ? 2.6 : 1.9, isSuper ? 230 : 180);
      cameraRef.current?.shake(isSuper ? 22 : isHeavy ? 14 : 7, isSuper ? 650 : isHeavy ? 480 : 300, 2.5);
      if (move.type === 'electric') cameraRef.current?.hueFlash(90, 220);
      if (isCrit) { cameraRef.current?.chromaticFlash(12, 320); cameraRef.current?.zoomTo(1.08, 180); }

      // HIT STOP
      await wait(isSuper ? 110 : isHeavy ? 75 : 45);

      // ─ Defender reaction ─
      setDefenderAnim(isPlayerAttacking ? 'anim-hit-enemy' : 'anim-hit-player');
      spawnDamageNumber(damage, isCrit, !isPlayerAttacking);

      // Apply damage to snapshot
      if (isPlayerAttacking) {
        curEt[eI] = { ...curEt[eI], currentHp: Math.max(0, curEt[eI].currentHp - damage) };
      } else {
        curPt[pI] = { ...curPt[pI], currentHp: Math.max(0, curPt[pI].currentHp - damage) };
      }
      syncPTeam([...curPt]);
      syncETeam([...curEt]);

      addLog(`${defender.name.toUpperCase()} perdeu ${damage} HP!`);
      if (isCrit) addLog('⚡ GOLPE CRÍTICO!');

      await wait(isHeavy ? 720 : 520);
      setScreenFX(null);
      setDefenderAnim('');
      if (isHeavy) cameraRef.current?.zoomTo(1, 420);
      await wait(180);

      return { curPt, curEt };
    };

    const checkFaint = async (curPt, curEt, pI, eI) => {
      let ended = false;
      let newPI = pI, newEI = eI;

      if (curPt[pI].currentHp <= 0) {
        setAttackerAnim(''); setDefenderAnim('');
        setPlayerTeam(s => { const n=[...s]; n[pI]={...n[pI],fainted:true}; return n; });
        addLog(`${curPt[pI].name.toUpperCase()} desmaiou! 💀`);
        cameraRef.current?.shake(8, 300);
        await wait(1000);
        const nextP = curPt.findIndex((p,i) => i !== pI && p.currentHp > 0);
        if (nextP === -1) {
          addLog('Você perdeu... 😔');
          setBattleResult('lose');
          ended = true;
        } else {
          activePRef.current = nextP;
          setActiveP(nextP);
          newPI = nextP;
          addLog(`Vai, ${curPt[nextP].name.toUpperCase()}!`);
        }
      }

      if (!ended && curEt[eI].currentHp <= 0) {
        setEnemyTeam(s => { const n=[...s]; n[eI]={...n[eI],fainted:true}; return n; });
        addLog(`${curEt[eI].name.toUpperCase()} desmaiou! 🎉`);
        cameraRef.current?.shake(10, 350);
        await wait(1000);
        const nextE = curEt.findIndex((p,i) => i !== eI && p.currentHp > 0);
        if (nextE === -1) {
          addLog('Você VENCEU! 🏆');
          setBattleResult('win');
          ended = true;
        } else {
          activeERef.current = nextE;
          setActiveE(nextE);
          newEI = nextE;
          addLog(`Rival enviou ${curEt[nextE].name.toUpperCase()}!`);
        }
      }

      return { ended, pI: newPI, eI: newEI, curPt, curEt };
    };

    // Turn order
    let curPt = [...pt], curEt = [...et];

    if (pFirst) {
      const r1 = await doAttack(pPoke, ePoke, playerMove, true, curPt, curEt, pIdx, eIdx);
      curPt = r1.curPt; curEt = r1.curEt;
      const f1 = await checkFaint(curPt, curEt, activePRef.current, activeERef.current);
      if (f1.ended) { setAnimating(false); return; }
      const r2 = await doAttack(curEt[f1.eI], curPt[f1.pI], enemyMove, false, f1.curPt, f1.curEt, f1.pI, f1.eI);
      curPt = r2.curPt; curEt = r2.curEt;
    } else {
      const r1 = await doAttack(ePoke, pPoke, enemyMove, false, curPt, curEt, pIdx, eIdx);
      curPt = r1.curPt; curEt = r1.curEt;
      const f1 = await checkFaint(curPt, curEt, activePRef.current, activeERef.current);
      if (f1.ended) { setAnimating(false); return; }
      const r2 = await doAttack(curPt[f1.pI], curEt[f1.eI], playerMove, true, f1.curPt, f1.curEt, f1.pI, f1.eI);
      curPt = r2.curPt; curEt = r2.curEt;
    }

    await checkFaint(curPt, curEt, activePRef.current, activeERef.current);
    setAnimating(false);
  };

  /* ── Render ── */
  if (loading) return (
    <div className="arena-loading">
      <div className="pokeball-spinner"><div className="pb-half pb-top"/><div className="pb-center"/><div className="pb-half pb-bot"/></div>
      <h2>Preparando Batalha...</h2>
      <p className="load-msg">{loadMsg}</p>
    </div>
  );

  const pPoke = playerTeam[activeP];
  const ePoke = enemyTeam[activeE];
  if (!pPoke || !ePoke) return null;

  const pHp = (pPoke.currentHp / pPoke.maxHp) * 100;
  const eHp = (ePoke.currentHp / ePoke.maxHp) * 100;
  const hpColor = pct => pct > 50 ? '#4ade80' : pct > 25 ? '#facc15' : '#ef4444';

  return (
    <div className="battle-arena" ref={arenaRef}>

      {/* ── Screen FX Overlay ── */}
      {screenFX && <div className={`screen-fx ${screenFX}`} />}

      {/* ── Damage Numbers ── */}
      <DamageNumber entries={damageNumbers} />

      {/* ── Battle Result Overlay ── */}
      {battleResult && (
        <div className={`battle-result-overlay ${battleResult}`}>
          <div className="result-text">{battleResult === 'win' ? '🏆 VITÓRIA!' : '💀 DERROTA...'}</div>
          <button className="btn-result-exit" onClick={onExit}>Voltar à Pokédex</button>
        </div>
      )}

      {/* ── BATTLE FIELD ── */}
      <div className="battle-field">
        <button className="btn-exit" onClick={onExit}>⬅ Fugir</button>

        {/* Attack FX canvas */}
        {currentEffect && (
          <AttackEffect
            move={currentEffect.move}
            fromPlayer={currentEffect.fromPlayer}
            active={true}
          />
        )}

        {/* ENEMY */}
        <div className={`battle-side enemy-side ${entryState === 'entering' ? 'entering-enemy' : ''}`}>
          <div className="hud hud-enemy">
            <div className="hud-row">
              <span className="hud-name">{ePoke.name}</span>
              <span className="hud-id">#{String(ePoke.id).padStart(3,'0')}</span>
            </div>
            <div className="hud-hp-wrap">
              <span className="hp-label">HP</span>
              <div className="hud-hp-bar">
                <div className="hud-hp-fill" style={{ width:`${eHp}%`, background: hpColor(eHp) }} />
              </div>
            </div>
            <span className="hud-hp-text">{ePoke.currentHp} / {ePoke.maxHp}</span>
          </div>
          <div className={`model-container ${defenderAnim.includes('enemy') || attackerAnim.includes('enemy') ? attackerAnim.includes('enemy') ? attackerAnim : defenderAnim : ''} ${ePoke.fainted ? 'fainted' : ''}`}>
            <model-viewer
              src={getModelUrl(ePoke.id)}
              poster={getFallbackImg(ePoke)}
              alt={ePoke.name}
              auto-rotate
              auto-rotate-delay="0"
              rotation-per-second="18deg"
              camera-controls
              style={{ width:'100%', height:'100%', background:'transparent' }}
            />
          </div>
        </div>

        {/* PLAYER */}
        <div className={`battle-side player-side ${entryState === 'entering' ? 'entering-player' : ''}`}>
          <div className={`model-container ${attackerAnim.includes('player') ? attackerAnim : defenderAnim.includes('player') ? defenderAnim : ''} ${pPoke.fainted ? 'fainted' : ''}`}>
            <model-viewer
              src={getModelUrl(pPoke.id)}
              poster={getFallbackImg(pPoke)}
              alt={pPoke.name}
              camera-orbit="180deg 75deg 105%"
              auto-rotate
              auto-rotate-delay="0"
              rotation-per-second="-18deg"
              camera-controls
              style={{ width:'100%', height:'100%', background:'transparent' }}
            />
          </div>
          <div className="hud hud-player">
            <div className="hud-row">
              <span className="hud-name">{pPoke.name}</span>
              <span className="hud-id">#{String(pPoke.id).padStart(3,'0')}</span>
            </div>
            <div className="hud-hp-wrap">
              <span className="hp-label">HP</span>
              <div className="hud-hp-bar">
                <div className="hud-hp-fill" style={{ width:`${pHp}%`, background: hpColor(pHp) }} />
              </div>
            </div>
            <span className="hud-hp-text">{pPoke.currentHp} / {pPoke.maxHp}</span>
          </div>
        </div>

        {/* Mini team status */}
        <div className="team-dots">
          {playerTeam.map((p,i) => (
            <div key={p.id} className={`team-dot ${p.currentHp<=0?'dot-fainted':''} ${i===activeP?'dot-active':''}`} title={p.name}>
              <img src={p.sprites.front_default} alt={p.name} />
            </div>
          ))}
        </div>
      </div>

      {/* ── UI BOTTOM ── */}
      <div className="battle-ui">
        <div className="combat-log" ref={logRef}>
          {logs.map((l,i) => (
            <p key={i} className={i===logs.length-1 ? 'log-latest' : ''}>
              {l}
            </p>
          ))}
        </div>
        <div className="moves-panel">
          {pPoke.moves.map(m => (
            <button
              key={m.name}
              className="btn-move"
              style={{ '--mc': `var(--type-${m.type})` }}
              onClick={() => executeTurn(m)}
              disabled={animating || pPoke.currentHp<=0 || !!battleResult}
            >
              <span className="move-name">{m.name.replace(/-/g,' ')}</span>
              <div className="move-meta">
                <span className="type-chip" style={{ background:`var(--type-${m.type})` }}>{m.type}</span>
                <span className="move-pwr">PWR {m.power}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BattleArena;
