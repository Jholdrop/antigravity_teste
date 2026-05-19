import { useEffect, useRef, useState } from 'react';
import { getSecureQuizRound, submitQuizGuess } from '../api/pokeapi';
import { ArrowLeft, CheckCircle, Trophy, XCircle } from 'lucide-react';
import '../components/PokemonQuiz.css';

const MAX_ROUNDS = 5;

const createSessionId = () => {
  const key = 'antigravity_multiplayer_session';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;

  const generated =
    window.crypto?.randomUUID?.() || `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(key, generated);
  return generated;
};

const getTimestamp = () => Date.now();

const MultiplayerQuiz = ({ connection, isHost, onBack }) => {
  const [roundData, setRoundData] = useState(null);
  const [challengeId, setChallengeId] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [startedAt, setStartedAt] = useState(getTimestamp);
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
  const sessionIdRef = useRef(createSessionId());
  const scoresRef = useRef(scores);
  const roundRef = useRef(round);

  useEffect(() => {
    scoresRef.current = scores;
  }, [scores]);

  useEffect(() => {
    roundRef.current = round;
  }, [round]);

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

  const handleNewRoundData = (data) => {
    setRoundData(data);
    setRound(data.round);
    setGameState('playing');
    setRoundWinner(null);
    setRevealedName('');
    setCluesRevealed(1);
    setGuess('');
    setWrongGuesses([]);
    setBlobUrl('');
    setLoading(false);

    if (inputRef.current) inputRef.current.focus();

    if (isHost) {
      clearInterval(hintTimerRef.current);
      let currentClues = 1;
      hintTimerRef.current = setInterval(() => {
        if (currentClues < data.clues.length) {
          currentClues += 1;
          connection.send({ type: 'REVEAL_HINT', count: currentClues });
          setCluesRevealed(currentClues);
        } else {
          clearInterval(hintTimerRef.current);
        }
      }, 5000);
    }
  };

  const startNewRound = async () => {
    if (!isHost) return;

    setLoading(true);
    setValidationMessage('');
    setStartedAt(getTimestamp());

    if (roundRef.current >= MAX_ROUNDS) {
      connection.send({ type: 'GAME_OVER', scores: scoresRef.current });
      setGameState('game_over');
      setLoading(false);
      return;
    }

    try {
      const data = await getSecureQuizRound();
      const nextRound = roundRef.current + 1;
      const payload = {
        type: 'NEW_ROUND',
        clues: data.clues,
        mainType: data.mainType,
        image: data.image,
        round: nextRound,
      };

      setChallengeId(data.challengeId);
      setChallengeToken(data.challengeToken);
      connection.send(payload);
      handleNewRoundData(payload);
    } catch (error) {
      console.error(error);
      setValidationMessage('Erro ao iniciar a rodada. Tentando novamente...');
      setTimeout(() => startNewRound(), 1200);
    }
  };

  const handleRoundEnd = (winner, realName) => {
    clearInterval(hintTimerRef.current);
    setGameState('round_end');
    setRevealedName(realName);

    if (winner === 'host') {
      setRoundWinner('me');
      setScores((prev) => ({ ...prev, me: prev.me + 1 }));
    } else {
      setRoundWinner('opponent');
      setScores((prev) => ({ ...prev, opponent: prev.opponent + 1 }));
    }

    connection.send({ type: 'ROUND_END', winner, realName });

    setTimeout(() => {
      if (isHost) startNewRound();
    }, 4000);
  };

  useEffect(() => {
    if (!connection) return undefined;
    if (isHost && roundRef.current === 0) startNewRound();

    const handleData = async (data) => {
      if (data.type === 'NEW_ROUND') {
        handleNewRoundData(data);
        return;
      }

      if (data.type === 'REVEAL_HINT') {
        setCluesRevealed(data.count);
        return;
      }

      if (data.type === 'GUESS_SUBMIT' && isHost && gameState === 'playing') {
        if (!challengeId || !challengeToken) {
          connection.send({ type: 'GUESS_WRONG', guess: data.guess });
          return;
        }

        try {
          const result = await submitQuizGuess({
            challengeId,
            challengeToken,
            guess: data.guess,
            startedAt,
            sessionId: sessionIdRef.current,
          });

          if (result.correct) {
            handleRoundEnd('opponent', result.pokemonName || data.guess);
          } else {
            connection.send({ type: 'GUESS_WRONG', guess: data.guess });
          }
        } catch {
          connection.send({ type: 'GUESS_WRONG', guess: data.guess });
        }

        return;
      }

      if (data.type === 'GUESS_WRONG') {
        setWrongGuesses((prev) => [...prev, data.guess]);
        return;
      }

      if (data.type === 'ROUND_END') {
        clearInterval(hintTimerRef.current);
        setGameState('round_end');
        setRevealedName(data.realName);
        setRoundWinner(data.winner === 'host' ? 'opponent' : 'me');
        if (data.winner === 'host') {
          setScores((prev) => ({ ...prev, opponent: prev.opponent + 1 }));
        } else {
          setScores((prev) => ({ ...prev, me: prev.me + 1 }));
        }
        return;
      }

      if (data.type === 'GAME_OVER') {
        setGameState('game_over');
        clearInterval(hintTimerRef.current);
      }
    };

    connection.on('data', handleData);

    return () => {
      connection.off?.('data', handleData);
      clearInterval(hintTimerRef.current);
    };
    // PeerJS subscriptions are intentionally scoped to connection/session state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [challengeId, challengeToken, connection, gameState, isHost, startedAt]);

  const handleGuess = async () => {
    if (!guess.trim() || gameState !== 'playing') return;

    const typedGuess = guess.trim();
    const normalized = typedGuess.toLowerCase().replace(/\s+/g, '-');
    setGuess('');

    if (!isHost) {
      connection.send({ type: 'GUESS_SUBMIT', guess: normalized });
      return;
    }

    if (!challengeId || !challengeToken) {
      setValidationMessage('Desafio indisponivel, tente novamente.');
      return;
    }

    try {
      const response = await submitQuizGuess({
        challengeId,
        challengeToken,
        guess: normalized,
        startedAt,
        sessionId: sessionIdRef.current,
      });

      if (response.correct) {
        handleRoundEnd('host', response.pokemonName || normalized);
      } else {
        setWrongGuesses((prev) => [...prev, typedGuess]);
        setValidationMessage(response.message || 'Resposta incorreta.');
      }
    } catch (error) {
      setValidationMessage(error.message || 'Erro ao validar o chute.');
    }
  };

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
          <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
            Placar final: voce {scores.me} x {scores.opponent} oponente
          </p>
          <button className="btn-next" onClick={onBack}>
            Voltar ao lobby
          </button>
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
