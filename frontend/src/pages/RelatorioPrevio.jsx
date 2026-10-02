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
  const [sucesso, setSucesso] = useState('');
  const [busy, setBusy] = useState(false);
  const [editandoAuxiliar, setEditandoAuxiliar] = useState(false);
  const [novoAuxiliar, setNovoAuxiliar] = useState('');
  const [sugestoes, setSugestoes] = useState([]);

  useEffect(() => {
    api.auditoria(id).then((a) => {
      setAuditoria(a);
      setNovoAuxiliar(a.auditor_auxiliar || '');
    }).catch((e) => setError(e.message));
    api.sugestoesAuxiliares().then(setSugestoes).catch(() => {});
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

  const podeDecidirLider = user?.isLider && auditoria.status === 'aguardando_aprovacao';

  const auxClean = (auditoria.auditor_auxiliar || '').toLowerCase();
  const userDisplay = (user?.displayName || '').toLowerCase();
  const userName = (user?.username || '').toLowerCase();
  const isAuxiliar = Boolean(
    auxClean && (auxClean.includes(userName) || auxClean.includes(userDisplay) || userDisplay.includes(auxClean))
  );
  const podeRevisarAuxiliar = auditoria.status === 'aguardando_revisao_auxiliar' && (isAuxiliar || user?.isLider);
  const podeGerenciarAuditoria = (auditoria.criado_por === user?.username) || user?.isLider;

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

  async function handleRevisarAuxiliar(decisao) {
    if (decisao === 'devolver' && !observacao.trim()) {
      setError('Observação é obrigatória ao devolver para ajustes.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.revisarAuxiliar(id, decisao, observacao);
      navigate('/');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleSalvarAuxiliar() {
    setBusy(true);
    setError('');
    try {
      await api.alterarAuxiliar(id, novoAuxiliar);
      setAuditoria((prev) => ({ ...prev, auditor_auxiliar: novoAuxiliar }));
      setEditandoAuxiliar(false);
      setSucesso('Auditor auxiliar atualizado com sucesso!');
      setTimeout(() => setSucesso(''), 4000);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReabrirRascunho() {
    if (!window.confirm('Deseja retornar esta auditoria para rascunho para realizar correções?')) return;
    setBusy(true);
    setError('');
    try {
      await api.reabrirRascunho(id);
      navigate(`/auditorias/${id}/preencher`);
    } catch (e) {
      setError(e.message);
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
            <span><b>Executor(a):</b> {auditoria.assinado_por_executor || auditoria.criado_por}</span>
            <span><b>Auxiliar:</b> {auditoria.auditor_auxiliar || '—'}</span>
            <span><b>Líder:</b> {auditoria.auditor_lider || '—'}</span>
            {auditoria.auditor_observador && <span><b>Observador:</b> {auditoria.auditor_observador}</span>}
            <span><b>Data:</b> {new Date(auditoria.criado_em).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {sucesso && <div className="note-banner" style={{ background: '#F0FDF4', borderColor: '#86EFAC', color: '#166534' }}>{sucesso}</div>}

        {/* Banners Informativos de Status */}
        {auditoria.status === 'aguardando_revisao_auxiliar' && (
          <div className="note-banner" style={{ background: '#FFFBEB', borderColor: '#FCD34D', color: '#92400E' }}>
            ⏳ <b>Aguardando De Acordo:</b> Esta auditoria foi finalizada pelo auditor executor e está aguardando a concordância do Auditor Auxiliar (<b>{auditoria.auditor_auxiliar || 'não informado'}</b>) antes de seguir para a homologação do Líder.
          </div>
        )}
        {auditoria.status === 'aguardando_aprovacao' && !podeDecidirLider && (
          <div className="note-banner">
            ⏳ Este relatório está aguardando a homologação e aprovação de um Auditor Líder.
          </div>
        )}

        {/* Carimbos de Assinaturas Já Registradas */}
        {(auditoria.assinado_por_executor || auditoria.assinado_por_auxiliar) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
            {auditoria.assinado_por_executor && (
              <div style={{ padding: '8px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, fontSize: 12, color: '#166534' }}>
                ✍️ <b>Auditor(a) Executor(a):</b> Assinado digitalmente por <b>{auditoria.assinado_por_executor}</b> em {new Date(auditoria.assinado_em_executor).toLocaleString('pt-BR')}
              </div>
            )}
            {auditoria.assinado_por_auxiliar && (
              <div style={{ padding: '8px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, fontSize: 12, color: '#166534' }}>
                ✍️ <b>Auditor(a) Auxiliar:</b> De acordo registrado digitalmente por <b>{auditoria.assinado_por_auxiliar}</b> em {new Date(auditoria.assinado_em_auxiliar).toLocaleString('pt-BR')}
              </div>
            )}
          </div>
        )}

        {/* Painel de Correção / Gestão para o Criador ou Líder */}
        {podeGerenciarAuditoria && auditoria.status === 'aguardando_revisao_auxiliar' && (
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 16px', marginBottom: 16 }}>
            {!editandoAuxiliar ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5, color: '#475569' }}>
                  Errou o auditor auxiliar ou precisa fazer alterações na auditoria?
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #CBD5E1' }}
                    onClick={() => setEditandoAuxiliar(true)}
                  >
                    ✏️ Corrigir Auditor Auxiliar
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #CBD5E1' }}
                    onClick={handleReabrirRascunho}
                  >
                    ↩ Retornar para Rascunho
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--navy)', marginBottom: 6 }}>
                  Corrigir Auditor Auxiliar
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={novoAuxiliar}
                    onChange={(e) => setNovoAuxiliar(e.target.value)}
                    placeholder="Nome ou login do auditor auxiliar correto"
                    list="sugestoes-auxiliares-previo"
                    style={{ flex: 1, padding: '8px 12px', border: '1.5px solid var(--line)', borderRadius: 6, fontSize: 13 }}
                  />
                  <datalist id="sugestoes-auxiliares-previo">
                    {sugestoes.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  <button
                    className="btn btn-primary"
                    style={{ padding: '8px 16px', fontSize: 12.5 }}
                    disabled={busy}
                    onClick={handleSalvarAuxiliar}
                  >
                    Salvar
                  </button>
                  <button
                    className="btn btn-ghost"
                    style={{ padding: '8px 12px', fontSize: 12.5 }}
                    disabled={busy}
                    onClick={() => setEditandoAuxiliar(false)}
                  >
                    Cancelar
                  </button>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginTop: 4 }}>
                  O auditor atualizado verá imediatamente esta auditoria em espera no painel dele.
                </div>
              </div>
            )}
          </div>
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

        {/* Decisão do Auditor Auxiliar */}
        {podeRevisarAuxiliar && (
          <div className="card" style={{ marginTop: 16, border: '1.5px solid #F59E0B' }}>
            <div className="eyebrow" style={{ color: '#B45309', marginBottom: 2 }}>Revisão de Campo</div>
            <div className="card-title">Concordância e De Acordo do Auditor Auxiliar</div>
            <p className="sub" style={{ fontSize: 12.5, marginBottom: 12 }}>
              Revise as evidências e o 5S. Registre observações opcionais para concordar ou obrigatórias ao devolver para ajustes.
            </p>
            <textarea
              className="comment-box"
              rows={3}
              placeholder="Observações do Auditor Auxiliar (opcional para dar De Acordo, obrigatório para devolver)"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
            />
            <div className="btn-row">
              <button className="btn btn-danger" disabled={busy} onClick={() => handleRevisarAuxiliar('devolver')}>
                Devolver para ajustes
              </button>
              <button className="btn btn-approve" disabled={busy} onClick={() => handleRevisarAuxiliar('concordo')}>
                Confirmar De Acordo e Enviar ao Líder →
              </button>
            </div>
          </div>
        )}

        {/* Decisão do Auditor Líder */}
        {podeDecidirLider && (
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
