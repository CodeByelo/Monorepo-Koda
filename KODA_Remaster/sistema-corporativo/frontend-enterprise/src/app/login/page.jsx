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
    const totalDuration = 800;
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
      {/* Overlay de cuadricula industrial */}
      <div className="splash-grid-overlay" />
      <Particles />

      {/* Floating Aurora Orbs (Highly active/moving) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-15%] left-[-15%] w-[80vw] h-[80vw] bg-emerald-500/25 rounded-full blur-[110px] animate-orb-one" />
        <div className="absolute bottom-[-15%] right-[-15%] w-[85vw] h-[85vw] bg-[#38bdf8]/20 rounded-full blur-[120px] animate-orb-two" />
        <div className="absolute top-[20%] right-[-10%] w-[70vw] h-[70vw] bg-teal-500/22 rounded-full blur-[100px] animate-orb-three" />
        <div className="absolute bottom-[20%] left-[-10%] w-[75vw] h-[75vw] bg-[#0bbf8c]/25 rounded-full blur-[130px] animate-orb-four" />
      </div>

      <div className="splash-card" ref={loaderRef}>
        {/* Linea de escaneo laser */}
        <div className="scanline" />

        {/* Micro-badge de seguridad de red */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-bold text-[#0bbf8c] uppercase tracking-widest mb-6">
          <Shield size={10} className="animate-pulse text-emerald-400" /> Canal Seguro SSL Activo
        </div>

        {/* Logo/Subtitle de la empresa (sin KODA REMASTER text) */}
        <div className="logo-subtitle text-base font-semibold tracking-wider text-emerald-400">
          Sistema de Gestión Integral
        </div>

        {/* Loader Circular de Alta Tecnologia con Logo */}
        {showLoader && (
          <div className="cyber-loader-container" aria-hidden="true">
            <div className="cyber-ring cyber-ring-outer" />
            <div className="cyber-ring cyber-ring-middle" />
            <div className="cyber-ring cyber-ring-inner" />
            <div className="cyber-logo-wrapper">
              <img
                src="/LogoGlass.webp"
                alt="KODA Logo"
                className="w-full h-full object-cover rounded-full"
              />
            </div>
          </div>
        )}

        {/* Barra de progreso de carga */}
        <div className="progress-container">
          <div className="progress-label">
            <span>Inicializando sistema...</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {/* Lista de estados del sistema */}
        <div className="system-status">
          <div className={`status-item ${status[0] ? 'active' : ''}`}>
            <span className="status-dot" />
            <span className="status-text flex items-center gap-2">
              <Zap size={14} className={status[0] ? 'text-emerald-400 animate-pulse' : 'text-gray-500'} />
              Conectando a servidores...
            </span>
          </div>
          <div className={`status-item ${status[1] ? 'active' : ''}`}>
            <span className="status-dot" />
            <span className="status-text flex items-center gap-2">
              <Shield size={14} className={status[1] ? 'text-emerald-400' : 'text-gray-500'} />
              Verificando credenciales corporativas...
            </span>
          </div>
          <div className={`status-item ${status[2] ? 'active' : ''}`}>
            <span className="status-dot" />
            <span className="status-text flex items-center gap-2">
              <CheckCircle size={14} className={status[2] ? 'text-emerald-400' : 'text-gray-500'} />
              Cargando datos industriales...
            </span>
          </div>
        </div>

        {/* Notificacion de carga lista */}
        <p className={`loading-complete ${progress === 100 ? 'visible' : ''}`}>
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
  const colors = ['bg-emerald-950', 'bg-emerald-700', 'bg-teal-500', 'bg-emerald-500', 'bg-amber-400'];

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
      <p className={`text-xs ${strength >= 3 ? 'text-emerald-400' : strength >= 2 ? 'text-emerald-300' : 'text-amber-300'
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
    <div className="relative group">
      {/* Glow effect behind input */}
      <div className={`absolute -inset-0.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 opacity-0 group-hover:opacity-10 transition duration-500 blur-sm pointer-events-none ${isFocused ? 'opacity-25' : ''}`} />
      
      <div className={`relative flex items-center rounded-xl transition-all duration-300 ${
        error 
          ? 'bg-red-500/5 border border-red-500/40 shadow-[0_0_15px_rgba(239,68,68,0.1)]' 
          : isFocused 
            ? 'bg-[#041d20]/80 border border-emerald-500/50 shadow-[0_0_15px_rgba(11,191,140,0.2)]'
            : 'bg-[#06181a]/60 border border-emerald-500/15 hover:border-emerald-500/30'
      }`}>
        {/* Floating tech badge label */}
        <span className={`absolute left-12 transition-all duration-300 pointer-events-none select-none ${
          isFocused || hasValue
            ? '-top-2.5 left-4 text-[9px] px-2 py-0.5 bg-[#082226] border border-emerald-500/30 rounded text-emerald-400 font-bold uppercase tracking-widest'
            : 'text-sm text-emerald-500/50'
        }`}>
          {label}
        </span>

        <div className={`pl-4 pr-2 transition-colors duration-300 ${isFocused ? 'text-emerald-400' : 'text-emerald-500/40'}`}>
          <Icon size={18} />
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
          className="w-full px-3 py-4 bg-transparent text-white placeholder-emerald-500/30 focus:outline-none text-sm font-medium tracking-wide"
        />

        {/* Toggle Password Visibility Button */}
        {id === 'password' && (
          <button
            type="button"
            onClick={props.onTogglePassword}
            className="pr-4 text-emerald-500/40 hover:text-emerald-400 transition-colors focus:outline-none"
          >
            {type === 'password' ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        )}

        {value && !error && id !== 'password' && (
          <div className="pr-4 text-emerald-400 animate-fadeIn">
            <CheckCircle size={18} />
          </div>
        )}
      </div>

      {error && showError && (
        <div className="flex items-center mt-1.5 ml-2 text-red-400 text-xs animate-shake">
          <AlertCircle size={12} className="mr-1" />
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
    className={`relative overflow-hidden w-full py-4 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 disabled:transform-none disabled:cursor-not-allowed ${
      isLoading
        ? 'bg-slate-800 text-slate-500 border border-slate-700'
        : 'bg-gradient-to-r from-[#0bbf8c] via-[#0da67b] to-[#075159] text-white shadow-[0_0_20px_rgba(11,191,140,0.3)] hover:shadow-[0_0_25px_rgba(11,191,140,0.5)] border border-emerald-400/20 bg-size-200 hover:bg-pos-100'
    }`}
  >
    {isLoading ? (
      <div className="flex items-center justify-center gap-1.5">
        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
        <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
      </div>
    ) : (
      children
    )}
  </button>
);

const Particles = () => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    let width = canvas.width = window.innerWidth;
    let height = canvas.height = window.innerHeight;

    const handleResize = () => {
      if (canvas) {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
      }
    };
    window.addEventListener('resize', handleResize);

    const isMobile = width < 768;
    const particleCount = Math.min(Math.floor((width * height) / (isMobile ? 15000 : 9000)), isMobile ? 40 : 130);
    const particles = [];

    class Particle {
      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.75;
        this.vy = (Math.random() - 0.5) * 0.75;
        this.radius = Math.random() * 2 + 1;
        this.color = Math.random() > 0.5 ? 'rgba(11, 191, 140, ' : 'rgba(56, 189, 248, ';
      }

      draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.color + '0.7)';
        ctx.fill();
      }

      update() {
        this.x += this.vx;
        this.y += this.vy;

        if (this.x < 0 || this.x > width) this.vx = -this.vx;
        if (this.y < 0 || this.y > height) this.vy = -this.vy;
      }
    }

    for (let i = 0; i < particleCount; i++) {
      particles.push(new Particle());
    }

    const drawLines = () => {
      const maxDistance = isMobile ? 100 : 135;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < maxDistance) {
            const alpha = (1 - dist / maxDistance) * 0.22;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(11, 191, 140, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        }
      }
    };

    const animate = () => {
      ctx.clearRect(0, 0, width, height);

      particles.forEach(p => {
        p.update();
        p.draw();
      });

      drawLines();
      animationFrameId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none z-0"
      style={{ mixBlendMode: 'screen' }}
    />
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
      }, 150);
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
            --auth-text-primary: #ffffff;
            --auth-text-secondary: #88aba7;
            --auth-card-bg: rgba(8, 28, 31, 0.65);
            --auth-card-border: rgba(11, 191, 140, 0.2);
            --auth-footer-bg: rgba(4, 15, 17, 0.6);
            --auth-footer-border: rgba(11, 191, 140, 0.12);
            --auth-input-bg: rgba(6, 22, 24, 0.65);
            --auth-input-text: #f4fbfa;
            --auth-input-placeholder: #4d7a76;
            --auth-input-icon: #0bbf8c;
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
        `}</style>
        <Particles />
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/10 via-transparent to-amber-400/10" />
        <div className="relative max-w-md w-full text-center animate-scaleIn">
          <div className="remaster-auth-card auth-glass-card relative rounded-3xl p-12 shadow-2xl">

            <div className="w-24 h-24 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <CheckCircle size={48} className="text-emerald-400" />
            </div>
            <h2 className="text-3xl font-bold auth-primary-text mb-2">¡Bienvenido!</h2>
            <p className="auth-secondary-text mb-6">Redirigiendo al Dashboard...</p>
            <div className="flex justify-center gap-2">
              <div className="w-3 h-3 bg-emerald-400 rounded-full animate-bounce" />
              <div className="w-3 h-3 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
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
    >
      {/* Overlay de cuadricula industrial en movimiento */}
      <div className="splash-grid-overlay" />
      
      {/* Floating Aurora Orbs (Highly active/moving) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-15%] left-[-15%] w-[80vw] h-[80vw] bg-emerald-500/25 rounded-full blur-[110px] animate-orb-one" />
        <div className="absolute bottom-[-15%] right-[-15%] w-[85vw] h-[85vw] bg-[#38bdf8]/20 rounded-full blur-[120px] animate-orb-two" />
        <div className="absolute top-[20%] right-[-10%] w-[70vw] h-[70vw] bg-teal-500/22 rounded-full blur-[100px] animate-orb-three" />
        <div className="absolute bottom-[20%] left-[-10%] w-[75vw] h-[75vw] bg-[#0bbf8c]/25 rounded-full blur-[130px] animate-orb-four" />
      </div>

      {/* Fondo degradado translúcido para mantener el fondo y orbes visibles */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#020d0f]/30 to-[#010506]/70 z-0" />
      <Particles />

      <div className="relative w-full max-w-md z-10" ref={formRef}>
        <div className="remaster-auth-card auth-glass-card rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.45)] overflow-hidden border border-emerald-500/20">
          <div className="relative px-8 py-8 text-center auth-divider border-b border-emerald-500/10">
            <div className="flex justify-center mb-4 relative">
              <div
                className="w-20 h-20 flex items-center justify-center bg-gradient-to-tr from-white/10 to-white/5 rounded-full border border-emerald-500/30 shadow-[0_0_20px_rgba(11,191,140,0.25)] p-0.5 backdrop-blur-md overflow-hidden transition-all duration-300 hover:scale-105"
              >
                <img
                  src="/LogoGlass.webp"
                  alt="KODA Logo"
                  className="h-full w-full object-cover rounded-full"
                />
              </div>
            </div>
            
            <h2 className="text-xl font-bold tracking-wider text-white uppercase mt-2">
              Sistema de Gestión Empresarial
            </h2>
            <p className="text-emerald-400/80 mt-1.5 text-xs flex items-center justify-center gap-1.5 font-bold tracking-widest uppercase">
              <Lock size={12} className="animate-pulse" />
              Canal de Acceso Seguro
            </p>

          </div>

          <div className="px-8 pb-8 pt-6">
            <form onSubmit={handleSubmit} className="space-y-6">
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
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-200 text-sm animate-shake">
                  <AlertCircle size={18} />
                  <span>{loginError}</span>
                </div>
              )}

              <LoadingButton isLoading={isLoading}>
                <span className="flex items-center justify-center gap-2">
                  <Shield size={16} />
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
          --auth-text-primary: #ffffff;
          --auth-text-secondary: #88aba7;
          --auth-card-bg: rgba(8, 28, 31, 0.65);
          --auth-card-border: rgba(11, 191, 140, 0.2);
          --auth-footer-bg: rgba(4, 15, 17, 0.6);
          --auth-footer-border: rgba(11, 191, 140, 0.12);
          --auth-input-bg: rgba(6, 22, 24, 0.65);
          --auth-input-text: #f4fbfa;
          --auth-input-placeholder: #4d7a76;
          --auth-input-icon: #0bbf8c;
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

  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('koda_login_splash_played') === 'true') {
      setShowSplash(false);
    }
  }, []);

  const handleSplashComplete = () => {
    setShowSplash(false);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('koda_login_splash_played', 'true');
    }
  };

  if (showSplash) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  return <LoginForm />;
}
