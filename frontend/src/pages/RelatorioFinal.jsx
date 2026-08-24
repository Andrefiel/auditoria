import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import Topbar from '../components/Topbar.jsx';

export default function RelatorioFinal() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [auditoria, setAuditoria] = useState(null);
  const [error, setError] = useState('');

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
  const flaggedCount = counts.NC + counts.PA;

  return (
    <div>
      <Topbar />
      <div className="screen">
        <div className="page-head">
          <div className="eyebrow"><a onClick={() => navigate('/')}>← Painel</a></div>
        </div>

        <div className="report-header">
          {auditoria.status === 'aprovado' && <div className="stamp">✓ APROVADO</div>}
          <div className="eyebrow" style={{ color: 'var(--sky)' }}>Relatório final</div>
          <h1 style={{ color: 'white' }}>Auditoria Interna — {auditoria.template_nome}</h1>
          <p className="sub" style={{ color: 'rgba(255,255,255,.65)' }}>{auditoria.setor_unidade}</p>
        </div>
        <div className="report-body">
          <div className="report-grid">
            <div className="report-field"><label>Auditor(a) Líder</label><div className="v">{auditoria.auditor_lider || '—'}</div></div>
            <div className="report-field"><label>Auditor auxiliar</label><div className="v">{auditoria.auditor_auxiliar}</div></div>
            <div className="report-field"><label>Aprovado por</label><div className="v">{auditoria.aprovado_por || '—'}</div></div>
            <div className="report-field"><label>Data da aprovação</label>
              <div className="v">{auditoria.aprovado_em ? new Date(auditoria.aprovado_em).toLocaleDateString('pt-BR') : '—'}</div>
            </div>
          </div>

          <div className="divider" />
          <div className="card-title">Itens avaliados ({auditoria.itens.length})</div>
          {auditoria.itens.map((item) => (
            <div key={item.requisito_id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
              <span>{item.nome}</span>
              <span className="mono" style={{ fontWeight: 700, color: 'var(--ink-soft)' }}>{item.resultado}</span>
            </div>
          ))}

          {flaggedCount > 0 && (
            <div className="note-banner" style={{ marginTop: 14, background: '#FFF9EC', border: '1px solid #F0DFAE', color: '#7A5A00' }}>
              ⚠ {flaggedCount} itens (NC/PA) foram encaminhados para plano de ação.
            </div>
          )}

          <div className="divider" />
          <div className="card-title">Conclusão</div>
          <div className="conclusao-box">{auditoria.conclusao || 'Nenhuma conclusão registrada.'}</div>

          <div style={{ marginTop: 18, paddingTop: 16, borderTop: '1px dashed var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>
              Aprovado digitalmente por<br /><b style={{ color: 'var(--ink)', fontSize: 13 }}>{auditoria.aprovado_por}</b>
            </div>
            <a href={api.pdfUrl(id)} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ flex: 'none', padding: '10px 20px', textDecoration: 'none' }}>
              Baixar PDF
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
