import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const requiredConfigValues = [
  firebaseConfig.apiKey,
  firebaseConfig.authDomain,
  firebaseConfig.projectId,
  firebaseConfig.appId,
];

export const isFirebaseConfigured = requiredConfigValues.every(Boolean);

const firestoreDatabaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID || 'default';

let app;
let auth;
let db;

if (isFirebaseConfigured) {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app, firestoreDatabaseId);
} else {
  console.warn('Firebase nao configurado. Configure as variaveis VITE_FIREBASE_* no ambiente.');
}

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const assertFirebase = () => {
  if (!isFirebaseConfigured || !auth || !db) {
    throw new Error('Firebase nao configurado pelo administrador do site.');
  }
};

const sanitizeTrainerName = (value) => {
  const cleaned = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 20);

  return cleaned || 'Treinador';
};

const getDefaultTrainerName = (user, preferredName) =>
  sanitizeTrainerName(preferredName || user.displayName || user.email?.split('@')[0] || 'Treinador');

const getUserRef = (uid) => doc(db, 'users', uid);

const getScore = (data = {}, caughtPokemons = []) => {
  const savedScore = Number(data.score);
  return Number.isFinite(savedScore) ? Math.max(savedScore, caughtPokemons.length) : caughtPokemons.length;
};

const normalizeCapturedPokemon = (pokemon) => ({
  id: Number(pokemon.id),
  name: String(pokemon.name || '').toLowerCase(),
  sprites: {
    front_default:
      pokemon.sprites?.front_default ||
      pokemon.sprites?.other?.['official-artwork']?.front_default ||
      '',
  },
  types: (pokemon.types || []).map((entry) => ({
    slot: Number(entry.slot || 0),
    type: {
      name: String(entry.type?.name || ''),
      url: String(entry.type?.url || ''),
    },
  })),
});

export { auth, db };

export const ensureTrainerProfile = async (user, preferredName = '') => {
  assertFirebase();
  if (!user?.uid) throw new Error('Usuario invalido.');

  const userDocRef = getUserRef(user.uid);
  const userSnap = await getDoc(userDocRef);
  const existing = userSnap.exists() ? userSnap.data() : null;
  const caughtPokemons = Array.isArray(existing?.caughtPokemons) ? existing.caughtPokemons : [];
  const name = existing?.name || getDefaultTrainerName(user, preferredName);

  const profileData = {
    uid: user.uid,
    name,
    email: user.email || existing?.email || '',
    photoURL: user.photoURL || existing?.photoURL || '',
    caughtPokemons,
    team: existing?.team || [],
    score: getScore(existing, caughtPokemons),
    lastActive: serverTimestamp(),
    ...(existing ? {} : { createdAt: serverTimestamp() }),
  };

  await setDoc(userDocRef, profileData, { merge: true });
  return profileData;
};

export const registerTrainer = async (email, password, trainerName) => {
  assertFirebase();

  const sanitizedName = sanitizeTrainerName(trainerName);
  if (sanitizedName.length < 3) {
    throw new Error('Nome de treinador invalido.');
  }

  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(userCredential.user, { displayName: sanitizedName });

  return ensureTrainerProfile(userCredential.user, sanitizedName);
};

export const loginTrainer = async (email, password) => {
  assertFirebase();

  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  await ensureTrainerProfile(userCredential.user);
  return userCredential.user;
};

export const signInWithGoogle = async () => {
  assertFirebase();

  const userCredential = await signInWithPopup(auth, googleProvider);
  await ensureTrainerProfile(userCredential.user);
  return userCredential.user;
};

export const logoutTrainer = async () => {
  if (!isFirebaseConfigured || !auth) return;
  await signOut(auth);
};

export const getTrainerData = async (userOrUid) => {
  if (!isFirebaseConfigured || !db) return null;

  if (typeof userOrUid === 'string') {
    const docSnap = await getDoc(getUserRef(userOrUid));
    return docSnap.exists() ? docSnap.data() : null;
  }

  if (userOrUid?.uid) {
    return ensureTrainerProfile(userOrUid);
  }

  return null;
};

export const saveTrainerTeam = async (uid, team) => {
  if (!isFirebaseConfigured || !db || !uid) return;

  await updateDoc(getUserRef(uid), {
    team,
    lastActive: serverTimestamp(),
  });
};

export const saveCaughtPokemon = async (uid, pokemon) => {
  assertFirebase();
  if (!uid || !pokemon?.id) throw new Error('Captura invalida.');

  const capturedPokemon = normalizeCapturedPokemon(pokemon);
  const userDocRef = getUserRef(uid);

  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(userDocRef);
    const previous = snapshot.exists() ? snapshot.data() : {};
    const caughtPokemons = Array.isArray(previous.caughtPokemons) ? previous.caughtPokemons : [];
    const alreadyCaught = caughtPokemons.some((entry) => Number(entry?.id) === capturedPokemon.id);
    const nextCaught = alreadyCaught ? caughtPokemons : [...caughtPokemons, capturedPokemon];
    const nextTeam = Array.isArray(previous.team) ? previous.team : [];

    transaction.set(
      userDocRef,
      {
        uid,
        name: previous.name || 'Treinador',
        email: previous.email || auth.currentUser?.email || '',
        photoURL: previous.photoURL || auth.currentUser?.photoURL || '',
        caughtPokemons: nextCaught,
        score: nextCaught.length,
        team: nextTeam,
        lastActive: serverTimestamp(),
        ...(snapshot.exists() ? {} : { createdAt: serverTimestamp() }),
      },
      { merge: true }
    );

    return {
      caughtPokemons: nextCaught,
      team: nextTeam,
      score: nextCaught.length,
      alreadyCaught,
    };
  });
};

export const getCurrentUserIdToken = async () => {
  if (!isFirebaseConfigured || !auth?.currentUser) return '';
  return auth.currentUser.getIdToken();
};

export const getCloudTrainerProfile = async () => {
  const idToken = await getCurrentUserIdToken();
  if (!idToken) return null;

  const response = await fetch('/.netlify/functions/getTrainerProfile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ idToken }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || 'Nao foi possivel carregar o perfil na nuvem.');
  }

  return data.trainerData || null;
};

export const getGlobalLeaderboard = async () => {
  if (!isFirebaseConfigured || !db) return [];

  try {
    const usersCollection = collection(db, 'users');
    const rankingQuery = query(usersCollection, orderBy('score', 'desc'), limit(50));
    const querySnapshot = await getDocs(rankingQuery);

    return querySnapshot.docs.map((entry) => {
      const data = entry.data();
      return {
        uid: data.uid || entry.id,
        name: data.name || 'Treinador',
        count: getScore(data, Array.isArray(data.caughtPokemons) ? data.caughtPokemons : []),
        photoURL: data.photoURL || '',
        isBot: false,
      };
    });
  } catch (error) {
    console.error('Erro ao buscar leaderboard:', error);
    return [];
  }
};
