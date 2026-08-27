const PDFDocument = require('pdfkit');

const NAVY = '#0B1C39';
const SKY = '#2E9FC7';
const LINE = '#E2E7EE';
const INK_SOFT = '#5B6B85';
const STATUS_COLOR = { C: '#2F9E5B', NC: '#D64545', PA: '#8A6100', OM: '#2E9FC7', NA: '#94A3AD' };

function desenharRadar5S(doc, cx, cy, raio, medias) {
  const sensos = [
    { label: 'Utilização', valor: Number(medias.media_utilizacao || 0) },
    { label: 'Organização', valor: Number(medias.media_organizacao || 0) },
    { label: 'Limpeza', valor: Number(medias.media_limpeza || 0) },
    { label: 'Saúde', valor: Number(medias.media_saude || 0) },
    { label: 'Disciplina', valor: Number(medias.media_disciplina || 0) },
  ];

  const totalVertices = 5;
  const anguloInicial = -Math.PI / 2; // topo

  // Grade de 5 níveis concêntricos (1 a 5)
  for (let level = 1; level <= 5; level++) {
    const r = (raio / 5) * level;
    doc.save();
    doc.lineWidth(level === 5 ? 1 : 0.5).strokeColor('#D1D5DB');
    for (let i = 0; i < totalVertices; i++) {
      const angle = anguloInicial + (i * 2 * Math.PI) / totalVertices;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      if (i === 0) doc.moveTo(x, y);
      else doc.lineTo(x, y);
    }
    doc.closePath().stroke();
    doc.restore();
  }

  // Linhas radiais
  for (let i = 0; i < totalVertices; i++) {
    const angle = anguloInicial + (i * 2 * Math.PI) / totalVertices;
    const x = cx + raio * Math.cos(angle);
    const y = cy + raio * Math.sin(angle);
    doc.save();
    doc.lineWidth(0.5).strokeColor('#D1D5DB').moveTo(cx, cy).lineTo(x, y).stroke();
    doc.restore();
  }

  // Polígono de dados preenchido
  const pontosDados = sensos.map((s, i) => {
    const r = (raio / 5) * Math.min(Math.max(s.valor, 0), 5);
    const angle = anguloInicial + (i * 2 * Math.PI) / totalVertices;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });

  doc.save();
  doc.fillColor('#2E9FC7', 0.22).strokeColor('#0284C7').lineWidth(2);
  pontosDados.forEach((p, i) => {
    if (i === 0) doc.moveTo(p.x, p.y);
    else doc.lineTo(p.x, p.y);
  });
  doc.closePath().fillAndStroke();
  doc.restore();

  // Rótulos e valores de cada senso
  sensos.forEach((s, i) => {
    const angle = anguloInicial + (i * 2 * Math.PI) / totalVertices;
    const labelR = raio + 18;
    const lx = cx + labelR * Math.cos(angle);
    const ly = cy + labelR * Math.sin(angle);

    doc.font('Helvetica-Bold').fontSize(8).fillColor('#0B1C39');
    let align = 'center';
    let textX = lx - 40;
    if (Math.abs(Math.cos(angle)) > 0.3) {
      if (Math.cos(angle) > 0) {
        textX = lx - 5;
        align = 'left';
      } else {
        textX = lx - 75;
        align = 'right';
      }
    }
    doc.text(`${s.label} (${s.valor > 0 ? s.valor.toFixed(1) : '—'})`, textX, ly - 5, { width: 80, align });
  });
}

/**
 * Gera o PDF do relatório (prévio ou final) e escreve no stream de resposta.
 * @param {import('stream').Writable} stream
 * @param {object} auditoria - registro da tabela auditorias
 * @param {string} templateNome
 * @param {Array} itens - [{codigo, nome, core, resultado, comentario}]
 * @param {boolean} aprovado
 * @param {object} dados5s - dados da tabela auditorias_5s
 */
function gerarRelatorioPDF(stream, auditoria, templateNome, itens, aprovado, dados5s) {
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

  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text('2. Resumo da avaliação setorial', 50, y);
  y += 20;
  const labels = ['C', 'NC', 'PA', 'OM', 'NA'];
  labels.forEach((l, i) => {
    const x = 50 + i * 100;
    doc.font('Helvetica-Bold').fontSize(16).fillColor(STATUS_COLOR[l] || '#000').text(String(counts[l]), x, y);
    doc.font('Helvetica').fontSize(8).fillColor(INK_SOFT).text(l, x, y + 20);
  });
  y += 50;

  // Seção do Programa 5S
  if (dados5s && Number(dados5s.media_geral || 0) > 0) {
    if (y > 540) { doc.addPage(); y = 50; }
    doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
    y += 16;

    doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY)
      .text('3. Avaliação do Programa 5S (Sensos)', 50, y);
    y += 20;

    // Resumo lateral das notas dos 5 sensos
    const start5sY = y;
    const sensosList = [
      { nome: 'Utilização (Seiri)', nota: dados5s.media_utilizacao },
      { nome: 'Organização (Seiton)', nota: dados5s.media_organizacao },
      { nome: 'Limpeza (Seiso)', nota: dados5s.media_limpeza },
      { nome: 'Saúde (Seiketsu)', nota: dados5s.media_saude },
      { nome: 'Disciplina (Shitsuke)', nota: dados5s.media_disciplina },
    ];

    let rowY = start5sY;
    sensosList.forEach((s) => {
      doc.font('Helvetica').fontSize(10).fillColor('#000').text(s.nome, 50, rowY);
      doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY)
        .text(Number(s.nota || 0).toFixed(1), 200, rowY, { align: 'right', width: 30 });
      rowY += 18;
    });

    // Média Geral Box
    doc.rect(50, rowY + 6, 180, 28).fillAndStroke('#F0FDF4', '#86EFAC');
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#166534')
      .text('MÉDIA GERAL 5S:', 60, rowY + 14);
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#15803D')
      .text(Number(dados5s.media_geral || 0).toFixed(2), 150, rowY + 12, { align: 'right', width: 70 });

    // Desenha o gráfico Radar à direita
    desenharRadar5S(doc, 395, start5sY + 55, 55, dados5s);

    y = Math.max(rowY + 45, start5sY + 130);

    if (dados5s.observacoes && dados5s.observacoes.trim()) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(INK_SOFT)
        .text('Observações e Registros do 5S:', 50, y);
      y += 14;
      doc.font('Helvetica-Oblique').fontSize(9.5).fillColor('#334155')
        .text(`"${dados5s.observacoes}"`, 50, y, { width: 495 });
      y = doc.y + 20;
    }
  }

  if (y > 660) { doc.addPage(); y = 50; }
  doc.moveTo(50, y).lineTo(545, y).strokeColor(LINE).stroke();
  y += 16;

  const secaoNum = (dados5s && Number(dados5s.media_geral || 0) > 0) ? '4' : '3';
  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY).text(`${secaoNum}. Conclusão`, 50, y);
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

