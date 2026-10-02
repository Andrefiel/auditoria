import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api';
import Topbar from '../components/Topbar.jsx';

const STATUS_LABEL = {
  rascunho: 'Rascunho',
  aguardando_revisao_auxiliar: 'Revisão do Auxiliar',
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
  const revisaoAuxiliar = (minhas || []).filter((a) => a.status === 'aguardando_revisao_auxiliar');
  const reprovadas = (minhas || []).filter((a) => a.status === 'reprovado');
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
              ? 'Você está no grupo AD "auditores_lideres" — pode assinar como líder e homologar relatórios.'
              : 'Painel de auditorias em campo, revisões pendentes e relatórios aprovados.'}
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
              Como membro do grupo de liderança, você navega entre as duas visões livremente.
            </div>
          </>
        )}

        {view === 'auditor' && (
          <>
            <div className="kpi-row">
              <div className="kpi"><div className="n">{emAndamento.length}</div><div className="l">Em andamento</div></div>
              <div className="kpi"><div className="n">{revisaoAuxiliar.length}</div><div className="l">Revisão Auxiliar</div></div>
              <div className="kpi"><div className="n">{aguardando.length}</div><div className="l">Aguardando Líder</div></div>
              <div className="kpi"><div className="n">{concluidas.length}</div><div className="l">Concluídas</div></div>
            </div>

            {revisaoAuxiliar.length > 0 && (
              <>
                <div className="section-label" style={{ color: '#B45309' }}>⏳ Aguardando Revisão e De Acordo do Auxiliar</div>
                {revisaoAuxiliar.map((a) => (
                  <AuditRow key={a.id} a={a} currentUser={user} onClick={() => navigate(`/auditorias/${a.id}/previo`)} />
                ))}
              </>
            )}

            {emAndamento.length > 0 && (
              <>
                <div className="section-label">Em andamento (Equipe)</div>
                {emAndamento.map((a) => (
                  <AuditRow key={a.id} a={a} currentUser={user} onClick={() => navigate(`/auditorias/${a.id}/preencher`)} />
                ))}
              </>
            )}

            {aguardando.length > 0 && (
              <>
                <div className="section-label">Aguardando aprovação do Líder</div>
                {aguardando.map((a) => (
                  <AuditRow key={a.id} a={a} currentUser={user} onClick={() => navigate(`/auditorias/${a.id}/previo`)} />
                ))}
              </>
            )}

            {concluidas.length > 0 && (
              <>
                <div className="section-label">Concluídas</div>
                {concluidas.map((a) => (
                  <AuditRow key={a.id} a={a} currentUser={user} onClick={() => navigate(`/auditorias/${a.id}/final`)} />
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

function AuditRow({ a, currentUser, onClick }) {
  const isMine = a.criado_por === currentUser?.username;
  const auxClean = (a.auditor_auxiliar || '').toLowerCase();
  const userDisplay = (currentUser?.displayName || '').toLowerCase();
  const userName = (currentUser?.username || '').toLowerCase();
  const isAuxiliar = Boolean(auxClean && (auxClean.includes(userName) || auxClean.includes(userDisplay) || userDisplay.includes(auxClean)));

  return (
    <div className="audit-row" onClick={onClick}>
      <div className="audit-row-left">
        <div className="audit-row-title">{a.template_nome} — {a.setor_unidade}</div>
        <div className="audit-row-sub">
          {new Date(a.criado_em).toLocaleDateString('pt-BR')}
          {a.status === 'rascunho' && (
            <span style={{ marginLeft: 8, color: isMine ? 'var(--sky-deep)' : '#0284C7', fontWeight: 600 }}>
              · {isMine ? 'Iniciado por você' : `Iniciado por ${a.criado_por}`}
            </span>
          )}
          {a.status === 'aguardando_revisao_auxiliar' && (
            <span style={{ marginLeft: 8, color: '#B45309', fontWeight: 600 }}>
              · {isAuxiliar ? '👉 Aguardando seu parecer' : `Aguardando parecer de ${a.auditor_auxiliar}`}
            </span>
          )}
        </div>
      </div>
      <span className={`status-pill ${a.status}`}>{STATUS_LABEL[a.status] || a.status}</span>
    </div>
  );
}
