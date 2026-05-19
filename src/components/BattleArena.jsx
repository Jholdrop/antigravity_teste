import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateDamage,
  fetchMovesForPokemon,
  generateNPCTeam,
  getPokemonPower,
  getStat,
  getTypeEffectiveness,
} from '../utils/battleEngine';
import { CameraDirector } from '../systems/CameraDirector';
import AttackEffect from './AttackEffect';
import DamageNumber from './DamageNumber';
import './BattleArena.css';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getPokemonTypes = (pokemon) => pokemon.types.map((entry) => entry.type.name);

const getBattleSprite = (pokemon, side) => {
  const showdown = pokemon.sprites?.other?.showdown || {};
  const home = pokemon.sprites?.other?.home || {};
  const artwork = pokemon.sprites?.other?.['official-artwork'] || {};

  if (side === 'player') {
    return (
      showdown.back_default ||
      pokemon.sprites?.back_default ||
      showdown.front_default ||
      home.front_default ||
      artwork.front_default ||
      pokemon.sprites?.front_default
    );
  }

  return (
    showdown.front_default ||
    pokemon.sprites?.front_default ||
    home.front_default ||
    artwork.front_default
  );
};

const getEnemyMove = (attacker, defender) => {
  const scoredMoves = attacker.moves.map((move) => ({
    move,
    score: (move.power || 40) * getTypeEffectiveness(move.type, defender),
  }));

  scoredMoves.sort((a, b) => b.score - a.score);
  const pool = scoredMoves.slice(0, 2).length ? scoredMoves.slice(0, 2) : scoredMoves;
  return pool[Math.floor(Math.random() * pool.length)]?.move || attacker.moves[0];
};

const getEffectLog = (result) => {
  if (result.missed) return 'O ataque errou!';
  if (result.effectiveness === 0) return 'Nao teve efeito...';
  if (result.effectiveness >= 2) return 'Foi super efetivo!';
  if (result.effectiveness < 1) return 'Nao foi muito efetivo.';
  return '';
};

const formatMoveName = (name) => name.replace(/-/g, ' ');

const preparePokemon = async (pokemon) => {
  const powerScore = getPokemonPower(pokemon);
  const hp = getStat(pokemon, 'hp') * 3 + Math.round(powerScore / 16);

  return {
    ...pokemon,
    moves: await fetchMovesForPokemon(pokemon),
    maxHp: hp,
    currentHp: hp,
    powerScore,
  };
};

