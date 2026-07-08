//  Koda ERP · koda-frontend/src/pages/Dashboard/OmniscienceDashboard.tsx
import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { 
  ShieldAlert, 
  Activity, 
  Settings, 
  Users, 
  Landmark, 
  Briefcase, 
  Scale, 
  Cpu, 
  Target, 
  Heart, 
  Zap, 
  Globe, 
  Code, 
  TrendingUp, 
  MessageSquare,
  FileText,
  Clock,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  X,
  RefreshCw
} from 'lucide-react';
import { api } from '@/api/client';

// Interfaces para la respuesta del backend
interface TelemetryData {
  gerencia_id: number;
  volumen_actividad: number;
  friccion_porcentaje: number;
  tiempo_promedio_horas: number | null;
  estado_salud: 'Optimo' | 'Advertencia' | 'Critico';
}

// Configuración visual por gerencia para mapear IDs
interface GerenciaConfig {
  name: string;
  acronym: string;
  icon: React.ComponentType<any>;
  color: string; // Tailwind hex or rgb equivalents
  glowColor: string; // Drop shadow glow
}

const GERENCIA_MAP: Record<number, GerenciaConfig> = {
  4: { name: 'Gerencia General', acronym: 'GG', icon: Briefcase, color: '#3B82F6', glowColor: 'rgba(59, 130, 246, 0.4)' },
  5: { name: 'Auditoría Interna', acronym: 'AUD', icon: ShieldAlert, color: '#8B5CF6', glowColor: 'rgba(139, 92, 246, 0.4)' },
  6: { name: 'Consultoría Jurídica', acronym: 'JUR', icon: Scale, color: '#06B6D4', glowColor: 'rgba(6, 182, 212, 0.4)' },
  7: { name: 'Planificación y Presupuesto', acronym: 'PLAN', icon: Target, color: '#EC4899', glowColor: 'rgba(236, 72, 153, 0.4)' },
  8: { name: 'Administración', acronym: 'ADM', icon: Landmark, color: '#0EA5E9', glowColor: 'rgba(14, 165, 233, 0.4)' },
  9: { name: 'Gestión Humana', acronym: 'RRHH', icon: Users, color: '#F43F5E', glowColor: 'rgba(244, 63, 94, 0.4)' },
  10: { name: 'Tecnologías de la Info. y Comunicaciones', acronym: 'TIC', icon: Cpu, color: '#10B981', glowColor: 'rgba(16, 185, 129, 0.4)' },
  11: { name: 'Proyectos', acronym: 'PROY', icon: Target, color: '#D97706', glowColor: 'rgba(217, 119, 6, 0.4)' },
  12: { name: 'Adecuaciones y Mejoras', acronym: 'ADEC', icon: Settings, color: '#F97316', glowColor: 'rgba(249, 115, 22, 0.4)' },
  13: { name: 'ASHO (Seguridad Laboral)', acronym: 'ASHO', icon: Heart, color: '#EF4444', glowColor: 'rgba(239, 68, 68, 0.4)' },
  14: { name: 'Atención al Ciudadano', acronym: 'ATC', icon: MessageSquare, color: '#EC4899', glowColor: 'rgba(236, 72, 153, 0.4)' },
  15: { name: 'Comercialización', acronym: 'COM', icon: TrendingUp, color: '#6366F1', glowColor: 'rgba(99, 102, 241, 0.4)' },
  16: { name: 'Energía Alternativa y Eficiencia', acronym: 'EE', icon: Zap, color: '#F59E0B', glowColor: 'rgba(245, 158, 11, 0.4)' },
  17: { name: 'Gestión Comunal', acronym: 'COMU', icon: Globe, color: '#A855F7', glowColor: 'rgba(168, 85, 247, 0.4)' },
  20: { name: 'Tecnología', acronym: 'TEC', icon: Code, color: '#10B981', glowColor: 'rgba(16, 185, 129, 0.4)' },
  21: { name: 'Operaciones', acronym: 'OP', icon: Activity, color: '#EF4444', glowColor: 'rgba(239, 68, 68, 0.4)' },
  22: { name: 'Tecnología', acronym: 'TEC', icon: Code, color: '#10B981', glowColor: 'rgba(16, 185, 129, 0.4)' }
};

const DEFAULT_GERENCIA: GerenciaConfig = {
  name: 'Gerencia Operativa',
  acronym: 'GER',
  icon: HelpCircle,
  color: '#94A3B8',
  glowColor: 'rgba(148, 163, 184, 0.4)'
};

