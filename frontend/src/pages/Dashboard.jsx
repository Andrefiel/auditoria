import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api';
import Topbar from '../components/Topbar.jsx';

const STATUS_LABEL = {
  rascunho: 'Rascunho',
  aguardando_aprovacao: 'Aguardando aprovação',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState(user?.isLider ? 'lider' : 'auditor');
  const [minhas, setMinhas] = useState(null);
  const [pendentes, setPendentes] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.minhasAuditorias().then(setMinhas).catch((e) => setError(e.message));
    if (user?.isLider) {
      api.pendentes().then(setPendentes).catch((e) => setError(e.message));
    }
  }, [user]);

  const emAndamento = (minhas || []).filter((a) => a.status === 'rascunho');
  const reprovadas = (minhas || []).filter((a) => a.status === 'reprovado'); // não deve ocorrer (volta a rascunho), mantido por segurança
  const aguardando = (minhas || []).filter((a) => a.status === 'aguardando_aprovacao');
  const concluidas = (minhas || []).filter((a) => a.status === 'aprovado');

  return (
    <div>
      <Topbar />
      <div className="screen">
        <div className="page-head">
          <div className="eyebrow">Painel</div>
          <h1>{view === 'lider' ? 'Aprovações pendentes' : 'Minhas auditorias'}</h1>
          <p className="sub">
            {view === 'lider'
              ? 'Você está no grupo AD "auditores_lideres" — pode assinar como líder e aprovar/reprovar.'
              : 'Qualquer usuário autenticado pode preencher, como auditor auxiliar.'}
          </p>
        </div>

        {error && <div className="error-banner">{error}</div>}

        {user?.isLider && (
          <>
            <div className="role-switch">
              <button className={`role-btn ${view === 'auditor' ? 'active' : ''}`} onClick={() => setView('auditor')}>
                Visão Auditor
              </button>
              <button className={`role-btn ${view === 'lider' ? 'active' : ''}`} onClick={() => setView('lider')}>
                Visão Auditor Líder
              </button>
            </div>
            <div className="role-hint">
              Como membro do grupo, você navega entre as duas visões livremente.
            </div>
          </>
        )}

        {view === 'auditor' && (
          <>
            <div className="kpi-row">
              <div className="kpi"><div className="n">{emAndamento.length}</div><div className="l">Em andamento</div></div>
              <div className="kpi"><div className="n">{aguardando.length}</div><div className="l">Aguardando</div></div>
              <div className="kpi alert"><div className="n">{reprovadas.length}</div><div className="l">Reprovada</div></div>
            </div>

            {emAndamento.length > 0 && (
              <>
                <div className="section-label">Em andamento</div>
                {emAndamento.map((a) => (
                  <AuditRow key={a.id} a={a} onClick={() => navigate(`/auditorias/${a.id}/preencher`)} />
                ))}
              </>
            )}

            {aguardando.length > 0 && (
              <>
                <div className="section-label">Aguardando aprovação</div>
                {aguardando.map((a) => (
                  <AuditRow key={a.id} a={a} onClick={() => navigate(`/auditorias/${a.id}/previo`)} />
                ))}
              </>
            )}

            {concluidas.length > 0 && (
              <>
                <div className="section-label">Concluídas</div>
                {concluidas.map((a) => (
                  <AuditRow key={a.id} a={a} onClick={() => navigate(`/auditorias/${a.id}/final`)} />
                ))}
              </>
            )}

            {minhas && minhas.length === 0 && (
              <div className="sector-empty">Você ainda não iniciou nenhuma auditoria.</div>
            )}

            <button className="fab-new" onClick={() => navigate('/nova')}>
              + Nova auditoria
            </button>
            {user?.isLider && (
              <button
                className="fab-new"
                style={{ background: 'white', color: 'var(--navy)', border: '1.5px solid var(--line)' }}
                onClick={() => navigate('/admin')}
              >
                ⚙ Gerenciar roteiros e itens
              </button>
            )}
          </>
        )}

        {view === 'lider' && (
          <>
            <div className="kpi-row">
              <div className="kpi alert"><div className="n">{pendentes?.length ?? '—'}</div><div className="l">Aguardando aprovação</div></div>
            </div>

            <div className="section-label">Aguardando sua aprovação</div>
            {(pendentes || []).map((a) => (
              <div key={a.id} className="audit-row" onClick={() => navigate(`/auditorias/${a.id}/previo`)}>
                <div className="audit-row-left">
                  <div className="audit-row-title">{a.template_nome} — {a.setor_unidade}</div>
                  <div className="audit-row-sub">
                    {a.auditor_auxiliar} · enviada em {new Date(a.criado_em).toLocaleDateString('pt-BR')}
                    {a.alertas > 0 ? ` · ${a.alertas} item(ns) NC/PA` : ''}
                  </div>
                </div>
                <span className="status-pill aguardando_aprovacao">Pendente</span>
              </div>
            ))}
            {pendentes && pendentes.length === 0 && (
              <div className="sector-empty">Nenhuma auditoria aguardando aprovação.</div>
            )}

            <button
              className="fab-new"
              style={{ background: 'white', color: 'var(--navy)', border: '1.5px solid var(--line)' }}
              onClick={() => navigate('/admin')}
            >
              ⚙ Gerenciar roteiros e itens
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AuditRow({ a, onClick }) {
  return (
    <div className="audit-row" onClick={onClick}>
      <div className="audit-row-left">
        <div className="audit-row-title">{a.template_nome} — {a.setor_unidade}</div>
        <div className="audit-row-sub">{new Date(a.criado_em).toLocaleDateString('pt-BR')}</div>
      </div>
      <span className={`status-pill ${a.status}`}>{STATUS_LABEL[a.status]}</span>
    </div>
  );
}