const BattleArena = ({ team, onExit }) => {
  const [playerTeam, setPlayerTeam] = useState([]);
  const [enemyTeam, setEnemyTeam] = useState([]);
  const [activeP, setActiveP] = useState(0);
  const [activeE, setActiveE] = useState(0);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadMsg, setLoadMsg] = useState('');
  const [animating, setAnimating] = useState(false);
  const [attackerAnim, setAttackerAnim] = useState('');
  const [defenderAnim, setDefenderAnim] = useState('');
  const [screenFX, setScreenFX] = useState(null);
  const [currentEffect, setCurrentEffect] = useState(null);
  const [damageNumbers, setDamageNumbers] = useState([]);
  const [battleResult, setBattleResult] = useState(null);
  const [entryState, setEntryState] = useState('entering');

  const arenaRef = useRef(null);
  const cameraRef = useRef(null);
  const logRef = useRef(null);
  const activePRef = useRef(0);
  const activeERef = useRef(0);
  const ptRef = useRef([]);
  const etRef = useRef([]);

  const syncPTeam = (nextTeam) => {
    ptRef.current = nextTeam;
    setPlayerTeam(nextTeam);
  };

  const syncETeam = (nextTeam) => {
    etRef.current = nextTeam;
    setEnemyTeam(nextTeam);
  };

  const addLog = useCallback((message) => setLogs((previous) => [...previous, message]), []);

  useEffect(() => {
    const camera = new CameraDirector(arenaRef);
    cameraRef.current = camera;
    camera.start();
    return () => camera.stop();
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: 99999, behavior: 'smooth' });
  }, [logs]);

  useEffect(() => {
    const initBattle = async () => {
      setLoading(true);
      setLoadMsg('Preparando seu time...');

      const preparedPlayerTeam = await Promise.all(team.map(preparePokemon));
      syncPTeam(preparedPlayerTeam);

      setLoadMsg('Escolhendo rival equilibrado...');
      const npcRaw = await generateNPCTeam(preparedPlayerTeam);
      const preparedEnemyTeam = await Promise.all(npcRaw.map(preparePokemon));
      syncETeam(preparedEnemyTeam);

      setLoading(false);
      setEntryState('entering');
      await wait(350);
      addLog('Treinador rival quer batalhar!');
      await wait(450);
      setEntryState('battle');
      addLog(`Vai, ${preparedPlayerTeam[0].name.toUpperCase()}!`);
      addLog(`Rival enviou ${preparedEnemyTeam[0].name.toUpperCase()}!`);
    };

    initBattle();
  }, [team, addLog]);

  const spawnDamageNumber = (result, isTargetPlayer) => {
    const id = Date.now() + Math.random();
    const x = isTargetPlayer ? '30%' : '62%';
    const y = isTargetPlayer ? '52%' : '28%';
    setDamageNumbers((previous) => [
      ...previous,
      {
        id,
        damage: result.damage,
        isCrit: result.critical,
        effectiveness: result.effectivenessLabel,
        missed: result.missed,
        x,
        y,
      },
    ]);
    setTimeout(() => setDamageNumbers((previous) => previous.filter((entry) => entry.id !== id)), 1700);
  };

  const checkFaint = async (curPt, curEt, pIndex, eIndex) => {
    let ended = false;
    let switched = false;
    let nextPlayerIndex = pIndex;
    let nextEnemyIndex = eIndex;

    if (curPt[pIndex]?.currentHp <= 0) {
      setPlayerTeam((state) => {
        const next = [...state];
        next[pIndex] = { ...next[pIndex], fainted: true };
        return next;
      });
      addLog(`${curPt[pIndex].name.toUpperCase()} desmaiou!`);
      cameraRef.current?.shake(8, 300);
      await wait(800);

      const next = curPt.findIndex((pokemon, index) => index !== pIndex && pokemon.currentHp > 0);
      if (next === -1) {
        addLog('Voce perdeu...');
        setBattleResult('lose');
        ended = true;
      } else {
        activePRef.current = next;
        setActiveP(next);
        nextPlayerIndex = next;
        switched = true;
        addLog(`Vai, ${curPt[next].name.toUpperCase()}!`);
      }
    }

    if (!ended && curEt[eIndex]?.currentHp <= 0) {
      setEnemyTeam((state) => {
        const next = [...state];
        next[eIndex] = { ...next[eIndex], fainted: true };
        return next;
      });
      addLog(`${curEt[eIndex].name.toUpperCase()} desmaiou!`);
      cameraRef.current?.shake(10, 340);
      await wait(800);

      const next = curEt.findIndex((pokemon, index) => index !== eIndex && pokemon.currentHp > 0);
      if (next === -1) {
        addLog('Voce venceu!');
        setBattleResult('win');
        ended = true;
      } else {
        activeERef.current = next;
        setActiveE(next);
        nextEnemyIndex = next;
        switched = true;
        addLog(`Rival enviou ${curEt[next].name.toUpperCase()}!`);
      }
    }

    return { ended, switched, pIndex: nextPlayerIndex, eIndex: nextEnemyIndex, curPt, curEt };
  };

  const doAttack = async (attacker, defender, move, isPlayerAttacking, curPt, curEt, pIndex, eIndex) => {
    const result = calculateDamage(attacker, defender, move);
    const isHeavy = (move.power || 40) >= 100 || result.effectiveness >= 2;
    const isSuper = (move.power || 40) >= 140 || result.effectiveness >= 4 || result.critical;

    addLog(`${attacker.name.toUpperCase()} usou ${formatMoveName(move.name).toUpperCase()}!`);

    setAttackerAnim(isPlayerAttacking ? 'anim-anticipate-player' : 'anim-anticipate-enemy');
    await wait(isHeavy ? 380 : 260);

    setAttackerAnim(isPlayerAttacking ? 'anim-charge-player' : 'anim-charge-enemy');
    setScreenFX(isHeavy ? 'charge-glow' : null);
    await wait(isHeavy ? 340 : 220);

    setAttackerAnim(isPlayerAttacking ? 'anim-strike-player' : 'anim-strike-enemy');
    setScreenFX(null);
    setCurrentEffect({ move, fromPlayer: isPlayerAttacking });
    await wait(isSuper ? 620 : isHeavy ? 520 : 420);

    setCurrentEffect(null);
    setAttackerAnim('');

    if (result.missed) {
      addLog(getEffectLog(result));
      await wait(380);
      return { curPt, curEt };
    }

    setScreenFX(isSuper ? 'impact-super' : isHeavy ? 'impact-heavy' : 'impact-normal');
    cameraRef.current?.brightnessFlash(isSuper ? 3.2 : isHeavy ? 2.1 : 1.6, isSuper ? 220 : 160);
    cameraRef.current?.shake(isSuper ? 18 : isHeavy ? 11 : 6, isSuper ? 520 : 280, 2.2);
    if (result.critical) cameraRef.current?.chromaticFlash(12, 320);

    await wait(isSuper ? 95 : isHeavy ? 70 : 40);

    setDefenderAnim(isPlayerAttacking ? 'anim-hit-enemy' : 'anim-hit-player');
    spawnDamageNumber(result, !isPlayerAttacking);

    if (isPlayerAttacking) {
      curEt[eIndex] = { ...curEt[eIndex], currentHp: Math.max(0, curEt[eIndex].currentHp - result.damage) };
    } else {
      curPt[pIndex] = { ...curPt[pIndex], currentHp: Math.max(0, curPt[pIndex].currentHp - result.damage) };
    }

    syncPTeam([...curPt]);
    syncETeam([...curEt]);

    const effectLog = getEffectLog(result);
    addLog(`${defender.name.toUpperCase()} perdeu ${result.damage} HP!`);
    if (effectLog) addLog(effectLog);
    if (result.critical) addLog('Golpe critico!');

    await wait(isHeavy ? 680 : 520);
    setScreenFX(null);
    setDefenderAnim('');
    await wait(130);

    return { curPt, curEt };
  };

  const executeTurn = async (playerMove) => {
    if (animating || battleResult) return;
    setAnimating(true);

    const pIndex = activePRef.current;
    const eIndex = activeERef.current;
    let curPt = ptRef.current.map((pokemon) => ({ ...pokemon }));
    let curEt = etRef.current.map((pokemon) => ({ ...pokemon }));
    const pPoke = curPt[pIndex];
    const ePoke = curEt[eIndex];
    const enemyMove = getEnemyMove(ePoke, pPoke);
    const playerFirst = getStat(pPoke, 'speed') >= getStat(ePoke, 'speed');

    if (playerFirst) {
      const first = await doAttack(pPoke, ePoke, playerMove, true, curPt, curEt, pIndex, eIndex);
      curPt = first.curPt;
      curEt = first.curEt;
      const faint = await checkFaint(curPt, curEt, activePRef.current, activeERef.current);
      if (faint.ended || faint.switched) {
        setAnimating(false);
        return;
      }

      const second = await doAttack(curEt[faint.eIndex], curPt[faint.pIndex], enemyMove, false, faint.curPt, faint.curEt, faint.pIndex, faint.eIndex);
      curPt = second.curPt;
      curEt = second.curEt;
    } else {
      const first = await doAttack(ePoke, pPoke, enemyMove, false, curPt, curEt, pIndex, eIndex);
      curPt = first.curPt;
      curEt = first.curEt;
      const faint = await checkFaint(curPt, curEt, activePRef.current, activeERef.current);
      if (faint.ended || faint.switched) {
        setAnimating(false);
        return;
      }

      const second = await doAttack(curPt[faint.pIndex], curEt[faint.eIndex], playerMove, true, faint.curPt, faint.curEt, faint.pIndex, faint.eIndex);
      curPt = second.curPt;
      curEt = second.curEt;
    }

    await checkFaint(curPt, curEt, activePRef.current, activeERef.current);
    setAnimating(false);
  };

  if (loading) {
    return (
      <div className="arena-loading">
        <div className="pokeball-spinner"><div className="pb-half pb-top" /><div className="pb-center" /><div className="pb-half pb-bot" /></div>
        <h2>Preparando batalha...</h2>
        <p className="load-msg">{loadMsg}</p>
      </div>
    );
  }

  const pPoke = playerTeam[activeP];
  const ePoke = enemyTeam[activeE];
  if (!pPoke || !ePoke) return null;

  const pHp = (pPoke.currentHp / pPoke.maxHp) * 100;
  const eHp = (ePoke.currentHp / ePoke.maxHp) * 100;
  const hpColor = (pct) => pct > 50 ? '#4ade80' : pct > 25 ? '#facc15' : '#ef4444';
  const pSprite = getBattleSprite(pPoke, 'player');
  const eSprite = getBattleSprite(ePoke, 'enemy');
  const pTypes = getPokemonTypes(pPoke);
  const eTypes = getPokemonTypes(ePoke);

  return (
    <div className="battle-arena" ref={arenaRef}>
      {screenFX && <div className={`screen-fx ${screenFX}`} />}
      <DamageNumber entries={damageNumbers} />

      {battleResult && (
        <div className={`battle-result-overlay ${battleResult}`}>
          <div className="result-text">{battleResult === 'win' ? 'VITORIA!' : 'DERROTA...'}</div>
          <button className="btn-result-exit" onClick={onExit}>Voltar a Pokedex</button>
        </div>
      )}

      <div className="battle-field">
        <button className="btn-exit" onClick={onExit}>Fugir</button>

        {currentEffect && (
          <AttackEffect
            move={currentEffect.move}
            fromPlayer={currentEffect.fromPlayer}
            active
          />
        )}

        <div className={`battle-side enemy-side ${entryState === 'entering' ? 'entering-enemy' : ''}`}>
          <div className="hud hud-enemy">
            <div className="hud-row">
              <span className="hud-name">{ePoke.name}</span>
              <span className="hud-id">#{String(ePoke.id).padStart(3, '0')}</span>
              <span className="hud-power">FOR {ePoke.powerScore}</span>
            </div>
            <div className="hud-hp-wrap">
              <span className="hp-label">HP</span>
              <div className="hud-hp-bar">
                <div className="hud-hp-fill" style={{ width: `${eHp}%`, background: hpColor(eHp) }} />
              </div>
            </div>
            <span className="hud-hp-text">{ePoke.currentHp} / {ePoke.maxHp}</span>
          </div>
          <div
            className={`model-container sprite-container ${eTypes.map((type) => `type-${type}`).join(' ')} ${
              defenderAnim.includes('enemy') || attackerAnim.includes('enemy')
                ? attackerAnim.includes('enemy') ? attackerAnim : defenderAnim
                : ''
            } ${ePoke.fainted ? 'fainted' : ''}`}
          >
            <img src={eSprite} alt={ePoke.name} className="battle-sprite enemy-sprite" draggable="false" />
          </div>
        </div>

        <div className={`battle-side player-side ${entryState === 'entering' ? 'entering-player' : ''}`}>
          <div
            className={`model-container sprite-container ${pTypes.map((type) => `type-${type}`).join(' ')} ${
              attackerAnim.includes('player') ? attackerAnim : defenderAnim.includes('player') ? defenderAnim : ''
            } ${pPoke.fainted ? 'fainted' : ''}`}
          >
            <img src={pSprite} alt={pPoke.name} className="battle-sprite player-sprite" draggable="false" />
          </div>
          <div className="hud hud-player">
            <div className="hud-row">
              <span className="hud-name">{pPoke.name}</span>
              <span className="hud-id">#{String(pPoke.id).padStart(3, '0')}</span>
              <span className="hud-power">FOR {pPoke.powerScore}</span>
            </div>
            <div className="hud-hp-wrap">
              <span className="hp-label">HP</span>
              <div className="hud-hp-bar">
                <div className="hud-hp-fill" style={{ width: `${pHp}%`, background: hpColor(pHp) }} />
              </div>
            </div>
            <span className="hud-hp-text">{pPoke.currentHp} / {pPoke.maxHp}</span>
          </div>
        </div>

        <div className="team-dots">
          {playerTeam.map((pokemon, index) => (
            <div
              key={pokemon.id}
              className={`team-dot ${pokemon.currentHp <= 0 ? 'dot-fainted' : ''} ${index === activeP ? 'dot-active' : ''}`}
              title={pokemon.name}
            >
              <img src={pokemon.sprites.front_default} alt={pokemon.name} />
            </div>
          ))}
        </div>
      </div>

      <div className="battle-ui">
        <div className="combat-log" ref={logRef}>
          {logs.map((log, index) => (
            <p key={`${log}-${index}`} className={index === logs.length - 1 ? 'log-latest' : ''}>
              {log}
            </p>
          ))}
        </div>
        <div className="moves-panel">
          {pPoke.moves.map((move) => (
            <button
              key={move.name}
              className="btn-move"
              style={{ '--mc': `var(--type-${move.type})` }}
              onClick={() => executeTurn(move)}
              disabled={animating || pPoke.currentHp <= 0 || Boolean(battleResult)}
            >
              <span className="move-name">{formatMoveName(move.name)}</span>
              <div className="move-meta">
                <span className="type-chip" style={{ background: `var(--type-${move.type})` }}>{move.type}</span>
                <span className="move-pwr">PWR {move.power}</span>
                <span className="move-pwr">{move.accuracy}%</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BattleArena;
