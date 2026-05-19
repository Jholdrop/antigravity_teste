export const json = (statusCode, payload, headers = {}) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  },
  body: JSON.stringify(payload),
});

export const methodNotAllowed = () =>
  json(405, { error: 'Metodo nao permitido' }, { Allow: 'POST' });

export const serverError = (message = 'Erro interno do servidor') =>
  json(500, { error: message });
