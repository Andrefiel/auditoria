const criterios5s = require('../data/criterios5s.json');

/**
 * Calcula as médias por senso e a média geral a partir de um array de respostas do 5S.
 * @param {Array<{ criterio_id: string, nota: number, comentario?: string }>} respostas
 * @returns {{
 *   media_utilizacao: number,
 *   media_organizacao: number,
 *   media_limpeza: number,
 *   media_saude: number,
 *   media_disciplina: number,
 *   media_geral: number,
 *   totais: { seiri: number, seiton: number, seiso: number, seiketsu: number, shitsuke: number }
 * }}
 */
function calcularMedias5S(respostas = []) {
  const mapaNotas = {};
  respostas.forEach((r) => {
    if (r.criterio_id && r.nota) {
      mapaNotas[r.criterio_id] = Number(r.nota);
    }
  });

  function calcularMediaSenso(prefixo) {
    let soma = 0;
    let count = 0;
    for (let i = 1; i <= 5; i++) {
      const id = `${prefixo}_${i}`;
      if (mapaNotas[id] !== undefined) {
        soma += mapaNotas[id];
        count++;
      }
    }
    return count > 0 ? Number((soma / count).toFixed(2)) : 0;
  }

  const media_utilizacao = calcularMediaSenso('seiri');
  const media_organizacao = calcularMediaSenso('seiton');
  const media_limpeza = calcularMediaSenso('seiso');
  const media_saude = calcularMediaSenso('seiketsu');
  const media_disciplina = calcularMediaSenso('shitsuke');

  const sensosValidos = [
    media_utilizacao,
    media_organizacao,
    media_limpeza,
    media_saude,
    media_disciplina,
  ].filter((m) => m > 0);

  const media_geral =
    sensosValidos.length > 0
      ? Number((sensosValidos.reduce((acc, v) => acc + v, 0) / sensosValidos.length).toFixed(2))
      : 0;

  return {
    media_utilizacao,
    media_organizacao,
    media_limpeza,
    media_saude,
    media_disciplina,
    media_geral,
  };
}

module.exports = { criterios5s, calcularMedias5S };
