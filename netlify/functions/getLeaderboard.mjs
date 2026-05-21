import { createClient } from '@supabase/supabase-js';
import { json, serverError } from './_shared/http.mjs';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const getSupabaseAdmin = () => {
  if (!supabaseUrl || !supabaseServiceRoleKey) return null;

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
};

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Metodo nao permitido' }, { Allow: 'GET' });

  const supabase = getSupabaseAdmin();
  if (!supabase) return serverError('Supabase Admin nao configurado.');

  try {
    const [{ data: profiles, error: profileError }, { data: caughtRows, error: caughtError }] =
      await Promise.all([
        supabase.from('profiles').select('id, username, avatar_url, score'),
        supabase.from('caught_pokemon').select('user_id, pokemon_id'),
      ]);

    if (profileError) throw profileError;
    if (caughtError) throw caughtError;

    const counts = new Map();
    for (const row of caughtRows || []) {
      counts.set(row.user_id, (counts.get(row.user_id) || 0) + 1);
    }

    const leaderboard = (profiles || [])
      .map((profile) => {
        const count = counts.get(profile.id) || 0;
        return {
          uid: profile.id,
          name: profile.username || 'Treinador',
          count,
          photoURL: profile.avatar_url || '',
          isBot: false,
          needsRepair: Number(profile.score || 0) !== count,
        };
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 50);

    const repairs = leaderboard
      .filter((entry) => entry.needsRepair)
      .map((entry) =>
        supabase
          .from('profiles')
          .update({ score: entry.count, updated_at: new Date().toISOString() })
          .eq('id', entry.uid)
      );

    await Promise.allSettled(repairs);

    return json(200, {
      leaderboard: leaderboard.map(({ needsRepair, ...entry }) => entry),
    }, { 'Cache-Control': 'no-store' });
  } catch (error) {
    console.error('Erro ao montar ranking seguro:', error);
    return serverError('Nao foi possivel carregar o ranking.');
  }
};
