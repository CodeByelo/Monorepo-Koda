import React, { useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/providers/AuthProvider';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await api.post<{access_token: string}>('/auth/login', { email, password });
      login(response.access_token);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm max-w-md w-full">
        <div className="text-center mb-8">
          <div className="bg-[#0b5156]/10 px-3 py-1 rounded-full w-fit mx-auto mb-4">
            <span className="text-[9px] font-black text-[#0b5156] uppercase tracking-widest">Koda ERP</span>
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tighter">Bienvenido</h1>
          <p className="text-slate-500 text-sm font-bold mt-2">Ingresa tus credenciales para continuar</p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs font-bold text-center mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Email</label>
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#0b5156] transition-colors"
              placeholder="admin@koda.com"
              required 
            />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Contraseña</label>
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#0b5156] transition-colors"
              placeholder="••••••••"
              required 
            />
          </div>
          <button 
            type="submit" 
            className="w-full bg-[#0b5156] text-white font-black py-4 rounded-xl uppercase text-[11px] tracking-widest shadow-lg shadow-teal-900/10 hover:shadow-teal-900/20 active:scale-95 transition-all mt-4"
          >
            Ingresar
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
