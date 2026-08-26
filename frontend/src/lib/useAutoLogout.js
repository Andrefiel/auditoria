import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from './auth.jsx';

// 30 minutos em milissegundos
const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

export function useAutoLogout(timeoutMs = INACTIVITY_TIMEOUT_MS) {
  const { user, logout } = useAuth();
  const timerRef = useRef(null);

  const resetTimer = useCallback(() => {
    if (!user) return;

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      console.warn('[Segurança] Sessão encerrada por inatividade.');
      logout();
    }, timeoutMs);
  }, [user, logout, timeoutMs]);

  useEffect(() => {
    if (!user) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'];

    const handleActivity = () => resetTimer();

    // Inicia o timer
    resetTimer();

    // Adiciona os ouvintes de eventos
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [user, resetTimer]);
}
