import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import Topbar from '../components/Topbar.jsx';

export default function Configuracoes() {
  const navigate = useNavigate();
  const [logoUrl, setLogoUrl] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [titulo, setTitulo] = useState('');
  const [subtitulo, setSubtitulo] = useState('Plataforma de Auditoria Interna e Qualidade Contínua.');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    setError('');
    try {
      const data = await api.configPublic();
      setLogoUrl(data.login_logo_url || '');
      setBannerUrl(data.login_banner_url || '');
      setTitulo(data.login_titulo || '');
      setSubtitulo(data.login_subtitulo || 'Plataforma de Auditoria Interna e Qualidade Contínua.');
    } catch (err) {
      setError(err.message || 'Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e, type) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'logo') setUploadingLogo(true);
    else setUploadingBanner(true);
    setError('');
    setMsg('');

    try {
      const res = await api.uploadBranding(file);
      if (type === 'logo') {
        setLogoUrl(res.url);
      } else {
        setBannerUrl(res.url);
      }
      setMsg(`Imagem de ${type === 'logo' ? 'Logo' : 'Banner'} enviada com sucesso! Clique em "Salvar Alterações".`);
    } catch (err) {
      setError(err.message || 'Erro no envio do arquivo');
    } finally {
      if (type === 'logo') setUploadingLogo(false);
      else setUploadingBanner(false);
    }
  }

  async function handleSave(e) {
    if (e) e.preventDefault();
    setSaving(true);
    setError('');
    setMsg('');

    try {
      await api.salvarConfig({
        login_logo_url: logoUrl,
        login_banner_url: bannerUrl,
        login_titulo: titulo,
        login_subtitulo: subtitulo,
      });
      setMsg('Configurações visuais salvas com sucesso!');
    } catch (err) {
      setError(err.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <Topbar />
      <div className="screen" style={{ maxWidth: 860 }}>
        <div className="page-head">
          <div className="eyebrow"><a onClick={() => navigate('/')}>← Painel</a> · Administração</div>
          <h1>Identidade Visual & Configurações</h1>
          <p className="sub">Personalize a Logo, a Imagem de Fundo e os Textos da tela de login do sistema.</p>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {msg && (
          <div className="note-banner" style={{ background: '#F0FDF4', borderColor: '#86EFAC', color: '#166534', marginBottom: 16 }}>
            ✓ {msg}
          </div>
        )}

        {loading ? (
          <div className="card" style={{ padding: 32, textAlign: 'center', color: 'var(--ink-soft)' }}>
            Carregando configurações...
          </div>
        ) : (
          <form onSubmit={handleSave}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 20 }}>
              
              {/* Card 1: Logo da Empresa */}
              <div className="card">
                <div className="card-title">Logo Oficial da Empresa</div>
                <p className="sub" style={{ fontSize: 12, marginBottom: 14 }}>
                  Exibida na tela de login e no cabeçalho do sistema. Formato recomendado: <b>PNG transparente ou SVG</b>.
                </p>

                {logoUrl ? (
                  <div style={{ background: '#0B1C39', padding: '16px 20px', borderRadius: 8, textAlign: 'center', marginBottom: 14 }}>
                    <img src={logoUrl} alt="Logo Preview" style={{ maxHeight: 60, maxWidth: '100%', objectFit: 'contain' }} />
                  </div>
                ) : (
                  <div style={{ background: '#0B1C39', padding: '24px 20px', borderRadius: 8, textAlign: 'center', marginBottom: 14, color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
                    (Nenhuma logo personalizada — usando padrão da marca)
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <label className="btn btn-ghost" style={{ cursor: 'pointer', fontSize: 12.5, flex: 1, textAlign: 'center' }}>
                    {uploadingLogo ? 'Enviando...' : '📁 Escolher arquivo de Logo'}
                    <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'logo')} style={{ display: 'none' }} disabled={uploadingLogo} />
                  </label>
                  {logoUrl && (
                    <button type="button" className="btn btn-ghost" style={{ color: 'var(--c-nc)', fontSize: 12 }} onClick={() => setLogoUrl('')}>
                      Remover
                    </button>
                  )}
                </div>
              </div>

              {/* Card 2: Imagem de Fundo / Banner */}
              <div className="card">
                <div className="card-title">Imagem do Painel Lateral (Login)</div>
                <p className="sub" style={{ fontSize: 12, marginBottom: 14 }}>
                  Imagem de fundo ilustrativa (laboratório, microscopia ou tecnologia médica).
                </p>

                {bannerUrl ? (
                  <div style={{ height: 120, borderRadius: 8, overflow: 'hidden', marginBottom: 14, border: '1px solid var(--line)' }}>
                    <img src={bannerUrl} alt="Banner Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                ) : (
                  <div style={{ height: 120, borderRadius: 8, background: 'linear-gradient(135deg, #0B1C39, #0284C7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 12, marginBottom: 14, padding: 12, textAlign: 'center' }}>
                    (Gradiente escuro institucional padrão)
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <label className="btn btn-ghost" style={{ cursor: 'pointer', fontSize: 12.5, flex: 1, textAlign: 'center' }}>
                    {uploadingBanner ? 'Enviando...' : '🖼️ Escolher imagem de fundo'}
                    <input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'banner')} style={{ display: 'none' }} disabled={uploadingBanner} />
                  </label>
                  {bannerUrl && (
                    <button type="button" className="btn btn-ghost" style={{ color: 'var(--c-nc)', fontSize: 12 }} onClick={() => setBannerUrl('')}>
                      Remover
                    </button>
                  )}
                </div>
              </div>

            </div>

            {/* Card 3: Mensagens Institucionais */}
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="card-title">Textos Institucionais da Tela de Login</div>
              
              <div className="field">
                <label>Título Principal</label>
                <input
                  type="text"
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ex: Excelência diagnóstica e rigor técnico."
                  required
                />
              </div>

              <div className="field">
                <label>Subtítulo / Descrição</label>
                <textarea
                  className="comment-box"
                  rows={3}
                  value={subtitulo}
                  onChange={(e) => setSubtitulo(e.target.value)}
                  placeholder="Ex: Plataforma de Auditoria Interna e Qualidade Contínua..."
                  required
                />
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="btn-row">
              <button type="button" className="btn btn-ghost" onClick={() => navigate('/')}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Salvando...' : '💾 Salvar Alterações'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
