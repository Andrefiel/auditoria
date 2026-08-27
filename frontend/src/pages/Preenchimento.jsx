import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, AUDITORES_LIDERES } from '../lib/api';
import Topbar from '../components/Topbar.jsx';

const STATUSES = ['C', 'NC', 'PA', 'OM', 'NA'];

export default function Preenchimento() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [auditoria, setAuditoria] = useState(null);
  const [itens, setItens] = useState([]);
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
    const data = await api.auditoria(id);
    setAuditoria(data);
    setItens(data.itens);
    setConclusao(data.conclusao || '');
    setAuditorLider(data.auditor_lider || AUDITORES_LIDERES[0]);
    setAuditorAuxiliar(data.auditor_auxiliar || '');
    setAuditorObservador(data.auditor_observador || '');
    setUnidade(data.setor_unidade || '');
  }, [id]);

  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);

  function setStatus(requisitoId, resultado) {
    setItens((prev) => prev.map((i) => (i.requisito_id === requisitoId ? { ...i, resultado } : i)));
  }
  function setComentario(requisitoId, comentario) {
    setItens((prev) => prev.map((i) => (i.requisito_id === requisitoId ? { ...i, comentario } : i)));
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
          <p className="sub">Avalie cada requisito. Itens NC, PA e NA exigem preenchimento de justificativa.</p>
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

        <div className="progress-wrap">
          <div className="progress-top">
            <span>{done} de {itens.length} itens avaliados</span>
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

        <div className="card">
          <div className="card-title">Conclusão</div>
          <p className="sub" style={{ marginBottom: 8 }}>
            Observações finais, recomendações e considerações da equipe de auditoria.
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
            title={!ready ? 'Responda todos os itens, justifique NC/PA/NA e preencha a conclusão.' : ''}
          >
            {sending ? 'Enviando…' : 'Gerar relatório prévio →'}
          </button>
        </div>
      </div>
    </div>
  );
}

