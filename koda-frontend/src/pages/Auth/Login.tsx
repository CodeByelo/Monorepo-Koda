import React, { useState } from 'react';
import { api } from '@/api/client';
import { useAuth } from '@/providers/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, Mail, ArrowRight, Shield, Zap, BarChart3 } from 'lucide-react';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    setError('');
    try {
      const response = await api.post<{access_token: string}>('/auth/login', { email, password });
      login(response.access_token);
      navigate('/');
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión. Verifica tus credenciales.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif" }}>

      {/* ───────── Left Panel: Branding & Features ───────── */}
      <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden items-center justify-center"
        style={{
          background: 'linear-gradient(135deg, #0b5156 0%, #093e42 40%, #072e31 70%, #051f22 100%)',
        }}
      >
        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
          }}
        />

        {/* Animated glow orbs */}
        <div className="absolute top-[15%] left-[10%] w-72 h-72 rounded-full blur-[120px] opacity-20"
          style={{
            background: 'radial-gradient(circle, #14b8a6, transparent 70%)',
            animation: 'pulse 6s ease-in-out infinite',
          }}
        />
        <div className="absolute bottom-[10%] right-[5%] w-96 h-96 rounded-full blur-[140px] opacity-15"
          style={{
            background: 'radial-gradient(circle, #0ea5e9, transparent 70%)',
            animation: 'pulse 8s ease-in-out infinite reverse',
          }}
        />

        <div className="relative z-10 px-16 max-w-xl">
          {/* Logo & Title */}
          <div className="mb-14">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #14b8a6, #0ea5e9)' }}>
                <Shield size={22} className="text-white" />
              </div>
              <div>
                <h2 className="text-white text-sm font-black tracking-widest uppercase" style={{ letterSpacing: '0.2em' }}>
                  OMNI 360
                </h2>
                <p className="text-teal-400/60 text-[9px] font-bold uppercase tracking-[0.3em]">
                  Enterprise Ledger
                </p>
              </div>
            </div>
            <h1 className="text-white text-4xl font-black leading-[1.15] tracking-tight mb-4">
              Gestión empresarial<br/>
              <span className="bg-gradient-to-r from-teal-300 to-cyan-400 bg-clip-text text-transparent">
                inteligente y segura
              </span>
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed font-medium max-w-md">
              Facturación fiscal, inventario en tiempo real, contabilidad automatizada y analítica avanzada — todo en una sola plataforma.
            </p>
          </div>

          {/* Feature cards */}
          <div className="space-y-4">
            {[
              {
                icon: <Zap size={18} />,
                title: 'Facturación Forense',
                desc: 'Emisión con SHA-256, correlativo SENIAT y libros fiscales automáticos.',
                gradient: 'from-teal-500/20 to-teal-500/5',
                border: 'border-teal-500/20',
                iconBg: 'bg-teal-500/20',
                iconColor: 'text-teal-400',
              },
              {
                icon: <BarChart3 size={18} />,
                title: 'Business Intelligence',
                desc: 'Dashboard ejecutivo, reportes de ventas, cuentas por cobrar y comisiones.',
                gradient: 'from-cyan-500/20 to-cyan-500/5',
                border: 'border-cyan-500/20',
                iconBg: 'bg-cyan-500/20',
                iconColor: 'text-cyan-400',
              },
              {
                icon: <Shield size={18} />,
                title: 'Multi-Tenant Seguro',
                desc: 'Aislamiento total por empresa, auditoría en cadena y control de acceso.',
                gradient: 'from-sky-500/20 to-sky-500/5',
                border: 'border-sky-500/20',
                iconBg: 'bg-sky-500/20',
                iconColor: 'text-sky-400',
              },
            ].map((f, i) => (
              <div key={i}
                className={`flex items-start gap-4 p-4 rounded-2xl border ${f.border} bg-gradient-to-r ${f.gradient} backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-black/10`}
              >
                <div className={`w-10 h-10 rounded-xl ${f.iconBg} flex items-center justify-center ${f.iconColor} shrink-0`}>
                  {f.icon}
                </div>
                <div>
                  <h4 className="text-white text-xs font-black uppercase tracking-wider mb-0.5">{f.title}</h4>
                  <p className="text-slate-400 text-[11px] font-medium leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-14 pt-6 border-t border-white/5">
            <p className="text-slate-600 text-[10px] font-bold uppercase tracking-widest">
              © 2024-2026 KODA ERP · Powered by Omni 360 Engine
            </p>
          </div>
        </div>
      </div>

      {/* ───────── Right Panel: Login Form ───────── */}
      <div className="w-full lg:w-[45%] flex items-center justify-center p-6 sm:p-10"
        style={{
          background: 'linear-gradient(180deg, #fafbfc 0%, #f1f5f9 100%)',
        }}
      >
        <div className="w-full max-w-[420px]">

          {/* Mobile-only logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10 justify-center">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #0b5156, #14b8a6)' }}>
              <Shield size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-slate-800 text-sm font-black tracking-widest uppercase">OMNI 360</h2>
              <p className="text-slate-400 text-[8px] font-bold uppercase tracking-[0.3em]">Enterprise Ledger</p>
            </div>
          </div>

          {/* Heading */}
          <div className="mb-10">
            <h1 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight mb-2">
              Iniciar sesión
            </h1>
            <p className="text-slate-500 text-sm font-medium">
              Ingresa tus credenciales para acceder al panel
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200/60 text-red-700 p-4 rounded-2xl text-xs font-bold mb-6 animate-in fade-in slide-in-from-top-2 duration-300">
              <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                <Lock size={14} className="text-red-500" />
              </div>
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email field */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Usuario o Correo
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200 text-slate-400 group-focus-within:text-[#0b5156]">
                  <Mail size={16} />
                </div>
                <input 
                  type="text" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-white border-2 border-slate-200/80 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-medium focus:outline-none focus:border-[#0b5156] focus:ring-4 focus:ring-[#0b5156]/10 transition-all duration-200"
                  placeholder="admin o tu@correo.com"
                  autoComplete="email"
                  required 
                />
              </div>
            </div>

            {/* Password field */}
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest">
                Contraseña
              </label>
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none transition-colors duration-200 text-slate-400 group-focus-within:text-[#0b5156]">
                  <Lock size={16} />
                </div>
                <input 
                  type={showPassword ? 'text' : 'password'} 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white border-2 border-slate-200/80 rounded-2xl pl-11 pr-12 py-3.5 text-sm font-semibold text-slate-800 placeholder:text-slate-400 placeholder:font-medium focus:outline-none focus:border-[#0b5156] focus:ring-4 focus:ring-[#0b5156]/10 transition-all duration-200"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required 
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#0b5156] hover:bg-[#0b5156]/10 transition-all duration-200"
                  title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit button */}
            <button 
              type="submit" 
              disabled={isLoading}
              className={`w-full relative overflow-hidden text-white font-black py-4 rounded-2xl uppercase text-[11px] tracking-[0.2em] transition-all duration-300 mt-2 flex items-center justify-center gap-2.5 group ${
                isLoading 
                  ? 'opacity-70 cursor-not-allowed' 
                  : 'hover:shadow-xl hover:shadow-[#0b5156]/25 hover:scale-[1.02] active:scale-[0.98]'
              }`}
              style={{
                background: 'linear-gradient(135deg, #0b5156 0%, #0a6b6e 50%, #0b5156 100%)',
                backgroundSize: '200% 200%',
              }}
            >
              {/* Animated shimmer */}
              {!isLoading && (
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                  style={{
                    background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.08) 45%, rgba(255,255,255,0.15) 50%, rgba(255,255,255,0.08) 55%, transparent 60%)',
                    backgroundSize: '200% 100%',
                    animation: 'shimmer 2s infinite',
                  }}
                />
              )}
              <span className="relative z-10">
                {isLoading ? 'Verificando credenciales…' : 'Acceder al Panel'}
              </span>
              {!isLoading && (
                <ArrowRight size={14} className="relative z-10 transition-transform duration-300 group-hover:translate-x-1" />
              )}
              {isLoading && (
                <svg className="relative z-10 w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-75" />
                </svg>
              )}
            </button>
          </form>

          {/* Secure badge */}
          <div className="mt-8 flex items-center justify-center gap-2 text-slate-400">
            <Lock size={11} />
            <span className="text-[10px] font-bold uppercase tracking-widest">
              Conexión cifrada de extremo a extremo
            </span>
          </div>

          {/* Footer (mobile) */}
          <div className="lg:hidden mt-10 text-center">
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">
              © 2024-2026 KODA ERP
            </p>
          </div>
        </div>
      </div>

      {/* Global animations */}
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.2; }
          50% { transform: scale(1.15); opacity: 0.3; }
        }
      `}</style>
    </div>
  );
};

export default Login;
