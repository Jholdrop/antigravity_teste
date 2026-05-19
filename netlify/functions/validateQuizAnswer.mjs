import { json, methodNotAllowed, serverError } from './_shared/http.mjs';
import {
  decryptChallengeToken,
  isQuizConfigError,
} from './_shared/quizCrypto.mjs';
import { awardPokemonToUser, toCapturedPokemon } from './_shared/supabaseAdmin.mjs';
import {
  buildAcceptedPokemonNames,
  getDisplayPokemonName,
  isAcceptedPokemonGuess,
} from './_shared/pokemonNames.mjs';

const BASE_URL = 'https://pokeapi.co/api/v2';
const RATE_WINDOW_MS = 120000;
const MAX_ATTEMPTS_PER_WINDOW = 8;
const MIN_ELAPSED_MS = 450;
const sessionAttempts = new Map();

const recordAttempt = (sessionId, challengeId) => {
  const key = `${sessionId}:${challengeId}`;
  const now = Date.now();
  const entry = sessionAttempts.get(key) || { count: 0, first: now };

  if (now - entry.first > RATE_WINDOW_MS) {
    entry.count = 0;
    entry.first = now;
  }

  entry.count += 1;
  sessionAttempts.set(key, entry);

  if (sessionAttempts.size > 5000) {
    for (const [entryKey, value] of sessionAttempts.entries()) {
      if (now - value.first > RATE_WINDOW_MS) sessionAttempts.delete(entryKey);
    }
  }

  return entry.count;
};

const parseBody = (event) => {
  try {
    return JSON.parse(event.body || '{}');
  } catch {
    return null;
  }
};

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const body = parseBody(event);
  if (!body) return json(400, { error: 'Corpo invalido ou vazio' });

  const { challengeId, challengeToken, guess, startedAt, sessionId, idToken } = body;
  if (!challengeId || !challengeToken || typeof guess !== 'string' || !startedAt || !sessionId) {
    return json(400, { error: 'Dados de validacao incompletos' });
  }

  let decoded;
  try {
    decoded = decryptChallengeToken(challengeToken);
  } catch (error) {
    if (isQuizConfigError(error)) return serverError(error.message);
    decoded = null;
  }

  if (!decoded || decoded.challengeId !== challengeId) {
    return json(403, { error: 'Token de desafio invalido' });
  }

  if (Date.now() > decoded.expiresAt) {
    return json(403, { error: 'Desafio expirado', expired: true });
  }

  const elapsedMs = Date.now() - Number(startedAt);
  if (!Number.isFinite(elapsedMs) || elapsedMs < MIN_ELAPSED_MS) {
    return json(429, {
      error: 'Tempo de resposta muito curto. Possivel automacao detectada.',
      blocked: true,
    });
  }

  const attemptCount = recordAttempt(sessionId, challengeId);
  if (attemptCount > MAX_ATTEMPTS_PER_WINDOW) {
    return json(429, { error: 'Muitas tentativas. Aguarde alguns segundos.', blocked: true });
  }

  try {
    const pokeRes = await fetch(`${BASE_URL}/pokemon/${decoded.pokemonId}`);
    if (!pokeRes.ok) throw new Error('Falha ao validar resposta');

    const pokemon = await pokeRes.json();
    const speciesRes = await fetch(pokemon.species?.url || `${BASE_URL}/pokemon-species/${decoded.pokemonId}`);
    const species = speciesRes.ok ? await speciesRes.json() : null;
    const acceptedNames = buildAcceptedPokemonNames(pokemon, species);
    const correct = isAcceptedPokemonGuess(guess, acceptedNames);
    const capturedPokemon = correct ? toCapturedPokemon(pokemon, species) : null;

    let saveResult = { saved: false, capturedPokemon };
    if (correct && idToken) {
      try {
        saveResult = await awardPokemonToUser({ idToken, pokemon, species });
      } catch (error) {
        console.error('Falha ao salvar captura no Supabase Admin:', error);
        saveResult = {
          saved: false,
          reason: 'Nao foi possivel salvar a captura na nuvem.',
          capturedPokemon,
        };
      }
    }

    const message = correct
      ? saveResult.saved
        ? saveResult.alreadyCaught
          ? 'Resposta correta! Esse Pokemon ja estava na sua Pokedex.'
          : 'Resposta correta! Pokemon capturado e salvo na nuvem.'
        : idToken
          ? 'Resposta correta! Configure o Supabase no Netlify para salvar capturas na nuvem.'
          : 'Resposta correta!'
      : 'Resposta incorreta. Continue tentando com calma.';

    return json(200, {
      success: correct,
      correct,
      pokemonId: correct ? pokemon.id : null,
      pokemonName: correct ? getDisplayPokemonName(pokemon, species) : null,
      capturedPokemon: saveResult.capturedPokemon,
      alreadyCaught: Boolean(saveResult.alreadyCaught),
      saved: Boolean(saveResult.saved),
      score: saveResult.score ?? null,
      trainerData: saveResult.trainerData || null,
      saveReason: saveResult.reason || null,
      message,
      stats: { elapsedMs, attemptCount },
    });
  } catch (error) {
    console.error('Erro interno ao validar resposta:', error);
    return serverError('Erro interno ao validar resposta');
  }
};
