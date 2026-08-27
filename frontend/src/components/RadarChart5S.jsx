import React from 'react';

/**
 * Componente de Gráfico Radar Pentagonal para o Programa 5S.
 * @param {{
 *   medias: {
 *     media_utilizacao: number,
 *     media_organizacao: number,
 *     media_limpeza: number,
 *     media_saude: number,
 *     media_disciplina: number,
 *     media_geral: number
 *   },
 *   size?: number
 * }} props
 */
export default function RadarChart5S({ medias, size = 320 }) {
  const sensos = [
    { key: 'utilizacao', label: 'Utilização', valor: Number(medias?.media_utilizacao || 0) },
    { key: 'organizacao', label: 'Organização', valor: Number(medias?.media_organizacao || 0) },
    { key: 'limpeza', label: 'Limpeza', valor: Number(medias?.media_limpeza || 0) },
    { key: 'saude', label: 'Saúde', valor: Number(medias?.media_saude || 0) },
    { key: 'disciplina', label: 'Disciplina', valor: Number(medias?.media_disciplina || 0) },
  ];

  const width = size;
  const height = size * 0.95;
  const cx = width / 2;
  const cy = height / 2 + 5;
  const radius = size * 0.32;
  const total = sensos.length;
  const startAngle = -Math.PI / 2;

  // Grade de 5 níveis
  const levels = [1, 2, 3, 4, 5];

  function getPoint(levelValue, index) {
    const r = (radius / 5) * levelValue;
    const angle = startAngle + (index * 2 * Math.PI) / total;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
    };
  }

  // Pontos de cada nível da grade
  const gridPolygons = levels.map((lvl) => {
    return sensos.map((_, i) => {
      const p = getPoint(lvl, i);
      return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
    }).join(' ');
  });

  // Polígono dos dados reais
  const dataPoints = sensos.map((s, i) => getPoint(Math.min(Math.max(s.valor, 0), 5), i));
  const dataPolygon = dataPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow: 'visible' }}>
        {/* Níveis de Grade */}
        {gridPolygons.map((points, idx) => (
          <polygon
            key={idx}
            points={points}
            fill={idx % 2 === 0 ? '#F8FAFC' : '#FFFFFF'}
            stroke="#E2E8F0"
            strokeWidth={idx === 4 ? '1.5' : '1'}
          />
        ))}

        {/* Linhas de Eixos Radiais */}
        {sensos.map((_, i) => {
          const maxP = getPoint(5, i);
          return (
            <line
              key={i}
              x1={cx}
              y1={cy}
              x2={maxP.x}
              y2={maxP.y}
              stroke="#CBD5E1"
              strokeWidth="1"
              strokeDasharray="2,2"
            />
          );
        })}

        {/* Polígono de Dados do 5S */}
        <polygon
          points={dataPolygon}
          fill="rgba(46, 159, 199, 0.28)"
          stroke="#0284C7"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* Pontos e Valores nos Vértices */}
        {dataPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="4" fill="#0284C7" stroke="#FFFFFF" strokeWidth="2" />
        ))}

        {/* Rótulos dos Sensos */}
        {sensos.map((s, i) => {
          const labelDist = radius + 22;
          const angle = startAngle + (i * 2 * Math.PI) / total;
          const lx = cx + labelDist * Math.cos(angle);
          const ly = cy + labelDist * Math.sin(angle);

          let textAnchor = 'middle';
          if (Math.abs(Math.cos(angle)) > 0.3) {
            textAnchor = Math.cos(angle) > 0 ? 'start' : 'end';
          }

          return (
            <g key={i}>
              <text
                x={lx}
                y={ly - 2}
                textAnchor={textAnchor}
                fontSize="11.5"
                fontWeight="700"
                fill="#0F172A"
              >
                {s.label}
              </text>
              <text
                x={lx}
                y={ly + 12}
                textAnchor={textAnchor}
                fontSize="11"
                fontWeight="600"
                fill={s.valor >= 4 ? '#16A34A' : s.valor >= 3 ? '#D97706' : '#DC2626'}
              >
                {s.valor > 0 ? s.valor.toFixed(1) : '—'}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
