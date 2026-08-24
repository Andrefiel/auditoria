import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const initials = (user?.displayName || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="topbar">
      <div className="brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
        <div className="brand-mark" />
        <div className="brand-text">
          <div className="t1">ARGOS</div>
          <div className="t2">PATOLOGIA</div>
        </div>
      </div>
      <button
        className="user-chip"
        onClick={() => {
          logout();
          navigate('/login');
        }}
        title="Sair"
      >
        <div className="user-avatar">{initials}</div>
        <span className="un">{user?.displayName}</span>
      </button>
    </div>
  );
}
