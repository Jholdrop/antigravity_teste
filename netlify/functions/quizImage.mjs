import { json, serverError } from './_shared/http.mjs';
import {
  decryptChallengeToken,
  isQuizConfigError,
} from './_shared/quizCrypto.mjs';
import sharp from 'sharp';

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
    const inputBuffer = Buffer.from(arrayBuffer);
    const { data, info } = await sharp(inputBuffer)
      .ensureAlpha()
      .resize({
        width: 520,
        height: 520,
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .raw()
      .toBuffer({ resolveWithObject: true });

    for (let index = 0; index < data.length; index += info.channels) {
      const alphaIndex = index + 3;
      const alpha = data[alphaIndex];

      if (alpha > 8) {
        data[index] = 8;
        data[index + 1] = 13;
        data[index + 2] = 22;
        data[alphaIndex] = Math.min(245, alpha + 35);
      } else {
        data[alphaIndex] = 0;
      }
    }

    const silhouette = await sharp(data, {
      raw: {
        width: info.width,
        height: info.height,
        channels: info.channels,
      },
    })
      .png()
      .toBuffer();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
      },
      body: silhouette.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('Erro ao servir imagem do quiz:', error);
    return serverError('Nao foi possivel carregar a imagem do desafio.');
  }
};
