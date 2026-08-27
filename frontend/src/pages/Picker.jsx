import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, AUDITORES_LIDERES } from '../lib/api';
import { useAuth } from '../lib/auth.jsx';
import Topbar from '../components/Topbar.jsx';

export default function Picker() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [templates, setTemplates] = useState(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  // Estado do modal de nova auditoria
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [unidade, setUnidade] = useState('');
  const [auditorLider, setAuditorLider] = useState(AUDITORES_LIDERES[0]);
  const [auditorAuxiliar, setAuditorAuxiliar] = useState('');
  const [auditorObservador, setAuditorObservador] = useState('');

  useEffect(() => {
    api.templates().then(setTemplates).catch((e) => setError(e.message));
  }, []);

  function handleOpenModal(t) {
    setSelectedTemplate(t);
    setUnidade(`${t.nome} — Matriz`);
    // Se o usuário logado for um dos líderes, pré-seleciona ele, senão o primeiro da lista
    const liderMatch = AUDITORES_LIDERES.find((l) => l.toLowerCase() === user?.displayName?.toLowerCase());
    setAuditorLider(liderMatch || AUDITORES_LIDERES[0]);
    setAuditorAuxiliar(user?.displayName || '');
    setAuditorObservador('');
    setError('');
  }

  async function handleConfirmCreate(e) {
    if (e) e.preventDefault();
    if (!unidade.trim()) {
      setError('Por favor, informe a unidade/local auditado.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const { id } = await api.criarAuditoria(
        selectedTemplate.id,
        unidade.trim(),
        auditorLider,
        auditorAuxiliar.trim() || user?.displayName,
        auditorObservador.trim() || null
      );
      navigate(`/auditorias/${id}/preencher`);
    } catch (err) {
      setError(err.message);
      setCreating(false);
    }
  }

  const list = (templates || []).filter((t) => t.nome.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div>
      <Topbar />
      <div className="screen">
        <div className="page-head">
          <div className="eyebrow"><a onClick={() => navigate('/')}>← Painel</a></div>
          <h1>Nova auditoria</h1>
          <p className="sub">Escolha o roteiro/setor que você vai auditar.</p>
        </div>

        {error && !selectedTemplate && <div className="error-banner">{error}</div>}

        <div className="field" style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Buscar setor..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '11px 12px' }}
          />
        </div>

        {templates === null && <div className="sector-empty">Carregando...</div>}
        {list.map((t) => (
          <div key={t.id} className="sector-row" onClick={() => handleOpenModal(t)}>
            <div>
              <div className="sector-row-name">{t.nome}</div>
              <div className="sector-row-meta">
                {t.itens} requisitos{t.status !== 'ativo' ? ' · aguardando cadastro' : ''}
              </div>
            </div>
            <span className="sector-row-arrow">→</span>
          </div>
        ))}
        {templates && list.length === 0 && <div className="sector-empty">Nenhum setor encontrado.</div>}
      </div>

      {/* Modal de Configuração da Auditoria */}
      {selectedTemplate && (
        <div className="modal-overlay" onClick={() => !creating && setSelectedTemplate(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="eyebrow" style={{ marginBottom: 2 }}>Configurar Auditoria</div>
                <h2 style={{ margin: 0, fontSize: 17, color: 'var(--ink)' }}>{selectedTemplate.nome}</h2>
              </div>
              <button className="modal-close" onClick={() => !creating && setSelectedTemplate(null)}>✕</button>
            </div>

            {error && <div className="error-banner" style={{ margin: '12px 0' }}>{error}</div>}

            <form onSubmit={handleConfirmCreate} style={{ marginTop: 14 }}>
              <div className="field">
                <label>Setor / Unidade Auditada</label>
                <input
                  type="text"
                  value={unidade}
                  onChange={(e) => setUnidade(e.target.value)}
                  placeholder="Ex: Recepção — Unidade Aldeota"
                  required
                />
                <div className="field-hint">Especifique a unidade ou posto de atendimento auditado.</div>
              </div>

              <div className="field">
                <label>Auditor(a) Líder Responsável</label>
                <select
                  value={auditorLider}
                  onChange={(e) => setAuditorLider(e.target.value)}
                  style={{
                    width: '100%',
                    border: '1.5px solid var(--line)',
                    borderRadius: 8,
                    padding: '11px 12px',
                    background: 'white',
                    fontWeight: 600,
                    color: 'var(--ink)',
                  }}
                >
                  {AUDITORES_LIDERES.map((lider) => (
                    <option key={lider} value={lider}>
                      {lider}
                    </option>
                  ))}
                </select>
                <div className="field-hint">O auditor líder selecionado revisará e aprovará este relatório.</div>
              </div>

              <div className="field">
                <label>Auditor Auxiliar</label>
                <input
                  type="text"
                  value={auditorAuxiliar}
                  onChange={(e) => setAuditorAuxiliar(e.target.value)}
                  placeholder="Nome do auditor auxiliar"
                />
                <div className="field-hint">Pode ser preenchido ou alterado manualmente.</div>
              </div>

              <div className="field">
                <label>Auditor Observador (Opcional)</label>
                <input
                  type="text"
                  value={auditorObservador}
                  onChange={(e) => setAuditorObservador(e.target.value)}
                  placeholder="Ex: Nome do auditor observador ou trainee"
                />
                <div className="field-hint">Preencha caso haja um auditor observador acompanhando.</div>
              </div>

              <div className="btn-row" style={{ marginTop: 20 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setSelectedTemplate(null)}
                  disabled={creating}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? <span className="spinner" /> : 'Iniciar Auditoria →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

