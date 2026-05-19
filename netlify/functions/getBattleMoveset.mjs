import { json, serverError } from './_shared/http.mjs';

const SMOGON_GEN = 'sm';
const BASE_POKEAPI = 'https://pokeapi.co/api/v2';
const memoryCache = new Map();

const FORMAT_PRIORITY = [
  'OU',
  'Uber',
  'UU',
  'RU',
  'NU',
  'PU',
  'ZU',
  'Monotype',
  'Doubles',
  'Battle Spot Singles',
  '1v1',
  'Draft',
  'LC',
];

const STATUS_DAMAGE_OVERRIDES = {
  'seismic-toss': { power: 80, damageClass: 'physical', type: 'fighting' },
  'night-shade': { power: 80, damageClass: 'special', type: 'ghost' },
};

const toId = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const shuffle = (entries) => {
  const result = [...entries];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

const uniqueByName = (moves) => {
  const seen = new Set();
  const unique = [];

  for (const move of moves) {
    if (!move?.name || seen.has(move.name)) continue;
    seen.add(move.name);
    unique.push(move);
  }

  return unique;
};

const fetchJson = async (url) => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Quizzdex/1.0 (+https://quizzdex.netlify.app)',
      Accept: 'application/json,text/html;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) throw new Error(`Falha ao buscar ${url}`);
  return response.json();
};

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Quizzdex/1.0 (+https://quizzdex.netlify.app)',
      Accept: 'text/html,*/*;q=0.8',
    },
  });

  if (!response.ok) throw new Error(`Falha ao buscar ${url}`);
  return response.text();
};

const parseSmogonSettings = (html) => {
  const marker = 'dexSettings = ';
  const start = html.indexOf(marker);
  if (start === -1) return null;

  const jsonStart = start + marker.length;
  const jsonEnd = html.indexOf('</script>', jsonStart);
  if (jsonEnd === -1) return null;

  return JSON.parse(html.slice(jsonStart, jsonEnd).trim());
};

const getPokemonDump = (settings) =>
  settings?.injectRpcs
    ?.map(([, value]) => value)
    .find((value) => value?.strategies || value?.formeStrategies) || null;

const getFormatRank = (format = '') => {
  const normalized = String(format);
  const exactIndex = FORMAT_PRIORITY.findIndex((entry) => entry === normalized);
  if (exactIndex !== -1) return exactIndex;

  const includesIndex = FORMAT_PRIORITY.findIndex((entry) => normalized.includes(entry));
  return includesIndex === -1 ? FORMAT_PRIORITY.length + 5 : includesIndex + 1;
};

const collectStrategies = (dump) => {
  const direct = Array.isArray(dump?.strategies) ? dump.strategies : [];
  const formes = Array.isArray(dump?.formeStrategies)
    ? dump.formeStrategies.flatMap((forme) => forme?.strategies || [])
    : [];

  return [...direct, ...formes]
    .filter((strategy) => Array.isArray(strategy?.movesets) && strategy.movesets.length)
    .sort((a, b) => getFormatRank(a.format) - getFormatRank(b.format));
};

const chooseSmogonMoves = (dump) => {
  const strategies = collectStrategies(dump);
  if (!strategies.length) return { moves: [], source: null };

  const preferred = strategies.find((strategy) => !strategy.outdated) || strategies[0];
  const moveset = preferred.movesets?.[0];
  const moves = [];

  for (const slot of moveset?.moveslots || []) {
    const options = Array.isArray(slot) ? slot : [];
    for (const option of options) {
      const moveId = toId(option?.move);
      if (!moveId) continue;

      moves.push({
        name: moveId,
        typeOverride: option?.type ? toId(option.type) : null,
        originalName: option.move,
      });
      break;
    }
  }

  return {
    moves,
    source: {
      provider: 'smogon',
      gen: SMOGON_GEN.toUpperCase(),
      format: preferred.format || 'Smogon',
      setName: moveset?.name || 'Moveset',
    },
  };
};

const fetchMoveDetail = async (moveCandidate) => {
  const name = toId(moveCandidate?.name || moveCandidate);
  if (!name) return null;

  const override = STATUS_DAMAGE_OVERRIDES[name];
  const data = await fetchJson(`${BASE_POKEAPI}/move/${name}`);
  const type = moveCandidate?.typeOverride || override?.type || data.type?.name || 'normal';
  const damageClass = override?.damageClass || data.damage_class?.name || 'status';
  const power = override?.power || data.power || 0;

  if (damageClass === 'status' || power <= 0) return null;

  return {
    name,
    power,
    type,
    damageClass,
    accuracy: data.accuracy || 100,
    source: moveCandidate?.source || 'smogon',
  };
};

