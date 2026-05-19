import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export const auth = supabase?.auth || null;
export const db = supabase;

const assertSupabase = () => {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase nao configurado pelo administrador do site.');
  }
};

const sanitizeTrainerName = (value) => {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 20);

  return cleaned || 'Treinador';
};

const toAppUser = (user) => {
  if (!user) return null;
  const metadata = user.user_metadata || {};

  return {
    ...user,
    uid: user.id,
    displayName: metadata.name || metadata.full_name || metadata.user_name || '',
    photoURL: metadata.avatar_url || metadata.picture || '',
  };
};

const getDefaultTrainerName = (user, preferredName) =>
  sanitizeTrainerName(preferredName || user.displayName || user.email?.split('@')[0] || 'Treinador');

const normalizeTypes = (types = []) =>
  types.map((entry) => ({
    slot: Number(entry.slot || 0),
    type: {
      name: String(entry.type?.name || entry.name || ''),
      url: String(entry.type?.url || entry.url || ''),
    },
  }));

const normalizeCapturedPokemon = (pokemon) => ({
  id: Number(pokemon.id),
  name: String(pokemon.name || '').toLowerCase(),
  sprites: {
    front_default:
      pokemon.sprites?.front_default ||
      pokemon.sprites?.other?.['official-artwork']?.front_default ||
      '',
  },
  types: normalizeTypes(pokemon.types || []),
});

const caughtRowToPokemon = (row) => ({
  id: Number(row.pokemon_id),
  name: row.pokemon_name,
  sprites: { front_default: row.sprite_url || '' },
  types: Array.isArray(row.types) ? row.types : [],
});

const getProfileBundle = async (uid) => {
  const [{ data: profile, error: profileError }, { data: caughtRows, error: caughtError }, { data: teamRow, error: teamError }] =
    await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('caught_pokemon').select('*').eq('user_id', uid).order('caught_at', { ascending: true }),
      supabase.from('teams').select('pokemon_ids').eq('user_id', uid).maybeSingle(),
    ]);

  if (profileError) throw profileError;
  if (caughtError) throw caughtError;
  if (teamError) throw teamError;

  const caughtPokemons = (caughtRows || []).map(caughtRowToPokemon);
  const teamIds = Array.isArray(teamRow?.pokemon_ids) ? teamRow.pokemon_ids.map(Number) : [];
  const team = teamIds
    .map((id) => caughtPokemons.find((pokemon) => pokemon.id === id))
    .filter(Boolean);

  return {
    uid,
    name: profile?.username || 'Treinador',
    email: profile?.email || '',
    photoURL: profile?.avatar_url || '',
    caughtPokemons,
    team,
    score: Number(profile?.score ?? caughtPokemons.length),
  };
};

export const onAuthStateChanged = (authClient, callback) => {
  if (!authClient || !supabase) {
    callback(null);
    return () => {};
  }

  let active = true;

  supabase.auth.getSession().then(({ data }) => {
    if (active) callback(toAppUser(data.session?.user || null));
  });

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(toAppUser(session?.user || null));
  });

  return () => {
    active = false;
    data.subscription.unsubscribe();
  };
};

export const ensureTrainerProfile = async (user, preferredName = '') => {
  assertSupabase();
  const appUser = toAppUser(user);
  if (!appUser?.uid) throw new Error('Usuario invalido.');

  const existing = await getProfileBundle(appUser.uid).catch(() => null);
  const name = existing?.name || getDefaultTrainerName(appUser, preferredName);

  const profilePayload = {
    id: appUser.uid,
    username: name,
    email: appUser.email || existing?.email || '',
    avatar_url: appUser.photoURL || existing?.photoURL || '',
    score: existing?.score || 0,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' });

  if (error) throw error;

  return getProfileBundle(appUser.uid);
};

export const registerTrainer = async (email, password, trainerName) => {
  assertSupabase();

  const sanitizedName = sanitizeTrainerName(trainerName);
  if (sanitizedName.length < 3) {
    throw new Error('Nome de treinador invalido.');
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        name: sanitizedName,
        full_name: sanitizedName,
      },
      emailRedirectTo: window.location.origin,
    },
  });

  if (error) throw error;

  if (!data.session) {
    throw new Error('Conta criada. Confirme seu e-mail e depois entre no jogo.');
  }

  return ensureTrainerProfile(data.user, sanitizedName);
};

export const loginTrainer = async (email, password) => {
  assertSupabase();

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  await ensureTrainerProfile(data.user);
  return toAppUser(data.user);
};

export const signInWithGoogle = async () => {
  assertSupabase();

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
      queryParams: { prompt: 'select_account' },
    },
  });

  if (error) throw error;
};

export const logoutTrainer = async () => {
  if (!isSupabaseConfigured || !supabase) return;
  await supabase.auth.signOut();
};

export const getTrainerData = async (userOrUid) => {
  if (!isSupabaseConfigured || !supabase) return null;

  if (typeof userOrUid === 'string') {
    return getProfileBundle(userOrUid);
  }

  const appUser = toAppUser(userOrUid);
  if (appUser?.uid) {
    return ensureTrainerProfile(appUser);
  }

  return null;
};

export const saveTrainerTeam = async (uid, team) => {
  if (!isSupabaseConfigured || !supabase || !uid) return;

  const pokemonIds = (team || []).map((pokemon) => Number(pokemon.id)).filter(Boolean).slice(0, 6);
  const { error } = await supabase
    .from('teams')
    .upsert({
      user_id: uid,
      pokemon_ids: pokemonIds,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) throw error;
};

export const saveCaughtPokemon = async (uid, pokemon) => {
  assertSupabase();
  if (!uid || !pokemon?.id) throw new Error('Captura invalida.');

  const capturedPokemon = normalizeCapturedPokemon(pokemon);
  const row = {
    user_id: uid,
    pokemon_id: capturedPokemon.id,
    pokemon_name: capturedPokemon.name,
    sprite_url: capturedPokemon.sprites.front_default,
    types: capturedPokemon.types,
  };

  const { error } = await supabase.from('caught_pokemon').insert(row);
  if (error && error.code !== '23505') throw error;

  const bundle = await getProfileBundle(uid);
  const score = bundle.caughtPokemons.length;
  await supabase
    .from('profiles')
    .update({ score, updated_at: new Date().toISOString() })
    .eq('id', uid);

  return {
    caughtPokemons: bundle.caughtPokemons,
    team: bundle.team,
    score,
    alreadyCaught: error?.code === '23505',
  };
};

export const getCurrentUserIdToken = async () => {
  if (!isSupabaseConfigured || !supabase) return '';
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || '';
};

export const getCloudTrainerProfile = async () => {
  const idToken = await getCurrentUserIdToken();
  if (!idToken) return null;

  const response = await fetch('/.netlify/functions/getTrainerProfile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ idToken }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Nao foi possivel carregar o perfil na nuvem.');
  }

  return data.trainerData || null;
};

export const getGlobalLeaderboard = async () => {
  if (!isSupabaseConfigured || !supabase) return [];

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, score, avatar_url')
      .order('score', { ascending: false })
      .limit(50);

    if (error) throw error;

    return (data || []).map((entry) => ({
      uid: entry.id,
      name: entry.username || 'Treinador',
      count: Number(entry.score || 0),
      photoURL: entry.avatar_url || '',
      isBot: false,
    }));
  } catch (error) {
    console.error('Erro ao buscar leaderboard:', error);
    return [];
  }
};
