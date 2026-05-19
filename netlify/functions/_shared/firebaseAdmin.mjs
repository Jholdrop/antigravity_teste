import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { getDisplayPokemonName } from './pokemonNames.mjs';

const firestoreDatabaseId = process.env.FIREBASE_DATABASE_ID || 'default';

const normalizePrivateKey = (privateKey = '') => privateKey.replace(/\\n/g, '\n');

export const isFirebaseAdminConfigured = () =>
  Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );

const getFirebaseAdminApp = () => {
  if (!isFirebaseAdminConfigured()) return null;

  if (!getApps().length) {
    return initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
      }),
    });
  }

  return getApp();
};

const getFirebaseAdminServices = () => {
  const app = getFirebaseAdminApp();
  if (!app) return null;

  return {
    auth: getAuth(app),
    db: getFirestore(app, firestoreDatabaseId),
  };
};

const sanitizeTrainerName = (value) => {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 20);

  return cleaned || 'Treinador';
};

const getScore = (previous = {}, caughtPokemons = []) => {
  const savedScore = Number(previous.score);
  return Number.isFinite(savedScore) ? Math.max(savedScore, caughtPokemons.length) : caughtPokemons.length;
};

export const getTrainerProfileFromToken = async (idToken) => {
  const services = getFirebaseAdminServices();
  if (!services || !idToken) {
    return {
      saved: false,
      reason: 'Firebase Admin nao configurado ou sessao ausente.',
      trainerData: null,
    };
  }

  const decoded = await services.auth.verifyIdToken(idToken);
  const userRef = services.db.collection('users').doc(decoded.uid);
  const snapshot = await userRef.get();
  const previous = snapshot.exists ? snapshot.data() : {};
  const caughtPokemons = Array.isArray(previous.caughtPokemons) ? previous.caughtPokemons : [];
  const team = Array.isArray(previous.team) ? previous.team : [];
  const score = getScore(previous, caughtPokemons);
  const trainerData = {
    uid: decoded.uid,
    name: sanitizeTrainerName(previous.name || decoded.name || decoded.email?.split('@')[0]),
    email: decoded.email || previous.email || '',
    photoURL: decoded.picture || previous.photoURL || '',
    caughtPokemons,
    team,
    score,
  };

  if (!snapshot.exists) {
    await userRef.set({
      ...trainerData,
      createdAt: FieldValue.serverTimestamp(),
      lastActive: FieldValue.serverTimestamp(),
    });
  } else {
    await userRef.set(
      {
        uid: trainerData.uid,
        name: trainerData.name,
        email: trainerData.email,
        photoURL: trainerData.photoURL,
        score: trainerData.score,
        lastActive: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  return {
    saved: true,
    trainerData,
  };
};

export const toCapturedPokemon = (pokemon, species = null) => ({
  id: pokemon.id,
  name: getDisplayPokemonName(pokemon, species),
  sprites: {
    front_default:
      pokemon.sprites?.other?.['official-artwork']?.front_default ||
      pokemon.sprites?.front_default ||
      '',
  },
  types: (pokemon.types || []).map((entry) => ({
    slot: entry.slot,
    type: {
      name: entry.type?.name || '',
      url: entry.type?.url || '',
    },
  })),
});

export const awardPokemonToUser = async ({ idToken, pokemon, species = null }) => {
  const services = getFirebaseAdminServices();
  if (!services || !idToken) {
    return {
      saved: false,
      reason: 'Firebase Admin nao configurado ou sessao ausente.',
      capturedPokemon: toCapturedPokemon(pokemon, species),
    };
  }

  const decoded = await services.auth.verifyIdToken(idToken);
  const db = services.db;
  const userRef = db.collection('users').doc(decoded.uid);
  const capturedPokemon = toCapturedPokemon(pokemon, species);

  let alreadyCaught = false;
  let score = 0;
  let savedCaughtPokemons = [];
  let savedTeam = [];

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const previous = snapshot.exists ? snapshot.data() : {};
    const caughtPokemons = Array.isArray(previous.caughtPokemons) ? previous.caughtPokemons : [];
    const nextTeam = Array.isArray(previous.team) ? previous.team : [];

    alreadyCaught = caughtPokemons.some((entry) => entry?.id === capturedPokemon.id);
    const nextCaught = alreadyCaught ? caughtPokemons : [...caughtPokemons, capturedPokemon];
    score = nextCaught.length;
    savedCaughtPokemons = nextCaught;
    savedTeam = nextTeam;

    transaction.set(
      userRef,
      {
        uid: decoded.uid,
        name: sanitizeTrainerName(previous.name || decoded.name || decoded.email?.split('@')[0]),
        email: decoded.email || previous.email || '',
        photoURL: decoded.picture || previous.photoURL || '',
        caughtPokemons: nextCaught,
        score,
        team: nextTeam,
        lastActive: FieldValue.serverTimestamp(),
        ...(snapshot.exists
          ? {}
          : { createdAt: FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );
  });

  return {
    saved: true,
    alreadyCaught,
    score,
    trainerData: {
      caughtPokemons: savedCaughtPokemons,
      score,
      team: savedTeam,
    },
    capturedPokemon,
  };
};
