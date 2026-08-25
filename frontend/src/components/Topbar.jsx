import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';

export default function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  const initials = (user?.displayName || '?')
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  return (
    <div className="topbar">
      <div className="brand" style={{ cursor: 'pointer' }} onClick={() => navigate('/')}>
        <div className="brand-mark" />
        <div className="brand-text">
          <div className="t1">ARGOS</div>
          <div className="t2">PATOLOGIA</div>
        </div>
      </div>

      <div className="user-menu-container" ref={menuRef}>
        <button
          className={`user-chip ${open ? 'active' : ''}`}
          onClick={() => setOpen((prev) => !prev)}
          title="Opções do usuário"
          aria-expanded={open}
        >
          <div className="user-avatar">{initials}</div>
          <span className="un">{user?.displayName}</span>
          <span className="user-chevron">▾</span>
        </button>

        {open && (
          <div className="user-dropdown">
            <div className="user-dropdown-header">
              <div className="user-dropdown-avatar">{initials}</div>
              <div className="user-dropdown-meta">
                <div className="user-dropdown-name">{user?.displayName}</div>
                <div className="user-dropdown-sub">@{user?.username}</div>
                <div className="user-dropdown-badge">
                  {user?.isLider ? 'Líder / Qualidade' : 'Auditor'}
                </div>
              </div>
            </div>

            <div className="user-dropdown-divider" />

            <button
              className="user-dropdown-item logout"
              onClick={() => {
                setOpen(false);
                logout();
                navigate('/login');
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <polyline points="16 17 21 12 16 7"></polyline>
                <line x1="21" y1="12" x2="9" y2="12"></line>
              </svg>
              <span>Sair da conta</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

