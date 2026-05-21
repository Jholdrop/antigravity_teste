import crypto from 'node:crypto';
import { json, serverError } from './_shared/http.mjs';
import { generateChallengeToken, isQuizConfigError } from './_shared/quizCrypto.mjs';
import { buildNarutoClues, fetchRandomNarutoCharacter } from './_shared/narutoApi.mjs';

const CHALLENGE_VALID_SECONDS = 90;

const createId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const handler = async () => {
  const challengeId = createId();
  const expiresAt = Date.now() + CHALLENGE_VALID_SECONDS * 1000;

  try {
    const character = await fetchRandomNarutoCharacter();
    const imageIndex = 0;
    const challengeToken = generateChallengeToken({
      challengeId,
      subjectKind: 'naruto',
      subjectId: character.id,
      imageIndex,
      expiresAt,
    });

    const image = `/.netlify/functions/narutoQuizImage?challengeId=${encodeURIComponent(
      challengeId
    )}&token=${encodeURIComponent(challengeToken)}`;

    return json(200, {
      challengeId,
      challengeToken,
      expiresAt,
      clues: buildNarutoClues(character),
      mainType: 'chakra',
      image,
      version: 'naruto-quiz-v1',
    });
  } catch (error) {
    if (isQuizConfigError(error)) return serverError(error.message);
    console.error('Erro ao gerar quiz Naruto:', error);
    return serverError('Nao foi possivel gerar o desafio de Naruto.');
  }
};
