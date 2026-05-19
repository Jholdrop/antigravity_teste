import crypto from 'node:crypto';
import { json, serverError } from './_shared/http.mjs';
import {
  generateChallengeToken,
  isQuizConfigError,
} from './_shared/quizCrypto.mjs';
import { getDisplayPokemonName } from './_shared/pokemonNames.mjs';

const MAX_POKEMON_ID = 1025;
const BASE_URL = 'https://pokeapi.co/api/v2';
const CHALLENGE_VALID_SECONDS = 90;

const GEN_NAMES = {
  'generation-i': '1a Geracao (Kanto)',
  'generation-ii': '2a Geracao (Johto)',
  'generation-iii': '3a Geracao (Hoenn)',
  'generation-iv': '4a Geracao (Sinnoh)',
  'generation-v': '5a Geracao (Unova)',
  'generation-vi': '6a Geracao (Kalos)',
  'generation-vii': '7a Geracao (Alola)',
  'generation-viii': '8a Geracao (Galar)',
  'generation-ix': '9a Geracao (Paldea)',
};

const createId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const maskName = (text, pokemonName) => {
  if (!text) return '';
  const regex = new RegExp(pokemonName, 'ig');
  return text.replace(/[\n\f]/g, ' ').replace(regex, '_____');
};

const buildClues = (pokemon, species) => {
  const name = getDisplayPokemonName(pokemon, species);
  const types = pokemon.types.map((entry) => entry.type.name);
  const gen = species ? GEN_NAMES[species.generation?.name] ?? 'Desconhecida' : 'Desconhecida';
  const color = species?.color?.name || 'desconhecida';
  const habitat = species?.habitat?.name || 'desconhecido';
  const shape = species?.shape?.name || 'desconhecida';
  const evolvesFrom = species?.evolves_from_species?.name;
  const isRare = species?.is_legendary || species?.is_mythical;

  const flavorEntry =
    species?.flavor_text_entries?.find((entry) => entry.language.name === 'pt-BR') ||
    species?.flavor_text_entries?.find((entry) => entry.language.name === 'pt') ||
    species?.flavor_text_entries?.find((entry) => entry.language.name === 'en');
  const flavorText = maskName(flavorEntry?.flavor_text, name);

  const clues = [
    { icon: 'ABC', label: 'Comprimento', text: `O nome possui ${name.length} letras.` },
    { icon: 'COR', label: 'Cor e forma', text: `Cor principal: ${color}. Formato: ${shape}.` },
    {
      icon: 'GEN',
      label: 'Geracao',
      text: `Pertence a ${gen}${isRare ? ' e e lendario/mitico' : ''}.`,
    },
  ];

  if (evolvesFrom) {
    clues.push({
      icon: 'EVO',
      label: 'Evolucao',
      text: `Evolui de ${evolvesFrom.charAt(0).toUpperCase() + evolvesFrom.slice(1)}.`,
    });
  } else if (habitat !== 'desconhecido') {
    clues.push({ icon: 'HAB', label: 'Habitat', text: `Habitat: ${habitat}.` });
  }

  clues.push({
    icon: 'TIP',
    label: 'Tipos',
    text: `Tipo(s): ${types.map((type) => type.charAt(0).toUpperCase() + type.slice(1)).join(' / ')}.`,
  });
  clues.push({
    icon: 'A',
    label: 'Primeira letra',
    text: `O nome comeca com a letra "${name.charAt(0).toUpperCase()}".`,
  });

  if (flavorText) {
    clues.push({ icon: 'DEX', label: 'Entrada da Pokedex', text: `"${flavorText}"` });
  }

  return clues.slice(0, 7);
};

export const handler = async () => {
  const pokemonId = Math.floor(Math.random() * MAX_POKEMON_ID) + 1;
  const challengeId = createId();
  const expiresAt = Date.now() + CHALLENGE_VALID_SECONDS * 1000;

  try {
    const pokeRes = await fetch(`${BASE_URL}/pokemon/${pokemonId}`);
    if (!pokeRes.ok) throw new Error('Erro ao buscar Pokemon.');
    const pokemon = await pokeRes.json();

    const specRes = await fetch(pokemon.species?.url || `${BASE_URL}/pokemon-species/${pokemonId}`);
    const species = specRes.ok ? await specRes.json() : null;

    const challengeToken = generateChallengeToken({
      challengeId,
      pokemonId: pokemon.id,
      expiresAt,
    });

    const image = `/.netlify/functions/quizImage?challengeId=${encodeURIComponent(
      challengeId
    )}&token=${encodeURIComponent(challengeToken)}`;

    return json(200, {
      challengeId,
      challengeToken,
      expiresAt,
      clues: buildClues(pokemon, species),
      mainType: 'mystery',
      image,
      version: 'secure-quiz-v4',
    });
  } catch (error) {
    if (isQuizConfigError(error)) {
      return serverError(error.message);
    }

    return serverError('Nao foi possivel gerar o desafio.');
  }
};
