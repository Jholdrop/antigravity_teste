export const calculateTeamBST = (team) => {
  return team.reduce((total, pokemon) => {
    const bst = pokemon.stats.reduce((sum, stat) => sum + stat.base_stat, 0);
    return total + bst;
  }, 0);
};

// Mapa de moves "Smogon-like" por tipo: lista os melhores ataques danosos por tipo
const SMOGON_MOVES_BY_TYPE = {
  fire:     ['flamethrower','fire-blast','fire-punch','heat-wave','overheat','will-o-wisp','ember','sacred-fire','flare-blitz'],
  water:    ['surf','hydro-pump','waterfall','scald','water-pulse','aqua-tail','origin-pulse','steam-eruption'],
  grass:    ['leaf-storm','solar-beam','giga-drain','energy-ball','petal-blizzard','frenzy-plant','leaf-blade'],
  electric: ['thunderbolt','thunder','volt-switch','thunder-punch','discharge','wild-charge','bolt-strike'],
  ice:      ['ice-beam','blizzard','ice-punch','freeze-dry','icicle-crash','glaciate','avalanche'],
  psychic:  ['psychic','psyshock','zen-headbutt','psycho-cut','future-sight','expanding-force'],
  dragon:   ['draco-meteor','dragon-pulse','outrage','dragon-claw','spacial-rend','roar-of-time'],
  dark:     ['dark-pulse','crunch','sucker-punch','knock-off','foul-play','night-slash','wicked-blow'],
  fighting: ['close-combat','superpower','focus-blast','drain-punch','aura-sphere','sacred-sword'],
  poison:   ['sludge-bomb','sludge-wave','poison-jab','gunk-shot','cross-poison'],
  ground:   ['earthquake','earth-power','drill-run','precipice-blades','land-s-wrath'],
  rock:     ['stone-edge','rock-slide','rock-blast','power-gem','diamond-storm'],
  bug:      ['u-turn','bug-buzz','x-scissor','megahorn','lunge','attack-order'],
  ghost:    ['shadow-ball','shadow-claw','shadow-sneak','hex','poltergeist','astral-barrage'],
  steel:    ['iron-head','flash-cannon','meteor-mash','steel-beam','anchor-shot'],
  fairy:    ['moonblast','dazzling-gleam','play-rough','spirit-break','fleur-cannon'],
  normal:   ['return','hyper-beam','extreme-speed','double-edge','body-slam','boomburst','giga-impact'],
  flying:   ['brave-bird','fly','air-slash','hurricane','aeroblast','sky-attack'],
};

