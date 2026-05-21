import { useEffect, useState } from 'react';
import PokemonCard from './components/PokemonCard';
import PokemonModal from './components/PokemonModal';
import BattleArena from './components/BattleArena';
import PokemonQuiz from './components/PokemonQuiz';
import NarutoQuiz from './components/NarutoQuiz';
import MultiplayerLobby from './components/MultiplayerLobby';
import Ranking from './components/Ranking';
import ThemeToggle from './components/ui/ThemeToggle';
import { HelpCircle, Swords, Trophy, Users, Sparkles, ArrowLeftRight } from 'lucide-react';
import {
  auth,
  getCloudTrainerProfile,
  getTrainerData,
  isSupabaseConfigured,
  loginTrainer,
  logoutTrainer,
  onAuthStateChanged,
  registerTrainer,
  saveCaughtPokemon,
  saveTrainerTeam,
  signInWithGoogle,
} from './api/supabase';
import './App.css';

function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('antigravity_theme') || 'dark';
    } catch {
      return 'dark';
    }
  });
  const [caughtPokemons, setCaughtPokemons] = useState([]);
  const [selectedPokemon, setSelectedPokemon] = useState(null);
  const [team, setTeam] = useState([]);
  const [view, setView] = useState('pokedex');
  const [activeArea, setActiveArea] = useState(null);

  const [isRegistering, setIsRegistering] = useState(false);
  const [trainerEmail, setTrainerEmail] = useState('');
  const [trainerPassword, setTrainerPassword] = useState('');
  const [trainerNameInput, setTrainerNameInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const applyTrainerData = (user, data) => {
    setCurrentUser({
      uid: user.uid,
      name: data?.name || user.displayName || user.email?.split('@')[0] || 'Treinador',
      email: user.email,
      photoURL: data?.photoURL || user.photoURL || '',
    });
    setCaughtPokemons(data?.caughtPokemons || []);
    setTeam(data?.team || []);
  };

  const chooseTrainerData = (cloudData, clientData) => {
    const cloudCount = Array.isArray(cloudData?.caughtPokemons) ? cloudData.caughtPokemons.length : -1;
    const clientCount = Array.isArray(clientData?.caughtPokemons) ? clientData.caughtPokemons.length : -1;
    return clientCount > cloudCount ? clientData : cloudData || clientData;
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return undefined;
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setCurrentUser(null);
        setCaughtPokemons([]);
        setTeam([]);
        setActiveArea(null);
        setAuthLoading(false);
        return;
      }

      try {
        let cloudData = null;
        let clientData = null;

        try {
          cloudData = await getCloudTrainerProfile();
        } catch (cloudError) {
          console.error('Erro ao obter perfil pelo backend:', cloudError);
        }

        try {
          clientData = await getTrainerData(user);
        } catch (clientError) {
          console.error('Erro ao obter perfil pelo cliente:', clientError);
        }

        const data = chooseTrainerData(cloudData, clientData);
        if (!data) throw new Error('Perfil nao encontrado.');

        applyTrainerData(user, data);
      } catch (error) {
        console.error('Erro ao obter dados do treinador:', error);
        setAuthError('Nao foi possivel carregar sua conta. Tente entrar novamente.');
      } finally {
        setAuthLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    document.body.classList.toggle('theme-light', theme === 'light');
    try {
      localStorage.setItem('antigravity_theme', theme);
    } catch {
      // Preferencia visual; pode falhar em navegadores restritos.
    }
  }, [theme]);

  useEffect(() => {
    if (!currentUser?.uid) return undefined;

    const timeoutId = setTimeout(async () => {
      try {
        await saveTrainerTeam(currentUser.uid, team);
      } catch (error) {
        console.error('Erro ao salvar time no Supabase:', error);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [team, currentUser?.uid]);

  const resetAuthForm = () => {
    setTrainerEmail('');
    setTrainerPassword('');
    setTrainerNameInput('');
  };

  const getAuthMessage = (error) => {
    if (error.code === 'auth/email-already-in-use' || error.message?.includes('already registered')) return 'Este e-mail ja esta em uso.';
    if (error.code === 'auth/weak-password' || error.message?.toLowerCase().includes('password')) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (error.code === 'auth/invalid-email' || error.message?.toLowerCase().includes('email')) return error.message || 'E-mail invalido.';
    if (
      error.code === 'auth/user-not-found' ||
      error.code === 'auth/wrong-password' ||
      error.code === 'auth/invalid-credential'
    ) {
      return 'E-mail ou senha incorretos.';
    }
    if (error.message?.includes('Invalid login credentials')) return 'E-mail ou senha incorretos.';
    if (error.code === 'auth/popup-closed-by-user') return 'Login com Google cancelado.';
    if (error.code === 'auth/popup-blocked') return 'O navegador bloqueou o popup do Google.';
    if (error.code === 'auth/operation-not-allowed') {
      return 'Login por e-mail e senha nao esta habilitado no Supabase Auth.';
    }
    return error.message || 'Ocorreu um erro ao processar. Tente novamente.';
  };

  const handleGoogleLogin = async () => {
    setAuthError('');
    setActionLoading(true);

    try {
      await signInWithGoogle();
      resetAuthForm();
      setView('pokedex');
    } catch (error) {
      console.error(error);
      setAuthError(getAuthMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSupabaseSubmit = async (event) => {
    event.preventDefault();
    setAuthError('');
    setActionLoading(true);

    const email = trainerEmail.trim();
    const password = trainerPassword.trim();
    const name = trainerNameInput.trim();

    if (!email || !password) {
      setAuthError('Preencha e-mail e senha.');
      setActionLoading(false);
      return;
    }

    try {
      if (isRegistering) {
        if (name.length < 3 || name.length > 20) {
          setAuthError('O nome do treinador deve ter de 3 a 20 caracteres.');
          setActionLoading(false);
          return;
        }

        await registerTrainer(email, password, name);
      } else {
        await loginTrainer(email, password);
      }

      resetAuthForm();
      setView('pokedex');
    } catch (error) {
      console.error(error);
      setAuthError(getAuthMessage(error));
    } finally {
      setActionLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutTrainer();
    } catch (error) {
      console.error('Erro ao deslogar:', error);
    }

    setCurrentUser(null);
    setCaughtPokemons([]);
    setTeam([]);
    setActiveArea(null);
    setView('pokedex');
  };

  const handleCatch = async (pokemon, trainerData) => {
    if (trainerData?.caughtPokemons) {
      setCaughtPokemons(trainerData.caughtPokemons);
      if (Array.isArray(trainerData.team)) setTeam(trainerData.team);
      return { saved: true, trainerData };
    }

    if (!pokemon?.id) return { saved: false };

    setCaughtPokemons((prev) =>
      prev.some((entry) => entry.id === pokemon.id) ? prev : [...prev, pokemon]
    );

    let saved = false;

    if (currentUser?.uid) {
      try {
        const data = await saveCaughtPokemon(currentUser.uid, pokemon);
        if (data?.caughtPokemons) {
          setCaughtPokemons(data.caughtPokemons);
          if (Array.isArray(data.team)) setTeam(data.team);
        }
        saved = true;
      } catch (error) {
        console.error('Erro ao salvar captura pelo cliente:', error);
      }
    }

    if (!saved) {
      try {
        const data = await getCloudTrainerProfile();
        if (data?.caughtPokemons) {
          setCaughtPokemons(data.caughtPokemons);
          if (Array.isArray(data.team)) setTeam(data.team);
          saved = true;
        }
      } catch (error) {
        console.error('Erro ao recarregar Pokedex da nuvem:', error);
      }
    }

    return { saved };
  };

  const addToTeam = (pokemon) => {
    if (team.length < 6 && !team.some((entry) => entry.id === pokemon.id)) {
      setTeam((prev) => [...prev, pokemon]);
    }
  };

  const removeFromTeam = (id) => {
    setTeam((prev) => prev.filter((entry) => entry.id !== id));
  };

  const getBattleTeam = () =>
    team.length ? team.slice(0, 6) : caughtPokemons.slice(0, 6);

  if (authLoading) {
    return (
      <div className="login-screen">
        <div className="ranking-loading">
          <svg className="animate-spin" viewBox="0 0 24 24" style={{ width: '40px', height: '40px', color: '#F7D02C' }}>
            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.1)" strokeWidth="4" fill="none" />
            <path d="M4 12a8 8 0 0 1 8-8" stroke="currentColor" strokeWidth="4" fill="none" />
          </svg>
          <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Verificando Pokedex Cloud...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="login-screen animate-fade-in">
        <div className="login-card glass-panel">
          <h1>Bem-vindo, Treinador!</h1>

          {!isSupabaseConfigured ? (
            <>
              <div className="supabase-alert-badge">
                Supabase ainda nao esta configurado. O modo local foi desativado para que as contas sejam reais.
              </div>
              <p>
                Configure as variaveis VITE_SUPABASE_* no Netlify, habilite os provedores no Supabase Auth
                e publique novamente o site.
              </p>
            </>
          ) : (
            <>
              <p>Entre com Google ou e-mail para salvar sua conta e sua Pokedex na nuvem.</p>

              <button
                type="button"
                className="btn-google-login"
                onClick={handleGoogleLogin}
                disabled={actionLoading}
              >
                <span className="google-mark">G</span>
                Entrar com Google
              </button>

              <div className="auth-divider">
                <span>ou</span>
              </div>

              <div className="auth-tabs">
                <button
                  type="button"
                  className={`auth-tab-btn ${!isRegistering ? 'active' : ''}`}
                  onClick={() => {
                    setIsRegistering(false);
                    setAuthError('');
                  }}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  className={`auth-tab-btn ${isRegistering ? 'active' : ''}`}
                  onClick={() => {
                    setIsRegistering(true);
                    setAuthError('');
                  }}
                >
                  Criar Conta
                </button>
              </div>

              <form className="login-form" onSubmit={handleSupabaseSubmit}>
                {isRegistering && (
                  <input
                    type="text"
                    placeholder="Nome de Treinador"
                    value={trainerNameInput}
                    onChange={(event) => setTrainerNameInput(event.target.value)}
                    maxLength={20}
                    required
                  />
                )}
                <input
                  type="email"
                  placeholder="E-mail"
                  value={trainerEmail}
                  onChange={(event) => setTrainerEmail(event.target.value)}
                  required
                />
                <input
                  type="password"
                  placeholder="Senha"
                  value={trainerPassword}
                  onChange={(event) => setTrainerPassword(event.target.value)}
                  required
                />
                <button type="submit" className="btn-start-quiz" disabled={actionLoading}>
                  {actionLoading ? 'Carregando...' : isRegistering ? 'Cadastrar e Jogar' : 'Entrar no Jogo'}
                </button>
              </form>

              {authError && <p className="login-error">{authError}</p>}
            </>
          )}
        </div>
      </div>
    );
  }

  if (!activeArea) {
    return (
      <div className="app-container platform-shell">
        <header className="app-header animate-fade-in">
          <div className="header-brand">
            <h1>Quizzdex</h1>
            <span className="caught-badge">Plataforma de quizzes</span>
          </div>
          <div className="header-meta">
            <span className="user-badge">Treinador: {currentUser?.name}</span>
            <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
            <button className="btn-logout" onClick={handleLogout}>Sair</button>
          </div>
        </header>

        <main className="platform-grid animate-fade-in">
          <button
            type="button"
            className="platform-card platform-pokemon"
            onClick={() => {
              setActiveArea('pokemon');
              setView('pokedex');
            }}
          >
            <span className="platform-kicker">Area Pokemon</span>
            <strong>Pokedex Quiz</strong>
            <span>Continue capturando Pokemon, veja ranking, monte time e batalhe.</span>
          </button>

          <button
            type="button"
            className="platform-card platform-naruto"
            onClick={() => {
              setActiveArea('naruto');
              setView('naruto-home');
            }}
          >
            <span className="platform-kicker">Area Naruto</span>
            <strong>Ninja Quiz</strong>
            <span>Adivinhe personagens de Naruto por silhueta e dicas do universo ninja.</span>
          </button>
        </main>
      </div>
    );
  }

  if (activeArea === 'naruto') {
    if (view === 'naruto-quiz') {
      return <NarutoQuiz onBack={() => setView('naruto-home')} />;
    }

    return (
      <div className="app-container naruto-hub">
        <header className="app-header animate-fade-in">
          <div className="header-brand">
            <h1>Area Naruto</h1>
            <span className="caught-badge">Quiz ninja</span>
          </div>
          <div className="header-meta">
            <span className="user-badge">Jogador: {currentUser?.name}</span>
            <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
            <button className="btn-logout" onClick={handleLogout}>Sair</button>
          </div>
          <div className="header-actions">
            <button className="btn-quiz-header btn-area-switch" onClick={() => setActiveArea(null)}>
              <ArrowLeftRight size={19} />
              Trocar area
            </button>
            <button className="btn-quiz-header" onClick={() => setView('naruto-quiz')}>
              <Sparkles size={19} />
              Jogar Naruto
            </button>
          </div>
        </header>

        <main className="naruto-hero animate-fade-in">
          <div>
            <span className="platform-kicker">Novo modo</span>
            <h2>Qual ninja e esse?</h2>
            <p>
              Um desafio por silhueta com dicas de cla, afiliacao, jutsus e estreia. O nome fica protegido no servidor
              ate voce responder.
            </p>
            <button className="btn-start-quiz" onClick={() => setView('naruto-quiz')}>
              <HelpCircle size={22} />
              Iniciar Quiz Naruto
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (view === 'battle') {
    return (
      <BattleArena
        team={getBattleTeam()}
        playerName={currentUser?.name || 'Voce'}
        onExit={() => setView('pokedex')}
      />
    );
  }

  if (view === 'ranking') {
    return (
      <Ranking
        onBack={() => setView('pokedex')}
        myScore={caughtPokemons.length}
        userName={currentUser?.name}
      />
    );
  }

  if (view === 'quiz') {
    return (
      <PokemonQuiz
        onCatch={handleCatch}
        onBack={() => setView('pokedex')}
        caughtIds={caughtPokemons.map((pokemon) => pokemon.id)}
      />
    );
  }

  if (view === 'multiplayer') {
    return (
      <MultiplayerLobby
        onBack={() => setView('pokedex')}
        caughtIds={caughtPokemons.map((pokemon) => pokemon.id)}
        onCatch={handleCatch}
        userName={currentUser?.name}
      />
    );
  }

  return (
    <div className="app-container">
      <header className="app-header animate-fade-in">
        <div className="header-brand">
          <h1>Pokedex</h1>
          {caughtPokemons.length > 0 && (
            <span className="caught-badge">
              {caughtPokemons.length} capturado{caughtPokemons.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <div className="header-meta">
          <span className="user-badge">Treinador: {currentUser?.name}</span>
          <ThemeToggle theme={theme} onToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')} />
          <button className="btn-logout" onClick={handleLogout}>Sair</button>
        </div>
        <div className="header-actions">
          <button className="btn-quiz-header btn-ranking" onClick={() => setView('ranking')}>
            <Trophy size={19} color="#F7D02C" />
            Ranking
          </button>
          <button className="btn-quiz-header btn-online" onClick={() => setView('multiplayer')}>
            <Users size={19} />
            PvP Quiz
          </button>
          <button className="btn-quiz-header btn-battle-header" onClick={() => setView('battle')}>
            <Swords size={19} />
            Batalhar
          </button>
          <button className="btn-quiz-header btn-area-switch" onClick={() => setActiveArea(null)}>
            <ArrowLeftRight size={19} />
            Trocar area
          </button>
          <button className="btn-quiz-header" onClick={() => setView('quiz')}>
            <HelpCircle size={19} />
            Jogar Quiz
          </button>
        </div>
      </header>

      {caughtPokemons.length === 0 ? (
        <div className="empty-pokedex animate-fade-in">
          <div className="empty-pokeball-svg">
            <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
              <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
              <path d="M 2 50 A 48 48 0 0 1 98 50" fill="rgba(239,68,68,0.2)" stroke="rgba(239,68,68,0.4)" strokeWidth="2" />
              <path d="M 2 50 A 48 48 0 0 0 98 50" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.15)" strokeWidth="2" />
              <line x1="2" y1="50" x2="98" y2="50" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
              <circle cx="50" cy="50" r="12" fill="rgba(30,41,59,0.9)" stroke="rgba(255,255,255,0.2)" strokeWidth="3" />
              <circle cx="50" cy="50" r="5" fill="rgba(255,255,255,0.15)" />
            </svg>
          </div>
          <h2>Sua Pokedex esta vazia</h2>
          <p>Jogue o quiz para capturar Pokemon e adicionar todos aqui.</p>
          <button className="btn-start-quiz" onClick={() => setView('quiz')}>
            <HelpCircle size={22} />
            Iniciar Quiz
          </button>
        </div>
      ) : (
        <main className="pokemon-grid">
          {caughtPokemons.map((pokemon) => (
            <PokemonCard
              key={pokemon.id}
              pokemon={{ name: pokemon.name, url: `https://pokeapi.co/api/v2/pokemon/${pokemon.id}/` }}
              onClick={setSelectedPokemon}
            />
          ))}
          <div
            className="add-more-card glass-panel"
            onClick={() => setView('quiz')}
            title="Capturar mais Pokemon"
          >
            <div className="add-more-inner">
              <HelpCircle size={32} strokeWidth={1.5} />
              <span>Capturar mais</span>
            </div>
          </div>
        </main>
      )}

      {team.length > 0 && (
        <div className="team-bar glass-panel animate-fade-in">
          <div className="team-slots">
            {team.map((pokemon) => (
              <div
                key={pokemon.id}
                className="team-slot-item"
                onClick={() => removeFromTeam(pokemon.id)}
                title="Remover do time"
              >
                <img src={pokemon.sprites.front_default} alt={pokemon.name} />
              </div>
            ))}
            {Array.from({ length: 6 - team.length }).map((_, index) => (
              <div key={`empty-${index}`} className="team-slot-empty" />
            ))}
          </div>
          <button className="btn-battle" onClick={() => setView('battle')}>
            <Swords size={17} style={{ display: 'inline', marginRight: '6px' }} />
            IR PARA BATALHA
          </button>
        </div>
      )}

      {selectedPokemon && (
        <PokemonModal
          pokemon={selectedPokemon}
          onClose={() => setSelectedPokemon(null)}
          onAdd={() => addToTeam(selectedPokemon)}
          inTeam={team.some((pokemon) => pokemon.id === selectedPokemon.id)}
        />
      )}
    </div>
  );
}

export default App;
