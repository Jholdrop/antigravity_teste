import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Medal, Star, Trophy } from 'lucide-react';
import { getGlobalLeaderboard, isSupabaseConfigured } from '../api/supabase';
import './Ranking.css';

const Ranking = ({ onBack, myScore, userName }) => {
  const [leaderboard, setLeaderboard] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRanking = async () => {
      setLoading(true);

      try {
        const globalPlayers = isSupabaseConfigured ? await getGlobalLeaderboard() : [];
        const players = globalPlayers.map((player) => ({
          ...player,
          isMe: player.name === userName,
        }));

        if (userName && !players.some((player) => player.name === userName)) {
          players.push({ name: userName, count: myScore, isMe: true, isBot: false });
        }

        players.sort((a, b) => b.count - a.count);
        setLeaderboard(players);
      } catch (error) {
        console.error('Erro ao carregar ranking:', error);
        setLeaderboard([]);
      } finally {
        setLoading(false);
      }
    };

    loadRanking();
  }, [myScore, userName]);

  return (
    <div className="ranking-page animate-fade-in">
      <header className="ranking-header">
        <button className="btn-back-quiz" onClick={onBack}>
          <ArrowLeft size={20} /> Voltar
        </button>
        <div className="ranking-title">
          <Trophy size={36} color="#F7D02C" />
          <h1>Hall da Fama</h1>
        </div>
        <div style={{ width: '100px' }} />
      </header>

      <div className="ranking-container">
        <div className="ranking-info-box glass-panel">
          <h3>Ranking Global</h3>
          <p>
            Este ranking mostra contas reais salvas no Supabase/Postgres. A pontuacao sobe quando o servidor valida
            uma resposta correta e registra a captura.
          </p>
        </div>

        <div className="ranking-list glass-panel">
          {loading ? (
            <div className="ranking-loading">
              <Loader2 className="animate-spin" size={32} />
              <p>Carregando ranking global...</p>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="ranking-loading">
              <p>Nenhum treinador no ranking ainda.</p>
            </div>
          ) : (
            leaderboard.map((player, index) => (
              <div key={player.uid || player.name} className={`ranking-row ${player.isMe ? 'is-me' : ''}`}>
                <div className="rank-position">
                  {index === 0 ? <Medal size={28} color="#fbbf24" /> :
                   index === 1 ? <Medal size={28} color="#9ca3af" /> :
                   index === 2 ? <Medal size={28} color="#b45309" /> :
                   `#${index + 1}`}
                </div>
                <div className="rank-name">
                  {player.name}
                  {player.isMe && <Star size={14} color="#F7D02C" style={{ marginLeft: '8px' }} />}
                </div>
                <div className="rank-score">
                  <span className="score-number">{player.count}</span> Pokemon
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Ranking;
