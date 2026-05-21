import { decryptChallengeToken } from './_shared/quizCrypto.mjs';
import { fetchNarutoCharacter, getNarutoImageUrl } from './_shared/narutoApi.mjs';

export const handler = async (event) => {
  const params = event.queryStringParameters || {};
  const challengeId = params.challengeId || '';
  const token = params.token || '';
  const decoded = decryptChallengeToken(token);

  if (!decoded || decoded.challengeId !== challengeId || decoded.subjectKind !== 'naruto') {
    return { statusCode: 403, body: 'Imagem bloqueada.' };
  }

  if (Date.now() > decoded.expiresAt) {
    return { statusCode: 403, body: 'Desafio expirado.' };
  }

  try {
    const character = await fetchNarutoCharacter(decoded.subjectId);
    const imageUrl = getNarutoImageUrl(character, decoded.imageIndex);
    if (!imageUrl) return { statusCode: 404, body: 'Imagem indisponivel.' };

    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Quizzdex/1.0 (+https://quizzdex.netlify.app)',
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
      },
    });

    if (!response.ok) return { statusCode: 502, body: 'Falha ao carregar imagem.' };

    const contentType = response.headers.get('content-type') || 'image/png';
    const buffer = Buffer.from(await response.arrayBuffer());

    return {
      statusCode: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=90',
        'X-Robots-Tag': 'noindex',
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (error) {
    console.error('Erro ao carregar imagem Naruto:', error);
    return { statusCode: 500, body: 'Erro interno.' };
  }
};
