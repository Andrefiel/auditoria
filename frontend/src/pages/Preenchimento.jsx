import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, AUDITORES_LIDERES } from '../lib/api';
import Topbar from '../components/Topbar.jsx';
import RadarChart5S from '../components/RadarChart5S.jsx';

const STATUSES = ['C', 'NC', 'PA', 'OM', 'NA'];

const NOTAS_5S = [
  { valor: 1, label: '1 - Ruim', cor: '#EF4444', bg: '#FEF2F2' },
  { valor: 2, label: '2 - Regular', cor: '#F97316', bg: '#FFF7ED' },
  { valor: 3, label: '3 - Bom', cor: '#EAB308', bg: '#FEFCE8' },
  { valor: 4, label: '4 - Muito Bom', cor: '#3B82F6', bg: '#EFF6FF' },
  { valor: 5, label: '5 - Excelente', cor: '#16A34A', bg: '#F0FDF4' },
];

export default function Preenchimento() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('setor'); // 'setor' | '5s'
  const [auditoria, setAuditoria] = useState(null);
  const [itens, setItens] = useState([]);
  const [criterios5s, setCriterios5s] = useState([]);
  const [respostas5s, setRespostas5s] = useState([]);
  const [observacoes5s, setObservacoes5s] = useState('');
  const [conclusao, setConclusao] = useState('');
  const [auditorLider, setAuditorLider] = useState('');
  const [auditorAuxiliar, setAuditorAuxiliar] = useState('');
  const [auditorObservador, setAuditorObservador] = useState('');
  const [unidade, setUnidade] = useState('');
  const [openDetail, setOpenDetail] = useState({});
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const [data, crit5s] = await Promise.all([
      api.auditoria(id),
      api.criterios5S().catch(() => []),
    ]);
    setAuditoria(data);
    setItens(data.itens);
    setCriterios5s(crit5s);
    setConclusao(data.conclusao || '');
    setAuditorLider(data.auditor_lider || AUDITORES_LIDERES[0]);
    setAuditorAuxiliar(data.auditor_auxiliar || '');
    setAuditorObservador(data.auditor_observador || '');
    setUnidade(data.setor_unidade || '');

    if (data.dados5s) {
      setRespostas5s(data.dados5s.respostas || []);
      setObservacoes5s(data.dados5s.observacoes || '');
    }
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  // Cálculo reativo das médias do 5S
  const medias5S = useMemo(() => {
    const mapa = {};
    respostas5s.forEach((r) => {
      if (r.criterio_id && r.nota) mapa[r.criterio_id] = Number(r.nota);
    });

    function calcMedia(prefixo) {
      let soma = 0;
      let count = 0;
      for (let i = 1; i <= 5; i++) {
        const key = `${prefixo}_${i}`;
        if (mapa[key] !== undefined) {
          soma += mapa[key];
          count++;
        }
      }
      return count > 0 ? Number((soma / count).toFixed(2)) : 0;
    }

    const media_utilizacao = calcMedia('seiri');
    const media_organizacao = calcMedia('seiton');
    const media_limpeza = calcMedia('seiso');
    const media_saude = calcMedia('seiketsu');
    const media_disciplina = calcMedia('shitsuke');

    const validos = [
      media_utilizacao,
      media_organizacao,
      media_limpeza,
      media_saude,
      media_disciplina,
    ].filter((v) => v > 0);

    const media_geral =
      validos.length > 0 ? Number((validos.reduce((a, b) => a + b, 0) / validos.length).toFixed(2)) : 0;

    return {
      media_utilizacao,
      media_organizacao,
      media_limpeza,
      media_saude,
      media_disciplina,
      media_geral,
    };
  }, [respostas5s]);

  function setStatus(requisitoId, resultado) {
    setItens((prev) => prev.map((i) => (i.requisito_id === requisitoId ? { ...i, resultado } : i)));
  }
  function setComentario(requisitoId, comentario) {
    setItens((prev) => prev.map((i) => (i.requisito_id === requisitoId ? { ...i, comentario } : i)));
  }

  function setNota5S(criterioId, nota) {
    setRespostas5s((prev) => {
      const idx = prev.findIndex((r) => r.criterio_id === criterioId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], nota };
        return next;
      }
      return [...prev, { criterio_id: criterioId, nota, comentario: '' }];
    });
  }

  function setComentario5S(criterioId, comentario) {
    setRespostas5s((prev) => {
      const idx = prev.findIndex((r) => r.criterio_id === criterioId);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], comentario };
        return next;
      }
      return [...prev, { criterio_id: criterioId, nota: null, comentario }];
    });
  }

  function getResposta5S(criterioId) {
    return respostas5s.find((r) => r.criterio_id === criterioId) || { nota: null, comentario: '' };
  }

  async function persist(customOverrides = {}) {
    setSaving(true);
    setError('');
    try {
      const respostas = itens.map((i) => ({
        requisito_id: i.requisito_id,
        resultado: i.resultado || null,
        comentario: i.comentario || null,
      }));
      await api.salvarRespostas(id, respostas, conclusao, {
        dados5s: {
          respostas: respostas5s,
          observacoes: observacoes5s,
        },
        auditor_lider: customOverrides.auditor_lider !== undefined ? customOverrides.auditor_lider : auditorLider,
        auditor_auxiliar: customOverrides.auditor_auxiliar !== undefined ? customOverrides.auditor_auxiliar : auditorAuxiliar,
        auditor_observador: customOverrides.auditor_observador !== undefined ? customOverrides.auditor_observador : auditorObservador,
        setor_unidade: customOverrides.setor_unidade !== undefined ? customOverrides.setor_unidade : unidade,
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  // Validação: NC, PA e NA exigem justificativa/comentário obrigatório
  const semJustificativaObrigatoria = itens.filter(
    (i) => ['NA', 'NC', 'PA'].includes(i.resultado) && (!i.comentario || !i.comentario.trim())
  );

  async function handleEnviar() {
    if (semJustificativaObrigatoria.length > 0) {
      const codigos = semJustificativaObrigatoria.map((i) => i.codigo || i.nome).slice(0, 4).join(', ');
      setError(`Justificativa obrigatória para ${semJustificativaObrigatoria.length} item(ns) marcado(s) como NC, PA ou NA (${codigos}). Preencha os comentários antes de prosseguir.`);
      return;
    }

    setSending(true);
    setError('');
    try {
      await persist();
      await api.enviar(id);
      navigate(`/auditorias/${id}/previo`);
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  }

  const done = itens.filter((i) => i.resultado).length;
  const pct = itens.length ? Math.round((done / itens.length) * 100) : 0;
  const totalItens5s = 25;
  const done5s = respostas5s.filter((r) => r.nota).length;
  const ready = itens.length > 0 && done === itens.length && conclusao.trim().length > 0 && semJustificativaObrigatoria.length === 0;

  if (!auditoria) {
    return (
      <div>
        <Topbar />
        <div className="screen">{error ? <div className="error-banner">{error}</div> : 'Carregando…'}</div>
      </div>
    );
  }

  return (
    <div>
      <Topbar />
      <div className="screen">
        <div className="page-head">
          <div className="eyebrow">
            <a onClick={() => navigate('/')}>← Painel</a> · Roteiro de Auditoria Interna · Versão Digital
          </div>
          <h1>Setor: {auditoria.template_nome}</h1>
          <p className="sub">Avalie os requisitos setoriais e o Programa 5S. Itens NC, PA e NA exigem justificativa.</p>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="meta-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          <div className="meta-pill">
            <label>Auditor(a) Líder</label>
            <select
              value={auditorLider}
              onChange={(e) => {
                const val = e.target.value;
                setAuditorLider(val);
                persist({ auditor_lider: val });
              }}
            >
              {AUDITORES_LIDERES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </div>
          <div className="meta-pill">
            <label>Auditor Auxiliar</label>
            <input
              value={auditorAuxiliar}
              onChange={(e) => setAuditorAuxiliar(e.target.value)}
              onBlur={() => persist()}
              placeholder="Nome do auditor auxiliar"
            />
          </div>
          <div className="meta-pill">
            <label>Auditor Observador (Opcional)</label>
            <input
              value={auditorObservador}
              onChange={(e) => setAuditorObservador(e.target.value)}
              onBlur={() => persist()}
              placeholder="Nome do auditor observador"
            />
          </div>
          <div className="meta-pill">
            <label>Unidade / Local</label>
            <input
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              onBlur={() => persist()}
              placeholder="Ex: Recepção — Matriz"
            />
          </div>
        </div>

        {/* Abas de Navegação */}
        <div style={{ display: 'flex', gap: 8, margin: '20px 0 16px', borderBottom: '2px solid var(--line)', paddingBottom: 2 }}>
          <button
            type="button"
            onClick={() => setActiveTab('setor')}
            style={{
              background: activeTab === 'setor' ? 'var(--navy)' : 'transparent',
              color: activeTab === 'setor' ? 'white' : 'var(--ink-soft)',
              border: 'none',
              borderRadius: '8px 8px 0 0',
              padding: '10px 18px',
              fontWeight: 700,
              fontSize: 13.5,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            📋 1. Roteiro Setorial
            <span style={{ fontSize: 11, background: activeTab === 'setor' ? 'rgba(255,255,255,0.25)' : 'var(--line)', padding: '2px 7px', borderRadius: 12 }}>
              {done}/{itens.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('5s')}
            style={{
              background: activeTab === '5s' ? 'var(--navy)' : 'transparent',
              color: activeTab === '5s' ? 'white' : 'var(--ink-soft)',
              border: 'none',
              borderRadius: '8px 8px 0 0',
              padding: '10px 18px',
              fontWeight: 700,
              fontSize: 13.5,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            ⭐ 2. Checklist Programa 5S
            <span style={{ fontSize: 11, background: activeTab === '5s' ? '#22C55E' : 'var(--line)', color: activeTab === '5s' ? 'white' : 'inherit', padding: '2px 7px', borderRadius: 12, fontWeight: 700 }}>
              {medias5S.media_geral > 0 ? `Média: ${medias5S.media_geral.toFixed(2)}` : `${done5s}/${totalItens5s}`}
            </span>
          </button>
        </div>

        {/* ABA 1: ROTEIRO SETORIAL */}
        {activeTab === 'setor' && (
          <div>
            <div className="progress-wrap">
              <div className="progress-top">
                <span>{done} de {itens.length} requisitos avaliados</span>
                <span>{pct}%</span>
              </div>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
            </div>

            {semJustificativaObrigatoria.length > 0 && done === itens.length && (
              <div className="note-banner" style={{ background: '#FFF7ED', borderColor: '#FED7AA', color: '#9A3412', marginBottom: 16 }}>
                ⚠️ Atenção: <b>{semJustificativaObrigatoria.length} item(ns)</b> marcado(s) com <b>NC, PA ou NA</b> ainda não possuem justificativa preenchida. O preenchimento do comentário é obrigatório para enviar o laudo.
              </div>
            )}

            {itens.map((item) => {
              const isJustificativaObrigatoria = ['NA', 'NC', 'PA'].includes(item.resultado);
              const isPendente = isJustificativaObrigatoria && (!item.comentario || !item.comentario.trim());

              return (
                <div className="item" key={item.requisito_id} style={isPendente ? { borderLeft: '4px solid #EA580C' } : {}}>
                  <div>
                    <span className="item-tag">
                      {item.codigo}
                      {item.core && <span className="item-core">CORE</span>}
                      {item.tag && <span className="item-tagver">· {item.tag}</span>}
                    </span>
                    <div className="item-name">{item.nome}</div>
                  </div>
                  <div
                    className="detail-toggle"
                    onClick={() => setOpenDetail((s) => ({ ...s, [item.requisito_id]: !s[item.requisito_id] }))}
                  >
                    {openDetail[item.requisito_id] ? '▾' : '▸'} Ver requisito e evidência esperada
                  </div>
                  {openDetail[item.requisito_id] && (
                    <div className="item-detail">
                      <div className="seg"><b>Requisito</b>{item.requisito}</div>
                      <div className="seg"><b>Evidência esperada</b>{item.evidencia}</div>
                    </div>
                  )}
                  <div className="chip-row">
                    {STATUSES.map((s) => (
                      <div
                        key={s}
                        className={`chip ${item.resultado === s ? `sel-${s}` : ''}`}
                        onClick={() => setStatus(item.requisito_id, s)}
                      >
                        {s}
                      </div>
                    ))}
                  </div>

                  {isJustificativaObrigatoria && (
                    <div style={{ fontSize: 11.5, fontWeight: 600, color: isPendente ? '#EA580C' : 'var(--ink-soft)', marginTop: 8 }}>
                      {isPendente ? '⚠️ Justificativa obrigatória para ' + item.resultado + ':' : 'Justificativa (' + item.resultado + '):'}
                    </div>
                  )}

                  <textarea
                    className="comment-box"
                    style={isPendente ? { borderColor: '#FDBA74', background: '#FFFDFB' } : {}}
                    placeholder={
                      isJustificativaObrigatoria
                        ? `Insira a justificativa obrigatória para ${item.resultado}...`
                        : 'Comentário ou observações (opcional)...'
                    }
                    value={item.comentario || ''}
                    onChange={(e) => setComentario(item.requisito_id, e.target.value)}
                    onBlur={() => persist()}
                  />
                </div>
              );
            })}
          </div>
        )}

        {/* ABA 2: PROGRAMA 5S */}
        {activeTab === '5s' && (
          <div>
            {/* Card Superior de Resumo com Gráfico Radar */}
            <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, alignItems: 'center', marginBottom: 20 }}>
              <div>
                <div className="eyebrow" style={{ color: 'var(--sky)', marginBottom: 4 }}>Painel de Desempenho 5S</div>
                <h2 style={{ fontSize: 18, margin: '0 0 12px', color: 'var(--navy)' }}>Média dos Sensos</h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#F8FAFC', borderRadius: 6, fontSize: 13 }}>
                    <span><b>Seiri</b> (Utilização):</span>
                    <b style={{ color: medias5S.media_utilizacao >= 4 ? '#16A34A' : '#0284C7' }}>{medias5S.media_utilizacao > 0 ? medias5S.media_utilizacao.toFixed(1) : '—'}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#F8FAFC', borderRadius: 6, fontSize: 13 }}>
                    <span><b>Seiton</b> (Organização):</span>
                    <b style={{ color: medias5S.media_organizacao >= 4 ? '#16A34A' : '#0284C7' }}>{medias5S.media_organizacao > 0 ? medias5S.media_organizacao.toFixed(1) : '—'}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#F8FAFC', borderRadius: 6, fontSize: 13 }}>
                    <span><b>Seiso</b> (Limpeza):</span>
                    <b style={{ color: medias5S.media_limpeza >= 4 ? '#16A34A' : '#0284C7' }}>{medias5S.media_limpeza > 0 ? medias5S.media_limpeza.toFixed(1) : '—'}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#F8FAFC', borderRadius: 6, fontSize: 13 }}>
                    <span><b>Seiketsu</b> (Saúde):</span>
                    <b style={{ color: medias5S.media_saude >= 4 ? '#16A34A' : '#0284C7' }}>{medias5S.media_saude > 0 ? medias5S.media_saude.toFixed(1) : '—'}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#F8FAFC', borderRadius: 6, fontSize: 13 }}>
                    <span><b>Shitsuke</b> (Auto-Disciplina):</span>
                    <b style={{ color: medias5S.media_disciplina >= 4 ? '#16A34A' : '#0284C7' }}>{medias5S.media_disciplina > 0 ? medias5S.media_disciplina.toFixed(1) : '—'}</b>
                  </div>
                </div>

                <div style={{ marginTop: 14, padding: '12px', background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#166534', fontSize: 13 }}>MÉDIA GERAL 5S:</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#15803D' }}>
                    {medias5S.media_geral > 0 ? medias5S.media_geral.toFixed(2) : '0.00'}
                  </span>
                </div>
              </div>

              {/* Gráfico Radar */}
              <div style={{ textAlign: 'center', background: '#FFFFFF', padding: '10px', borderRadius: 8 }}>
                <RadarChart5S medias={medias5S} size={280} />
              </div>
            </div>

            {/* Checklist dos 5 Sensos */}
            {criterios5s.map((senso) => (
              <div key={senso.id} style={{ marginBottom: 24 }}>
                <div style={{ background: 'var(--navy)', color: 'white', padding: '10px 16px', borderRadius: 8, fontWeight: 700, fontSize: 14, marginBottom: 12 }}>
                  {senso.titulo}
                </div>

                {senso.criterios.map((crit, idx) => {
                  const resp = getResposta5S(crit.id);

                  return (
                    <div key={crit.id} className="item" style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <span style={{ background: '#E2E8F0', color: '#334155', fontWeight: 700, fontSize: 11, padding: '3px 8px', borderRadius: 4 }}>
                          {idx + 1}
                        </span>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{crit.texto}</div>
                      </div>

                      {/* Escala de Notas de 1 a 5 */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                        {NOTAS_5S.map((n) => {
                          const isSel = resp.nota === n.valor;
                          return (
                            <button
                              key={n.valor}
                              type="button"
                              onClick={() => {
                                setNota5S(crit.id, n.valor);
                                setTimeout(() => persist(), 50);
                              }}
                              style={{
                                flex: '1 1 auto',
                                minWidth: 90,
                                padding: '8px 10px',
                                borderRadius: 6,
                                border: isSel ? `2px solid ${n.cor}` : '1px solid var(--line)',
                                background: isSel ? n.cor : n.bg,
                                color: isSel ? '#FFFFFF' : '#334155',
                                fontWeight: isSel ? 700 : 500,
                                fontSize: 12,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              {n.label}
                            </button>
                          );
                        })}
                      </div>

                      <textarea
                        className="comment-box"
                        placeholder="Comentário sobre este item do 5S (opcional)..."
                        value={resp.comentario || ''}
                        onChange={(e) => setComentario5S(crit.id, e.target.value)}
                        onBlur={() => persist()}
                        style={{ marginTop: 8 }}
                      />
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Observações Gerais do 5S */}
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-title">Observações e Registros do Auditor sobre o 5S</div>
              <p className="sub" style={{ marginBottom: 8 }}>
                Pontos fortes, oportunidades de melhoria e considerações gerais sobre a aplicação do 5S no setor.
              </p>
              <textarea
                className="comment-box"
                rows={4}
                placeholder="Descreva as observações gerais sobre o 5S..."
                value={observacoes5s}
                onChange={(e) => setObservacoes5s(e.target.value)}
                onBlur={() => persist()}
              />
            </div>
          </div>
        )}

        {/* Conclusão Geral e Ações de Salvar */}
        <div className="card" style={{ marginTop: 24 }}>
          <div className="card-title">Conclusão Geral da Auditoria</div>
          <p className="sub" style={{ marginBottom: 8 }}>
            Observações finais, recomendações e considerações da equipe de auditoria sobre o setor.
          </p>
          <textarea
            className="comment-box"
            rows={4}
            placeholder="Escreva a conclusão da auditoria..."
            value={conclusao}
            onChange={(e) => setConclusao(e.target.value)}
            onBlur={() => persist()}
          />
        </div>

        <div className="btn-row">
          <button className="btn btn-ghost" onClick={() => persist()} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar rascunho'}
          </button>
          <button
            className="btn btn-primary"
            disabled={!ready || sending}
            onClick={handleEnviar}
            title={!ready ? 'Responda todos os itens do roteiro setorial, justifique NC/PA/NA e preencha a conclusão.' : ''}
          >
            {sending ? 'Enviando…' : 'Gerar relatório prévio →'}
          </button>
        </div>
      </div>
    </div>
  );
}


