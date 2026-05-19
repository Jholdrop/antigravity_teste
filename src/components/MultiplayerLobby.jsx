import { useEffect, useRef, useState } from 'react';
import Peer from 'peerjs';
import BattleArena from './BattleArena';
import MultiplayerQuiz from './MultiplayerQuiz';
import { ArrowLeft, Wifi, Swords, User, X, Check } from 'lucide-react';
import './Multiplayer.css';

const cleanNickname = (value) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 20);

const MultiplayerLobby = ({ onBack, caughtIds, onCatch, userName, mode = 'quiz', battleTeam = [] }) => {
  const [nickname, setNickname] = useState(userName || '');
  const [isNicknameSet, setIsNicknameSet] = useState(Boolean(userName));
  const [peer, setPeer] = useState(null);
  const [targetId, setTargetId] = useState('');
  const [connection, setConnection] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [pendingInvite, setPendingInvite] = useState(null);
  const [sentInvite, setSentInvite] = useState(null);
  const [status, setStatus] = useState('Pronto para conectar.');
  const [error, setError] = useState('');

  const connectionRef = useRef(null);
  const pendingInviteRef = useRef(null);
  const sentInviteRef = useRef(null);

  useEffect(() => {
    connectionRef.current = connection;
  }, [connection]);

  useEffect(() => {
    pendingInviteRef.current = pendingInvite;
  }, [pendingInvite]);

  useEffect(() => {
    sentInviteRef.current = sentInvite;
  }, [sentInvite]);

  const isBusy = () => Boolean(connectionRef.current || pendingInviteRef.current || sentInviteRef.current);

  const beginBattle = (conn, hostRole) => {
    connectionRef.current = conn;
    pendingInviteRef.current = null;
    sentInviteRef.current = null;
    setPendingInvite(null);
    setSentInvite(null);
    setError('');
    setIsHost(hostRole);
    setConnection(conn);
  };

  const resetInvite = (message = '') => {
    pendingInviteRef.current = null;
    sentInviteRef.current = null;
    setPendingInvite(null);
    setSentInvite(null);
    if (message) setStatus(message);
  };

  const registerIncomingConnection = (conn) => {
    const showInvite = () => {
      if (connectionRef.current || sentInviteRef.current) {
        conn.send?.({ type: 'BATTLE_BUSY' });
        setTimeout(() => conn.close(), 150);
        return;
      }

      if (pendingInviteRef.current?.conn === conn) return;

      const invite = { conn, from: conn.peer || 'oponente' };
      pendingInviteRef.current = invite;
      setPendingInvite(invite);
      setStatus(`Convite recebido de ${invite.from}.`);
      setError('');
    };

    conn.on('open', showInvite);

    conn.on('data', (data) => {
      if (data?.type === 'BATTLE_INVITE') {
        showInvite();
      }

      if (data?.type === 'INVITE_CANCELLED' && pendingInviteRef.current?.conn === conn) {
        resetInvite('Convite cancelado pelo oponente.');
      }
    });

    conn.on('close', () => {
      if (pendingInviteRef.current?.conn === conn) {
        resetInvite('Convite cancelado.');
      }

      if (connectionRef.current === conn) {
        connectionRef.current = null;
        setConnection(null);
        setStatus('Oponente desconectou.');
      }
    });

    conn.on('error', () => {
      if (pendingInviteRef.current?.conn === conn) {
        resetInvite('Erro ao receber o convite.');
      }
    });
  };

  const initializePeer = (eventOrNick) => {
    if (eventOrNick?.preventDefault) eventOrNick.preventDefault();
    const cleanNick = cleanNickname(typeof eventOrNick === 'string' ? eventOrNick : nickname);

    if (!cleanNick) {
      setError('Digite um nick valido usando letras, numeros, underline ou hifen.');
      return;
    }

    if (peer && !peer.destroyed) {
      peer.destroy();
    }

    setNickname(cleanNick);
    setIsNicknameSet(true);
    setStatus('Conectando ao servidor...');
    setError('');

    const newPeer = new Peer(cleanNick, { debug: 2 });

    newPeer.on('open', (id) => {
      setStatus(`Online! Seu nick e ${id}.`);
      setError('');
    });

    newPeer.on('connection', registerIncomingConnection);

    newPeer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        setError('Esse nick ja esta em uso. Escolha outro.');
        setIsNicknameSet(false);
      } else {
        setError(`Erro de conexao: ${err.type || 'desconhecido'}.`);
      }
      setStatus('Falha na conexao.');
    });

    setPeer(newPeer);
  };

  useEffect(() => {
    let autoInitTimer = 0;

    if (userName && !peer) {
      autoInitTimer = window.setTimeout(() => initializePeer(userName), 0);
    }

    return () => {
      clearTimeout(autoInitTimer);
      if (peer && !peer.destroyed) peer.destroy();
    };
    // O peer precisa ser criado uma vez por nick ativo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peer, userName]);

  const connectToPeer = (event) => {
    event.preventDefault();
    const cleanTarget = cleanNickname(targetId);

    if (!peer || !cleanTarget || isBusy()) return;

    if (cleanTarget === peer.id) {
      setError('Voce nao pode desafiar voce mesmo.');
      return;
    }

    setStatus('Enviando convite...');
    setError('');

    const conn = peer.connect(cleanTarget, { reliable: true });

    conn.on('open', () => {
      const invite = { conn, to: cleanTarget };
      sentInviteRef.current = invite;
      setSentInvite(invite);
      setStatus(`Convite enviado para ${cleanTarget}. Aguardando resposta...`);
      conn.send({ type: 'BATTLE_INVITE', from: peer.id });
    });

    conn.on('data', (data) => {
      if (data?.type === 'BATTLE_ACCEPTED') {
        setStatus('Convite aceito. Iniciando partida...');
        beginBattle(conn, false);
        return;
      }

      if (data?.type === 'BATTLE_DECLINED') {
        conn.close();
        setError(`${cleanTarget} recusou o convite.`);
        resetInvite('Online. Escolha outro oponente ou tente de novo.');
        return;
      }

      if (data?.type === 'BATTLE_BUSY') {
        conn.close();
        setError(`${cleanTarget} ja esta em outra partida ou convite.`);
        resetInvite('Online. Escolha outro oponente ou tente de novo.');
      }
    });

    conn.on('close', () => {
      if (sentInviteRef.current?.conn === conn) {
        resetInvite('Convite encerrado.');
      }

      if (connectionRef.current === conn) {
        connectionRef.current = null;
        setConnection(null);
        setStatus('Oponente desconectou.');
      }
    });

    conn.on('error', () => {
      setError('Erro ao conectar. Confira se o nick esta correto e se seu amigo esta online.');
      resetInvite('Falha ao enviar convite.');
    });
  };

  const acceptInvite = () => {
    if (!pendingInvite?.conn) return;
    pendingInvite.conn.send({ type: 'BATTLE_ACCEPTED', from: nickname });
    setStatus('Convite aceito. Iniciando partida...');
    beginBattle(pendingInvite.conn, true);
  };

  const declineInvite = () => {
    if (!pendingInvite?.conn) return;
    pendingInvite.conn.send({ type: 'BATTLE_DECLINED', from: nickname });
    pendingInvite.conn.close();
    resetInvite('Convite recusado. Voce continua online.');
  };

  const cancelSentInvite = () => {
    if (!sentInvite?.conn) return;
    sentInvite.conn.send({ type: 'INVITE_CANCELLED', from: nickname });
    sentInvite.conn.close();
    resetInvite('Convite cancelado.');
  };

  const leaveBattle = () => {
    if (connectionRef.current) {
      connectionRef.current.send?.({ type: 'OPPONENT_LEFT' });
      connectionRef.current.close();
    }
    connectionRef.current = null;
    setConnection(null);
    onBack();
  };

  if (connection) {
    if (mode === 'battle') {
      return (
        <BattleArena
          team={battleTeam}
          connection={connection}
          isHost={isHost}
          playerName={nickname || 'Voce'}
          opponentName={connection.peer || 'Oponente'}
          onExit={leaveBattle}
        />
      );
    }

    return (
      <MultiplayerQuiz
        connection={connection}
        isHost={isHost}
        onBack={leaveBattle}
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
          <h2>{mode === 'battle' ? 'Batalha PvP' : 'Modo Online (1 vs 1)'}</h2>
          <p>
            {mode === 'battle'
              ? 'Envie um desafio de batalha e espere o outro treinador aceitar.'
              : 'Escolha seu nick, envie um desafio e espere o outro treinador aceitar.'}
          </p>
        </div>

        {error && <div className="lobby-error">{error}</div>}

        {!isNicknameSet ? (
          <form className="lobby-section" onSubmit={initializePeer}>
            <h3>1. Escolha seu nickname</h3>
            <div className="connect-row">
              <input
                type="text"
                placeholder="Seu nome no jogo..."
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                className="id-input"
                maxLength={20}
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
                <input type="text" value={nickname} disabled className="id-input" />
                <button type="button" className="btn-connect" disabled>
                  <User size={18} /> Online
                </button>
              </div>
            </div>

            <div className="lobby-section">
              <h3 style={{ color: '#4ade80' }}>{status}</h3>
            </div>

            {pendingInvite && (
              <div className="battle-invite-card">
                <div>
                  <span className="invite-label">Solicitacao de batalha</span>
                  <strong>{pendingInvite.from}</strong>
                </div>
                <div className="invite-actions">
                  <button type="button" className="btn-invite accept" onClick={acceptInvite}>
                    <Check size={18} /> Aceitar
                  </button>
                  <button type="button" className="btn-invite decline" onClick={declineInvite}>
                    <X size={18} /> Recusar
                  </button>
                </div>
              </div>
            )}

            {sentInvite && (
              <div className="battle-invite-card sent">
                <div>
                  <span className="invite-label">Convite enviado</span>
                  <strong>{sentInvite.to}</strong>
                </div>
                <button type="button" className="btn-invite decline" onClick={cancelSentInvite}>
                  <X size={18} /> Cancelar
                </button>
              </div>
            )}

            <div className="lobby-divider"><span>CONECTAR</span></div>

            <form className="lobby-section" onSubmit={connectToPeer}>
              <h3>2. Procurar amigo pelo nickname</h3>
              <div className="connect-row">
                <input
                  type="text"
                  placeholder="Nick do seu amigo..."
                  value={targetId}
                  onChange={(event) => setTargetId(event.target.value)}
                  className="id-input"
                  disabled={Boolean(pendingInvite || sentInvite)}
                />
                <button type="submit" className="btn-connect" disabled={!targetId.trim() || Boolean(pendingInvite || sentInvite)}>
                  <Wifi size={18} /> Desafiar
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
