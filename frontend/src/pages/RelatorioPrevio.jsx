import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api';
import Topbar from '../components/Topbar.jsx';

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
