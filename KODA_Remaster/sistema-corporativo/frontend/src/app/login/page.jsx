"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Shield, Zap, Lock, User, CheckCircle, AlertCircle, ChevronRight } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
// import { login } from '../../lib/api'; // Eliminado: Usaremos useAuth

// ====================================================================
// SPLASH SCREEN - CORPOEELEC INDUSTRIAL
// ====================================================================
const SplashScreen = ({ onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState([false, false, false]);
  const [showLoader, setShowLoader] = useState(true);
  const loaderRef = useRef(null);
  const startTimeRef = useRef(null);

  useEffect(() => {
    if (!startTimeRef.current) {
      startTimeRef.current = Date.now();
    }
    const totalDuration = 3000;
    let animationFrameId;

    const animate = () => {
      const elapsed = Date.now() - startTimeRef.current;
      const progressValue = Math.min(elapsed / totalDuration, 1);
      const percent = Math.floor(progressValue * 100);

      setProgress(percent);

      setStatus(prev => {
        const next = [...prev];
        for (let i = 0; i < 3; i++) {
          const statusStart = 0.1 + (i * 0.2);
          if (progressValue > statusStart) {
            next[i] = true;
          }
        }
        return next;
      });

      // Completar
      if (progressValue >= 1) {
        setShowLoader(false);
        if (loaderRef.current) {
          loaderRef.current.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          loaderRef.current.style.opacity = '0';
          loaderRef.current.style.transform = 'scale(0.92)';
          setTimeout(() => {
            if (loaderRef.current) loaderRef.current.style.display = 'none';
          }, 300);
        }

        if (onComplete) {
          setTimeout(() => onComplete(), 300);
        }
      }

      if (progressValue < 1) {
        animationFrameId = requestAnimationFrame(animate);
      }
    };

    animationFrameId = requestAnimationFrame(animate);

    // Activar primer estado
    const timeoutId = setTimeout(() => {
      setStatus(prev => {
        const newS = [...prev];
        newS[0] = true;
        return newS;
      });
    }, 100);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(timeoutId);
    };
  }, [onComplete]);

  return (
    <div className="splash-screen">

      <div className="splash-container">
        {/* Logo */}
        <div className="logo-text">KODA REMASTER</div>
        <div className="logo-subtitle">Sistema de Gestión Integral</div>

        {/* Loader */}
        {showLoader && (
          <div className="loader flex items-center justify-center" ref={loaderRef} aria-hidden="true">
            <div className="relative flex h-24 w-24 items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-cyan-300/30 animate-ping" />
              <div className="absolute inset-2 rounded-full border border-cyan-200/40" />
              <img
                src="/koda-mark.png"
                alt="KODA"
                className="h-20 w-20 rounded-full object-cover shadow-[0_0_30px_rgba(34,211,238,0.28)]"
              />
            </div>
          </div>
        )}

        {/* Barra de progreso */}
        <div className="progress-container">
          <div className="progress-label">
            <span>Inicializando sistema...</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill bg-cyan-400" style={{ width: `${progress}%`, boxShadow: '0 0 14px rgba(34,211,238,0.45)' }}></div>
          </div>
        </div>

        {/* Estado del sistema */}
        <div className="system-status">
          <div className={`status-item ${status[0] ? 'active text-cyan-300' : ''}`}>
            <span className={`status-dot ${status[0] ? 'bg-cyan-400' : ''}`}></span>
            <span className="status-text">Conectando a servidores...</span>
          </div>
          <div className={`status-item ${status[1] ? 'active text-cyan-300' : ''}`}>
            <span className={`status-dot ${status[1] ? 'bg-cyan-400' : ''}`}></span>
            <span className="status-text">Verificando credenciales corporativas...</span>
          </div>
          <div className={`status-item ${status[2] ? 'active text-cyan-300' : ''}`}>
            <span className={`status-dot ${status[2] ? 'bg-cyan-400' : ''}`}></span>
            <span className="status-text">Cargando datos industriales...</span>
          </div>
        </div>

        <p className={`loading-complete text-cyan-300 ${progress === 100 ? 'visible' : ''}`}>
          ✓ Sistema listo. Redirigiendo al login...
        </p>
      </div>
    </div>
  );
};

// ========================
// LOGIN
// ========================
const usePasswordToggle = () => {
  const [visible, setVisible] = useState(false);
  const toggle = useCallback(() => setVisible(v => !v), []);
  return { type: visible ? 'text' : 'password', icon: visible ? <EyeOff size={18} /> : <Eye size={18} />, toggle };
};

