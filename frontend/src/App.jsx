import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth.jsx';

import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Picker from './pages/Picker.jsx';
import Preenchimento from './pages/Preenchimento.jsx';
import RelatorioPrevio from './pages/RelatorioPrevio.jsx';
import RelatorioFinal from './pages/RelatorioFinal.jsx';
import Admin from './pages/Admin.jsx';

function PrivateRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/nova" element={<PrivateRoute><Picker /></PrivateRoute>} />
      <Route path="/auditorias/:id/preencher" element={<PrivateRoute><Preenchimento /></PrivateRoute>} />
      <Route path="/auditorias/:id/previo" element={<PrivateRoute><RelatorioPrevio /></PrivateRoute>} />
      <Route path="/auditorias/:id/final" element={<PrivateRoute><RelatorioFinal /></PrivateRoute>} />
      <Route path="/admin" element={<PrivateRoute><Admin /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
