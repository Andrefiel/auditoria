const { z } = require('zod');

/**
 * Middleware para validar o req.body com um schema Zod.
 * Sanitiza e remove campos extras não definidos no schema (bloqueia Mass Assignment).
 */
function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errorMessages = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({ error: `Dados inválidos: ${errorMessages}` });
      }
      next(err);
    }
  };
}

module.exports = { validateBody, z };
