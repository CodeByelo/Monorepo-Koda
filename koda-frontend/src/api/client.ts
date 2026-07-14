export let BASE_URL = (typeof import.meta !== 'undefined' && (import.meta as any).env && (import.meta as any).env.VITE_API_URL) || (
  typeof window !== 'undefined' && (window.location.hostname.includes('cloudflare') || window.location.hostname.includes('.ts.net'))
    ? '/api-facturacion'
    : '/api'
);

if (BASE_URL && !BASE_URL.startsWith('http://') && !BASE_URL.startsWith('https://') && !BASE_URL.startsWith('/')) {
  BASE_URL = '/' + BASE_URL;
}

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('koda_token') || localStorage.getItem('sgd_token');
  const isFormData = options.body instanceof FormData;
  const headers: any = {
    ...options.headers,
  };
  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorMessage = 'Error en la petición';
    try {
      const errorData = await response.json();
      errorMessage = errorData.detail || errorData.message || errorMessage;
    } catch {
      // Ignorar
    }

    if (response.status === 401) {
      localStorage.removeItem('koda_token');
      localStorage.removeItem('sgd_token');
      window.location.href = '/';
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
    const token = localStorage.getItem('koda_token') || localStorage.getItem('sgd_token');
    const headers: any = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'GET',
      headers,
    });
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
