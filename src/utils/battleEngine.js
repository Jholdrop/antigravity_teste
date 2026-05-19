import powerRankingRaw from '../../aaa.aaa?raw';

const battleMovesCache = new Map();

export const calculateTeamBST = (team) =>
  team.reduce((total, pokemon) => total + getBST(pokemon), 0);

const TYPE_CHART = {
  normal: { rock: 0.5, ghost: 0, steel: 0.5 },
  fire: { fire: 0.5, water: 0.5, grass: 2, ice: 2, bug: 2, rock: 0.5, dragon: 0.5, steel: 2 },
  water: { fire: 2, water: 0.5, grass: 0.5, ground: 2, rock: 2, dragon: 0.5 },
  electric: { water: 2, electric: 0.5, grass: 0.5, ground: 0, flying: 2, dragon: 0.5 },
  grass: { fire: 0.5, water: 2, grass: 0.5, poison: 0.5, ground: 2, flying: 0.5, bug: 0.5, rock: 2, dragon: 0.5, steel: 0.5 },
  ice: { fire: 0.5, water: 0.5, grass: 2, ice: 0.5, ground: 2, flying: 2, dragon: 2, steel: 0.5 },
  fighting: { normal: 2, ice: 2, poison: 0.5, flying: 0.5, psychic: 0.5, bug: 0.5, rock: 2, ghost: 0, dark: 2, steel: 2, fairy: 0.5 },
  poison: { grass: 2, poison: 0.5, ground: 0.5, rock: 0.5, ghost: 0.5, steel: 0, fairy: 2 },
  ground: { fire: 2, electric: 2, grass: 0.5, poison: 2, flying: 0, bug: 0.5, rock: 2, steel: 2 },
  flying: { electric: 0.5, grass: 2, fighting: 2, bug: 2, rock: 0.5, steel: 0.5 },
  psychic: { fighting: 2, poison: 2, psychic: 0.5, dark: 0, steel: 0.5 },
  bug: { fire: 0.5, grass: 2, fighting: 0.5, poison: 0.5, flying: 0.5, psychic: 2, ghost: 0.5, dark: 2, steel: 0.5, fairy: 0.5 },
  rock: { fire: 2, ice: 2, fighting: 0.5, ground: 0.5, flying: 2, bug: 2, steel: 0.5 },
  ghost: { normal: 0, psychic: 2, ghost: 2, dark: 0.5 },
  dragon: { dragon: 2, steel: 0.5, fairy: 0 },
  dark: { fighting: 0.5, psychic: 2, ghost: 2, dark: 0.5, fairy: 0.5 },
  steel: { fire: 0.5, water: 0.5, electric: 0.5, ice: 2, rock: 2, steel: 0.5, fairy: 2 },
  fairy: { fire: 0.5, fighting: 2, poison: 0.5, dragon: 2, dark: 2, steel: 0.5 },
};

const STRONG_MOVES_BY_TYPE = {
  fire: ['flamethrower', 'fire-blast', 'fire-punch', 'heat-wave', 'overheat', 'sacred-fire', 'flare-blitz'],
  water: ['surf', 'hydro-pump', 'waterfall', 'scald', 'water-pulse', 'aqua-tail', 'origin-pulse', 'steam-eruption'],
  grass: ['leaf-storm', 'solar-beam', 'giga-drain', 'energy-ball', 'petal-blizzard', 'frenzy-plant', 'leaf-blade'],
  electric: ['thunderbolt', 'thunder', 'volt-switch', 'thunder-punch', 'discharge', 'wild-charge', 'bolt-strike'],
  ice: ['ice-beam', 'blizzard', 'ice-punch', 'freeze-dry', 'icicle-crash', 'glaciate', 'avalanche'],
  psychic: ['psychic', 'psyshock', 'zen-headbutt', 'psycho-cut', 'future-sight', 'expanding-force'],
  dragon: ['draco-meteor', 'dragon-pulse', 'outrage', 'dragon-claw', 'spacial-rend', 'roar-of-time'],
  dark: ['dark-pulse', 'crunch', 'sucker-punch', 'knock-off', 'foul-play', 'night-slash', 'wicked-blow'],
  fighting: ['close-combat', 'superpower', 'focus-blast', 'drain-punch', 'aura-sphere', 'sacred-sword'],
  poison: ['sludge-bomb', 'sludge-wave', 'poison-jab', 'gunk-shot', 'cross-poison'],
  ground: ['earthquake', 'earth-power', 'drill-run', 'precipice-blades', 'land-s-wrath'],
  rock: ['stone-edge', 'rock-slide', 'rock-blast', 'power-gem', 'diamond-storm'],
  bug: ['u-turn', 'bug-buzz', 'x-scissor', 'megahorn', 'lunge', 'attack-order'],
  ghost: ['shadow-ball', 'shadow-claw', 'shadow-sneak', 'hex', 'poltergeist', 'astral-barrage'],
  steel: ['iron-head', 'flash-cannon', 'meteor-mash', 'steel-beam', 'anchor-shot'],
  fairy: ['moonblast', 'dazzling-gleam', 'play-rough', 'spirit-break', 'fleur-cannon'],
  normal: ['body-slam', 'double-edge', 'hyper-beam', 'extreme-speed', 'boomburst', 'giga-impact'],
  flying: ['brave-bird', 'fly', 'air-slash', 'hurricane', 'aeroblast', 'sky-attack'],
};

