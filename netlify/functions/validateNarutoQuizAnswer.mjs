import { json, methodNotAllowed, serverError } from './_shared/http.mjs';
import { decryptChallengeToken, isQuizConfigError } from './_shared/quizCrypto.mjs';
import {
  buildAcceptedNarutoNames,
  fetchNarutoCharacter,
  getNarutoImageUrl,
  isAcceptedNarutoGuess,
} from './_shared/narutoApi.mjs';

const RATE_WINDOW_MS = 120000;
const MAX_ATTEMPTS_PER_WINDOW = 8;
const MIN_ELAPSED_MS = 450;
const sessionAttempts = new Map();

const recordAttempt = (sessionId, challengeId) => {
  const key = `${sessionId}:naruto:${challengeId}`;
  const now = Date.now();
  const entry = sessionAttempts.get(key) || { count: 0, first: now };

  if (now - entry.first > RATE_WINDOW_MS) {
    entry.count = 0;
    entry.first = now;
  }

  entry.count += 1;
  sessionAttempts.set(key, entry);
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

  const { challengeId, challengeToken, guess, startedAt, sessionId } = body;
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

  if (!decoded || decoded.challengeId !== challengeId || decoded.subjectKind !== 'naruto') {
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
    const character = await fetchNarutoCharacter(decoded.subjectId);
    const acceptedNames = buildAcceptedNarutoNames(character);
    const correct = isAcceptedNarutoGuess(guess, acceptedNames);

    return json(200, {
      success: correct,
      correct,
      characterId: correct ? character.id : null,
      characterName: correct ? character.name : null,
      image: correct ? getNarutoImageUrl(character, decoded.imageIndex) : null,
      message: correct
        ? 'Resposta correta! Personagem revelado.'
        : 'Resposta incorreta. Continue tentando com calma.',
      stats: { elapsedMs, attemptCount },
    });
  } catch (error) {
    console.error('Erro interno ao validar Naruto:', error);
    return serverError('Erro interno ao validar resposta.');
  }
};
