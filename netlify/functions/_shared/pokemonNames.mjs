export const normalizePokemonName = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const compactPokemonName = (value) => normalizePokemonName(value).replace(/-/g, '');

export const getDisplayPokemonName = (pokemon, species = null) =>
  normalizePokemonName(species?.name || pokemon?.species?.name || pokemon?.name || 'pokemon');

export const buildAcceptedPokemonNames = (pokemon, species = null) => {
  const names = new Set();
  const addName = (value) => {
    const normalized = normalizePokemonName(value);
    if (normalized) names.add(normalized);
  };

  addName(pokemon?.name);
  addName(pokemon?.species?.name);
  addName(species?.name);

  for (const form of pokemon?.forms || []) {
    addName(form?.name);
  }

  for (const variety of species?.varieties || []) {
    addName(variety?.pokemon?.name);
  }

  return [...names];
};

export const isAcceptedPokemonGuess = (guess, acceptedNames) => {
  const normalizedGuess = normalizePokemonName(guess);
  const compactGuess = compactPokemonName(guess);

  return acceptedNames.some((name) => {
    const normalizedName = normalizePokemonName(name);
    return normalizedGuess === normalizedName || compactGuess === compactPokemonName(normalizedName);
  });
};