export const fetchMovesForPokemon = async (pokemon) => {
  try {
    // pokemon pode ser um objeto completo ou um id
    const pokemonData = typeof pokemon === 'object' ? pokemon : null;
    
    if (!pokemonData) {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemon}`);
      const data = await res.json();
      return fetchMovesForPokemon(data);
    }
    
    // Pega os tipos do pokemon para selecionar moves relevantes
    const types = pokemonData.types.map(t => t.type.name);
    
    // Junta os moves Smogon dos tipos do pokemon
    let candidateMoveNames = [];
    for (const type of types) {
      if (SMOGON_MOVES_BY_TYPE[type]) {
        candidateMoveNames = [...candidateMoveNames, ...SMOGON_MOVES_BY_TYPE[type]];
      }
    }
    // Adiciona moves normais como fallback
    candidateMoveNames = [...candidateMoveNames, ...SMOGON_MOVES_BY_TYPE['normal']];
    
    // Interseciona com os moves que o pokemon realmente pode aprender
    const pokemonMoveNames = new Set(pokemonData.moves.map(m => m.move.name));
    const learnableSmogon = candidateMoveNames.filter(name => pokemonMoveNames.has(name));
    
    // Se o pokemon não aprender nenhum smogon, usa os moves dele e filtra por damaging
    const finalCandidates = learnableSmogon.length >= 4 ? learnableSmogon : candidateMoveNames;
    
    // Pega os 4 primeiros candidatos únicos
    const uniqueMoveNames = [...new Set(finalCandidates)].slice(0, 8);
    
    // Busca os detalhes dos moves na API
    const movePromises = uniqueMoveNames.map(name =>
      fetch(`https://pokeapi.co/api/v2/move/${name}`).then(r => r.json()).catch(() => null)
    );
    const movesData = (await Promise.all(movePromises)).filter(Boolean);
    
    // Filtra apenas moves de dano (physical ou special) com power > 0
    const damagingMoves = movesData.filter(m =>
      m.damage_class && m.damage_class.name !== 'status' && m.power && m.power > 0
    );
    
    // Seleciona até 4
    const selected = damagingMoves.slice(0, 4);
    
    // Fallback se não tiver moves suficientes
    while (selected.length < 4) {
      selected.push({ name: 'tackle', power: 40, type: { name: 'normal' }, damage_class: { name: 'physical' }, accuracy: 100 });
    }
    
    return selected.map(m => ({
      name: m.name,
      power: m.power,
      type: m.type.name,
      damageClass: m.damage_class.name,
      accuracy: m.accuracy || 100
    }));
    
  } catch (e) {
    console.error('Error fetching moves', e);
    return [
      { name: 'tackle', power: 40, type: 'normal', damageClass: 'physical', accuracy: 100 },
      { name: 'hyper-beam', power: 150, type: 'normal', damageClass: 'special', accuracy: 90 },
      { name: 'thunderbolt', power: 90, type: 'electric', damageClass: 'special', accuracy: 100 },
      { name: 'flamethrower', power: 90, type: 'fire', damageClass: 'special', accuracy: 100 },
    ];
  }
};

export const generateNPCTeam = async (playerTeam) => {
  const getStat = (poke, name) => poke.stats.find(s => s.stat.name === name).base_stat;
  const getBST = (poke) => poke.stats.reduce((sum, s) => sum + s.base_stat, 0);
  
  const playerBST = playerTeam.reduce((sum, p) => sum + getBST(p), 0);
  const targetBST = playerBST; // Queremos igualar o BST total
  
  const npcTeam = [];
  let attempts = 0;
  
  while (npcTeam.length < 6 && attempts < 60) {
    attempts++;
    // Evita lendários extremos (IDs 144-151, 243-251, 377-386, etc.) para balanceamento
    const randomId = Math.floor(Math.random() * 600) + 1;
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${randomId}`);
      const data = await res.json();
      const bst = getBST(data);
      
      // Aceita pokemon com BST razoável (evita extremos)
      if (bst >= 200 && bst <= 680) {
        npcTeam.push(data);
      }
    } catch {}
  }
  
  // Se não completou, preenche com pokemon simples
  while (npcTeam.length < 6) {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${Math.floor(Math.random() * 150) + 1}`);
    const data = await res.json();
    npcTeam.push(data);
  }
  
  return npcTeam;
};

export const calculateDamage = (attacker, defender, move) => {
  const level = 50;
  const getStat = (poke, name) => poke.stats.find(s => s.stat.name === name).base_stat;

  // Decide qual stat usar (physical vs special)
  const isSpecial = move.damageClass === 'special';
  const attackStat  = isSpecial ? getStat(attacker, 'special-attack')  : getStat(attacker, 'attack');
  const defenseStat = isSpecial ? getStat(defender, 'special-defense') : getStat(defender, 'defense');

  // Fórmula oficial simplificada
  let damage = (((2 * level) / 5 + 2) * move.power * (attackStat / defenseStat)) / 50 + 2;

  // STAB
  if (attacker.types.some(t => t.type.name === move.type)) damage *= 1.5;

  // Variação aleatória (85-100%)
  damage *= (Math.random() * 0.15 + 0.85);

  return Math.max(1, Math.floor(damage));
};