const parsePowerRanking = () => {
  const entries = new Map();

  for (const line of powerRankingRaw.split(/\r?\n/)) {
    const parts = line.trim().split(/\t+/);
    if (parts.length < 7) continue;

    const dex = Number(parts[1]);
    const power = Number(parts[6]);
    if (Number.isInteger(dex) && Number.isFinite(power)) entries.set(dex, power);
  }

  return entries;
};

const POWER_BY_DEX = parsePowerRanking();

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const getStat = (poke, name) =>
  poke?.stats?.find((stat) => stat.stat.name === name)?.base_stat || 50;

export const getBST = (poke) =>
  (poke?.stats || []).reduce((sum, stat) => sum + Number(stat.base_stat || 0), 0);

export const getPokemonPower = (pokemon) => {
  const ranked = POWER_BY_DEX.get(Number(pokemon?.id));
  if (ranked) return ranked;

  const bst = getBST(pokemon);
  return clamp(Math.round(1 + ((bst - 175) * 998) / (720 - 175)), 1, 999);
};

export const getTypeEffectiveness = (moveType, defender) => {
  const defenderTypes = defender?.types?.map((entry) => entry.type.name) || [];
  return defenderTypes.reduce((multiplier, type) => multiplier * (TYPE_CHART[moveType]?.[type] ?? 1), 1);
};

const getEffectivenessLabel = (effectiveness) => {
  if (effectiveness === 0) return 'immune';
  if (effectiveness >= 4) return 'ultra';
  if (effectiveness > 1) return 'super';
  if (effectiveness < 1) return 'resisted';
  return 'normal';
};

const formatMove = (move) => ({
  name: move.name,
  power: move.power,
  type: move.type.name,
  damageClass: move.damage_class.name,
  accuracy: move.accuracy || 100,
  source: 'pokeapi',
});

const normalizeServerMove = (move) => ({
  name: move.name,
  power: Number(move.power || 40),
  type: move.type || 'normal',
  damageClass: move.damageClass || move.damage_class || 'physical',
  accuracy: Number(move.accuracy || 100),
  source: move.source || 'smogon',
});

export const fetchMovesForPokemon = async (pokemon) => {
  const pokemonData = typeof pokemon === 'object'
    ? pokemon
    : await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemon}`).then((response) => response.json());
  const cacheKey = `${pokemonData.id}:${pokemonData.name}`;
  const cached = battleMovesCache.get(cacheKey);
  if (cached) return cached;

  const types = pokemonData.types.map((entry) => entry.type.name);

  try {
    const response = await fetch(
      `/.netlify/functions/getBattleMoveset?pokemon=${encodeURIComponent(pokemonData.name)}&id=${encodeURIComponent(
        pokemonData.id
      )}&types=${encodeURIComponent(types.join(','))}`,
      { cache: 'force-cache' }
    );

    if (response.ok) {
      const data = await response.json();
      const serverMoves = (data.moves || [])
        .map(normalizeServerMove)
        .filter((move) => move.power > 0)
        .slice(0, 4);

      if (serverMoves.length >= 4) {
        battleMovesCache.set(cacheKey, serverMoves);
        return serverMoves;
      }
    }
  } catch {
    // Em dev:vite as Netlify Functions nao existem; a PokéAPI direta cobre esse caso.
  }

  try {
    const learned = new Set((pokemonData.moves || []).map((entry) => entry.move.name));
    const preferred = [
      ...types.flatMap((type) => STRONG_MOVES_BY_TYPE[type] || []),
      ...STRONG_MOVES_BY_TYPE.normal,
    ];
    const preferredLearned = [...new Set(preferred)].filter((name) => learned.has(name));
    const fallbackLearned = [...learned].slice(-30);
    const candidates = [...new Set([...preferredLearned, ...fallbackLearned])].slice(0, 16);

    const movesData = await Promise.all(
      candidates.map((name) =>
        fetch(`https://pokeapi.co/api/v2/move/${name}`)
          .then((response) => response.ok ? response.json() : null)
          .catch(() => null)
      )
    );

    const damagingMoves = movesData
      .filter((move) => move?.damage_class?.name !== 'status' && move?.power > 0)
      .sort((a, b) => {
        const aStab = types.includes(a.type.name) ? 25 : 0;
        const bStab = types.includes(b.type.name) ? 25 : 0;
        return (b.power + bStab) - (a.power + aStab);
      })
      .slice(0, 4)
      .map(formatMove);

    while (damagingMoves.length < 4) {
      damagingMoves.push({ name: 'tackle', power: 40, type: 'normal', damageClass: 'physical', accuracy: 100 });
    }

    battleMovesCache.set(cacheKey, damagingMoves);
    return damagingMoves;
  } catch (error) {
    console.error('Error fetching moves', error);
    return [
      { name: 'tackle', power: 40, type: 'normal', damageClass: 'physical', accuracy: 100 },
      { name: 'hyper-beam', power: 150, type: 'normal', damageClass: 'special', accuracy: 90 },
      { name: 'thunderbolt', power: 90, type: 'electric', damageClass: 'special', accuracy: 100 },
      { name: 'flamethrower', power: 90, type: 'fire', damageClass: 'special', accuracy: 100 },
    ];
  }
};

