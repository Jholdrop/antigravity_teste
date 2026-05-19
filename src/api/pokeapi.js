const BASE_URL = 'https://pokeapi.co/api/v2';
const QUIZ_API = '/.netlify/functions';

const cleanText = (value) => String(value ?? '').trim();

const parseJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return {};
  }
};

export const getQuizRound = async () => {
  const response = await fetch(`${QUIZ_API}/getQuizRound`, { cache: 'no-store' });
  const data = await parseJson(response);

  if (!response.ok) {
    throw new Error(data?.error || 'Nao foi possivel carregar o desafio seguro.');
  }

  return data;
};

export const getSecureQuizRound = getQuizRound;

export const submitQuizGuess = async ({
  challengeId,
  challengeToken,
  guess,
  startedAt,
  sessionId,
  idToken,
}) => {
  const response = await fetch(`${QUIZ_API}/validateQuizAnswer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      challengeId: cleanText(challengeId),
      challengeToken: cleanText(challengeToken),
      guess: cleanText(guess),
      startedAt,
      sessionId: cleanText(sessionId),
      idToken: idToken || '',
    }),
  });

  const data = await parseJson(response);
  if (!response.ok) {
    throw new Error(data?.error || 'Falha ao validar a resposta.');
  }

  return data;
};

export const getPokemons = async (limit = 20, offset = 0) => {
  const response = await fetch(`${BASE_URL}/pokemon?limit=${limit}&offset=${offset}`);
  return await response.json();
};

export const getPokemonDetails = async (urlOrId) => {
  const url =
    typeof urlOrId === 'string' && urlOrId.startsWith('http')
      ? urlOrId
      : `${BASE_URL}/pokemon/${urlOrId}`;
  const response = await fetch(url);
  return await response.json();
};

export const getPokemonSpecies = async (idOrName) => {
  const response = await fetch(`${BASE_URL}/pokemon-species/${idOrName}`);
  return await response.json();
};