// Componente para la cabecera de la red analítica
const NetworkHeader = ({ loading, onRefresh }: { loading: boolean; onRefresh: () => void }) => (
  <header className="bg-[#0B0B14]/85 border border-[#1E1E38]/60 backdrop-blur-xl p-6 rounded-3xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-[0_4px_30px_rgba(0,0,0,0.4)]">
    <div className="space-y-1">
      <div className="bg-[#10B981]/10 px-3 py-1 rounded-full w-fit mb-2 border border-[#10B981]/30">
        <span className="text-[9px] font-black text-[#10B981] uppercase tracking-widest flex items-center gap-1.5">
          <Activity size={10} className="animate-pulse" /> Telemetría Pasiva en Tiempo Real
        </span>
      </div>
      <h1 className="text-3xl font-black text-white tracking-tighter uppercase">Dashboard Omniscience</h1>
      <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Topología de Red Operativa & Salud de Gerencias (Últimos 30 días)</p>
    </div>
    
    <div className="flex gap-3">
      <button 
        onClick={onRefresh}
        disabled={loading}
        className="flex items-center gap-2 bg-[#1E1E38]/80 text-white border border-[#2D2D54]/80 px-4 py-2.5 rounded-xl font-bold text-xs hover:bg-[#2D2D54] transition-all duration-300 disabled:opacity-50 active:scale-95 text-slate-300"
      >
        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        Sincronizar
      </button>
      <Link 
        to="/" 
        className="flex items-center gap-2 bg-[#10B981] text-black px-4 py-2.5 rounded-xl font-black text-xs hover:bg-[#0D9488] transition-all duration-300 shadow-[0_0_15px_rgba(16,185,129,0.3)] active:scale-95"
      >
        Volver al Panel
      </Link>
    </div>
  </header>
);

