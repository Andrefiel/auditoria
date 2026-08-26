const path = require('path');
const crypto = require('crypto');

// Whitelist de extensões e tipos MIME permitidos
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

const ALLOWED_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.pdf']);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Valida o arquivo enviado (extensão, mime-type e tamanho)
 * e gera um nome de arquivo seguro baseado em UUID para impedir Path Traversal.
 * @param {{ originalname: string, mimetype: string, size: number }} file
 * @returns {{ valid: boolean, error?: string, safeFileName?: string }}
 */
function validateAndSanitizeFile(file) {
  if (!file) {
    return { valid: false, error: 'Nenhum arquivo enviado' };
  }

  // 1. Validação de tamanho
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'Arquivo excede o tamanho máximo permitido de 10 MB' };
  }

  // 2. Validação de extensão
  const ext = path.extname(file.originalname || '').toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `Extensão de arquivo não permitida (${ext || 'desconhecida'}). Permitidos: JPG, PNG, WEBP, PDF` };
  }

  // 3. Validação de MIME Type
  const mime = (file.mimetype || '').toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mime)) {
    return { valid: false, error: `Tipo de mídia inválido (${mime})` };
  }

  // 4. Geração de nome aleatório seguro (Anti-Path Traversal / Anti-Overwrite)
  const safeFileName = `${crypto.randomUUID()}${ext}`;

  return { valid: true, safeFileName };
}

module.exports = {
  validateAndSanitizeFile,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
};
