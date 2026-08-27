const PDFDocument = require('pdfkit');

const NAVY = '#0B1C39';
const SKY = '#2E9FC7';
const LINE = '#E2E7EE';
const INK_SOFT = '#5B6B85';
const STATUS_COLOR = { C: '#2F9E5B', NC: '#D64545', PA: '#8A6100', OM: '#2E9FC7', NA: '#94A3AD' };

/**
 * Gera o PDF do relatório (prévio ou final) e escreve no stream de resposta.
 * @param {import('stream').Writable} stream
 * @param {object} auditoria - registro da tabela auditorias
 * @param {string} templateNome
 * @param {Array} itens - [{codigo, nome, core, resultado, comentario}]
 * @param {boolean} aprovado
 */
function gerarRelatorioPDF(stream, auditoria, templateNome, itens, aprovado) {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  doc.pipe(stream);

  // Cabeçalho
  doc.rect(0, 0, doc.page.width, 90).fill(NAVY);
  doc.fillColor('white').fontSize(10).font('Helvetica-Bold')
    .text(aprovado ? 'RELATÓRIO FINAL' : 'RELATÓRIO PRÉVIO', 50, 25, { characterSpacing: 1 });
  doc.fontSize(18).text(`Auditoria Interna — ${templateNome}`, 50, 40);
  doc.fontSize(10).font('Helvetica').fillColor('#CFE9F4')
    .text(auditoria.setor_unidade || '', 50, 65);

  doc.moveDown(3);
  doc.fillColor('#000');

  // Metadados
  const metaY = 110;
  doc.fontSize(9).fillColor(INK_SOFT).font('Helvetica-Bold');
  doc.text('AUDITOR(A) LÍDER', 50, metaY);
  doc.text('AUDITOR AUXILIAR', 300, metaY);
  doc.fillColor('#000').font('Helvetica').fontSize(11);
  doc.text(auditoria.auditor_lider || '— (pendente)', 50, metaY + 13);
  doc.text(auditoria.auditor_auxiliar || '-', 300, metaY + 13);

  doc.fontSize(9).fillColor(INK_SOFT).font('Helvetica-Bold');
  doc.text('AUDITOR OBSERVADOR', 50, metaY + 35);
  doc.text('DATA DA AUDITORIA', 300, metaY + 35);
  doc.fillColor('#000').font('Helvetica').fontSize(11);
  doc.text(auditoria.auditor_observador || '—', 50, metaY + 48);
  doc.text(new Date(auditoria.criado_em).toLocaleString('pt-BR'), 300, metaY + 48);

  doc.moveTo(50, metaY + 75).lineTo(545, metaY + 75).strokeColor(LINE).stroke();

  // Itens
  let y = metaY + 95;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('1. Requisitos avaliados', 50, y);
  y += 22;

  const counts = { C: 0, NC: 0, PA: 0, OM: 0, NA: 0 };

  itens.forEach((item) => {
    if (!item.resultado) return;
    counts[item.resultado] = (counts[item.resultado] || 0) + 1;

    if (y > 720) {
      doc.addPage();
      y = 50;
    }

    doc.font('Helvetica-Bold').fontSize(9).fillColor(SKY)
      .text(`${item.codigo}${item.core ? ' [CORE]' : ''}`, 50, y);
    const statusColor = STATUS_COLOR[item.resultado] || '#000';
    doc.font('Helvetica-Bold').fontSize(9).fillColor(statusColor)
      .text(item.resultado, 500, y, { width: 45, align: 'right' });

    doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#000')
      .text(item.nome, 50, y + 12, { width: 495 });
    let cursorY = doc.y + 2;

    if (item.comentario) {
      doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(INK_SOFT)
        .text(`"${item.comentario}"`, 50, cursorY, { width: 495 });
      cursorY = doc.y;
    }
    y = cursorY + 12;
  });

  if (y > 680) { doc.addPage(); y = 50; }
  y += 10;
  doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
  y += 16;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('2. Resumo da avaliação', 50, y);
  y += 20;
  const labels = ['C', 'NC', 'PA', 'OM', 'NA'];
  labels.forEach((l, i) => {
    const x = 50 + i * 100;
    doc.font('Helvetica-Bold').fontSize(16).fillColor(STATUS_COLOR[l] || '#000').text(String(counts[l]), x, y);
    doc.font('Helvetica').fontSize(8).fillColor(INK_SOFT).text(l, x, y + 20);
  });
  y += 50;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('3. Conclusão', 50, y);
  y += 18;
  doc.font('Helvetica').fontSize(10).fillColor('#000')
    .text(auditoria.conclusao || 'Nenhuma conclusão registrada.', 50, y, { width: 495 });
  y = doc.y + 30;

  if (aprovado) {
    if (y > 670) { doc.addPage(); y = 50; }
    doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).dash(2, { space: 2 }).stroke().undash();
    y += 20;
    doc.font('Helvetica').fontSize(9.5).fillColor(INK_SOFT)
      .text('ASSINATURA DIGITAL / APROVAÇÃO DO LAUDO', 50, y, { align: 'center', width: 495, characterSpacing: 1 });
    y += 16;
    doc.font('Helvetica-Bold').fontSize(13.5).fillColor(NAVY)
      .text(`Aprovado digitalmente por: ${auditoria.aprovado_por || ''}`, 50, y, { align: 'center', width: 495 });
    y += 18;
    doc.font('Helvetica').fontSize(10).fillColor(INK_SOFT)
      .text(auditoria.aprovado_em ? `Data e hora da aprovação: ${new Date(auditoria.aprovado_em).toLocaleString('pt-BR')}` : '', 50, y, { align: 'center', width: 495 });
  }

  doc.end();
}

module.exports = { gerarRelatorioPDF };