const PasswordStrength = ({ password }) => {
  const getStrength = () => {
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(score, 4);
  };

  const strength = getStrength();
  const labels = ['Muy débil', 'Débil', 'Regular', 'Fuerte', 'Excelente'];
  const colors = ['bg-sky-950', 'bg-sky-700', 'bg-blue-500', 'bg-cyan-400', 'bg-amber-400'];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map(level => (
          <div
            key={level}
            className={`h-1 flex-1 rounded-full ${strength >= level ? colors[strength - 1] : 'bg-gray-700'
              }`}
          />
        ))}
      </div>
      <p className={`text-xs ${strength >= 3 ? 'text-cyan-300' : strength >= 2 ? 'text-sky-300' : 'text-amber-300'
        }`}>
        {labels[strength - 1]}
      </p>
    </div>
  );
};

const AnimatedInput = ({
  id, label, value, onChange, type, placeholder, icon: Icon,
  error, showError, autoComplete, required, ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const hasValue = value.length > 0;

  return (
    <div className="relative">
      <label
        htmlFor={id}
        className={`absolute left-12 transition-all duration-300 z-10 ${isFocused || hasValue
          ? '-top-2 left-8 text-xs px-2 bg-transparent font-semibold uppercase tracking-wider'
          : 'top-4 auth-input-label-idle'
          } ${isFocused ? 'text-cyan-300' : 'auth-input-label-idle'}`}
      >
        {label}
      </label>

      <div className={`relative flex items-center rounded-xl ${error ? 'bg-red-500/10' : 'auth-input-shell'
        } ${isFocused ? 'ring-2 ring-cyan-400/40' : ''}`}>
        <div className={`pl-4 pr-2 ${isFocused ? 'text-cyan-300' : 'auth-input-icon'}`}>
          <Icon size={20} />
        </div>

        <input
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={isFocused ? placeholder : ''}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          autoComplete={autoComplete}
          required={required}
          className="w-full px-4 py-4 bg-transparent auth-input-control focus:outline-none"
        />

        {/* Toggle Password Visibility Button */}
        {id === 'password' && (
          <button
            type="button"
            onClick={props.onTogglePassword}
            className="pr-4 auth-input-icon hover:text-cyan-300 transition-colors focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 border-0 bg-transparent shadow-none appearance-none" style={{ border: "none", outline: "none", boxShadow: "none", background: "transparent" }}
          >
            {type === 'password' ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        )}

        {value && !error && id !== 'password' && (
          <div className="pr-4 text-cyan-300">
            <CheckCircle size={18} />
          </div>
        )}
      </div>

      {error && showError && (
        <div className="flex items-center mt-2 text-red-500 text-xs animate-shake">
          <AlertCircle size={14} className="mr-1" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
};

const LoadingButton = ({ isLoading, children, ...props }) => (
  <button
    {...props}
    disabled={isLoading}
    className={`glass-hover relative overflow-hidden w-full py-4 rounded-xl font-bold text-lg tracking-wide transition-all duration-300 transform hover:scale-[1.01] active:scale-[0.99] disabled:transform-none ${isLoading
      ? 'bg-slate-700 cursor-not-allowed'
      : 'bg-gradient-to-r from-sky-600 via-blue-600 to-cyan-500 hover:from-sky-500 hover:via-blue-500 hover:to-cyan-400 shadow-cyan-500/25 hover:shadow-cyan-400/40'
      } shadow-lg`}
  >
    {isLoading && (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 bg-white rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
      </div>
    )}
    <span className={isLoading ? 'invisible' : ''}>{children}</span>
  </button>
);

const Particles = () => {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 2,
    duration: Math.random() * 20 + 15,
    delay: Math.random() * 5,
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute bg-cyan-400/20 rounded-full animate-float"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
};

// ====================================================================
// FORMULARIO PRINCIPAL
// ====================================================================
const LoginForm = () => {
  const [formData, setFormData] = useState({ username: '', password: '' });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [loginError, setLoginError] = useState(null);
  const formRef = useRef(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const safeNextPath = useCallback(() => {
    const next = searchParams.get('next');
    if (next && next.startsWith('/') && !next.startsWith('//')) {
      return next;
    }
    return '/dashboard';
  }, [searchParams]);

  // ✅ USAR HOOK DE AUTH
  const { login: authLogin, isAuthenticated } = useAuth();

  // ✅ Redirección automática si ya está autenticado
  useEffect(() => {
    if (isAuthenticated && !loginSuccess) {
      router.push(safeNextPath());
    }
  }, [isAuthenticated, loginSuccess, router, safeNextPath]);

  // ✅ Redirección después de login exitoso (con delay para efecto visual)
  useEffect(() => {
    if (loginSuccess) {
      const timer = setTimeout(() => {
        router.push(safeNextPath());
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [loginSuccess, router, safeNextPath]);

  const { type: passwordType, toggle: togglePassword } = usePasswordToggle();

  useEffect(() => {
    const elements = formRef.current?.children;
    if (elements) {
      Array.from(elements).forEach((el, i) => {
        if (el.style) {
          el.style.opacity = '0';
          el.style.transform = 'translateY(20px)';
          el.style.animation = `fadeInUp 0.6s ease forwards ${i * 0.1}s`;
        }
      });
    }
  }, []);

  const validate = useCallback(() => {
    const newErrors = {};
    const { username, password } = formData;

    if (!username.trim()) newErrors.username = 'Usuario corporativo requerido';
    else if (username.length < 4) newErrors.username = 'Mínimo 4 caracteres';

    if (!password) newErrors.password = 'Contraseña requerida';
    else if (password.length < 6) newErrors.password = 'Mínimo 6 caracteres';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      const form = formRef.current;
      if (form) {
        form.style.animation = 'none';
        form.offsetHeight;
        form.style.animation = 'shake 0.5s ease';
      }
      return;
    }

    setIsLoading(true);
    setLoginError(null);

    // Limpieza previa de sesión
    localStorage.removeItem('sgd_token');
    localStorage.removeItem('sgd_user');
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);

    try {
      console.log("Intentando login corporativo para:", formData.username);

      // ✅ USAMOS EL SISTEMA DE AUTH UNIFICADO
      const result = await authLogin(formData.username, formData.password);

      if (result.success) {
        console.log('Acceso autorizado por AuthContext');
        setLoginSuccess(true);
      } else {
        setLoginError(result.error || 'Credenciales incorrectas o error de servidor');
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error en flujo de autenticación:', error);
      setLoginError(error?.message || 'Error inesperado de conexión');
      setIsLoading(false);
    }
  };

  const handleChange = (field) => (e) => {
    setFormData(prev => ({ ...prev, [field]: e.target.value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: undefined }));
    }
    if (loginError) {
      setLoginError(null);
    }
  };

  if (loginSuccess) {
    return (
      <div className="auth-page min-h-screen remaster-auth-bg flex items-center justify-center p-4 relative bg-gradient-to-br from-gray-900 via-black to-gray-900">
        <Particles />
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-400/10 via-transparent to-amber-400/10" />
        <div className="relative max-w-md w-full text-center animate-scaleIn">
          <div className="remaster-auth-card auth-glass-card relative rounded-3xl p-12 shadow-2xl">

            <div className="w-24 h-24 bg-cyan-400/15 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <CheckCircle size={48} className="text-cyan-300" />
            </div>
            <h2 className="text-3xl font-bold auth-primary-text mb-2">¡Bienvenido!</h2>
            <p className="auth-secondary-text mb-6">Redirigiendo al Dashboard...</p>
            <div className="flex justify-center gap-2">
              <div className="w-3 h-3 bg-cyan-300 rounded-full animate-bounce" />
              <div className="w-3 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <div className="w-3 h-3 bg-amber-300 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="auth-page min-h-screen remaster-auth-bg flex items-center justify-center p-4 relative overflow-hidden"
      style={{
        background:
          'radial-gradient(circle at top, rgba(35,166,217,0.18), transparent 32%), linear-gradient(135deg, #d1e4e9 0%, #c1dce5 45%, #9bc6da 100%)',
      }}
    >
      <div
        className="absolute inset-0 bg-center bg-no-repeat bg-contain opacity-30"
        style={{ backgroundImage: "url('/koda-logo.jpeg')" }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-[#d1e4e9]/78 via-[#bdd8e3]/72 to-[#0d47a1]/24" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(35,166,217,0.18),transparent_50%)]" />
      <Particles />
      <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-[#23A6D9]/14 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/4 w-72 h-72 bg-[#D48924]/12 rounded-full blur-3xl pointer-events-none" />

      <div className="relative w-full max-w-md" ref={formRef}>
        <div className="remaster-auth-card auth-glass-card rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.37)] overflow-hidden">
          <div className="relative px-8 py-10 text-center auth-divider">
            <div className="flex justify-center mb-4 relative">
              <div
                className="w-36 h-36 rounded-full bg-gradient-to-br from-[#eaf4f6] via-[#d1e4e9] to-[#b7d6e2] flex items-center justify-center transition-all duration-300 overflow-hidden border border-[#1976D2]/25 shadow-[0_0_36px_rgba(25,118,210,0.18)]"
              >
                <img
                  src="/koda-mark.png"
                  alt="KODA"
                  className="h-full w-full object-cover"
                />
              </div>
            </div>
            <h1 className="text-3xl font-bold auth-primary-text tracking-tight">
              <span className="text-[#0D47A1]">KODA</span> <span className="text-[#23A6D9]">REMASTER</span>
            </h1>
            <p className="auth-secondary-text mt-2 text-sm flex items-center justify-center gap-2">
              <Lock size={14} />
              Sistema de Gestión Empresarial
            </p>

          </div>

          <div className="px-8 pb-8 pt-4">
            <form onSubmit={handleSubmit} className="space-y-5">
              <AnimatedInput
                id="username"
                label="Usuario Corporativo"
                value={formData.username}
                onChange={handleChange('username')}
                placeholder="ej: JPEREZ"
                icon={User}
                error={errors.username}
                showError={!!errors.username}
                autoComplete="username"
                required
              />

              <div>
                <AnimatedInput
                  id="password"
                  label="Contraseña Segura"
                  value={formData.password}
                  onChange={handleChange('password')}
                  placeholder="••••••••"
                  type={passwordType}
                  icon={Lock}
                  error={errors.password}
                  showError={!!errors.password}
                  autoComplete="current-password"
                  required
                  onTogglePassword={togglePassword}
                />

              </div>

              {loginError && (
                <div className="flex items-center gap-2 p-3 bg-amber-400/10 border border-amber-300/30 rounded-lg text-amber-200 text-sm animate-shake">
                  <AlertCircle size={18} />
                  <span>{loginError}</span>
                </div>
              )}

              <LoadingButton isLoading={isLoading}>
                <span className="flex items-center justify-center gap-2">
                  <Shield size={20} />
                  {isLoading ? 'ACCEDIENDO AL SISTEMA...' : 'ACCEDER AL SISTEMA'}
                </span>
              </LoadingButton>
            </form>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes fadeInUp { to { opacity: 1; transform: translateY(0); } }
        @keyframes shake { 0%,100%{transform:translateX(0);} 20%,60%{transform:translateX(-10px);} 40%,80%{transform:translateX(10px);} }
        @keyframes scaleIn { from { opacity:0; transform:scale(0.8); } to { opacity:1; transform:scale(1); } }
        @keyframes float { 0%,100%{transform:translateY(0) scale(1); opacity:0.2;} 50%{transform:translateY(-20px) scale(1.2); opacity:0.4;} }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-float { animation: float infinite ease-in-out; }
        .animate-shake { animation: shake 0.5s ease; }
        .animate-scaleIn { animation: scaleIn 0.5s ease forwards; }
        .animate-fadeIn { animation: fadeIn 0.3s ease; }

        .auth-page {
          --auth-text-primary: #0d47a1;
          --auth-text-secondary: #355f87;
          --auth-card-bg: rgba(232, 242, 245, 0.74);
          --auth-card-border: rgba(13, 71, 161, 0.14);
          --auth-footer-bg: rgba(212, 228, 235, 0.48);
          --auth-footer-border: rgba(25, 118, 210, 0.12);
          --auth-input-bg: rgba(242, 248, 250, 0.72);
          --auth-input-text: #0d305f;
          --auth-input-placeholder: #5f84a4;
          --auth-input-icon: #4b7196;
        }

        @media (prefers-color-scheme: dark) {
          .auth-page {
            --auth-text-primary: #f0f9ff;
            --auth-text-secondary: #c6e3f5;
            --auth-card-bg: rgba(4, 20, 35, 0.72);
            --auth-card-border: rgba(103, 232, 249, 0.16);
            --auth-footer-bg: rgba(3, 16, 30, 0.56);
            --auth-footer-border: rgba(56, 189, 248, 0.18);
            --auth-input-bg: rgba(8, 24, 40, 0.72);
            --auth-input-text: #f8fbff;
            --auth-input-placeholder: #8fb7d1;
            --auth-input-icon: #8fb7d1;
          }
        }

        .auth-glass-card {
          background: var(--auth-card-bg);
          border: 1px solid var(--auth-card-border);
          backdrop-filter: blur(14px);
        }

        .auth-divider {
          border-bottom: 1px solid var(--auth-footer-border);
        }

        .auth-footer {
          border-top: 1px solid var(--auth-footer-border);
          background: var(--auth-footer-bg);
        }

        .auth-primary-text,
        .auth-page .animate-scaleIn .remaster-auth-card h2 {
          color: var(--auth-text-primary);
        }

        .auth-secondary-text,
        .auth-footer-text,
        .auth-page .animate-scaleIn .remaster-auth-card p {
          color: var(--auth-text-secondary);
        }

        .auth-input-shell {
          background: var(--auth-input-bg);
        }

        .auth-input-control {
          color: var(--auth-input-text);
        }

        .auth-input-control::placeholder {
          color: var(--auth-input-placeholder);
        }

        .auth-input-icon,
        .auth-input-label-idle {
          color: var(--auth-input-icon);
        }

      `}</style>
    </div>
  );
};

export default function LoginPage() {
  const [showSplash, setShowSplash] = useState(true);

  const handleSplashComplete = () => {
    setShowSplash(false);
  };

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  return <LoginForm />;
}
