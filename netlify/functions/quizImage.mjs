import { json, serverError } from './_shared/http.mjs';
import {
  decryptChallengeToken,
  isQuizConfigError,
} from './_shared/quizCrypto.mjs';

const BASE_URL = 'https://pokeapi.co/api/v2';

export const handler = async (event) => {
  const { challengeId, token } = event.queryStringParameters || {};

  if (!challengeId || !token) {
    return json(400, { error: 'Imagem de desafio invalida' });
  }

  let decoded;
  try {
    decoded = decryptChallengeToken(token);
  } catch (error) {
    if (isQuizConfigError(error)) return serverError(error.message);
    decoded = null;
  }

  if (!decoded || decoded.challengeId !== challengeId || Date.now() > decoded.expiresAt) {
    return json(403, { error: 'Imagem de desafio expirada ou invalida' });
  }

  try {
    const pokeRes = await fetch(`${BASE_URL}/pokemon/${decoded.pokemonId}`);
    if (!pokeRes.ok) throw new Error('Pokemon indisponivel');
    const pokemon = await pokeRes.json();
    const imageUrl =
      pokemon.sprites?.other?.['official-artwork']?.front_default ||
      pokemon.sprites?.front_default;

    if (!imageUrl) return json(404, { error: 'Imagem nao encontrada' });

    const imageRes = await fetch(imageUrl);
    if (!imageRes.ok) throw new Error('Imagem indisponivel');

    const arrayBuffer = await imageRes.arrayBuffer();
    const contentType = imageRes.headers.get('Content-Type') || 'image/png';

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
      body: Buffer.from(arrayBuffer).toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('Erro ao servir imagem do quiz:', error);
    return serverError('Nao foi possivel carregar a imagem do desafio.');
  }
};