const getRandomCandidateIds = (count = 22) => {
  const ids = new Set();
  while (ids.size < count) ids.add(Math.floor(Math.random() * 1025) + 1);
  return [...ids];
};

export const generateRentalTeam = async (count = 3) => {
  const preferredPools = [
    [6, 9, 25, 94, 130, 149, 248, 282, 373, 376, 445, 448, 635, 658, 700, 778],
    [3, 59, 68, 121, 143, 181, 212, 230, 254, 260, 306, 330, 350, 392, 468, 475],
    [65, 80, 131, 169, 197, 214, 229, 242, 289, 407, 462, 474, 477, 479, 534, 571],
  ];
  const ids = [];

  for (const pool of preferredPools) {
    const available = pool.filter((id) => !ids.includes(id));
    ids.push(available[Math.floor(Math.random() * available.length)]);
    if (ids.length >= count) break;
  }

  while (ids.length < count) {
    const id = getRandomCandidateIds(1)[0];
    if (!ids.includes(id)) ids.push(id);
  }

  const team = await Promise.all(
    ids.slice(0, count).map(async (id) => {
      const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
      if (!response.ok) throw new Error('Rental Pokemon unavailable');
      return response.json();
    })
  );

  return team;
};

export const generateNPCTeam = async (playerTeam) => {
  const teamSize = clamp(playerTeam.length || 1, 1, 6);
  const playerPowers = playerTeam.map(getPokemonPower);
  const averagePower = playerPowers.reduce((sum, power) => sum + power, 0) / Math.max(1, playerPowers.length);
  const npcTeam = [];
  const used = new Set();

  for (let slot = 0; slot < teamSize; slot += 1) {
    const targetPower = playerPowers[slot] || averagePower;
    const tolerance = clamp(90 + slot * 15, 70, 180);
    const rankedCandidates = [...POWER_BY_DEX.entries()]
      .filter(([id, power]) => !used.has(id) && Math.abs(power - targetPower) <= tolerance)
      .sort((a, b) => Math.abs(a[1] - targetPower) - Math.abs(b[1] - targetPower));

    const closePool = rankedCandidates.slice(0, 40);
    const fallbackPool = rankedCandidates.length ? rankedCandidates : getRandomCandidateIds(40).map((id) => [id, POWER_BY_DEX.get(id) || 450]);
    const pool = closePool.length ? closePool : fallbackPool;
    const picked = pool[Math.floor(Math.random() * Math.min(pool.length, 16))];

    if (!picked) continue;
    used.add(picked[0]);

    try {
      const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${picked[0]}`);
      if (!response.ok) throw new Error('NPC Pokemon unavailable');
      npcTeam.push(await response.json());
    } catch {
      used.delete(picked[0]);
    }
  }

  while (npcTeam.length < teamSize) {
    const id = getRandomCandidateIds(1)[0];
    try {
      const response = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
      if (response.ok) npcTeam.push(await response.json());
    } catch {
      // Tenta outro candidato se a PokéAPI falhar para esse ID.
    }
  }

  return npcTeam;
};

export const calculateDamage = (attacker, defender, move) => {
  const level = 50;
  const accuracy = move.accuracy ?? 100;
  const hitRoll = Math.random() * 100;

  if (hitRoll > accuracy) {
    return {
      damage: 0,
      missed: true,
      critical: false,
      stab: false,
      effectiveness: 1,
      effectivenessLabel: 'miss',
      random: 1,
    };
  }

  const isSpecial = move.damageClass === 'special';
  const attackStat = isSpecial ? getStat(attacker, 'special-attack') : getStat(attacker, 'attack');
  const defenseStat = Math.max(1, isSpecial ? getStat(defender, 'special-defense') : getStat(defender, 'defense'));
  const basePower = Math.max(1, move.power || 40);
  const stab = attacker.types.some((entry) => entry.type.name === move.type);
  const effectiveness = getTypeEffectiveness(move.type, defender);
  const critical = Math.random() < 0.0625;
  const random = 0.85 + Math.random() * 0.15;
  const powerBias = 0.88 + getPokemonPower(attacker) / 4200;

  let damage = (((2 * level) / 5 + 2) * basePower * (attackStat / defenseStat)) / 50 + 2;
  damage *= stab ? 1.5 : 1;
  damage *= effectiveness;
  damage *= critical ? 1.5 : 1;
  damage *= random;
  damage *= powerBias;

  return {
    damage: Math.max(effectiveness === 0 ? 0 : 1, Math.floor(damage)),
    missed: false,
    critical,
    stab,
    effectiveness,
    effectivenessLabel: getEffectivenessLabel(effectiveness),
    random,
  };
};
