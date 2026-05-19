import { useState, useEffect } from 'react';
import Peer from 'peerjs';
import MultiplayerQuiz from './MultiplayerQuiz';
import { ArrowLeft, Wifi, Swords, User } from 'lucide-react';
import './Multiplayer.css';

const MultiplayerLobby = ({ onBack, caughtIds, onCatch, userName }) => {
  const [nickname, setNickname] = useState(userName || '');
  const [isNicknameSet, setIsNicknameSet] = useState(!!userName);
  const [peer, setPeer] = useState(null);
  const [targetId, setTargetId] = useState('');
  const [connection, setConnection] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [status, setStatus] = useState('Pronto para conectar.');
  const [error, setError] = useState('');

  const initializePeer = (eOrNick) => {
    if (eOrNick?.preventDefault) eOrNick.preventDefault();
    const rawNick = typeof eOrNick === 'string' ? eOrNick : nickname;
    const cleanNick = rawNick.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
    if (!cleanNick) {
      setError('Por favor, digite um Nick válido (apenas letras, números, underline ou hífen).');
      return;
    }

    setNickname(cleanNick);
    setIsNicknameSet(true);
    setStatus('Conectando ao servidor...');
    
    // O ID do peer será exatamente o nick limpo!
    const newPeer = new Peer(cleanNick, {
      debug: 2
    });

    newPeer.on('open', (id) => {
      setStatus('Online! Seu Nick é: ' + id);
      setError('');
    });

    newPeer.on('connection', (conn) => {
      conn.on('open', () => {
        setConnection(conn);
        setIsHost(true);
      });
      conn.on('close', () => {
        setConnection(null);
        setError('Oponente desconectou.');
      });
    });

    newPeer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        setError('Esse Nick já está em uso! Escolha outro.');
        setIsNicknameSet(false);
      } else {
        setError('Erro: ' + err.type);
      }
      setStatus('Falha na conexão.');
    });

    setPeer(newPeer);
  };

  useEffect(() => {
    if (userName && !peer) {
      initializePeer(userName);
    }
    return () => {
      if (peer) peer.destroy();
    };
  }, [peer, userName]);

  const connectToPeer = (e) => {
    e.preventDefault();
    const cleanTarget = targetId.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!peer || !cleanTarget) return;
    if (cleanTarget === peer.id) {
      setError('Você não pode conectar com você mesmo!');
      return;
    }

    setStatus('Procurando oponente...');
    setError('');
    
    const conn = peer.connect(cleanTarget, { reliable: true });
    
    conn.on('open', () => {
      setConnection(conn);
      setIsHost(false);
    });
    
    conn.on('close', () => {
      setConnection(null);
      setError('Oponente desconectou.');
    });

    conn.on('error', (err) => {
      setError('Erro ao conectar. O Nick do seu amigo está correto? Ele está online?');
    });
  };

  if (connection) {
    return (
      <MultiplayerQuiz 
        connection={connection} 
        isHost={isHost} 
        onBack={() => {
           connection.close();
           setConnection(null);
           onBack();
        }}
        caughtIds={caughtIds}
        onCatch={onCatch}
      />
    );
  }

  return (
    <div className="lobby-container animate-fade-in">
      <button className="btn-back-quiz" onClick={onBack} style={{ alignSelf: 'flex-start', marginBottom: '1rem' }}>
        <ArrowLeft size={20} /> Voltar
      </button>

      <div className="lobby-card glass-panel">
        <div className="lobby-header">
          <Swords size={40} className="lobby-icon" />
          <h2>Modo Online (1 vs 1)</h2>
          <p>Batalha ao vivo! Escolha seu Nick e jogue com um amigo.</p>
        </div>

        {error && <div className="lobby-error">{error}</div>}

        {!isNicknameSet ? (
          <form className="lobby-section" onSubmit={initializePeer}>
            <h3>1. Escolha seu Nickname</h3>
            <div className="connect-row">
              <input 
                type="text" 
                placeholder="Seu nome no jogo..."
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                className="id-input"
                maxLength={15}
              />
              <button type="submit" className="btn-connect" disabled={!nickname.trim()}>
                <User size={18} /> Definir Nick
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="lobby-section">
              <h3>Nick conectado</h3>
              <div className="connect-row">
                <input
                  type="text"
                  value={nickname}
                  disabled
                  className="id-input"
                />
                <button type="button" className="btn-connect" disabled>
                  <User size={18} /> Usando login
                </button>
              </div>
            </div>
            <div className="lobby-section">
              <h3 style={{ color: '#4ade80' }}>{status}</h3>
            </div>

            <div className="lobby-divider"><span>CONECTAR</span></div>

            <form className="lobby-section" onSubmit={connectToPeer}>
              <h3>2. Procurar amigo pelo Nickname</h3>
              <div className="connect-row">
                <input 
                  type="text" 
                  placeholder="Nick do seu amigo..."
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="id-input"
                />
                <button type="submit" className="btn-connect" disabled={!targetId.trim()}>
                  <Wifi size={18} /> Desafiar!
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

export default MultiplayerLobby;
