import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calculateDamage,
  fetchMovesForPokemon,
  generateNPCTeam,
  generateRentalTeam,
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

const BattleArena = ({
  team = [],
  onExit,
  connection = null,
  isHost = false,
  playerName = 'Voce',
  opponentName = 'Rival',
}) => {
  const isPvp = Boolean(connection);
  const [playerTeam, setPlayerTeam] = useState([]);
  const [enemyTeam, setEnemyTeam] = useState([]);
  const [activeP, setActiveP] = useState(0);
  const [activeE, setActiveE] = useState(0);
  const [logs, setLogs] = useState([]);
  const [turnCount, setTurnCount] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadMsg, setLoadMsg] = useState('');
  const [animating, setAnimating] = useState(false);
  const [waitingForOpponentMove, setWaitingForOpponentMove] = useState(false);
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
  const turnCountRef = useRef(1);
  const damageIdRef = useRef(0);
  const ptRef = useRef([]);
  const etRef = useRef([]);
  const localMoveIndexRef = useRef(null);
  const remoteMoveIndexRef = useRef(null);
  const resolvingTurnRef = useRef(false);
  const logsRef = useRef([]);
  const opponentReadyRef = useRef(false);
  const pvpStartedRef = useRef(false);
  const battleResultRef = useRef(null);

  const syncPTeam = (nextTeam) => {
    ptRef.current = nextTeam;
    setPlayerTeam(nextTeam);
  };

  const syncETeam = (nextTeam) => {
    etRef.current = nextTeam;
    setEnemyTeam(nextTeam);
  };

  const syncTurnCount = (nextTurn) => {
    turnCountRef.current = nextTurn;
    setTurnCount(nextTurn);
  };

  const addLog = useCallback((message) => {
    logsRef.current = [...logsRef.current, message];
    setLogs(logsRef.current);
  }, []);

  const startPvpBattle = useCallback(async (remoteTeam) => {
    if (pvpStartedRef.current) return;
    if (!ptRef.current.length || !Array.isArray(remoteTeam) || !remoteTeam.length) {
      opponentReadyRef.current = remoteTeam;
      return;
    }

    pvpStartedRef.current = true;
    opponentReadyRef.current = false;
    syncETeam(remoteTeam);
    setLoading(false);
    setEntryState('entering');
    await wait(350);
    addLog(`${opponentName} aceitou a batalha!`);
    await wait(450);
    setEntryState('battle');
    addLog(`Vai, ${ptRef.current[0].name.toUpperCase()}!`);
    addLog(`${opponentName} enviou ${remoteTeam[0].name.toUpperCase()}!`);
  }, [addLog, opponentName]);

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
    let cancelled = false;

    const initBattle = async () => {
      setLoading(true);
      setLoadMsg(team.length ? 'Preparando seu time...' : 'Montando time rental...');
      logsRef.current = [];
      setLogs([]);
      setBattleResult(null);
      battleResultRef.current = null;
      setWaitingForOpponentMove(false);
      syncTurnCount(1);
      activePRef.current = 0;
      activeERef.current = 0;

      const basePlayerTeam = team.length ? team.slice(0, 6) : await generateRentalTeam(3);
      if (cancelled) return;

      const preparedPlayerTeam = await Promise.all(basePlayerTeam.map(preparePokemon));
      if (cancelled) return;
      syncPTeam(preparedPlayerTeam);

      if (isPvp) {
        if (Array.isArray(opponentReadyRef.current)) {
          await startPvpBattle(opponentReadyRef.current);
        }
        setLoadMsg('Aguardando time do oponente...');
        connection.send({ type: 'BATTLE_TEAM_READY', team: preparedPlayerTeam });
        return;
      }

      setLoadMsg('Escolhendo rival equilibrado...');
      const npcRaw = await generateNPCTeam(preparedPlayerTeam);
      if (cancelled) return;

      const preparedEnemyTeam = await Promise.all(npcRaw.map(preparePokemon));
      if (cancelled) return;
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

    return () => {
      cancelled = true;
    };
  }, [team, addLog, connection, isPvp, startPvpBattle]);

  const spawnDamageNumber = (result, isTargetPlayer) => {
    damageIdRef.current += 1;
    const id = damageIdRef.current;
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
      curPt[pIndex] = { ...curPt[pIndex], fainted: true };
      syncPTeam([...curPt]);
      addLog(`${curPt[pIndex].name.toUpperCase()} desmaiou!`);
      cameraRef.current?.shake(8, 300);
      await wait(800);

      const next = curPt.findIndex((pokemon, index) => index !== pIndex && pokemon.currentHp > 0);
      if (next === -1) {
        addLog('Voce perdeu...');
        battleResultRef.current = 'lose';
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
      curEt[eIndex] = { ...curEt[eIndex], fainted: true };
      syncETeam([...curEt]);
      addLog(`${curEt[eIndex].name.toUpperCase()} desmaiou!`);
      cameraRef.current?.shake(10, 340);
      await wait(800);

      const next = curEt.findIndex((pokemon, index) => index !== eIndex && pokemon.currentHp > 0);
      if (next === -1) {
        addLog('Voce venceu!');
        battleResultRef.current = 'win';
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

  const getSharedLogs = () =>
    logsRef.current
      .filter((message) => !String(message).startsWith('Voce escolheu '))
      .slice(-18);

  const localizeHostLogsForGuest = (messages) =>
    messages
      .map((message) => {
        const text = String(message);
        if (text.startsWith('Voce escolheu ')) return null;
        if (text === 'Voce venceu!') return 'Voce perdeu...';
        if (text === 'Voce perdeu...') return 'Voce venceu!';
        if (text.endsWith('aceitou a batalha!')) return 'Batalha aceita!';
        if (text.startsWith('Rival enviou ')) return text.replace('Rival enviou ', 'Vai, ');
        if (text.startsWith('Vai, ')) return `${opponentName} enviou ${text.slice(5)}`;
        return text;
      })
      .filter(Boolean);

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

  const sendPvpState = () => {
    if (!isPvp || !isHost || !connection?.open) return;

    connection.send({
      type: 'BATTLE_TURN_STATE',
      hostTeam: ptRef.current,
      guestTeam: etRef.current,
      hostActive: activePRef.current,
      guestActive: activeERef.current,
      battleResult: battleResultRef.current,
      turnCount: turnCountRef.current,
      logs: getSharedLogs(),
    });
  };

  const executeTurn = async (playerMove, forcedEnemyMove = null, options = {}) => {
    if (animating || battleResult) return;
    setAnimating(true);

    const finishTurn = () => {
      syncTurnCount(turnCountRef.current + 1);
      setAnimating(false);

      if (options.sendPvpState) {
        localMoveIndexRef.current = null;
        remoteMoveIndexRef.current = null;
        resolvingTurnRef.current = false;
        sendPvpState();
      }
    };

    const pIndex = activePRef.current;
    const eIndex = activeERef.current;
    let curPt = ptRef.current.map((pokemon) => ({ ...pokemon }));
    let curEt = etRef.current.map((pokemon) => ({ ...pokemon }));
    const pPoke = curPt[pIndex];
    const ePoke = curEt[eIndex];
    const enemyMove = forcedEnemyMove || getEnemyMove(ePoke, pPoke);
    const playerFirst = getStat(pPoke, 'speed') >= getStat(ePoke, 'speed');

    if (playerFirst) {
      const first = await doAttack(pPoke, ePoke, playerMove, true, curPt, curEt, pIndex, eIndex);
      curPt = first.curPt;
      curEt = first.curEt;
      const faint = await checkFaint(curPt, curEt, activePRef.current, activeERef.current);
      if (faint.ended || faint.switched) {
        finishTurn();
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
        finishTurn();
        return;
      }

      const second = await doAttack(curPt[faint.pIndex], curEt[faint.eIndex], playerMove, true, faint.curPt, faint.curEt, faint.pIndex, faint.eIndex);
      curPt = second.curPt;
      curEt = second.curEt;
    }

    await checkFaint(curPt, curEt, activePRef.current, activeERef.current);
    finishTurn();
  };

  const resolvePvpTurnIfReady = async () => {
    if (!isPvp || !isHost || resolvingTurnRef.current) return;
    if (localMoveIndexRef.current === null || remoteMoveIndexRef.current === null) return;

    const pPoke = ptRef.current[activePRef.current];
    const ePoke = etRef.current[activeERef.current];
    const playerMove = pPoke?.moves?.[localMoveIndexRef.current];
    const enemyMove = ePoke?.moves?.[remoteMoveIndexRef.current];
    if (!playerMove || !enemyMove) return;

    resolvingTurnRef.current = true;
    setWaitingForOpponentMove(false);
    await executeTurn(playerMove, enemyMove, { sendPvpState: true });
  };

  const chooseMove = async (move, moveIndex) => {
    if (!isPvp) {
      await executeTurn(move);
      return;
    }

    if (animating || battleResult || waitingForOpponentMove) return;

    localMoveIndexRef.current = moveIndex;
    setWaitingForOpponentMove(true);
    addLog(`Voce escolheu ${formatMoveName(move.name).toUpperCase()}. Aguardando oponente...`);
    connection.send({ type: 'BATTLE_MOVE', moveIndex });

    if (isHost) {
      await resolvePvpTurnIfReady();
    }
  };

  const handleExit = () => {
    if (isPvp && connection?.open) {
      connection.send({ type: 'BATTLE_EXIT' });
    }
    onExit();
  };

  useEffect(() => {
    if (!isPvp || !connection) return undefined;

    const handleData = async (data) => {
      if (!data || typeof data !== 'object') return;

      if (data.type === 'BATTLE_TEAM_READY') {
        await startPvpBattle(data.team);
        return;
      }

      if (data.type === 'BATTLE_MOVE') {
        remoteMoveIndexRef.current = Number(data.moveIndex);
        if (isHost) await resolvePvpTurnIfReady();
        return;
      }

      if (data.type === 'BATTLE_TURN_STATE' && !isHost) {
        syncPTeam((data.guestTeam || []).map((pokemon) => ({ ...pokemon })));
        syncETeam((data.hostTeam || []).map((pokemon) => ({ ...pokemon })));
        activePRef.current = Number(data.guestActive || 0);
        activeERef.current = Number(data.hostActive || 0);
        setActiveP(activePRef.current);
        setActiveE(activeERef.current);
        syncTurnCount(Number(data.turnCount || turnCountRef.current + 1));
        logsRef.current = Array.isArray(data.logs)
          ? localizeHostLogsForGuest(data.logs)
          : logsRef.current;
        setLogs(logsRef.current);
        battleResultRef.current = data.battleResult === 'win' ? 'lose' : data.battleResult === 'lose' ? 'win' : null;
        setBattleResult(battleResultRef.current);
        localMoveIndexRef.current = null;
        remoteMoveIndexRef.current = null;
        setWaitingForOpponentMove(false);
        setAnimating(false);
        return;
      }

      if (data.type === 'BATTLE_EXIT') {
        battleResultRef.current = 'win';
        setBattleResult('win');
        addLog('Oponente saiu da batalha.');
      }
    };

    const handleClose = () => {
      if (!battleResultRef.current) {
        battleResultRef.current = 'win';
        setBattleResult('win');
        addLog('Oponente desconectou.');
      }
    };

    connection.on('data', handleData);
    connection.on('close', handleClose);

    return () => {
      connection.off?.('data', handleData);
      connection.off?.('close', handleClose);
    };
    // A arena PvP usa refs para manter o turno sincronizado entre os peers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, isHost, isPvp, startPvpBattle]);

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
          <button className="btn-result-exit" onClick={handleExit}>Voltar a Pokedex</button>
        </div>
      )}

      <div className="battle-field">
        <button className="btn-exit" onClick={handleExit}>Fugir</button>
        <div className="turn-badge">Turn {turnCount}</div>
        <div className="terrain-label">{isPvp ? 'PvP Battle' : 'Wild Stadium'} </div>

        <aside className="trainer-panel trainer-panel-left">
          <strong>{playerName}</strong>
          <div className="trainer-sprite trainer-player" />
          <div className="panel-team-icons">
            {playerTeam.map((pokemon, index) => (
              <span
                key={`${pokemon.id}-${index}`}
                className={`panel-pokeball ${pokemon.currentHp <= 0 ? 'used' : ''} ${index === activeP ? 'active' : ''}`}
                title={pokemon.name}
              />
            ))}
          </div>
        </aside>

        <aside className="trainer-panel trainer-panel-right">
          <strong>{opponentName}</strong>
          <div className="trainer-sprite trainer-rival" />
          <div className="panel-team-icons">
            {enemyTeam.map((pokemon, index) => (
              <span
                key={`${pokemon.id}-${index}`}
                className={`panel-pokeball ${pokemon.currentHp <= 0 ? 'used' : ''} ${index === activeE ? 'active' : ''}`}
                title={pokemon.name}
              />
            ))}
          </div>
        </aside>

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
              <span className="hud-id">L50</span>
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
              <span className="hud-id">L50</span>
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

        <div className="team-dots enemy-team-dots">
          {enemyTeam.map((pokemon, index) => (
            <div
              key={pokemon.id}
              className={`team-dot ${pokemon.currentHp <= 0 ? 'dot-fainted' : ''} ${index === activeE ? 'dot-active' : ''}`}
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
          {waitingForOpponentMove && <div className="waiting-move">Aguardando oponente...</div>}
          {pPoke.moves.map((move, index) => (
            <button
              key={move.name}
              className="btn-move"
              style={{ '--mc': `var(--type-${move.type})` }}
              onClick={() => chooseMove(move, index)}
              disabled={animating || waitingForOpponentMove || pPoke.currentHp <= 0 || Boolean(battleResult)}
            >
              <span className="move-name">{formatMoveName(move.name)}</span>
              <div className="move-meta">
                <span className="type-chip" style={{ background: `var(--type-${move.type})` }}>{move.type}</span>
                <span className="move-pwr">PWR {move.power}</span>
                <span className="move-pwr">{move.accuracy}%</span>
                {move.source === 'smogon' && <span className="move-pwr source-smogon">SM</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default BattleArena;
