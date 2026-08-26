import DOMPurify from 'dompurify';

/**
 * Sanitiza texto removendo scripts, tags maliciosas e atributos perigosos.
 * Retorna texto limpo seguro para exibição.
 * @param {string} text
 * @returns {string}
 */
export function sanitizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: [],
  });
}

/**
 * Limpa completamente qualquer tag HTML, retornando apenas texto puro.
 * Útil para campos simples (como nomes, títulos e códigos).
 * @param {string} text
 * @returns {string}
 */
export function sanitizePlainText(text) {
  if (!text || typeof text !== 'string') return '';
  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}
