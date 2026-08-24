const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: process.env.SMTP_USER
    ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
    : undefined,
});

async function send({ to, subject, html }) {
  if (!process.env.SMTP_HOST) {
    console.log(`[mailer] SMTP não configurado — pulando envio para ${to}: ${subject}`);
    return;
  }
  try {
    await transporter.sendMail({ from: process.env.SMTP_FROM, to, subject, html });
  } catch (err) {
    // Falha de e-mail não deve derrubar o fluxo da auditoria
    console.error('[mailer] Erro ao enviar e-mail:', err.message);
  }
}

function notificarEnvioParaAprovacao({ to, setorNome, unidade, auditor, link }) {
  return send({
    to,
    subject: `Auditoria aguardando aprovação — ${setorNome}`,
    html: `
      <p>Uma auditoria de <b>${setorNome}</b> (${unidade}) foi enviada por <b>${auditor}</b> e está aguardando sua aprovação.</p>
      <p><a href="${link}">Abrir relatório prévio</a></p>
    `,
  });
}

function notificarDecisao({ to, setorNome, unidade, decisao, observacao, link }) {
  const aprovado = decisao === 'aprovado';
  return send({
    to,
    subject: `Auditoria ${aprovado ? 'aprovada' : 'devolvida'} — ${setorNome}`,
    html: `
      <p>Sua auditoria de <b>${setorNome}</b> (${unidade}) foi <b>${aprovado ? 'aprovada' : 'devolvida para ajustes'}</b>.</p>
      ${observacao ? `<p><b>Observação:</b> ${observacao}</p>` : ''}
      <p><a href="${link}">Abrir auditoria</a></p>
    `,
  });
}

module.exports = { notificarEnvioParaAprovacao, notificarDecisao };
