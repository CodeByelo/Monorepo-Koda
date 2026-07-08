import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../providers/AuthProvider';
import { api } from '../api/client';
import { Shield, Lock, User, AlertTriangle, Eye, EyeOff, CheckCircle } from 'lucide-react';

const usePasswordToggle = () => {
  const [visible, setVisible] = useState(false);
  const toggle = useCallback(() => setVisible(v => !v), []);
  return { type: visible ? 'text' : 'password', icon: visible ? <EyeOff size={18} /> : <Eye size={18} />, toggle };
};

const AnimatedInput = ({
  id, label, value, onChange, type, placeholder, icon: Icon,
  error, autoComplete, required, ...props
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  type: string;
  placeholder: string;
  icon: any;
  error?: string | null;
  autoComplete?: string;
  required?: boolean;
  onTogglePassword?: () => void;
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
            : 'text-sm text-emerald-500/55'
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
        {id === 'password' && props.onTogglePassword && (
          <button
            type="button"
            onClick={props.onTogglePassword}
            className="pr-4 text-emerald-500/40 hover:text-emerald-400 transition-colors focus:outline-none"
          >
            {type === 'password' ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
        )}

        {value && !error && id !== 'password' && (
          <div className="pr-4 text-emerald-400">
            <CheckCircle size={18} />
          </div>
        )}
      </div>
    </div>
  );
};

const Particles = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let animationFrameId: number;

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
    const particleCount = Math.min(Math.floor((width * height) / (isMobile ? 15000 : 9000)), isMobile ? 40 : 120);
    const particles: Particle[] = [];

    class Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      color: string;

      constructor() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = (Math.random() - 0.5) * 0.75;
        this.vy = (Math.random() - 0.5) * 0.75;
        this.radius = Math.random() * 2 + 1;
        this.color = Math.random() > 0.5 ? 'rgba(11, 191, 140, ' : 'rgba(56, 189, 248, ';
      }

      draw() {
        if (!ctx) return;
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
      if (!ctx) return;
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
      if (!ctx) return;
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

export const Login: React.FC = () => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { type: passwordType, toggle: togglePassword } = usePasswordToggle();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) return;

    setLoading(true);
    setError(null);

    try {
      const response = await api.post<{ access_token: string }>('/auth/login', {
        email: identifier.includes('@') ? identifier : undefined,
        username: !identifier.includes('@') ? identifier : undefined,
        password
      });

      const success = login(response.access_token);
      if (!success) {
        setError('Acceso denegado: Se requiere rol de Desarrollador para ingresar a esta consola.');
      }
    } catch (err: any) {
      setError(err.message || 'Error de credenciales o de red.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page min-h-screen remaster-auth-bg flex items-center justify-center p-4 relative overflow-hidden font-sans">

      {/* Grid overlay for high-tech look */}
      <div className="splash-grid-overlay" />

      {/* Floating Aurora Orbs (Highly active/moving) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-15%] left-[-15%] w-[80vw] h-[80vw] bg-[#0bbf8c]/15 rounded-full blur-[110px] animate-orb-one" />
        <div className="absolute bottom-[-15%] right-[-15%] w-[85vw] h-[85vw] bg-[#38bdf8]/10 rounded-full blur-[120px] animate-orb-two" />
        <div className="absolute top-[20%] right-[-10%] w-[70vw] h-[70vw] bg-teal-500/12 rounded-full blur-[100px] animate-orb-three" />
        <div className="absolute bottom-[20%] left-[-10%] w-[75vw] h-[75vw] bg-[#0bbf8c]/15 rounded-full blur-[130px] animate-orb-four" />
      </div>

      {/* Gradient mask */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#020d0f]/30 to-[#010506]/75 z-0" />

      {/* Connected Nodes Background */}
      <Particles />

      <div className="relative w-full max-w-md z-10">
        <div className="remaster-auth-card auth-glass-card rounded-3xl shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] overflow-hidden border border-emerald-500/20">

          {/* Header Panel */}
          <div className="relative px-8 py-8 text-center border-b border-emerald-500/10">
            <div className="flex justify-center mb-4 relative">
              <div className="w-20 h-20 flex items-center justify-center bg-gradient-to-tr from-white/10 to-white/5 rounded-full border border-emerald-500/35 shadow-[0_0_20px_rgba(11,191,140,0.25)] p-0.5 backdrop-blur-md overflow-hidden transition-all duration-300 hover:scale-105">
                <img
                  src="/dev/LogoGlass.png"
                  alt="KODA Logo"
                  className="h-full w-full object-cover rounded-full"
                />
              </div>
            </div>

            <h2 className="text-xl font-bold tracking-wider text-white uppercase mt-2">
              Consola KODA
            </h2>
            <p className="text-emerald-400 mt-1.5 text-xs flex items-center justify-center gap-1.5 font-extrabold tracking-widest uppercase">
              <Lock size={12} className="animate-pulse" />
              Canal de Acceso Seguro - Desarrollador
            </p>
          </div>

          <div className="px-8 pb-8 pt-6">

            {/* Error notifications */}
            {error && (
              <div className="flex gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-xs font-bold text-red-200 mb-6 animate-pulse">
                <AlertTriangle size={18} className="text-red-400 shrink-0" />
                <p className="leading-tight">{error}</p>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <AnimatedInput
                id="identifier"
                label="Usuario o Correo"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="ej: JPEREZ o admin@empresa.com"
                type="text"
                icon={User}
                autoComplete="username"
                required
              />

              <AnimatedInput
                id="password"
                label="Clave de Acceso"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                type={passwordType}
                icon={Lock}
                autoComplete="current-password"
                required
                onTogglePassword={togglePassword}
              />

              <button
                type="submit"
                disabled={loading}
                className={`relative overflow-hidden w-full py-4 rounded-xl font-bold text-sm uppercase tracking-wider transition-all duration-300 transform hover:-translate-y-0.5 active:translate-y-0 disabled:transform-none disabled:cursor-not-allowed ${
                  loading
                    ? 'bg-slate-800 text-slate-500 border border-slate-700'
                    : 'bg-gradient-to-r from-[#0bbf8c] via-[#0da67b] to-[#075159] text-white shadow-[0_0_20px_rgba(11,191,140,0.3)] hover:shadow-[0_0_25px_rgba(11,191,140,0.5)] border border-emerald-400/20'
                }`}
              >
                {loading ? (
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <span className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                  </div>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <Shield size={16} />
                    <span>Autenticar Firma Digital</span>
                  </span>
                )}
              </button>
            </form>
          </div>

          {/* Footer message */}
          <div className="px-8 py-4 bg-[#040f11]/60 border-t border-emerald-500/10 text-center">
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
              Acceso exclusivo para desarrolladores. <br/>Los eventos de autenticación son registrados.
            </p>
          </div>

        </div>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

        body {
          font-family: 'Inter', sans-serif !important;
        }

        .auth-page {
          background-color: #0B1313;
          --auth-card-bg: rgba(8, 28, 31, 0.65);
          --auth-card-border: rgba(11, 191, 140, 0.2);
          --auth-input-bg: rgba(6, 22, 24, 0.65);
        }

        /* Force transparent/dark background for Chrome Autofill */
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-box-shadow: 0 0 0 30px #06181a inset !important;
          -webkit-text-fill-color: #ffffff !important;
          transition: background-color 5000s ease-in-out 0s;
        }

        .auth-glass-card {
          background: var(--auth-card-bg);
          border: 1px solid var(--auth-card-border);
          backdrop-filter: blur(14px);
          -webkit-backdrop-filter: blur(14px);
        }

        .splash-grid-overlay {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(11, 191, 140, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(11, 191, 140, 0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          background-position: center;
          pointer-events: none;
        }

        /* Float animations for background orbs */
        @keyframes orb-float-one {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, -60px) scale(1.1); }
        }
        @keyframes orb-float-two {
          0%, 100% { transform: translate(0, 0) scale(1.1); }
          50% { transform: translate(-50px, 40px) scale(0.9); }
        }

        .animate-orb-one {
          animation: orb-float-one 20s infinite ease-in-out;
        }
        .animate-orb-two {
          animation: orb-float-two 25s infinite ease-in-out;
        }
        .animate-orb-three {
          animation: orb-float-one 18s infinite ease-in-out reverse;
        }
        .animate-orb-four {
          animation: orb-float-two 22s infinite ease-in-out reverse;
        }
      `}</style>
    </div>
  );
};
