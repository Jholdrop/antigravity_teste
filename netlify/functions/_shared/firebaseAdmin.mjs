import admin from 'firebase-admin';

const normalizePrivateKey = (privateKey = '') => privateKey.replace(/\\n/g, '\n');

export const isFirebaseAdminConfigured = () =>
  Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );

export const getFirebaseAdmin = () => {
  if (!isFirebaseAdminConfigured()) return null;

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
      }),
    });
  }

  return admin;
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
  const firebaseAdmin = getFirebaseAdmin();
  if (!firebaseAdmin || !idToken) {
    return {
      saved: false,
      reason: 'Firebase Admin nao configurado ou sessao ausente.',
      capturedPokemon: toCapturedPokemon(pokemon),
    };
  }

  const decoded = await firebaseAdmin.auth().verifyIdToken(idToken);
  const db = firebaseAdmin.firestore();
  const userRef = db.collection('users').doc(decoded.uid);
  const capturedPokemon = toCapturedPokemon(pokemon);

  let alreadyCaught = false;
  let score = 0;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(userRef);
    const previous = snapshot.exists ? snapshot.data() : {};
    const caughtPokemons = Array.isArray(previous.caughtPokemons) ? previous.caughtPokemons : [];

    alreadyCaught = caughtPokemons.some((entry) => entry?.id === capturedPokemon.id);
    const nextCaught = alreadyCaught ? caughtPokemons : [...caughtPokemons, capturedPokemon];
    score = nextCaught.length;

    transaction.set(
      userRef,
      {
        uid: decoded.uid,
        name: sanitizeTrainerName(previous.name || decoded.name || decoded.email?.split('@')[0]),
        email: decoded.email || previous.email || '',
        photoURL: decoded.picture || previous.photoURL || '',
        caughtPokemons: nextCaught,
        score,
        team: Array.isArray(previous.team) ? previous.team : [],
        lastActive: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
        ...(snapshot.exists
          ? {}
          : { createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp() }),
      },
      { merge: true }
    );
  });

  return {
    saved: true,
    alreadyCaught,
    score,
    capturedPokemon,
  };
};
