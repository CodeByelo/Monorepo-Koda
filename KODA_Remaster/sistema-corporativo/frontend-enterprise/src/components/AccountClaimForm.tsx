import React, { useState } from 'react';
import axios from 'axios';

interface AccountClaimFormProps {
  onSuccessRedirect?: () => void;
}

export const AccountClaimForm: React.FC<AccountClaimFormProps> = ({ onSuccessRedirect }) => {
  const [tokenPlano, setTokenPlano] = useState('');
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validaciones básicas
    if (!tokenPlano.trim()) {
      setError('El token de activación es requerido.');
      return;
    }
    if (!nombre.trim() || !apellido.trim()) {
      setError('Nombre y apellido son requeridos.');
      return;
    }
    if (!email.trim()) {
      setError('El correo electrónico es requerido.');
      return;
    }
    if (password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsLoading(true);
    setError(null);

    const baseURL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

    try {
      await axios.post(`${baseURL}/auth/claim-account`, {
        token_plano: tokenPlano.trim(),
        username: email.trim(),
        password,
        nombre: nombre.trim(),
        apellido: apellido.trim(),
        email: email.trim()
      });
      setIsSuccess(true);
    } catch (err: any) {
      const errMsg = err.response?.data?.detail || err.message || 'Ocurrió un error al activar la cuenta.';
      setError(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg));
    } finally {
      setIsLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="w-full max-w-lg mx-auto bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-100 shadow-2xl font-sans">
        <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold mb-3 tracking-tight text-white">
          ¡Cuenta Corporativa Activada!
        </h2>
        <p className="text-sm text-slate-400 mb-8 leading-relaxed">
          Tu perfil de Administrador General ha sido creado con éxito y el token de un solo uso ha sido invalidado de forma permanente. Ya puedes iniciar sesión con tu cuenta corporativa.
        </p>
        <button
          onClick={() => {
            if (onSuccessRedirect) {
              onSuccessRedirect();
            } else {
              window.location.href = '/login';
            }
          }}
          className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 active:scale-[0.98] transition-all"
        >
          Ir al Login Corporativo
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-lg mx-auto bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-8 text-slate-100 font-sans">
      <div className="text-center mb-8">
        <div className="w-12 h-12 bg-teal-500/10 border border-teal-500/20 rounded-xl flex items-center justify-center mx-auto mb-4 text-teal-400">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Activar Cuenta SaaS</h2>
        <p className="text-sm text-slate-400 mt-1.5 leading-relaxed">
          Ingresa el token provisto por tu administrador y configura tus credenciales maestras.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="tokenPlano" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Token de Activación
          </label>
          <input
            id="tokenPlano"
            type="password"
            placeholder="Pega tu token de un solo uso aquí"
            value={tokenPlano}
            onChange={(e) => setTokenPlano(e.target.value)}
            disabled={isLoading}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-teal-500 transition-colors"
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="nombre" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Nombre
            </label>
            <input
              id="nombre"
              type="text"
              placeholder="ej. Juan"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              disabled={isLoading}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-teal-500 transition-colors"
              required
            />
          </div>

          <div>
            <label htmlFor="apellido" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Apellido
            </label>
            <input
              id="apellido"
              type="text"
              placeholder="ej. Pérez"
              value={apellido}
              onChange={(e) => setApellido(e.target.value)}
              disabled={isLoading}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-teal-500 transition-colors"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Email Corporativo (Usuario)
          </label>
          <input
            id="email"
            type="email"
            placeholder="ej. admin@miempresa.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-teal-500 transition-colors"
            required
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            placeholder="Mínimo 8 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-teal-500 transition-colors"
            required
          />
        </div>

        <div>
          <label htmlFor="confirmPassword" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Confirmar Contraseña
          </label>
          <input
            id="confirmPassword"
            type="password"
            placeholder="Confirma tu contraseña"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={isLoading}
            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-700 focus:outline-none focus:border-teal-500 transition-colors"
            required
          />
        </div>

        {error && (
          <div className="bg-red-950/40 border border-red-900/50 text-red-200 text-sm px-4 py-3 rounded-xl">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-semibold py-3.5 px-4 rounded-xl shadow-lg shadow-teal-500/20 hover:shadow-teal-500/30 active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5 text-slate-950" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <span>Activando Cuenta...</span>
            </div>
          ) : (
            'Activar Cuenta Corporativa'
          )}
        </button>
      </form>
    </div>
  );
};
export default AccountClaimForm;
