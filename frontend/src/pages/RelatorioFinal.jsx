import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import Topbar from '../components/Topbar.jsx';
import RadarChart5S from '../components/RadarChart5S.jsx';

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
          <div className="eyebrow" style={{ color: 'var(--sky)' }}>Relatório final</div>
          <h1 style={{ color: 'white' }}>Auditoria Interna — {auditoria.template_nome}</h1>
          <p className="sub" style={{ color: 'rgba(255,255,255,.65)' }}>{auditoria.setor_unidade}</p>
        </div>
        <div className="report-body">
          <div className="report-grid">
            <div className="report-field"><label>Auditor(a) Líder</label><div className="v">{auditoria.auditor_lider || '—'}</div></div>
            <div className="report-field"><label>Auditor auxiliar</label><div className="v">{auditoria.auditor_auxiliar || '—'}</div></div>
            <div className="report-field"><label>Auditor observador</label><div className="v">{auditoria.auditor_observador || '—'}</div></div>
            <div className="report-field"><label>Data da auditoria</label>
              <div className="v">{new Date(auditoria.criado_em).toLocaleDateString('pt-BR')}</div>
            </div>
          </div>

          <div className="divider" />
          <div className="card-title">Itens avaliados ({auditoria.itens.length})</div>
          {auditoria.itens.map((item) => (
            <div key={item.requisito_id} style={{ padding: '10px 0', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
              <div>
                <span>{item.nome}</span>
                {item.comentario && (
                  <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', fontStyle: 'italic', marginTop: 3 }}>
                    "{item.comentario}"
                  </div>
                )}
              </div>
              <span className="mono" style={{ fontWeight: 700, color: 'var(--ink-soft)', flexShrink: 0 }}>{item.resultado}</span>
            </div>
          ))}

          {flaggedCount > 0 && (
            <div className="note-banner" style={{ marginTop: 14, background: '#FFF9EC', border: '1px solid #F0DFAE', color: '#7A5A00' }}>
              ⚠ {flaggedCount} itens (NC/PA) foram encaminhados para plano de ação.
            </div>
          )}

          {/* Avaliação do Programa 5S */}
          {auditoria.dados5s && Number(auditoria.dados5s.media_geral || 0) > 0 && (
            <>
              <div className="divider" />
              <div className="card-title">Avaliação do Programa 5S</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, alignItems: 'center', marginTop: 12 }}>
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
                <div style={{ marginTop: 14, paddingTop: 10, borderTop: '1px solid var(--line)', fontSize: 12.5, color: '#334155' }}>
                  <b>Observações do 5S:</b> <i>"{auditoria.dados5s.observacoes}"</i>
                </div>
              )}
            </>
          )}

          <div className="divider" />
          <div className="card-title">Conclusão Geral</div>
          <div className="conclusao-box">{auditoria.conclusao || 'Nenhuma conclusão registrada.'}</div>

          <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px dashed var(--line)', textAlign: 'center' }}>
            <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600 }}>
              Assinatura Digital / Aprovação do Relatorio
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--navy)', marginTop: 6 }}>
              Aprovado digitalmente por: {auditoria.aprovado_por}
            </div>
            <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 4 }}>
              {auditoria.aprovado_em ? `Data e hora da aprovação: ${new Date(auditoria.aprovado_em).toLocaleString('pt-BR')}` : ''}
            </div>
            <div style={{ marginTop: 16 }}>
              <a href={api.pdfUrl(id)} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ display: 'inline-block', padding: '10px 24px', textDecoration: 'none' }}>
                📄 Baixar PDF do Relatorio Final
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
