const BASE_URL = 'https://dattebayo-api.onrender.com';
const TOTAL_CHARACTERS = 1431;

export const normalizeGuessText = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const compact = (value) => {
  if (!value) return '';
  if (Array.isArray(value)) return value.filter(Boolean).slice(0, 3).join(', ');
  if (typeof value === 'object') {
    return Object.values(value)
      .flat()
      .filter(Boolean)
      .slice(0, 3)
      .join(', ');
  }
  return String(value);
};

const maskName = (text, name) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  return name
    .split(/\s+/)
    .filter((part) => part.length > 2)
    .reduce((current, part) => current.replace(new RegExp(part, 'ig'), '_____'), clean);
};

export const fetchNarutoCharacter = async (id) => {
  const response = await fetch(`${BASE_URL}/characters/${id}`, {
    headers: {
      'User-Agent': 'Quizzdex/1.0 (+https://quizzdex.netlify.app)',
      Accept: 'application/json',
    },
  });

  if (!response.ok) throw new Error('Personagem de Naruto indisponivel.');
  return response.json();
};

export const fetchRandomNarutoCharacter = async () => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const id = Math.floor(Math.random() * TOTAL_CHARACTERS) + 1;
    const character = await fetchNarutoCharacter(id).catch(() => null);
    if (character?.name && Array.isArray(character.images) && character.images[0]) return character;
  }

  return fetchNarutoCharacter(1344);
};

export const buildNarutoClues = (character) => {
  const personal = character.personal || {};
  const rank = character.rank || {};
  const debut = character.debut || {};
  const jutsu = Array.isArray(character.jutsu) ? character.jutsu : [];
  const nature = Array.isArray(character.natureType) ? character.natureType : [];
  const name = String(character.name || 'Personagem');
  const affiliation = compact(personal.affiliation);
  const clan = compact(personal.clan);
  const classification = compact(personal.classification);
  const team = compact(personal.team);
  const firstJutsu = maskName(jutsu[0], name);

  const clues = [
    { icon: 'ABC', label: 'Nome', text: `O nome possui ${name.replace(/\s+/g, '').length} letras sem espacos.` },
    { icon: 'A', label: 'Primeira letra', text: `Comeca com a letra "${name.charAt(0).toUpperCase()}".` },
  ];

  if (affiliation) clues.push({ icon: 'VIL', label: 'Afiliacao', text: `Ligacao: ${maskName(affiliation, name)}.` });
  if (clan) clues.push({ icon: 'CLA', label: 'Cla', text: `Cla: ${maskName(clan, name)}.` });
  if (rank.ninjaRank) clues.push({ icon: 'RAN', label: 'Rank', text: `Rank ninja: ${compact(rank.ninjaRank)}.` });
  if (nature.length) clues.push({ icon: 'CHK', label: 'Natureza', text: `Natureza de chakra: ${nature.slice(0, 2).join(' / ')}.` });
  if (classification) clues.push({ icon: 'TIP', label: 'Classificacao', text: `Classificacao: ${maskName(classification, name)}.` });
  if (team) clues.push({ icon: 'EQP', label: 'Equipe', text: `Equipe/grupo: ${maskName(team, name)}.` });
  if (firstJutsu) clues.push({ icon: 'JUT', label: 'Jutsu', text: `Jutsu conhecido: ${firstJutsu}.` });
  if (debut.anime) clues.push({ icon: 'ANI', label: 'Anime', text: `Estreia no anime: ${debut.anime}.` });

  return clues.slice(0, 7);
};

export const buildAcceptedNarutoNames = (character) => {
  const name = String(character?.name || '');
  const parts = name.split(/\s+/).filter(Boolean);
  const accepted = new Set([normalizeGuessText(name)]);

  if (parts[0]?.length > 2) accepted.add(normalizeGuessText(parts[0]));
  if (parts.length > 1 && parts.at(-1)?.length > 2) accepted.add(normalizeGuessText(parts.at(-1)));

  return [...accepted].filter(Boolean);
};

export const isAcceptedNarutoGuess = (guess, acceptedNames) =>
  acceptedNames.includes(normalizeGuessText(guess));

export const getNarutoImageUrl = (character, imageIndex = 0) => {
  const images = Array.isArray(character?.images) ? character.images.filter(Boolean) : [];
  return images[Number(imageIndex)] || images[0] || '';
};
