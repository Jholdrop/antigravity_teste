export const sanitizeText = (value, { allowNumbers = true, allowHyphen = true, allowSpaces = true } = {}) => {
  if (typeof value !== 'string') return '';
  const allowed = ['a-zA-Z', allowNumbers ? '0-9' : '', allowHyphen ? '\\-' : '', allowSpaces ? '\\s' : ''].join('');
  return value
    .replace(new RegExp(`[^${allowed}]`, 'g'), '')
    .trim()
    .replace(/\s+/g, ' ');
};