export default function OmniscienceDashboard() {
  const [data, setData] = useState<TelemetryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<(TelemetryData & { config: GerenciaConfig }) | null>(null);
  const svgContainerRef = useRef<SVGSVGElement | null>(null);

  const fetchTelemetry = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await api.get<TelemetryData[]>('/api/v1/analytics/telemetry/gerencias');
      setData(res);
    } catch (err: any) {
      console.error("Error fetching telemetry:", err);
      setError(err.message || "Error al conectar con el motor analítico.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTelemetry();
  }, []);

  // Calcular las posiciones en círculo o elipse
  const centerX = 400;
  const centerY = 300;
  const radiusX = 280;
  const radiusY = 200;

  const getHealthBorderClass = (health: 'Optimo' | 'Advertencia' | 'Critico') => {
    switch (health) {
      case 'Optimo': return 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.4)]';
      case 'Advertencia': return 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)] animate-pulse';
      case 'Critico': return 'border-red-500 shadow-[0_0_20px_rgba(239,68,68,0.6)] border-2 animate-bounce';
    }
  };

  const getHealthIconColor = (health: 'Optimo' | 'Advertencia' | 'Critico') => {
    switch (health) {
      case 'Optimo': return 'text-emerald-400';
      case 'Advertencia': return 'text-amber-400';
      case 'Critico': return 'text-red-400';
    }
  };

  // Mapeamos la respuesta al grafo
  const mappedNodes = data.map((item, index) => {
    const config = GERENCIA_MAP[item.gerencia_id] || DEFAULT_GERENCIA;
    const angle = (index / data.length) * 2 * Math.PI - Math.PI / 2; // Iniciar arriba
    const x = centerX + radiusX * Math.cos(angle);
    const y = centerY + radiusY * Math.sin(angle);
    return { ...item, config, x, y };
  });

  return (
    <div className="min-h-screen bg-[#050508] text-white p-6 space-y-6 flex flex-col font-sans relative overflow-hidden">
      
      {/* Background neon glows */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-emerald-950/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-red-950/10 rounded-full blur-3xl pointer-events-none"></div>

      <NetworkHeader loading={loading} onRefresh={fetchTelemetry} />

      {error ? (
        <div className="bg-red-950/30 border border-red-500/20 p-8 rounded-3xl text-center space-y-3 z-10 my-auto">
          <ShieldAlert size={48} className="text-red-500 mx-auto animate-bounce" />
          <h3 className="text-xl font-black uppercase">Fallo en la Red de Auditoría</h3>
          <p className="text-slate-400 font-bold text-xs uppercase max-w-md mx-auto">{error}</p>
          <button 
            onClick={fetchTelemetry}
            className="bg-red-600 hover:bg-red-700 text-white font-black px-6 py-2.5 rounded-xl uppercase text-xs tracking-wider transition-all duration-300"
          >
            Reintentar Conexión
          </button>
        </div>
      ) : loading ? (
        <div className="flex flex-col justify-center items-center flex-1 space-y-4 min-h-[50vh] z-10">
          <div className="w-12 h-12 border-4 border-[#10B981] border-t-transparent rounded-full animate-spin"></div>
          <div className="text-center text-emerald-400 font-bold text-xs uppercase tracking-widest animate-pulse">
            Mapeando Red del Ledger Inmutable...
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-6 relative z-10 items-stretch">
          
          {/* TOPOLOGÍA NETWORK CONTAINER */}
          <div className="lg:col-span-3 bg-[#0B0B14]/85 border border-[#1E1E38]/60 backdrop-blur-xl rounded-3xl shadow-[0_4px_30px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col justify-between min-h-[600px] relative">
            
            {/* Visual indicators */}
            <div className="absolute top-4 left-6 flex gap-4 text-[9px] font-black uppercase tracking-widest text-slate-400">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span>Óptimo (&lt;10%)</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span>Advertencia (10%-25%)</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500"></span>Crítico (&gt;25%)</span>
            </div>

            <div className="absolute top-4 right-6 text-[10px] font-bold uppercase text-slate-500">
              Dispositivo: Observador Pasivo
            </div>

            {/* SVG Network Canvas */}
            <div className="flex-1 flex items-center justify-center p-4">
              <svg 
                ref={svgContainerRef}
                viewBox="0 0 800 600" 
                className="w-full h-full max-h-[550px] select-none"
                style={{ overflow: 'visible' }}
              >
                {/* Definiciones para filtros y glows SVG */}
                <defs>
                  <filter id="glow-emerald" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="glow-amber" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="8" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="12" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* ENLACES / EDGES (Dashed moving links) */}
                {mappedNodes.map((node, i) => {
                  const getStrokeColor = () => {
                    switch(node.estado_salud) {
                      case 'Optimo': return '#10B981';
                      case 'Advertencia': return '#F59E0B';
                      case 'Critico': return '#EF4444';
                    }
                  };
                  return (
                    <g key={`edge-${i}`}>
                      {/* Línea sutil de base */}
                      <line 
                        x1={centerX} 
                        y1={centerY} 
                        x2={node.x} 
                        y2={node.y} 
                        stroke="#1E1E38" 
                        strokeWidth="1.5" 
                        strokeOpacity="0.4"
                      />
                      {/* Línea animada (Flujo de eventos) */}
                      <line 
                        x1={centerX} 
                        y1={centerY} 
                        x2={node.x} 
                        y2={node.y} 
                        stroke={getStrokeColor()} 
                        strokeWidth="1.5" 
                        strokeDasharray="8 12" 
                        strokeOpacity="0.75"
                      >
                        <animate 
                          attributeName="stroke-dashoffset" 
                          values="100;0" 
                          dur="3s" 
                          repeatCount="indefinite" 
                        />
                      </line>
                    </g>
                  );
                })}

                {/* NÚCLEO CENTRAL (BÚNKER ERP) */}
                <g transform={`translate(${centerX}, ${centerY})`} className="cursor-pointer">
                  {/* Círculo pulsante de fondo */}
                  <circle r="45" fill="rgba(16, 185, 129, 0.05)" stroke="rgba(16, 185, 129, 0.2)" strokeWidth="1">
                    <animate attributeName="r" values="45;55;45" dur="4s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.2;0.05;0.2" dur="4s" repeatCount="indefinite" />
                  </circle>
                  <circle r="36" fill="#0A0A0F" stroke="#10B981" strokeWidth="2.5" filter="url(#glow-emerald)" />
                  <foreignObject x="-20" y="-20" width="40" height="40">
                    <div className="w-full h-full flex items-center justify-center text-emerald-400">
                      <ShieldAlert size={24} className="animate-pulse" />
                    </div>
                  </foreignObject>
                  <text y="55" textAnchor="middle" fill="#10B981" className="text-[10px] font-black uppercase tracking-widest font-mono">Ledger Core</text>
                </g>

                {/* NODOS DE GERENCIAS */}
                {mappedNodes.map((node, i) => {
                  const getGlowFilter = (health: string) => {
                    if (health === 'Optimo') return 'url(#glow-emerald)';
                    if (health === 'Advertencia') return 'url(#glow-amber)';
                    return 'url(#glow-red)';
                  };

                  const getStrokeColor = (health: string) => {
                    if (health === 'Optimo') return '#10B981';
                    if (health === 'Advertencia') return '#F59E0B';
                    return '#EF4444';
                  };

                  const isSelected = selectedNode?.gerencia_id === node.gerencia_id;
                  const Icon = node.config.icon;

                  return (
                    <g 
                      key={`node-${node.gerencia_id}`}
                      transform={`translate(${node.x}, ${node.y})`}
                      className="cursor-pointer group"
                      onClick={() => setSelectedNode(node)}
                    >
                      {/* Pulse outer circle for critical/warning */}
                      {node.estado_salud !== 'Optimo' && (
                        <circle r="30" fill="none" stroke={getStrokeColor(node.estado_salud)} strokeWidth="1">
                          <animate attributeName="r" values="22;32;22" dur="2s" repeatCount="indefinite" />
                          <animate attributeName="stroke-opacity" values="0.8;0;0.8" dur="2s" repeatCount="indefinite" />
                        </circle>
                      )}

                      {/* Main Node Circle */}
                      <circle 
                        r="22" 
                        fill={isSelected ? '#14142B' : '#0B0B14'} 
                        stroke={getStrokeColor(node.estado_salud)} 
                        strokeWidth={isSelected ? 3 : 1.5} 
                        filter={getGlowFilter(node.estado_salud)}
                        className="transition-all duration-300 group-hover:scale-110"
                      />

                      {/* Node Icon inside ForeignObject */}
                      <foreignObject x="-12" y="-12" width="24" height="24" className="pointer-events-none">
                        <div className={`w-full h-full flex items-center justify-center ${getHealthIconColor(node.estado_salud)} group-hover:scale-110 transition-transform duration-300`}>
                          <Icon size={14} />
                        </div>
                      </foreignObject>

                      {/* Acronym / Badge */}
                      <g transform="translate(0, -30)">
                        <rect 
                          x="-18" 
                          y="-7" 
                          width="36" 
                          height="14" 
                          rx="4" 
                          fill="#1E1E38" 
                          stroke={node.config.color} 
                          strokeWidth="0.5"
                          opacity="0.9"
                        />
                        <text 
                          textAnchor="middle" 
                          y="3" 
                          fill="#FFFFFF" 
                          className="text-[8px] font-black font-mono"
                        >
                          {node.config.acronym}
                        </text>
                      </g>

                      {/* Name below node */}
                      <text 
                        y="35" 
                        textAnchor="middle" 
                        fill="#94A3B8" 
                        className="text-[9px] font-bold uppercase tracking-wide opacity-80 group-hover:opacity-100 transition-opacity"
                      >
                        {node.config.name.length > 20 ? `${node.config.name.substring(0, 18)}...` : node.config.name}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            
            {/* Footer indicators */}
            <div className="p-6 border-t border-[#1E1E38]/60 bg-[#07070D] flex justify-between items-center text-[10px] font-black uppercase text-slate-500 tracking-wider">
              <span>Auditoría Interna Activa</span>
              <span>Koda ERP Enterprise Edition v2.0</span>
            </div>
          </div>

          {/* SIDEBAR DETALLE DE NODO (Glassmorphism panel) */}
          <div className="bg-[#0B0B14]/85 border border-[#1E1E38]/60 backdrop-blur-xl rounded-3xl p-6 shadow-[0_4px_30px_rgba(0,0,0,0.5)] flex flex-col justify-between min-h-[600px] z-10 relative">
            {selectedNode ? (
              <div className="space-y-6 flex-1 flex flex-col justify-between">
                
                {/* Node info header */}
                <div className="space-y-4">
                  <div className="flex justify-between items-start">
                    <div className="bg-[#1E1E38] px-3 py-1 rounded-full border border-[#2D2D54]">
                      <span className="text-[9px] font-mono font-black tracking-widest text-white">ID: {selectedNode.gerencia_id}</span>
                    </div>
                    <button 
                      onClick={() => setSelectedNode(null)}
                      className="p-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-[#1E1E38]" style={{ border: `1.5px solid ${selectedNode.config.color}` }}>
                      {React.createElement(selectedNode.config.icon, { size: 20, style: { color: selectedNode.config.color } })}
                    </div>
                    <div>
                      <h2 className="text-lg font-black leading-tight tracking-tight text-white">{selectedNode.config.name}</h2>
                      <p className="text-[9px] font-bold uppercase text-slate-400 tracking-wider mt-0.5">Categoría: Operativa</p>
                    </div>
                  </div>
                  
                  {/* Health status indicator card */}
                  <div className={`p-4 rounded-2xl border flex items-center justify-between bg-white/[0.02] ${getHealthBorderClass(selectedNode.estado_salud)}`}>
                    <div className="space-y-0.5">
                      <p className="text-[9px] font-black uppercase text-slate-500 tracking-widest">Salud Operativa</p>
                      <p className="text-sm font-black uppercase tracking-tight text-white">{selectedNode.estado_salud}</p>
                    </div>
                    {selectedNode.estado_salud === 'Optimo' && <CheckCircle size={22} className="text-emerald-500" />}
                    {selectedNode.estado_salud === 'Advertencia' && <AlertTriangle size={22} className="text-amber-500 animate-pulse" />}
                    {selectedNode.estado_salud === 'Critico' && <ShieldAlert size={22} className="text-red-500 animate-bounce" />}
                  </div>
                </div>

                {/* Metrics Breakdown */}
                <div className="space-y-4 my-auto">
                  
                  <div className="bg-white/[0.02] border border-[#1E1E38] p-4 rounded-2xl space-y-1">
                    <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-400 tracking-wider">
                      <span>Volumen de Actividad</span>
                      <FileText size={12} className="text-blue-400" />
                    </div>
                    <h4 className="text-2xl font-black text-white tracking-tight">{selectedNode.volumen_actividad}</h4>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Eventos registrados en los últimos 30 días</p>
                  </div>

                  <div className="bg-white/[0.02] border border-[#1E1E38] p-4 rounded-2xl space-y-1">
                    <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-400 tracking-wider">
                      <span>Índice de Fricción</span>
                      <AlertTriangle size={12} className="text-amber-400" />
                    </div>
                    <h4 className="text-2xl font-black text-white tracking-tight">{selectedNode.friccion_porcentaje}%</h4>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Eventos de severidad Warning/Critical</p>
                  </div>

                  <div className="bg-white/[0.02] border border-[#1E1E38] p-4 rounded-2xl space-y-1">
                    <div className="flex justify-between items-center text-[9px] font-black uppercase text-slate-400 tracking-wider">
                      <span>Tiempo Promedio Resol.</span>
                      <Clock size={12} className="text-emerald-400" />
                    </div>
                    <h4 className="text-2xl font-black text-white tracking-tight">
                      {selectedNode.tiempo_promedio_horas !== null 
                        ? `${selectedNode.tiempo_promedio_horas} hrs` 
                        : 'N/D'}
                    </h4>
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">Intervalo ticket.creado &rarr; ticket.cerrado</p>
                  </div>

                </div>

                {/* Advice or system recommendation based on health */}
                <div className="bg-[#1E1E38]/50 border border-[#2D2D54] p-4 rounded-2xl text-[10px] leading-relaxed text-slate-300 font-bold uppercase tracking-wide">
                  <span className="text-[#10B981] font-black block mb-1">Diagnóstico del Búnker:</span>
                  {selectedNode.estado_salud === 'Optimo' && 'Operaciones fluidas. La tasa de incidentes es baja y los tiempos de resolución se mantienen óptimos. No se requiere intervención.'}
                  {selectedNode.estado_salud === 'Advertencia' && 'Se detecta incremento moderado de anomalías o cuellos de botella en la resolución. Monitorear los canales de soporte.'}
                  {selectedNode.estado_salud === 'Critico' && 'ALERTA DE SEGURIDAD OPERACIONAL: Alto volumen de eventos de fricción o tiempos excesivos. Se sugiere revisión inmediata de la gerencia.'}
                </div>

              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 text-center p-6 space-y-4">
                <div className="p-4 rounded-3xl bg-[#1E1E38]/50 border border-[#2D2D54] text-slate-400">
                  <Activity size={32} className="animate-pulse" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-wider text-slate-300">Seleccione un Nodo</h3>
                <p className="text-[10px] text-slate-500 font-black uppercase max-w-[200px]">Haga clic en cualquiera de las gerencias de la red para desplegar su telemetría detallada en este panel.</p>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
