import React, { useState, useEffect } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  ArrowRight, 
  Building2, 
  Package, 
  Users, 
  Receipt, 
  BarChart3, 
  HelpCircle, 
  X, 
  ChevronRight, 
  Sparkles,
  ExternalLink,
  BookOpen,
  DollarSign,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const OnboardingChecklist = ({ onOpenHelp }: { onOpenHelp: () => void }) => {
  const navigate = useNavigate();
  const [completedSteps, setCompletedSteps] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('koda_onboarding_steps');
      return saved ? JSON.parse(saved) : [1]; // El paso 1 viene listo o iniciado
    } catch {
      return [1];
    }
  });

  const [dismissed, setDismissed] = useState<boolean>(() => {
    return localStorage.getItem('koda_onboarding_dismissed') === 'true';
  });

  const steps = [
    {
      id: 1,
      title: 'Configura tu Empresa y Moneda',
      desc: 'Define el RIF de tu negocio, tasa de cambio BCV y datos fiscales.',
      route: '/empresa',
      icon: Building2,
      badge: 'Básico'
    },
    {
      id: 2,
      title: 'Carga tu Inventario y Precios',
      desc: 'Agrega productos con sus precios Detal, Mayor y Gran Mayor.',
      route: '/inventario',
      icon: Package,
      badge: 'Catálogo'
    },
    {
      id: 3,
      title: 'Registra tu Equipo Comercial',
      desc: 'Crea vendedores y define comisiones base y metas mensuales.',
      route: '/admin/usuarios',
      icon: Users,
      badge: 'Equipo'
    },
    {
      id: 4,
      title: 'Emite tu Primera Venta',
      desc: 'Genera una Factura Fiscal o Ticket POS asignando un vendedor.',
      route: '/nueva-fiscal',
      icon: Receipt,
      badge: 'Ventas'
    },
    {
      id: 5,
      title: 'Monitorea Cobros y Ganancias',
      desc: 'Revisa el ranking de comisiones y el estado de resultados.',
      route: '/reportes/vendedores',
      icon: BarChart3,
      badge: 'Finanzas'
    }
  ];

  const toggleStep = (stepId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    let updated: number[];
    if (completedSteps.includes(stepId)) {
      updated = completedSteps.filter(id => id !== stepId);
    } else {
      updated = [...completedSteps, stepId];
    }
    setCompletedSteps(updated);
    localStorage.setItem('koda_onboarding_steps', JSON.stringify(updated));
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('koda_onboarding_dismissed', 'true');
  };

  const handleRestore = () => {
    setDismissed(false);
    localStorage.removeItem('koda_onboarding_dismissed');
  };

  const progressPercent = Math.round((completedSteps.length / steps.length) * 100);

  if (dismissed) {
    return (
      <div className="flex items-center justify-between bg-emerald-50/60 border border-emerald-200/80 rounded-2xl px-5 py-3 text-xs font-bold text-[#0b5156]">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-emerald-600" />
          <span>Guía de Inicio Rápido ({completedSteps.length}/{steps.length} completados)</span>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={onOpenHelp}
            className="text-xs text-slate-600 hover:text-[#0b5156] font-black uppercase flex items-center gap-1 underline"
          >
            <HelpCircle size={14} /> Centro de Ayuda
          </button>
          <button 
            onClick={handleRestore}
            className="text-xs bg-[#0b5156] text-white px-3 py-1.5 rounded-lg font-black uppercase hover:bg-[#083a3d] transition-all"
          >
            Mostrar Pasos
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-sm relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-[#0b5156]/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 relative z-10 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-[#0b5156] text-white text-[9px] font-black px-2.5 py-0.5 rounded-full uppercase tracking-widest flex items-center gap-1">
              <Sparkles size={11} /> Guía de Inicio Rápido
            </span>
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {progressPercent}% completado
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-[#0b5156] uppercase tracking-tight">
            Puesta en Marcha de tu Negocio
          </h2>
          <p className="text-xs font-bold text-slate-500 uppercase mt-0.5">
            Sigue estos 5 pasos lógicos para configurar y dominar tu ecosistema KODA.
          </p>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            onClick={onOpenHelp}
            className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-black uppercase transition-all"
          >
            <BookOpen size={14} className="text-[#0b5156]" />
            <span>Manual Rápido</span>
          </button>
          <button
            onClick={handleDismiss}
            title="Ocultar esta guía"
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-100 rounded-full h-2 mb-6 overflow-hidden">
        <div 
          className="bg-emerald-600 h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Steps List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 relative z-10">
        {steps.map((step) => {
          const isDone = completedSteps.includes(step.id);
          const StepIcon = step.icon;

          return (
            <div
              key={step.id}
              onClick={() => navigate(step.route)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group ${
                isDone 
                  ? 'bg-emerald-50/40 border-emerald-200/80 hover:border-emerald-300' 
                  : 'bg-white border-slate-200 hover:border-[#0b5156] hover:shadow-md'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className={`p-2 rounded-xl ${isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600 group-hover:bg-[#0b5156] group-hover:text-white transition-colors'}`}>
                    <StepIcon size={16} />
                  </div>
                  <button
                    onClick={(e) => toggleStep(step.id, e)}
                    title={isDone ? 'Marcar como pendiente' : 'Marcar como completado'}
                    className="text-slate-400 hover:text-emerald-600 transition-colors p-1"
                  >
                    {isDone ? (
                      <CheckCircle2 size={20} className="text-emerald-600 fill-emerald-100" />
                    ) : (
                      <Circle size={20} className="text-slate-300 group-hover:text-slate-400" />
                    )}
                  </button>
                </div>

                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                  Paso {step.id} · {step.badge}
                </span>
                <h4 className={`text-xs font-black uppercase mb-1 leading-snug ${isDone ? 'text-emerald-950 line-through opacity-75' : 'text-slate-800 group-hover:text-[#0b5156]'}`}>
                  {step.title}
                </h4>
                <p className="text-[10px] text-slate-500 font-medium leading-relaxed mb-3">
                  {step.desc}
                </p>
              </div>

              <div className="flex items-center gap-1 text-[10px] font-black text-[#0b5156] uppercase group-hover:translate-x-1 transition-transform">
                <span>Comenzar</span>
                <ChevronRight size={12} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const QuickHelpModal = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const [activeTab, setActiveTab] = useState<'inicio' | 'inventario' | 'ventas' | 'comisiones'>('inicio');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-2xl w-full my-auto flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Modal Header */}
        <div className="flex justify-between items-center px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#0b5156] text-white flex items-center justify-center shadow-md shadow-[#0b5156]/20">
              <BookOpen size={20} />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-[#0b5156] uppercase tracking-tight">Manual del Principiante KODA</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Guía paso a paso para operar tu empresa sin complicaciones.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-b border-slate-100 bg-white">
          <button
            onClick={() => setActiveTab('inicio')}
            className={`py-3 px-3 text-[10px] sm:text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all ${
              activeTab === 'inicio' ? 'border-[#0b5156] text-[#0b5156] bg-emerald-50/30' : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            1. Puesta en Marcha
          </button>
          <button
            onClick={() => setActiveTab('inventario')}
            className={`py-3 px-3 text-[10px] sm:text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all ${
              activeTab === 'inventario' ? 'border-[#0b5156] text-[#0b5156] bg-emerald-50/30' : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            2. Inventario y Precios
          </button>
          <button
            onClick={() => setActiveTab('ventas')}
            className={`py-3 px-3 text-[10px] sm:text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all ${
              activeTab === 'ventas' ? 'border-[#0b5156] text-[#0b5156] bg-emerald-50/30' : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            3. Facturación / POS
          </button>
          <button
            onClick={() => setActiveTab('comisiones')}
            className={`py-3 px-3 text-[10px] sm:text-xs font-black uppercase tracking-wider text-center border-b-2 transition-all ${
              activeTab === 'comisiones' ? 'border-[#0b5156] text-[#0b5156] bg-emerald-50/30' : 'border-transparent text-slate-400 hover:text-slate-700 hover:bg-slate-50'
            }`}
          >
            4. Vendedores y Cobros
          </button>
        </div>


        {/* Tab Content */}
        <div className="p-6 sm:p-8 overflow-y-auto flex-1 space-y-6 text-sm">
          {activeTab === 'inicio' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200">
                <h4 className="font-black text-[#0b5156] uppercase text-xs mb-1">🏁 La Regla de Oro</h4>
                <p className="text-xs text-slate-600 font-medium">
                  Antes de emitir cualquier venta, asegúrate de configurar tu <strong>RIF</strong> y la <strong>Tasa oficial BCV</strong>. El sistema recalcula automáticamente los montos en Bolívares y Dólares protegiendo tu margen.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Paso A</span>
                  <strong className="text-slate-800 text-xs uppercase block mb-1">Empresa y Sucursales</strong>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    Ve a <code>Configuración ➔ Datos de la Empresa</code> para ingresar RIF, razón social, dirección fiscal y teléfonos de contacto.
                  </p>
                </div>
                <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Paso B</span>
                  <strong className="text-slate-800 text-xs uppercase block mb-1">Usuarios y Accesos</strong>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    En <code>Configuración ➔ Usuarios y Roles</code> puedes invitar a tus cajeros, gerentes y asesores comerciales.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'inventario' && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-2xl border border-blue-200">
                <h4 className="font-black text-blue-900 uppercase text-xs mb-1">📦 3 Niveles de Precios Automáticos</h4>
                <p className="text-xs text-slate-600 font-medium">
                  KODA maneja tres tarifas para cada producto: <strong>Detal</strong> (mostrador), <strong>Mayor</strong> (tiendas) y <strong>Gran Mayor</strong> (distribuidores). Al facturar, el precio cambia según el cliente seleccionado.
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="font-black text-slate-800 uppercase text-xs">Acciones Clave en Inventario:</h4>
                <ul className="text-xs text-slate-600 space-y-2 list-disc list-inside">
                  <li><strong>Crear Producto:</strong> Código SKU único, nombre, costo en USD y los 3 niveles de precio.</li>
                  <li><strong>Stock Mínimo:</strong> Si el producto baja de ese número, KODA te alertará para reponer inventario.</li>
                  <li><strong>Carga Masiva:</strong> Puedes importar tu inventario desde una plantilla Excel con un solo clic.</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'ventas' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Receipt size={16} className="text-[#0b5156]" />
                    <h4 className="font-black text-slate-800 uppercase text-xs">Facturación Fiscal / Comercial</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    Ideal para despachos a mayoristas, empresas y ventas con crédito. Permite seleccionar vendedor, fecha de vencimiento y generar comprobantes PDF con desglose de IVA e IGTF.
                  </p>
                </div>

                <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap size={16} className="text-amber-600" />
                    <h4 className="font-black text-slate-800 uppercase text-xs">Punto de Venta (POS Rápido)</h4>
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    Diseñado para el mostrador. Cobro en 3 segundos con lector de código de barras, cálculo de vuelto multimoneda (Dólares, Bolívares, PagoMóvil) e impresión directa de tickets.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'comisiones' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 p-4 rounded-2xl border border-emerald-200">
                <h4 className="font-black text-[#0b5156] uppercase text-xs mb-1">💰 Comisiones sobre Cobro Real</h4>
                <p className="text-xs text-slate-600 font-medium">
                  En KODA no pagas comisiones por facturas no cobradas. La comisión se calcula y liquida a medida que el cliente paga su deuda.
                </p>
              </div>

              <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
                <p>
                  1. En <strong>Configuración ➔ Usuarios y Roles</strong>, asignas a cada vendedor su <code>% de Comisión</code> (ej. 5%) y su <code>Meta del Mes</code>.
                </p>
                <p>
                  2. Al facturar, seleccionas al vendedor responsable en el menú desplegable.
                </p>
                <p>
                  3. En <strong>Reportes ➔ Gestión de Vendedores</strong>, consultas el ranking mensual y el saldo exacto en USD a liquidar.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-6 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <span className="text-[10px] font-bold text-slate-400 uppercase">¿Dudas específicas? Consulta a tu supervisor</span>
          <button
            onClick={onClose}
            className="bg-[#0b5156] text-white px-6 py-2.5 rounded-xl text-xs font-black uppercase hover:bg-[#083a3d] transition-all shadow-md"
          >
            Entendido
          </button>
        </div>

      </div>
    </div>
  );
};
