import { createClient } from '@supabase/supabase-js';
import { getDisplayPokemonName } from './pokemonNames.mjs';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const isSupabaseAdminConfigured = () => Boolean(supabaseUrl && supabaseServiceRoleKey);

const getSupabaseAdmin = () => {
  if (!isSupabaseAdminConfigured()) return null;

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
};

const sanitizeTrainerName = (value) => {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 20);

  return cleaned || 'Treinador';
};

const toUserProfile = (user) => {
  const metadata = user?.user_metadata || {};
  return {
    uid: user.id,
    name: sanitizeTrainerName(metadata.name || metadata.full_name || user.email?.split('@')[0]),
    email: user.email || '',
    photoURL: metadata.avatar_url || metadata.picture || '',
  };
};

const normalizeTypes = (types = []) =>
  types.map((entry) => ({
    slot: Number(entry.slot || 0),
    type: {
      name: String(entry.type?.name || entry.name || ''),
      url: String(entry.type?.url || entry.url || ''),
    },
  }));

const caughtRowToPokemon = (row) => ({
  id: Number(row.pokemon_id),
  name: row.pokemon_name,
  sprites: { front_default: row.sprite_url || '' },
  types: Array.isArray(row.types) ? row.types : [],
});

const getUserFromToken = async (supabase, idToken) => {
  if (!idToken) throw new Error('Sessao ausente.');

  const { data, error } = await supabase.auth.getUser(idToken);
  if (error || !data?.user) throw error || new Error('Sessao invalida.');

  return data.user;
};

const ensureProfile = async (supabase, user) => {
  const profile = toUserProfile(user);

  const { data: existing, error: existingError } = await supabase
    .from('profiles')
    .select('id, username, email, avatar_url, score')
    .eq('id', profile.uid)
    .maybeSingle();

  if (existingError) throw existingError;

  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: profile.uid,
      username: existing?.username || profile.name,
      email: profile.email || existing?.email || '',
      avatar_url: profile.photoURL || existing?.avatar_url || '',
      score: Number(existing?.score || 0),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });

  if (error) throw error;

  return {
    ...profile,
    name: existing?.username || profile.name,
    score: Number(existing?.score || 0),
  };
};

const getProfileBundle = async (supabase, uid) => {
  const [{ data: profile, error: profileError }, { data: caughtRows, error: caughtError }, { data: teamRow, error: teamError }] =
    await Promise.all([
      supabase.from('profiles').select('id, username, email, avatar_url, score').eq('id', uid).maybeSingle(),
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

const updateScore = async (supabase, uid) => {
  const { count, error: countError } = await supabase
    .from('caught_pokemon')
    .select('pokemon_id', { count: 'exact', head: true })
    .eq('user_id', uid);

  if (countError) throw countError;

  const score = Number(count || 0);
  const { error } = await supabase
    .from('profiles')
    .update({ score, updated_at: new Date().toISOString() })
    .eq('id', uid);

  if (error) throw error;
  return score;
};

export const getTrainerProfileFromToken = async (idToken) => {
  const supabase = getSupabaseAdmin();
  if (!supabase || !idToken) {
    return {
      saved: false,
      reason: 'Supabase Admin nao configurado ou sessao ausente.',
      trainerData: null,
    };
  }

  const user = await getUserFromToken(supabase, idToken);
  await ensureProfile(supabase, user);
  const trainerData = await getProfileBundle(supabase, user.id);

  return {
    saved: true,
    trainerData,
  };
};

export const toCapturedPokemon = (pokemon, species = null) => ({
  id: pokemon.id,
  name: getDisplayPokemonName(pokemon, species),
  sprites: {
    front_default:
      pokemon.sprites?.other?.['official-artwork']?.front_default ||
      pokemon.sprites?.front_default ||
      '',
  },
  types: normalizeTypes(pokemon.types || []),
});

export const awardPokemonToUser = async ({ idToken, pokemon, species = null }) => {
  const supabase = getSupabaseAdmin();
  const capturedPokemon = toCapturedPokemon(pokemon, species);

  if (!supabase || !idToken) {
    return {
      saved: false,
      reason: 'Supabase Admin nao configurado ou sessao ausente.',
      capturedPokemon,
    };
  }

  const user = await getUserFromToken(supabase, idToken);
  await ensureProfile(supabase, user);

  const { data: existing, error: existingError } = await supabase
    .from('caught_pokemon')
    .select('pokemon_id')
    .eq('user_id', user.id)
    .eq('pokemon_id', capturedPokemon.id)
    .maybeSingle();

  if (existingError) throw existingError;

  const alreadyCaught = Boolean(existing);
  if (!alreadyCaught) {
    const { error } = await supabase.from('caught_pokemon').insert({
      user_id: user.id,
      pokemon_id: capturedPokemon.id,
      pokemon_name: capturedPokemon.name,
      sprite_url: capturedPokemon.sprites.front_default,
      types: capturedPokemon.types,
    });

    if (error && error.code !== '23505') throw error;
  }

  const score = await updateScore(supabase, user.id);
  const trainerData = await getProfileBundle(supabase, user.id);

  return {
    saved: true,
    alreadyCaught,
    score,
    trainerData,
    capturedPokemon,
  };
};