const fillWithLearnedMoves = async ({ pokemonId, pokemonName, existingMoves, types, desiredCount = 4 }) => {
  const identifier = pokemonId || toId(pokemonName);
  if (!identifier) return existingMoves;

  const pokemon = await fetchJson(`${BASE_POKEAPI}/pokemon/${identifier}`);
  const typeNames = types?.length ? types : pokemon.types?.map((entry) => entry.type.name) || [];
  const known = new Set(existingMoves.map((move) => move.name));
  const smVersionGroups = new Set(['sun-moon', 'ultra-sun-ultra-moon']);

  const learnable = (pokemon.moves || [])
    .filter((entry) => {
      const details = entry.version_group_details || [];
      return (
        details.length === 0 ||
        details.some((detail) => smVersionGroups.has(detail.version_group?.name))
      );
    })
    .map((entry) => entry.move?.name)
    .filter((name) => name && !known.has(name));

  const candidates = shuffle(learnable).slice(0, 60);
  const detailed = await Promise.all(
    candidates.map((name) => fetchMoveDetail({ name, source: 'pokeapi' }).catch(() => null))
  );

  const ranked = detailed
    .filter(Boolean)
    .sort((a, b) => {
      const aStab = typeNames.includes(a.type) ? 28 : 0;
      const bStab = typeNames.includes(b.type) ? 28 : 0;
      const aAccuracy = Math.min(100, a.accuracy || 100) / 100;
      const bAccuracy = Math.min(100, b.accuracy || 100) / 100;
      return (b.power + bStab) * bAccuracy - (a.power + aStab) * aAccuracy;
    });

  return uniqueByName([...existingMoves, ...shuffle(ranked.slice(0, 14))]).slice(0, desiredCount);
};

const getSmogonCandidates = async (pokemonName) => {
  const slug = toId(pokemonName);
  if (!slug) return { moves: [], source: null };

  const html = await fetchText(`https://www.smogon.com/dex/${SMOGON_GEN}/pokemon/${slug}/`);
  const settings = parseSmogonSettings(html);
  const dump = getPokemonDump(settings);

  return chooseSmogonMoves(dump);
};

const getBattleMoveset = async ({ pokemonName, pokemonId, types }) => {
  const cacheKey = `${pokemonId || ''}:${toId(pokemonName)}:${(types || []).join(',')}`;
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.createdAt < 1000 * 60 * 60) return cached.payload;

  let source = null;
  let smogonCandidates = [];

  try {
    const smogon = await getSmogonCandidates(pokemonName);
    smogonCandidates = smogon.moves || [];
    source = smogon.source;
  } catch (error) {
    console.warn('Smogon moveset indisponivel, usando fallback:', error.message);
  }

  const smogonMovesRaw = await Promise.all(
    smogonCandidates.map((candidate) => fetchMoveDetail(candidate).catch(() => null))
  );
  const smogonMoves = uniqueByName(smogonMovesRaw.filter(Boolean)).slice(0, 4);
  const moves = await fillWithLearnedMoves({
    pokemonId,
    pokemonName,
    existingMoves: smogonMoves,
    types,
    desiredCount: 4,
  });

  const finalMoves = moves.length
    ? moves
    : [
        { name: 'tackle', power: 40, type: 'normal', damageClass: 'physical', accuracy: 100, source: 'fallback' },
      ];
  const emergencyMoves = [
    { name: 'quick-attack', power: 40, type: 'normal', damageClass: 'physical', accuracy: 100, source: 'fallback' },
    { name: 'swift', power: 60, type: 'normal', damageClass: 'special', accuracy: 100, source: 'fallback' },
    { name: 'body-slam', power: 85, type: 'normal', damageClass: 'physical', accuracy: 100, source: 'fallback' },
  ];

  while (finalMoves.length < 4) {
    finalMoves.push(emergencyMoves[finalMoves.length - 1] || emergencyMoves[0]);
  }

  const payload = {
    moves: finalMoves.slice(0, 4),
    source: source || { provider: 'pokeapi', gen: 'learnset', format: 'Fallback', setName: 'Learned moves' },
  };

  memoryCache.set(cacheKey, { createdAt: Date.now(), payload });
  return payload;
};

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return json(405, { error: 'Metodo nao permitido' }, { Allow: 'GET' });
  }

  const params = event.queryStringParameters || {};
  const pokemonName = params.pokemon || params.name || '';
  const pokemonId = params.id || '';
  const types = String(params.types || '')
    .split(',')
    .map((entry) => toId(entry))
    .filter(Boolean);

  if (!pokemonName && !pokemonId) {
    return json(400, { error: 'Informe pokemon ou id.' });
  }

  try {
    const payload = await getBattleMoveset({ pokemonName, pokemonId, types });
    return json(200, payload, { 'Cache-Control': 'public, max-age=3600' });
  } catch (error) {
    console.error('Erro ao gerar moveset de batalha:', error);
    return serverError('Nao foi possivel gerar moveset de batalha.');
  }
};
