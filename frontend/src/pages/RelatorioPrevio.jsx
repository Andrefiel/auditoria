import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api';
import Topbar from '../components/Topbar.jsx';
import RadarChart5S from '../components/RadarChart5S.jsx';

const STATUS_LABEL = { C: 'C', NC: 'NC', PA: 'PA', OM: 'OM', NA: 'NA' };

export default function RelatorioPrevio() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [auditoria, setAuditoria] = useState(null);
  const [observacao, setObservacao] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.auditoria(id).then(setAuditoria).catch((e) => setError(e.message));
  }, [id]);

  if (!auditoria) {
    return (
      <div>
        <Topbar />
        <div className="screen">{error ? <div className="error-banner">{error}</div> : 'Carregando…'}</div>
      </div>
    );
  }

  const counts = { C: 0, NC: 0, PA: 0, OM: 0, NA: 0 };
  auditoria.itens.forEach((i) => { if (i.resultado) counts[i.resultado]++; });
  const flagged = auditoria.itens.filter((i) => i.resultado === 'NC' || i.resultado === 'PA');
  const podeDecidir = user?.isLider && auditoria.status === 'aguardando_aprovacao';

  async function decidir(decisao) {
    if (decisao === 'reprovado' && !observacao.trim()) {
      setError('Observação é obrigatória ao reprovar.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.decidir(id, decisao, observacao);
      navigate(decisao === 'aprovado' ? `/auditorias/${id}/final` : '/');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Topbar />
      <div className="screen">
        <div className="page-head">
          <div className="eyebrow">
            <a onClick={() => navigate('/')}>← Painel</a> · Relatório prévio
          </div>
          <h1>{auditoria.template_nome} — {auditoria.setor_unidade}</h1>
          <div style={{ marginTop: 6, fontSize: 13, color: 'var(--ink-soft)', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            <span><b>Líder:</b> {auditoria.auditor_lider || '—'}</span>
            <span><b>Auxiliar:</b> {auditoria.auditor_auxiliar || '—'}</span>
            {auditoria.auditor_observador && <span><b>Observador:</b> {auditoria.auditor_observador}</span>}
            <span><b>Data:</b> {new Date(auditoria.criado_em).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {!podeDecidir && (
          <div className="note-banner">Este relatório está aguardando a aprovação de um auditor líder.</div>
        )}

        <div className="summary-strip">
          {['C', 'NC', 'PA', 'OM', 'NA'].map((s) => (
            <div className="stat" key={s}>
              <div className="n">{counts[s]}</div>
              <div className="l">{s}</div>
            </div>
          ))}
        </div>

        <a
          href={api.pdfUrl(id)}
          target="_blank"
          rel="noreferrer"
          className="btn btn-ghost"
          style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginBottom: 16 }}
        >
          📄 Abrir PDF do relatório prévio
        </a>

        {flagged.length > 0 && (
          <>
            <div className="card-title">Itens que exigem atenção</div>
            {flagged.map((item) => (
              <div className={`flag-item ${item.resultado === 'PA' ? 'pa' : ''}`} key={item.requisito_id}>
                <div className="flag-item-head">
                  <span className={`flag-status ${item.resultado}`}>{STATUS_LABEL[item.resultado]}</span>
                  <span className="mono" style={{ fontSize: 10, color: 'var(--ink-soft)' }}>{item.codigo}</span>
                </div>
                <div className="flag-item-text">{item.nome}</div>
                {item.comentario && <div className="flag-item-comment">"{item.comentario}"</div>}
              </div>
            ))}
          </>
        )}

        {/* Avaliação do Programa 5S */}
        {auditoria.dados5s && Number(auditoria.dados5s.media_geral || 0) > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="eyebrow" style={{ color: 'var(--sky)', marginBottom: 2 }}>Programa 5S</div>
            <div className="card-title" style={{ marginBottom: 14 }}>Desempenho dos Sensos</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#F8FAFC', borderRadius: 6, fontSize: 13 }}>
                    <span><b>Seiri</b> (Utilização):</span>
                    <b style={{ color: '#0284C7' }}>{Number(auditoria.dados5s.media_utilizacao || 0).toFixed(1)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#F8FAFC', borderRadius: 6, fontSize: 13 }}>
                    <span><b>Seiton</b> (Organização):</span>
                    <b style={{ color: '#0284C7' }}>{Number(auditoria.dados5s.media_organizacao || 0).toFixed(1)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#F8FAFC', borderRadius: 6, fontSize: 13 }}>
                    <span><b>Seiso</b> (Limpeza):</span>
                    <b style={{ color: '#0284C7' }}>{Number(auditoria.dados5s.media_limpeza || 0).toFixed(1)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#F8FAFC', borderRadius: 6, fontSize: 13 }}>
                    <span><b>Seiketsu</b> (Saúde):</span>
                    <b style={{ color: '#0284C7' }}>{Number(auditoria.dados5s.media_saude || 0).toFixed(1)}</b>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: '#F8FAFC', borderRadius: 6, fontSize: 13 }}>
                    <span><b>Shitsuke</b> (Auto-Disciplina):</span>
                    <b style={{ color: '#0284C7' }}>{Number(auditoria.dados5s.media_disciplina || 0).toFixed(1)}</b>
                  </div>
                </div>

                <div style={{ marginTop: 14, padding: '10px 14px', background: '#F0FDF4', border: '1.5px solid #86EFAC', borderRadius: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#166534', fontSize: 13 }}>MÉDIA GERAL 5S:</span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#15803D' }}>
                    {Number(auditoria.dados5s.media_geral || 0).toFixed(2)}
                  </span>
                </div>
              </div>

              <div style={{ textAlign: 'center' }}>
                <RadarChart5S medias={auditoria.dados5s} size={250} />
              </div>
            </div>

            {auditoria.dados5s.observacoes && (
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)', fontSize: 12.5, color: '#334155' }}>
                <b>Observações do 5S:</b> <i>"{auditoria.dados5s.observacoes}"</i>
              </div>
            )}
          </div>
        )}

        {podeDecidir && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">Decisão do Auditor Líder</div>
            <textarea
              className="comment-box"
              rows={3}
              placeholder="Observações sobre a aprovação (opcional para aprovar, obrigatório para reprovar)"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
            <div className="btn-row">
              <button className="btn btn-danger" disabled={busy} onClick={() => decidir('reprovado')}>
                Reprovar e devolver
              </button>
              <button className="btn btn-approve" disabled={busy} onClick={() => decidir('aprovado')}>
                Aprovar relatório
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
