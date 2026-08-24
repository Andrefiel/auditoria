import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import Topbar from '../components/Topbar.jsx';

export default function Picker() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState(null);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(null);

  useEffect(() => {
    api.templates().then(setTemplates).catch((e) => setError(e.message));
  }, []);

  async function handleSelect(t) {
    const unidade = window.prompt(`Setor/unidade auditada (ex: "Recepção — Unidade Aldeota"):`, t.nome);
    if (!unidade) return;
    setCreating(t.id);
    try {
      const { id } = await api.criarAuditoria(t.id, unidade);
      navigate(`/auditorias/${id}/preencher`);
    } catch (e) {
      setError(e.message);
    } finally {
      setCreating(null);
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

        {error && <div className="error-banner">{error}</div>}

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
          <div key={t.id} className="sector-row" onClick={() => (creating ? null : handleSelect(t))}>
            <div>
              <div className="sector-row-name">{t.nome}</div>
              <div className="sector-row-meta">
                {t.itens} requisitos{t.status !== 'ativo' ? ' · aguardando cadastro' : ''}
              </div>
            </div>
            {creating === t.id ? <span className="spinner" /> : <span className="sector-row-arrow">→</span>}
          </div>
        ))}
        {templates && list.length === 0 && <div className="sector-empty">Nenhum setor encontrado.</div>}
      </div>
    </div>
  );
}
