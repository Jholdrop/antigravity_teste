import { useEffect, useRef, useState } from 'react';
import { getSecureQuizRound, submitQuizGuess } from '../api/pokeapi';
import { ArrowLeft, CheckCircle, Trophy, XCircle } from 'lucide-react';
import '../components/PokemonQuiz.css';

const MAX_ROUNDS = 5;

const createId = (prefix) =>
  window.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const getStartedAt = () => Date.now();

const normalizeGuess = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const MultiplayerQuiz = ({ connection, isHost, onBack }) => {
  const [roundData, setRoundData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [validationMessage, setValidationMessage] = useState('');
  const [cluesRevealed, setCluesRevealed] = useState(1);
  const [guess, setGuess] = useState('');
  const [wrongGuesses, setWrongGuesses] = useState([]);
  const [gameState, setGameState] = useState('playing');
  const [roundWinner, setRoundWinner] = useState(null);
  const [revealedName, setRevealedName] = useState('');
  const [blobUrl, setBlobUrl] = useState('');
  const [scores, setScores] = useState({ me: 0, opponent: 0 });
  const [round, setRound] = useState(0);

  const inputRef = useRef(null);
  const hintTimerRef = useRef(null);
  const nextRoundTimerRef = useRef(null);
  const startRetryTimerRef = useRef(null);
  const startedOnceRef = useRef(false);
  const startInFlightRef = useRef(false);
  const gameOverSentRef = useRef(false);
  const sessionIdRef = useRef(createId('mp-session'));
  const roundDataRef = useRef(null);
  const challengeRef = useRef({ challengeId: '', challengeToken: '', startedAt: 0, roundId: '' });
  const scoresRef = useRef(scores);
  const roundRef = useRef(round);
  const gameStateRef = useRef(gameState);

  const setGameStateSafe = (nextState) => {
    gameStateRef.current = nextState;
    setGameState(nextState);
  };

  const setScoresSafe = (updater) => {
    setScores((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      scoresRef.current = next;
      return next;
    });
  };

  const sendSafe = (payload) => {
    if (connection?.open) {
      connection.send(payload);
    }
  };

  const stopRoundTimers = () => {
    clearInterval(hintTimerRef.current);
    clearTimeout(nextRoundTimerRef.current);
    clearTimeout(startRetryTimerRef.current);
  };

  const startHintTimer = (data) => {
    if (!isHost) return;

    clearInterval(hintTimerRef.current);
    let currentClues = 1;

    hintTimerRef.current = setInterval(() => {
      if (gameStateRef.current !== 'playing') {
        clearInterval(hintTimerRef.current);
        return;
      }

      if (currentClues >= data.clues.length) {
        clearInterval(hintTimerRef.current);
        return;
      }

      currentClues += 1;
      setCluesRevealed(currentClues);
      sendSafe({ type: 'REVEAL_HINT', roundId: data.roundId, count: currentClues });
    }, 5000);
  };

  const handleNewRoundData = (data) => {
    const roundNumber = Number(data.round || 1);

    stopRoundTimers();
    roundDataRef.current = data;
    roundRef.current = roundNumber;

    setRoundData(data);
    setRound(roundNumber);
    setGameStateSafe('playing');
    setRoundWinner(null);
    setRevealedName('');
    setCluesRevealed(1);
    setGuess('');
    setWrongGuesses([]);
    setValidationMessage('');
    setBlobUrl('');
    setLoading(false);

    startHintTimer(data);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  };

  const finishGame = () => {
    stopRoundTimers();
    setGameStateSafe('game_over');
    setLoading(false);
  };

  const startNewRound = async () => {
    if (!isHost || startInFlightRef.current || gameStateRef.current === 'game_over') return;

    if (roundRef.current >= MAX_ROUNDS) {
      if (!gameOverSentRef.current) {
        gameOverSentRef.current = true;
        sendSafe({ type: 'GAME_OVER' });
      }
      finishGame();
      return;
    }

    startInFlightRef.current = true;
    setLoading(true);
    setValidationMessage('');

    try {
      const secureRound = await getSecureQuizRound();
      const nextRound = roundRef.current + 1;
      const roundId = createId(`round-${nextRound}`);
      const startedAt = getStartedAt();

      challengeRef.current = {
        challengeId: secureRound.challengeId,
        challengeToken: secureRound.challengeToken,
        startedAt,
        roundId,
      };

      const payload = {
        type: 'NEW_ROUND',
        roundId,
        round: nextRound,
        clues: secureRound.clues,
        mainType: secureRound.mainType,
        image: secureRound.image,
      };

      sendSafe(payload);
      handleNewRoundData(payload);
    } catch (error) {
      console.error(error);
      setValidationMessage('Erro ao iniciar a rodada. Tentando novamente...');
      startRetryTimerRef.current = window.setTimeout(startNewRound, 1200);
    } finally {
      startInFlightRef.current = false;
    }
  };

  const applyRoundResult = (winner, realName, { notifyOpponent = false } = {}) => {
    if (gameStateRef.current !== 'playing') return;

    const normalizedWinner = winner === 'host' ? 'host' : 'opponent';
    const didIWin = (isHost && normalizedWinner === 'host') || (!isHost && normalizedWinner === 'opponent');

    clearInterval(hintTimerRef.current);
    setGameStateSafe('round_end');
    setRevealedName(realName || 'pokemon');
    setRoundWinner(didIWin ? 'me' : 'opponent');
    setValidationMessage('');

    setScoresSafe((prev) =>
      didIWin
        ? { ...prev, me: prev.me + 1 }
        : { ...prev, opponent: prev.opponent + 1 }
    );

    if (notifyOpponent) {
      sendSafe({
        type: 'ROUND_END',
        roundId: challengeRef.current.roundId,
        winner: normalizedWinner,
        realName: realName || 'pokemon',
      });
    }

    if (isHost) {
      nextRoundTimerRef.current = window.setTimeout(startNewRound, 4000);
    }
  };

  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);

  useEffect(() => {
    roundRef.current = round;
  }, [round]);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    let urlToRevoke = '';
    if (roundData?.image) {
      fetch(roundData.image)
        .then((res) => res.blob())
        .then((blob) => {
          urlToRevoke = URL.createObjectURL(blob);
          setBlobUrl(urlToRevoke);
        })
        .catch(() => setBlobUrl(roundData.image));
    }

    return () => {
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [roundData?.image]);

  useEffect(() => {
    if (!connection) return undefined;

    const handleData = async (data) => {
      if (!data || typeof data !== 'object') return;

      if (data.type === 'NEW_ROUND') {
        if (!isHost && data.roundId) {
          handleNewRoundData(data);
        }
        return;
      }

      if (data.type === 'REVEAL_HINT') {
        if (data.roundId === roundDataRef.current?.roundId) {
          setCluesRevealed(data.count);
        }
        return;
      }

      if (data.type === 'GUESS_SUBMIT') {
        if (!isHost || gameStateRef.current !== 'playing') return;
        if (data.roundId !== challengeRef.current.roundId) return;

        const currentChallenge = challengeRef.current;
        if (!currentChallenge.challengeId || !currentChallenge.challengeToken) {
          sendSafe({
            type: 'GUESS_REJECTED',
            roundId: data.roundId,
            message: 'A rodada ainda nao esta pronta. Tente de novo.',
          });
          return;
        }

        try {
          const result = await submitQuizGuess({
            challengeId: currentChallenge.challengeId,
            challengeToken: currentChallenge.challengeToken,
            guess: data.guess,
            startedAt: currentChallenge.startedAt,
            sessionId: `${sessionIdRef.current}:opponent`,
          });

          if (data.roundId !== challengeRef.current.roundId || gameStateRef.current !== 'playing') return;

          if (result.correct) {
            applyRoundResult('opponent', result.pokemonName || data.guess, { notifyOpponent: true });
          } else {
            sendSafe({
              type: 'GUESS_WRONG',
              roundId: data.roundId,
              guess: data.displayGuess || data.guess,
              message: result.message || 'Resposta incorreta.',
            });
          }
        } catch (error) {
          sendSafe({
            type: 'GUESS_REJECTED',
            roundId: data.roundId,
            message: error.message || 'Nao foi possivel validar agora. Tente novamente.',
          });
        }

        return;
      }

      if (data.type === 'GUESS_WRONG') {
        if (data.roundId === roundDataRef.current?.roundId) {
          setWrongGuesses((prev) => [...prev, data.guess]);
          setValidationMessage(data.message || 'Resposta incorreta.');
        }
        return;
      }

      if (data.type === 'GUESS_REJECTED') {
        if (data.roundId === roundDataRef.current?.roundId) {
          setValidationMessage(data.message || 'Tente novamente.');
        }
        return;
      }

      if (data.type === 'ROUND_END') {
        if (data.roundId === roundDataRef.current?.roundId) {
          applyRoundResult(data.winner, data.realName);
        }
        return;
      }

      if (data.type === 'GAME_OVER') {
        finishGame();
        return;
      }

      if (data.type === 'OPPONENT_LEFT') {
        stopRoundTimers();
        setValidationMessage('Oponente saiu da partida.');
        setGameStateSafe('game_over');
      }
    };

    const handleClose = () => {
      stopRoundTimers();
      if (gameStateRef.current !== 'game_over') {
        setValidationMessage('Oponente desconectou.');
        setGameStateSafe('game_over');
      }
    };

    connection.on('data', handleData);
    connection.on('close', handleClose);

    if (isHost && !startedOnceRef.current) {
      startedOnceRef.current = true;
      startNewRound();
    }

    return () => {
      connection.off?.('data', handleData);
      connection.off?.('close', handleClose);
      stopRoundTimers();
    };
    // Um unico listener por conexao evita rodadas duplicadas e estado antigo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection, isHost]);

  const handleGuess = async () => {
    if (!guess.trim() || gameStateRef.current !== 'playing') return;

    const typedGuess = guess.trim();
    const normalized = normalizeGuess(typedGuess);
    setGuess('');
    setValidationMessage('');

    if (!normalized) return;

    if (!isHost) {
      if (!roundDataRef.current?.roundId) {
        setValidationMessage('Aguardando a rodada ficar pronta.');
        return;
      }

      sendSafe({
        type: 'GUESS_SUBMIT',
        roundId: roundDataRef.current.roundId,
        guess: normalized,
        displayGuess: typedGuess,
      });
      return;
    }

    const currentChallenge = challengeRef.current;
    if (!currentChallenge.challengeId || !currentChallenge.challengeToken) {
      setValidationMessage('Desafio indisponivel, tente novamente.');
      return;
    }

    try {
      const response = await submitQuizGuess({
        challengeId: currentChallenge.challengeId,
        challengeToken: currentChallenge.challengeToken,
        guess: normalized,
        startedAt: currentChallenge.startedAt,
        sessionId: `${sessionIdRef.current}:host`,
      });

      if (currentChallenge.roundId !== challengeRef.current.roundId || gameStateRef.current !== 'playing') return;

      if (response.correct) {
        applyRoundResult('host', response.pokemonName || normalized, { notifyOpponent: true });
      } else {
        setWrongGuesses((prev) => [...prev, typedGuess]);
        setValidationMessage(response.message || 'Resposta incorreta.');
      }
    } catch (error) {
      setValidationMessage(error.message || 'Erro ao validar o chute.');
    }
  };

  if (gameState === 'game_over') {
    const iWon = scores.me > scores.opponent;
    const isTie = scores.me === scores.opponent;

    return (
      <div className="quiz-page" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="game-over-card glass-panel animate-fade-in" style={{ textAlign: 'center', padding: '3rem' }}>
          <Trophy size={60} color={iWon ? '#F7D02C' : '#94a3b8'} style={{ marginBottom: '1rem' }} />
          <h1 style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>
            {isTie ? 'Empate!' : iWon ? 'Voce venceu!' : 'Voce perdeu!'}
          </h1>
          <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Placar final: voce {scores.me} x {scores.opponent} oponente
          </p>
          {validationMessage && (
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>{validationMessage}</p>
          )}
          <button className="btn-next" onClick={onBack}>
            Voltar ao lobby
          </button>
        </div>
      </div>
    );
  }

  if (loading || !roundData) {
    return (
      <div className="quiz-page">
        <div className="quiz-loading">
          <div className="pokeball-anim">
            <div className="pb-top" />
            <div className="pb-middle" />
            <div className="pb-bottom" />
          </div>
          <p>{isHost ? 'Gerando desafio seguro...' : 'Aguardando o host gerar a rodada...'}</p>
        </div>
      </div>
    );
  }

  const { clues, mainType, image } = roundData;
  const isRevealed = gameState === 'round_end';
  const displayImage = blobUrl || image;

  return (
    <div className="quiz-page">
      <header className="quiz-header animate-fade-in">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn-back-quiz" onClick={onBack}>
            <ArrowLeft size={20} /> Sair
          </button>
          <div className="score-badge">
            <span className="score-me">Voce: {scores.me}</span>
            <span className="score-divider">VS</span>
            <span className="score-opp">Oponente: {scores.opponent}</span>
          </div>
        </div>

        <h2>Rodada {round}/{MAX_ROUNDS}</h2>

        <div className="quiz-clue-badge">
          {Math.min(cluesRevealed, clues.length)}/{clues.length} dicas
        </div>
      </header>

      <div className="quiz-body">
        <div className="quiz-image-col">
          <div className={`quiz-img-wrapper type-${mainType} ${isRevealed ? 'revealed' : ''}`}>
            <img
              src={displayImage}
              alt={isRevealed ? revealedName : '???'}
              className={`quiz-img ${isRevealed ? 'show' : 'silhouette'}`}
              onContextMenu={(event) => event.preventDefault()}
              draggable="false"
            />
            {!isRevealed && <div className="quiz-question-mark">?</div>}
          </div>

          {isRevealed && (
            <div className={`result-card animate-fade-in ${roundWinner === 'me' ? 'won' : 'lost'}`}>
              {roundWinner === 'me' ? <CheckCircle size={28} /> : <XCircle size={28} />}
              <div>
                <div className="result-name" style={{ textTransform: 'capitalize' }}>{revealedName}</div>
                <div className="result-sub">
                  {roundWinner === 'me' ? 'Voce acertou! +1 ponto' : 'Oponente acertou primeiro!'}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="quiz-clues-col">
          <h2 className="quiz-title">Qual Pokemon e esse? Corra!</h2>

          <div className="clues-list">
            {clues.slice(0, cluesRevealed).map((clue, index) => (
              <div
                key={`${clue.label}-${index}`}
                className={`clue-item animate-fade-in ${index === cluesRevealed - 1 ? 'clue-new' : ''}`}
              >
                <span className="clue-icon">{clue.icon}</span>
                <div className="clue-body">
                  <span className="clue-label">{clue.label}</span>
                  <span className="clue-text">{clue.text}</span>
                </div>
              </div>
            ))}
          </div>

          {validationMessage && <div className="quiz-alert">{validationMessage}</div>}

          {wrongGuesses.length > 0 && (
            <div className="wrong-guesses">
              <span className="wrong-title">Seus erros:</span>
              <div className="wrong-tags">
                {wrongGuesses.map((entry, index) => (
                  <span key={`${entry}-${index}`} className="wrong-tag">{entry}</span>
                ))}
              </div>
            </div>
          )}

          {gameState === 'playing' ? (
            <div className="quiz-input-area">
              <div className="guess-row">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Digite rapido..."
                  value={guess}
                  onChange={(event) => setGuess(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleGuess()}
                  className="guess-input"
                />
                <button className="btn-guess" onClick={handleGuess}>
                  Enviar
                </button>
              </div>
            </div>
          ) : (
            <div className="quiz-input-area animate-fade-in">
              <p style={{ textAlign: 'center', fontSize: '1.1rem', color: 'var(--text-muted)', padding: '1rem' }}>
                Preparando proxima rodada...
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MultiplayerQuiz;
