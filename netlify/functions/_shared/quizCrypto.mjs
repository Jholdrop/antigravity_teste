import crypto from 'node:crypto';

const MIN_SECRET_LENGTH = 32;

export class QuizConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QuizConfigError';
  }
}

const getSecret = () => {
  const secret = process.env.QUIZ_SECRET;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new QuizConfigError(
      `QUIZ_SECRET precisa existir no ambiente e ter pelo menos ${MIN_SECRET_LENGTH} caracteres.`
    );
  }
  return secret;
};

const getCipherKey = () => crypto.createHash('sha256').update(getSecret()).digest();

export const generateChallengeToken = ({ challengeId, pokemonId, expiresAt }) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getCipherKey(), iv);
  const payload = JSON.stringify({ challengeId, pokemonId, expiresAt });
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}.${tag.toString('hex')}.${encrypted.toString('hex')}`;
};

export const decryptChallengeToken = (token) => {
  try {
    const [ivHex, tagHex, encryptedHex] = String(token || '').split('.');
    if (!ivHex || !tagHex || !encryptedHex) return null;

    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', getCipherKey(), iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return null;
  }
};

export const isQuizConfigError = (error) => error instanceof QuizConfigError;
