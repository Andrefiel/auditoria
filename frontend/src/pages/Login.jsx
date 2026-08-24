import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Erro ao entrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-mark" />
        <div className="login-title">Sistema de Qualidade</div>
        <div className="login-sub">Auditoria Interna · Argos Patologia</div>

        <div className="login-domain">🔒 Autenticação via <b>ARGOS\</b> Active Directory</div>

        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Usuário de rede</label>
            <input
              type="text"
              placeholder="maikel.fiel"
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
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <div className="field-hint">Mesma credencial usada no Windows / e-mail corporativo.</div>
          </div>

          {error && <div className="error-banner">{error}</div>}

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 6 }} disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
