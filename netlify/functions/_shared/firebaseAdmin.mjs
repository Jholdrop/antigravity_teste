import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

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

export const toCapturedPokemon = (pokemon) => ({
  id: pokemon.id,
  name: pokemon.name,
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

export const awardPokemonToUser = async ({ idToken, pokemon }) => {
  const services = getFirebaseAdminServices();
  if (!services || !idToken) {
    return {
      saved: false,
      reason: 'Firebase Admin nao configurado ou sessao ausente.',
      capturedPokemon: toCapturedPokemon(pokemon),
    };
  }

  const decoded = await services.auth.verifyIdToken(idToken);
  const db = services.db;
  const userRef = db.collection('users').doc(decoded.uid);
  const capturedPokemon = toCapturedPokemon(pokemon);

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
