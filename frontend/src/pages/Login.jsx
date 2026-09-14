import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { api } from '../lib/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [website, setWebsite] = useState(''); // Honeypot contra bots
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [branding, setBranding] = useState({
    login_logo_url: '',
    login_banner_url: '',
    login_titulo: 'Excelência diagnóstica e rigor técnico.',
    login_subtitulo: 'Plataforma de Auditoria Interna e Qualidade Contínua.',
  });

  useEffect(() => {
    api.configPublic()
      .then((data) => {
        if (data) setBranding(data);
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password, website);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Erro ao entrar');
    } finally {
      setLoading(false);
    }
  }

  const bannerStyle = branding.login_banner_url
    ? {
        backgroundImage: `linear-gradient(rgba(11, 28, 57, 0.88), rgba(11, 28, 57, 0.94)), url(${branding.login_banner_url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : {
        background: 'linear-gradient(145deg, #0B1C39 0%, #08152A 60%, #0F2C59 100%)',
      };

  return (
    <div className="login-split-wrap">
      <div className="login-split-card">
        {/* Painel Esquerdo: Identidade Visual e Institucional */}
        <div className="login-split-side" style={bannerStyle}>
          <div className="login-side-content">
            {/* Logo da Empresa */}
            <div className="login-logo-wrap">
              {branding.login_logo_url ? (
                <img
                  src={branding.login_logo_url}
                  alt="Argos Patologia"
                  className="login-logo-img"
                />
              ) : (
                <div className="login-brand-default">
                  <div className="login-brand-name">
                    <span>ARG</span>
                    <span className="login-brand-circle"></span>
                    <span>S</span>
                  </div>
                  <div className="login-brand-sub">PATOLOGIA</div>
                </div>
              )}
            </div>

            <div className="login-badge-pill">SISTEMA DE QUALIDADE & AUDITORIA</div>

            {branding.login_subtitulo && (
              <p className="login-side-sub" style={{ fontSize: 14, marginTop: 10 }}>
                {branding.login_subtitulo}
              </p>
            )}
          </div>

          <div className="login-side-footer">
            <span>ARGOS AUDITORIA</span>
          </div>
        </div>

        {/* Painel Direito: Formulário de Login */}
        <div className="login-split-form-panel">
          <div className="login-form-inner">
            <h1 className="login-form-title">Acesse sua conta</h1>
            <p className="login-form-desc">Informe suas credenciais para entrar no sistema.</p>

            <form onSubmit={handleSubmit} className="login-form">
              {/* Honeypot invisível para bots */}
              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                style={{ display: 'none', position: 'absolute', left: '-9999px', opacity: 0 }}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
              />

              <div className="field">
                <label>Usuário</label>
                <input
                  type="text"
                  placeholder="Digite seu usuário"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="field">
                <label>Senha</label>
                <input
                  type="password"
                  placeholder="Digite sua senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {error && <div className="error-banner">{error}</div>}

              <button className="btn btn-primary login-btn" disabled={loading}>
                {loading ? <span className="spinner" /> : 'Entrar no Sistema →'}
              </button>
            </form>

            <div className="login-card-footer">
              © {new Date().getFullYear()} Argos Patologia · Todos os direitos reservados.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
