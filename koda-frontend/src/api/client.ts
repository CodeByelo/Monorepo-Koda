const isProductionFrontend = typeof window !== 'undefined' && (
  window.location.hostname.includes('vercel.app') ||
  window.location.hostname.includes('onrender.com') ||
  window.location.hostname.includes('cloudflare')
);

export let BASE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_API_URL) || (
  isProductionFrontend
    ? 'https://koda-backend-contable.onrender.com'
    : (typeof window !== 'undefined' && window.location.hostname.includes('.ts.net'))
    ? '/api-facturacion'
    : 'http://localhost:8000'
);

if (BASE_URL && !BASE_URL.startsWith('http://') && !BASE_URL.startsWith('https://') && !BASE_URL.startsWith('/')) {
  BASE_URL = '/' + BASE_URL;
}

// ─────────────────────────────────────────────────────────────────────────────
// REFRESH TOKEN — renovación silenciosa del access token
// Cuando el servidor responde 401, intentamos renovar antes de expulsar al usuario.
// ─────────────────────────────────────────────────────────────────────────────

let _isRefreshing = false;
let _refreshSubscribers: Array<(token: string | null) => void> = [];

function _onRefreshDone(token: string | null) {
  _refreshSubscribers.forEach(cb => cb(token));
  _refreshSubscribers = [];
}

async function _attemptTokenRefresh(): Promise<string | null> {
  if (_isRefreshing) {
    // Ya hay un refresh en curso — encolar y esperar su resultado
    return new Promise(resolve => {
      _refreshSubscribers.push(resolve);
    });
  }

  _isRefreshing = true;
  try {
    const refreshToken = typeof window !== 'undefined'
      ? (localStorage.getItem('sgd_refresh_token') || localStorage.getItem('koda_refresh_token'))
      : null;

    if (!refreshToken) {
      _onRefreshDone(null);
      return null;
    }

    const res = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!res.ok) {
      _onRefreshDone(null);
      return null;
    }

    const data = await res.json();
    const newToken = data.access_token;

    if (newToken) {
      localStorage.setItem('koda_token', newToken);
      localStorage.setItem('sgd_token', newToken);
    }

    _onRefreshDone(newToken || null);
    return newToken || null;
  } catch {
    _onRefreshDone(null);
    return null;
  } finally {
    _isRefreshing = false;
  }
}

function _redirectToLogin(reason = 'timeout') {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('koda_token');
    localStorage.removeItem('sgd_token');
    localStorage.removeItem('sgd_refresh_token');
    localStorage.removeItem('koda_refresh_token');
    window.location.href = `/login?reason=${reason}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

// Tiempo máximo de espera para cualquier petición. Sin esto, un backend caído
// o que nunca responde deja el `fetch` colgado indefinidamente: cualquier UI
// que dependa de `await api.xxx(...)` (p.ej. el botón "Reintentar Conexión"
// del gate de licencia, que muestra "Verificando...") queda atascada para
// siempre en vez de fallar y mostrar un error.
const DEFAULT_TIMEOUT_MS = 20000;

function _fetchWithTimeout(input: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer));
}

export async function request<T>(endpoint: string, options: RequestInit = {}, _isRetry = false): Promise<T> {
  const isFormData = options.body instanceof FormData;
  const headers: any = {
    ...options.headers,
  };
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  // Adjuntar token de acceso desde localStorage como Bearer header
  if (!headers['Authorization']) {
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('koda_token') || localStorage.getItem('sgd_token'))
      : null;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    response = await _fetchWithTimeout(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
      credentials: 'include', // Enviar cookies httpOnly automáticamente
    });
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error('Tiempo de espera agotado al contactar el servidor. Verifica tu conexión e intenta nuevamente.');
    }
    throw err;
  }

  if (!response.ok) {
    // ── Interceptor 401: intentar refresh silencioso ──────────────────────────
    if (response.status === 401 && !_isRetry) {
      const newToken = await _attemptTokenRefresh();
      if (newToken) {
        // Reintentar la petición original con el nuevo token
        return request<T>(endpoint, options, true);
      } else {
        // Refresh fallido — redirigir al login
        _redirectToLogin('timeout');
        throw new Error('Sesión expirada. Por favor, inicia sesión nuevamente.');
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    let errorMessage = 'Error en la petición';
    try {
      const errorData = await response.json();
      errorMessage = errorData.detail || errorData.message || errorMessage;
    } catch {
      // Ignorar error de parseo
    }

    if (response.status === 403 && errorMessage.toLowerCase().includes('licencia')) {
      window.dispatchEvent(new CustomEvent('koda-license-error', { detail: errorMessage }));
    }

    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  get: <T>(endpoint: string, options?: RequestInit) => request<T>(endpoint, { ...options, method: 'GET' }),
  post: <T>(endpoint: string, body?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'POST',
      body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined)
    }),
  put: <T>(endpoint: string, body?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'PUT',
      body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined)
    }),
  patch: <T>(endpoint: string, body?: any, options?: RequestInit) =>
    request<T>(endpoint, {
      ...options,
      method: 'PATCH',
      body: body instanceof FormData ? body : (body ? JSON.stringify(body) : undefined)
    }),
  delete: <T>(endpoint: string, options?: RequestInit) => request<T>(endpoint, { ...options, method: 'DELETE' }),
  download: async (endpoint: string, filename: string) => {
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('koda_token') || localStorage.getItem('sgd_token'))
      : null;
    let response: Response;
    try {
      // Timeout más holgado: generar un PDF/reporte en el backend puede
      // tardar más que una consulta JSON normal.
      response = await _fetchWithTimeout(`${BASE_URL}${endpoint}`, {
        method: 'GET',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      }, 60000);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new Error('Tiempo de espera agotado al generar el archivo. Intenta nuevamente.');
      }
      throw err;
    }
    if (!response.ok) {
      throw new Error('Error al descargar el archivo');
    }
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }
};
