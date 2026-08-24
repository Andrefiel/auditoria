import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api';
import Topbar from '../components/Topbar.jsx';

const EMPTY_FORM = { codigo: '', nome: '', requisito: '', evidencia: '', core: false, tag: '' };

export default function Admin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(null);
  const [itens, setItens] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadTemplates = useCallback(async () => {
    const t = await api.templates();
    setTemplates(t);
    if (!templateId && t.length) setTemplateId(t[0].id);
  }, [templateId]);

  const loadItens = useCallback(async (id) => {
    if (!id) return;
    const list = await api.templateItens(id);
    setItens(list);
  }, []);

  useEffect(() => { loadTemplates().catch((e) => setError(e.message)); }, [loadTemplates]);
  useEffect(() => { loadItens(templateId).catch((e) => setError(e.message)); }, [templateId, loadItens]);

  if (!user?.isLider) {
    return (
      <div>
        <Topbar />
        <div className="screen">
          <div className="error-banner">Esta área é restrita ao grupo AD "auditores_lideres".</div>
        </div>
      </div>
    );
  }

  const currentTemplate = templates.find((t) => t.id === templateId);

  function edit(item) {
    setEditingId(item.id);
    setForm({
      codigo: item.codigo, nome: item.nome, requisito: item.requisito,
      evidencia: item.evidencia, core: item.core, tag: item.tag || '',
    });
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }
  function clearForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function save() {
    if (!form.codigo || !form.nome) return;
    setBusy(true);
    setError('');
    try {
      if (editingId) {
        await api.updateItem(templateId, editingId, { ...form, tag: form.tag || null });
      } else {
        await api.addItem(templateId, { ...form, tag: form.tag || null });
      }
      clearForm();
      await loadItens(templateId);
      await loadTemplates();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(itemId) {
    if (!window.confirm('Remover este item do roteiro?')) return;
    await api.deleteItem(templateId, itemId);
    await loadItens(templateId);
    await loadTemplates();
  }

  async function ativar() {
    await api.ativarTemplate(templateId);
    await loadTemplates();
  }

  return (
    <div>
      <Topbar />
      <div className="screen">
        <div className="page-head">
          <div className="eyebrow">
            <a onClick={() => navigate('/')}>← Painel</a> · Administração · restrito ao grupo AD "auditores_lideres"
          </div>
          <h1>Cadastro de itens do roteiro</h1>
          <p className="sub">Adicione, edite ou remova os requisitos avaliados neste setor.</p>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="meta-row">
          <div className="meta-pill" style={{ flex: 2 }}>
            <label>Roteiro / setor</label>
            <select value={templateId || ''} onChange={(e) => setTemplateId(Number(e.target.value))}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.nome} ({t.status})</option>
              ))}
            </select>
          </div>
          <div className="meta-pill" style={{ flex: 1, minWidth: 110, display: 'flex', alignItems: 'center' }}>
            <span className={`status-pill ${currentTemplate?.status === 'ativo' ? 'aprovado' : 'aguardando_aprovacao'}`}>
              {currentTemplate?.status === 'ativo' ? 'Ativo' : 'Pendente'}
            </span>
          </div>
        </div>

        <div className="card-title">{itens.length} itens cadastrados</div>
        {itens.length === 0 && <div className="sector-empty">Nenhum item cadastrado ainda. Adicione o primeiro requisito abaixo.</div>}
        {itens.map((it) => (
          <div className="item" key={it.id}>
            <div>
              <span className="item-tag">
                {it.codigo}
                {it.core && <span className="item-core">CORE</span>}
                {it.tag && <span className="item-tagver">· {it.tag}</span>}
              </span>
              <div className="item-name">{it.nome}</div>
            </div>
            <div className="item-detail" style={{ marginTop: 6 }}>
              <div className="seg"><b>Requisito</b>{it.requisito}</div>
              <div className="seg"><b>Evidência esperada</b>{it.evidencia}</div>
            </div>
            <div className="btn-row" style={{ marginTop: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 'none', padding: '8px 14px', fontSize: 12 }} onClick={() => edit(it)}>Editar</button>
              <button className="btn btn-danger" style={{ flex: 'none', padding: '8px 14px', fontSize: 12 }} onClick={() => remove(it.id)}>Remover</button>
            </div>
          </div>
        ))}

        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-title">{editingId ? 'Editar requisito' : 'Adicionar requisito'}</div>

          <div className="meta-row">
            <div className="meta-pill" style={{ flex: 1, minWidth: 120 }}>
              <label>Código</label>
              <input value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} placeholder="Ex: GMC 30.006" />
            </div>
            <div className="meta-pill" style={{ flex: 2 }}>
              <label>Nome do requisito</label>
              <input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="Ex: Controle interno da qualidade" />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Texto do requisito</label>
            <textarea className="comment-box" rows={3} value={form.requisito} onChange={(e) => setForm((f) => ({ ...f, requisito: e.target.value }))} placeholder="Descrição completa do que é exigido..." />
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 }}>Evidência esperada</label>
            <textarea className="comment-box" rows={2} value={form.evidencia} onChange={(e) => setForm((f) => ({ ...f, evidencia: e.target.value }))} placeholder="O que o auditor deve verificar..." />
          </div>

          <div className="meta-row" style={{ alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, background: 'white', border: '1px solid var(--line)', borderRadius: 8, padding: '9px 12px', flex: 1, minWidth: 110 }}>
              <input type="checkbox" checked={form.core} onChange={(e) => setForm((f) => ({ ...f, core: e.target.checked }))} style={{ width: 15, height: 15 }} /> Item CORE
            </label>
            <div className="meta-pill" style={{ flex: 1, minWidth: 130 }}>
              <label>Tag</label>
              <select value={form.tag} onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value }))}>
                <option value="">—</option>
                <option value="Novo">Novo</option>
                <option value="Atualizado">Atualizado</option>
              </select>
            </div>
          </div>

          <div className="btn-row">
            <button className="btn btn-ghost" onClick={clearForm}>Limpar</button>
            <button className="btn btn-primary" disabled={busy} onClick={save}>Salvar item</button>
          </div>
        </div>

        {currentTemplate?.status !== 'ativo' && (
          <div className="btn-row">
            <button className="btn btn-approve" onClick={ativar}>Ativar roteiro para uso</button>
          </div>
        )}
      </div>
    </div>
  );
}
