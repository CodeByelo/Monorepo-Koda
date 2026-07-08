// frontend/src/services/api.js
import axios from 'axios';

// CORRECCIÓN: Quitamos '/api' del final porque el backend sirve en la raíz
const api = axios.create({
  baseURL:
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === 'production'
      ? 'https://corpoelect-backend.onrender.com'
      : 'http://127.0.0.1:8000'),
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para agregar el token automáticamente
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('sgd_token'); // O como guardes el token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const loginApi = async (username, password) => {
  // Usamos URLSearchParams para OAuth2PasswordRequestForm que espera el backend
  const params = new URLSearchParams();
  params.append('username', username);
  params.append('password', password);

  const response = await api.post('/api/login', params.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
  });
  return response.data;
};

export const registerApi = async (userData) => {
  const response = await api.post('/api/register', userData);
  return response.data;
};

export const getGerencias = async () => {
  const response = await api.get('/gerencias'); // Asegúrate de tener esta ruta en backend
  return response.data;
};

