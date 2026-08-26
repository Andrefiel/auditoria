const TOKEN_KEY = 'auditoria_token';
const USER_KEY = 'auditoria_user';

export const AUDITORES_LIDERES = [
  'Camila Rebouças',
  'Juliana Cordeiro',
  'Taís do Vale',
  'Rigoberto Matos',
  'Marcelo Daniel',
];

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function getUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}
export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearSession();
    window.location.href = '/login';
    throw new Error('Sessão expirada');
  }

  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : null;

  if (!res.ok) {
    throw new Error(data?.error || `Erro ${res.status}`);
  }
  return data;
}

export const api = {
  login: (username, password, website = '') =>
    request('/auth/login', { method: 'POST', body: { username, password, website } }),

  templates: () => request('/templates'),
  templateItens: (id) => request(`/templates/${id}/itens`),
  addItem: (templateId, item) => request(`/templates/${templateId}/itens`, { method: 'POST', body: item }),
  updateItem: (templateId, itemId, item) =>
    request(`/templates/${templateId}/itens/${itemId}`, { method: 'PUT', body: item }),
  deleteItem: (templateId, itemId) =>
    request(`/templates/${templateId}/itens/${itemId}`, { method: 'DELETE' }),
  ativarTemplate: (templateId) => request(`/templates/${templateId}/ativar`, { method: 'POST' }),

  criarAuditoria: (template_id, setor_unidade, auditor_lider) =>
    request('/auditorias', { method: 'POST', body: { template_id, setor_unidade, auditor_lider } }),
  minhasAuditorias: () => request('/auditorias/mine'),
  pendentes: () => request('/auditorias/pendentes'),
  auditoria: (id) => request(`/auditorias/${id}`),
  salvarRespostas: (id, respostas, conclusao, meta = {}) =>
    request(`/auditorias/${id}/respostas`, { method: 'PUT', body: { respostas, conclusao, ...meta } }),
  enviar: (id) => request(`/auditorias/${id}/enviar`, { method: 'POST' }),
  decidir: (id, decisao, observacao) =>
    request(`/auditorias/${id}/decidir`, { method: 'POST', body: { decisao, observacao } }),
  pdfUrl: (id) => {
    const token = getToken();
    return `/api/auditorias/${id}/pdf${token ? `?token=${encodeURIComponent(token)}` : ''}`;
  },
};
