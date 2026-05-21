import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import { getNarutoQuizRound, submitNarutoQuizGuess } from '../api/pokeapi';
import useAntiCheat from '../hooks/useAntiCheat';
import LoadingScreen from './ui/LoadingScreen';
import './PokemonQuiz.css';

const createSessionId = () => {
  const key = 'antigravity_naruto_quiz_session';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;

  const generated =
    window.crypto?.randomUUID?.() || `naruto-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(key, generated);
  return generated;
};

const NarutoQuiz = ({ onBack }) => {
  const [characterName, setCharacterName] = useState('');
  const [clues, setClues] = useState([]);
  const [image, setImage] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [startedAt, setStartedAt] = useState(Date.now);
  const [loading, setLoading] = useState(true);
  const [cluesRevealed, setCluesRevealed] = useState(1);
  const [guess, setGuess] = useState('');
  const [gameState, setGameState] = useState('playing');
  const [wrongGuesses, setWrongGuesses] = useState([]);
  const [validationMessage, setValidationMessage] = useState('');
  const [blobUrl, setBlobUrl] = useState('');
  const [loadError, setLoadError] = useState(false);

  const inputRef = useRef(null);
  const sessionIdRef = useRef(createSessionId());
  const { registerAttempt } = useAntiCheat({ onAlert: setValidationMessage });

  useEffect(() => {
    let urlToRevoke = '';

    if (image) {
      fetch(image)
        .then((res) => res.blob())
        .then((blob) => {
          urlToRevoke = URL.createObjectURL(blob);
          setBlobUrl(urlToRevoke);
        })
        .catch(() => setBlobUrl(image));
    }

    return () => {
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [image]);

  const loadNew = async () => {
    setLoading(true);
    setGuess('');
    setWrongGuesses([]);
    setGameState('playing');
    setValidationMessage('');
    setCluesRevealed(1);
    setBlobUrl('');
    setImage('');
    setStartedAt(Date.now());
    setLoadError(false);

    try {
      const data = await getNarutoQuizRound();
      setCharacterName('');
      setClues(data.clues || []);
      setImage(data.image);
      setChallengeId(data.challengeId);
      setChallengeToken(data.challengeToken);
    } catch (error) {
      console.error('Erro ao carregar quiz Naruto:', error);
      setValidationMessage('Erro ao carregar o desafio. Verifique sua conexao.');
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(() => loadNew(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!loading && inputRef.current) inputRef.current.focus();
  }, [loading]);

  const handleGuess = async () => {
    if (!guess.trim() || gameState !== 'playing') return;

    registerAttempt();
    setValidationMessage('Validando sua resposta...');
    setLoading(true);

    try {
      const response = await submitNarutoQuizGuess({
        challengeId,
        challengeToken,
        guess,
        startedAt,
        sessionId: sessionIdRef.current,
      });

      if (response.correct) {
        setGameState('won');
        setCharacterName(response.characterName || guess.trim());
        setImage(response.image || image);
        setValidationMessage(response.message || 'Resposta correta!');
        return;
      }

      setWrongGuesses((prev) => [...prev, guess.trim()]);
      setGuess('');
      setValidationMessage(response.message || 'Resposta incorreta. Tente de novo.');
      if (cluesRevealed < clues.length) setCluesRevealed((prev) => prev + 1);
    } catch (error) {
      setValidationMessage(error.message || 'Erro ao validar a resposta.');
      if (error.message?.includes('Desafio expirado')) setGameState('expired');
    } finally {
      setLoading(false);
    }
  };

  const handleGiveUp = () => {
    if (gameState !== 'playing') return;
    setGameState('gaveup');
    setCharacterName('Desafio pulado');
    setValidationMessage('Voce pulou este desafio.');
  };

  if (loading) return <LoadingScreen message="Carregando desafio ninja..." />;

  if (loadError) {
    return (
      <div className="quiz-page naruto-quiz-page">
        <div className="quiz-error">
          <XCircle size={48} color="var(--error-color)" />
          <h2>Erro ao carregar desafio</h2>
          <p>{validationMessage}</p>
          <button className="btn-primary" onClick={loadNew}>Tentar novamente</button>
        </div>
      </div>
    );
  }

  const isRevealed = gameState !== 'playing';
  const displayImage = blobUrl || image;

  return (
    <div className="quiz-page naruto-quiz-page">
      <header className="quiz-header animate-fade-in">
        <button className="btn-back-quiz" onClick={onBack}>
          <ArrowLeft size={20} /> Area Naruto
        </button>
        <h1>Quiz Naruto</h1>
        <div className="quiz-clue-badge">
          {Math.min(cluesRevealed, clues.length)}/{clues.length} dicas
        </div>
      </header>

      <div className="quiz-body">
        <div className="quiz-image-col">
          <div className={`quiz-img-wrapper type-fire ${isRevealed ? 'revealed' : ''}`}>
            <img
              src={displayImage}
              alt={isRevealed ? characterName : '???'}
              className={`quiz-img ${isRevealed ? 'show' : 'silhouette'}`}
              draggable="false"
              onContextMenu={(event) => event.preventDefault()}
            />
            {!isRevealed && <div className="quiz-question-mark">?</div>}
          </div>

          {isRevealed && (
            <div className={`result-card animate-fade-in ${gameState === 'won' ? 'won' : 'lost'}`}>
              {gameState === 'won' ? <CheckCircle size={28} /> : <XCircle size={28} />}
              <div>
                <div className="result-name">{characterName}</div>
                <div className="result-sub">
                  {gameState === 'won' ? 'Personagem revelado!' : 'Nenhum ponto registrado.'}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="quiz-clues-col">
          <h2 className="quiz-title">Qual personagem de Naruto e esse?</h2>

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
              <span className="wrong-title">Erros:</span>
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
                  placeholder="Digite o nome do personagem..."
                  value={guess}
                  onChange={(event) => setGuess(event.target.value)}
                  onKeyDown={(event) => event.key === 'Enter' && handleGuess()}
                  className="guess-input"
                />
                <button className="btn-guess" onClick={handleGuess}>Adivinhar</button>
              </div>
              <div className="quiz-action-row">
                <button className="btn-giveup" onClick={handleGiveUp}>Desistir</button>
              </div>
            </div>
          ) : (
            <div className="quiz-next-area animate-fade-in">
              <button className="btn-next" onClick={loadNew}>Proximo desafio</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NarutoQuiz;
