import { useState, useEffect, useRef } from 'react';
import { getPokemonDetails, getSecureQuizRound, submitQuizGuess } from '../api/pokeapi';
import { getCurrentUserIdToken } from '../api/firebase';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import useAntiCheat from '../hooks/useAntiCheat';
import LoadingScreen from './ui/LoadingScreen';
import './PokemonQuiz.css';

const createSessionId = () => {
  const key = 'antigravity_quiz_session';
  const existing = sessionStorage.getItem(key);
  if (existing) return existing;
  const generated = window.crypto?.randomUUID?.() || `sess-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  sessionStorage.setItem(key, generated);
  return generated;
};

const getTimestamp = () => Date.now();

const PokemonQuiz = ({ onCatch, onBack, caughtIds }) => {
  const [pokemonName, setPokemonName] = useState('');
  const [pokemonId, setPokemonId] = useState(null);
  const [clues, setClues] = useState([]);
  const [mainType, setMainType] = useState('');
  const [image, setImage] = useState('');
  const [pokemonTypes, setPokemonTypes] = useState([]);
  const [challengeId, setChallengeId] = useState('');
  const [challengeToken, setChallengeToken] = useState('');
  const [startedAt, setStartedAt] = useState(getTimestamp);
  const [loading, setLoading] = useState(true);
  const [cluesRevealed, setCluesRevealed] = useState(1);
  const [guess, setGuess] = useState('');
  const [gameState, setGameState] = useState('playing');
  const [wrongGuesses, setWrongGuesses] = useState([]);
  const [alreadyCaught, setAlreadyCaught] = useState(false);
  const [validationMessage, setValidationMessage] = useState('');
  const [blobUrl, setBlobUrl] = useState('');
  const inputRef = useRef(null);
  const sessionIdRef = useRef(createSessionId());
  const { registerAttempt } = useAntiCheat({ onAlert: setValidationMessage });
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let urlToRevoke = '';
    if (image) {
      fetch(image)
        .then(res => res.blob())
        .then(blob => {
          urlToRevoke = URL.createObjectURL(blob);
          setBlobUrl(urlToRevoke);
        })
        .catch((error) => {
          console.error('Erro ao carregar imagem:', error);
          setBlobUrl(image);
        }); 
    }
    return () => {
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [image]);

  const loadNew = async () => {
    setLoading(true);
    setGuess('');
    setWrongGuesses([]);
    setGameState('playing');
    setValidationMessage('');
    setCluesRevealed(1);
    setAlreadyCaught(false);
    setBlobUrl('');
    setImage('');
    setStartedAt(getTimestamp());
    setLoadError(false);

    try {
      const data = await getSecureQuizRound();
      
      setPokemonName('');
      setPokemonId(null);
      setClues(data.clues);
      setMainType(data.mainType);
      setImage(data.image);
      setPokemonTypes([]);
      setAlreadyCaught(false);
      setChallengeId(data.challengeId);
      setChallengeToken(data.challengeToken);
    } catch (error) {
      console.error('Erro ao carregar quiz:', error);
      setValidationMessage('Erro ao carregar o desafio. Verifique sua conexão.');
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
    if (!challengeId || !challengeToken) {
      setValidationMessage('Desafio inválido. Inicie um novo jogo.');
      return;
    }

    const answer = guess.trim();
    setValidationMessage('Validando sua resposta...');
    setLoading(true);

    try {
      const idToken = await getCurrentUserIdToken();
      const response = await submitQuizGuess({
        challengeId,
        challengeToken,
        guess: answer,
        startedAt,
        sessionId: sessionIdRef.current,
        idToken,
      });

      if (response.correct) {
        setGameState('won');
        setPokemonName(response.pokemonName || answer);
        setPokemonId(response.pokemonId || pokemonId);

        const revealedPokemon =
          response.capturedPokemon ||
          (response.pokemonId ? await getPokemonDetails(response.pokemonId) : null);

        if (revealedPokemon) {
          const safeImage =
            revealedPokemon.sprites?.front_default ||
            revealedPokemon.sprites?.other?.['official-artwork']?.front_default ||
            '';
          setImage(safeImage);
          setPokemonTypes(revealedPokemon.types || []);
          setMainType(revealedPokemon.types?.[0]?.type?.name || 'mystery');
        }

        if (!caughtIds.includes(response.pokemonId) && revealedPokemon) {
          onCatch(revealedPokemon, response.trainerData);
          setAlreadyCaught(false);
        } else {
          setAlreadyCaught(true);
        }

        if (!response.saved) {
          setValidationMessage(
            response.saveReason ||
              'Resposta correta, mas nao foi possivel salvar na nuvem. Confira as variaveis Firebase Admin no Netlify.'
          );
        } else {
          setValidationMessage(response.message || 'Parabens!');
        }
      } else {
        setWrongGuesses((prev) => [...prev, answer]);
        setGuess('');
        setValidationMessage(response.message || 'Resposta incorreta. Tente de novo.');
        if (cluesRevealed < clues.length) {
          setCluesRevealed((prev) => prev + 1);
        }
      }
    } catch (error) {
      setValidationMessage(error.message || 'Erro ao validar a resposta.');
      if (error.message?.includes('Desafio expirado')) {
        setGameState('expired');
      }
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingScreen message="Carregando o próximo desafio..." />;
  }

  if (loadError) {
    return (
      <div className="quiz-page">
        <div className="quiz-error">
          <XCircle size={48} color="var(--error-color)" />
          <h2>Erro ao carregar desafio</h2>
          <p>{validationMessage}</p>
          <button className="btn-primary" onClick={loadNew}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  const isRevealed = gameState !== 'playing';
  const displayImage = blobUrl || image;

  return (
    <div className="quiz-page">
      <header className="quiz-header animate-fade-in">
        <button className="btn-back-quiz" onClick={onBack}>
          <ArrowLeft size={20} /> Pokédex
        </button>
        <h1>Quiz Pokémon</h1>
        <div className="quiz-clue-badge">
          {Math.min(cluesRevealed, clues.length)}/{clues.length} dicas
        </div>
      </header>

      <div className="quiz-body">
        {/* Imagem / Silhueta */}
        <div className="quiz-image-col">
          <div className={`quiz-img-wrapper type-${mainType} ${isRevealed ? 'revealed' : ''}`}>
            <img
              src={displayImage}
              alt={isRevealed ? pokemonName : '???'}
              className={`quiz-img ${isRevealed ? 'show' : 'silhouette'}`}
              draggable="false"
              onContextMenu={(e) => e.preventDefault()}
            />
            {!isRevealed && <div className="quiz-question-mark">?</div>}
          </div>

          {isRevealed && (
            <div className={`result-card animate-fade-in ${gameState}`}>
              {gameState === 'won'
                ? <CheckCircle size={28} />
                : <XCircle size={28} />}
              <div>
                <div className="result-name">{pokemonName}</div>
                <div className="result-sub">
                  {gameState === 'won'
                    ? (alreadyCaught ? 'Já está na sua Pokédex!' : '🎉 Adicionado à Pokédex!')
                    : 'Melhor sorte na próxima!'}
                </div>
              </div>
            </div>
          )}

          {isRevealed && (
            <div className="result-types animate-fade-in">
              {pokemonTypes.map(t => (
                <span key={t.type.name} className="type-badge" style={{ background: `var(--type-${t.type.name})` }}>
                  {t.type.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Dicas e Resposta */}
        <div className="quiz-clues-col">
          <h2 className="quiz-title">Qual Pokémon é esse?</h2>

          <div className="clues-list">
            {clues.slice(0, cluesRevealed).map((c, i) => (
              <div key={i} className={`clue-item animate-fade-in ${i === cluesRevealed - 1 ? 'clue-new' : ''}`}>
                <span className="clue-icon">{c.icon}</span>
                <div className="clue-body">
                  <span className="clue-label">{c.label}</span>
                  <span className="clue-text">{c.text}</span>
                </div>
              </div>
            ))}
          </div>

          {validationMessage && (
            <div className="quiz-alert">{validationMessage}</div>
          )}

          {wrongGuesses.length > 0 && (
            <div className="wrong-guesses">
              <span className="wrong-title">❌ Erros:</span>
              <div className="wrong-tags">
                {wrongGuesses.map((g, i) => <span key={i} className="wrong-tag">{g}</span>)}
              </div>
            </div>
          )}

          {gameState === 'playing' && (
            <div className="quiz-input-area">
              <div className="guess-row">
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="Digite o nome do Pokémon..."
                  value={guess}
                  onChange={e => setGuess(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleGuess()}
                  className="guess-input"
                />
                <button className="btn-guess" onClick={handleGuess}>
                  Adivinhar
                </button>
              </div>
              <div className="quiz-action-row">
                <button className="btn-guess" onClick={handleGuess}>
                  Enviar
                </button>
              </div>
            </div>
          )}

          {gameState !== 'playing' && (
            <div className="quiz-next-area animate-fade-in">
              <button className="btn-next" onClick={loadNew}>
                Próximo desafio
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PokemonQuiz;
