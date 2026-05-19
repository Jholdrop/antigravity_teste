import { json, methodNotAllowed, serverError } from './_shared/http.mjs';
import { getTrainerProfileFromToken } from './_shared/firebaseAdmin.mjs';

const parseBody = (event) => {
  try {
    return JSON.parse(event.body || '{}');
  } catch {
    return null;
  }
};

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed();

  const body = parseBody(event);
  if (!body?.idToken) return json(401, { error: 'Sessao ausente.' });

  try {
    const result = await getTrainerProfileFromToken(body.idToken);
    if (!result.saved) return json(500, { error: result.reason, trainerData: null });

    return json(200, result);
  } catch (error) {
    console.error('Erro ao carregar perfil pelo Firebase Admin:', error);
    return serverError('Nao foi possivel carregar o perfil na nuvem.');
  }
};
