import { 
  Plus, 
  Search, 
  Filter, 
  ArrowLeft,
  TrendingUp,
  ShieldAlert,
  Settings2,
  Lock,
  Zap,
  Layers,
  X,
  Maximize2,
  Minimize2,
  Store,
  Wrench,
  Factory,
  FolderInput,
  Trash2,
  Save,
  FileSpreadsheet
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { api } from '@/api/client';
import { createPortal } from 'react-dom';

const TEMPLATE_ACCOUNTS: Record<string, { codigo: string; nombre: string; tipo: string }[]> = {
  Comercial: [
    { codigo: "1", nombre: "ACTIVO", tipo: "ACTIVO" },
    { codigo: "1.1", nombre: "ACTIVO CORRIENTE", tipo: "ACTIVO" },
    { codigo: "1.1.01", nombre: "Caja y Bancos", tipo: "ACTIVO" },
    { codigo: "1.1.02", nombre: "Cuentas por Cobrar Comerciales", tipo: "ACTIVO" },
    { codigo: "1.1.03", nombre: "Inventario de Mercancía de Comercio", tipo: "ACTIVO" },
    { codigo: "1.1.04", nombre: "IVA Crédito Fiscal", tipo: "ACTIVO" },
    { codigo: "1.1.05", nombre: "Anticipo de Retención de IVA", tipo: "ACTIVO" },
    { codigo: "1.2", nombre: "ACTIVO NO CORRIENTE", tipo: "ACTIVO" },
    { codigo: "1.2.01", nombre: "Propiedades, Planta y Equipo", tipo: "ACTIVO" },
    { codigo: "1.2.02", nombre: "Edificaciones Comerciales", tipo: "ACTIVO" },
    { codigo: "1.2.03", nombre: "Equipos de Computación", tipo: "ACTIVO" },
    { codigo: "2", nombre: "PASIVO", tipo: "PASIVO" },
    { codigo: "2.1", nombre: "PASIVO CORRIENTE", tipo: "PASIVO" },
    { codigo: "2.1.01", nombre: "Cuentas por Pagar Comerciales", tipo: "PASIVO" },
    { codigo: "2.1.02", nombre: "IVA Débito Fiscal por Pagar", tipo: "PASIVO" },
    { codigo: "2.1.03", nombre: "IGTF por Pagar", tipo: "PASIVO" },
    { codigo: "2.1.04", nombre: "Nómina por Pagar", tipo: "PASIVO" },
    { codigo: "2.1.05", nombre: "Otras Retenciones por Pagar", tipo: "PASIVO" },
    { codigo: "3", nombre: "PATRIMONIO", tipo: "PATRIMONIO" },
    { codigo: "3.1", nombre: "PATRIMONIO NETO", tipo: "PATRIMONIO" },
    { codigo: "3.1.01", nombre: "Capital Social", tipo: "PATRIMONIO" },
    { codigo: "3.1.02", nombre: "Reserva Legal", tipo: "PATRIMONIO" },
    { codigo: "4", nombre: "INGRESOS", tipo: "INGRESO" },
    { codigo: "4.1", nombre: "INGRESOS OPERACIONALES", tipo: "INGRESO" },
    { codigo: "4.1.01", nombre: "Ventas de Mercancía (Comercial)", tipo: "INGRESO" },
    { codigo: "4.1.02", nombre: "Ventas por Canales Digitales", tipo: "INGRESO" },
    { codigo: "5", nombre: "EGRESOS / GASTOS", tipo: "EGRESO" },
    { codigo: "5.1", nombre: "COSTOS Y GASTOS OPERACIONALES", tipo: "EGRESO" },
    { codigo: "5.1.01", nombre: "Costo de Ventas (Comercial)", tipo: "EGRESO" },
    { codigo: "5.1.02", nombre: "Sueldos y Salarios Base (Gasto)", tipo: "EGRESO" },
    { codigo: "5.1.03", nombre: "Otras Asignaciones (Gasto)", tipo: "EGRESO" },
    { codigo: "5.1.04", nombre: "Gastos por Mermas y Faltantes", tipo: "EGRESO" },
    { codigo: "5.1.05", nombre: "Resultado por Exposición a la Inflación (REI)", tipo: "EGRESO" },
    { codigo: "5.1.06", nombre: "Servicios Públicos de Tiendas", tipo: "EGRESO" }
  ],
  Servicios: [
    { codigo: "1", nombre: "ACTIVO", tipo: "ACTIVO" },
    { codigo: "1.1", nombre: "ACTIVO CORRIENTE", tipo: "ACTIVO" },
    { codigo: "1.1.01", nombre: "Caja y Bancos (Servicios)", tipo: "ACTIVO" },
    { codigo: "1.1.02", nombre: "Cuentas por Cobrar por Servicios", tipo: "ACTIVO" },
    { codigo: "1.1.04", nombre: "IVA Crédito Fiscal", tipo: "ACTIVO" },
    { codigo: "1.1.05", nombre: "Anticipo de Retención de IVA", tipo: "ACTIVO" },
    { codigo: "1.2", nombre: "ACTIVO NO CORRIENTE", tipo: "ACTIVO" },
    { codigo: "1.2.01", nombre: "Mobiliario y Equipos de Oficina", tipo: "ACTIVO" },
    { codigo: "1.2.02", nombre: "Equipos Tecnológicos / Servidores", tipo: "ACTIVO" },
    { codigo: "2", nombre: "PASIVO", tipo: "PASIVO" },
    { codigo: "2.1", nombre: "PASIVO CORRIENTE", tipo: "PASIVO" },
    { codigo: "2.1.01", nombre: "Proveedores de Servicios por Pagar", tipo: "PASIVO" },
    { codigo: "2.1.02", nombre: "IVA Débito Fiscal por Pagar", tipo: "PASIVO" },
    { codigo: "2.1.03", nombre: "IGTF por Pagar", tipo: "PASIVO" },
    { codigo: "2.1.04", nombre: "Honorarios Profesionales por Pagar", tipo: "PASIVO" },
    { codigo: "2.1.05", nombre: "Otras Retenciones por Pagar", tipo: "PASIVO" },
    { codigo: "3", nombre: "PATRIMONIO", tipo: "PATRIMONIO" },
    { codigo: "3.1", nombre: "PATRIMONIO NETO", tipo: "PATRIMONIO" },
    { codigo: "3.1.01", nombre: "Capital Social", tipo: "PATRIMONIO" },
    { codigo: "3.1.02", nombre: "Utilidades Acumuladas", tipo: "PATRIMONIO" },
    { codigo: "4", nombre: "INGRESOS", tipo: "INGRESO" },
    { codigo: "4.1", nombre: "INGRESOS OPERACIONALES", tipo: "INGRESO" },
    { codigo: "4.1.01", nombre: "Ingresos por Servicios Profesionales", tipo: "INGRESO" },
    { codigo: "4.1.02", nombre: "Ingresos por Consultorías / Asesorías", tipo: "INGRESO" },
    { codigo: "5", nombre: "EGRESOS / GASTOS", tipo: "EGRESO" },
    { codigo: "5.1", nombre: "COSTOS Y GASTOS OPERACIONALES", tipo: "EGRESO" },
    { codigo: "5.1.01", nombre: "Costo de Servicios Prestados", tipo: "EGRESO" },
    { codigo: "5.1.02", nombre: "Honorarios de Consultores Subcontratados", tipo: "EGRESO" },
    { codigo: "5.1.03", nombre: "Sueldos del Personal Técnico", tipo: "EGRESO" },
    { codigo: "5.1.04", nombre: "Gasto de Suscripciones y Software SaaS", tipo: "EGRESO" },
    { codigo: "5.1.05", nombre: "Resultado por Exposición a la Inflación (REI)", tipo: "EGRESO" },
    { codigo: "5.1.06", nombre: "Gastos de Publicidad y Eventos", tipo: "EGRESO" }
  ],
  Industrial: [
    { codigo: "1", nombre: "ACTIVO", tipo: "ACTIVO" },
    { codigo: "1.1", nombre: "ACTIVO CORRIENTE", tipo: "ACTIVO" },
    { codigo: "1.1.01", nombre: "Caja y Bancos (Industrial)", tipo: "ACTIVO" },
    { codigo: "1.1.02", nombre: "Cuentas por Cobrar de Clientes Industriales", tipo: "ACTIVO" },
    { codigo: "1.1.03", nombre: "Inventario de Materia Prima", tipo: "ACTIVO" },
    { codigo: "1.1.04", nombre: "IVA Crédito Fiscal", tipo: "ACTIVO" },
    { codigo: "1.1.05", nombre: "Anticipo de Retención de IVA", tipo: "ACTIVO" },
    { codigo: "1.1.06", nombre: "Inventario de Productos en Proceso", tipo: "ACTIVO" },
    { codigo: "1.1.07", nombre: "Inventario de Productos Terminados", tipo: "ACTIVO" },
    { codigo: "1.2", nombre: "ACTIVO NO CORRIENTE", tipo: "ACTIVO" },
    { codigo: "1.2.01", nombre: "Maquinaria e Instalaciones Industriales", tipo: "ACTIVO" },
    { codigo: "1.2.02", nombre: "Herramientas y Moldes de Producción", tipo: "ACTIVO" },
    { codigo: "1.2.03", nombre: "Vehículos de Carga y Distribución", tipo: "ACTIVO" },
    { codigo: "2", nombre: "PASIVO", tipo: "PASIVO" },
    { codigo: "2.1", nombre: "PASIVO CORRIENTE", tipo: "PASIVO" },
    { codigo: "2.1.01", nombre: "Proveedores de Materia Prima por Pagar", tipo: "PASIVO" },
    { codigo: "2.1.02", nombre: "IVA Débito Fiscal por Pagar", tipo: "PASIVO" },
    { codigo: "2.1.03", nombre: "IGTF por Pagar", tipo: "PASIVO" },
    { codigo: "2.1.04", nombre: "Sueldos y Salarios de Planta por Pagar", tipo: "PASIVO" },
    { codigo: "2.1.05", nombre: "Otras Retenciones por Pagar", tipo: "PASIVO" },
    { codigo: "3", nombre: "PATRIMONIO", tipo: "PATRIMONIO" },
    { codigo: "3.1", nombre: "PATRIMONIO NETO", tipo: "PATRIMONIO" },
    { codigo: "3.1.01", nombre: "Capital Social", tipo: "PATRIMONIO" },
    { codigo: "3.1.02", nombre: "Reservas de Reinversión de Capital", tipo: "PATRIMONIO" },
    { codigo: "4", nombre: "INGRESOS", tipo: "INGRESO" },
    { codigo: "4.1", nombre: "INGRESOS OPERACIONALES", tipo: "INGRESO" },
    { codigo: "4.1.01", nombre: "Ventas de Productos Terminados (Industrial)", tipo: "INGRESO" },
    { codigo: "4.1.02", nombre: "Ventas de Subproductos de Desecho", tipo: "INGRESO" },
    { codigo: "5", nombre: "EGRESOS / GASTOS", tipo: "EGRESO" },
    { codigo: "5.1", nombre: "COSTOS Y GASTOS OPERACIONALES", tipo: "EGRESO" },
    { codigo: "5.1.01", nombre: "Costo de Producción y Ventas (Manufactura)", tipo: "EGRESO" },
    { codigo: "5.1.02", nombre: "Mano de Obra Directa (Gasto Fábrica)", tipo: "EGRESO" },
    { codigo: "5.1.03", nombre: "Mantenimiento Preventivo de Maquinarias", tipo: "EGRESO" },
    { codigo: "5.1.04", nombre: "Combustibles, Energía Eléctrica y Agua Industrial", tipo: "EGRESO" },
    { codigo: "5.1.05", nombre: "Resultado por Exposición a la Inflación (REI)", tipo: "EGRESO" },
    { codigo: "5.1.06", nombre: "Depreciación de Maquinarias de Planta", tipo: "EGRESO" }
  ]
};

const ChartOfAccounts = () => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('Comercial');
  const [isImporting, setIsImporting] = useState(false);

  // States for Editing/Deleting Account
  const [selectedAccount, setSelectedAccount] = useState<any | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ nombre: '', tipo: 'ACTIVO', naturaleza: 'DEUDORA', activa: true });
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  // Koda Styled Toast Notifications State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchAccounts = async () => {
    try {
      setIsLoading(true);
      const res = await api.get<any[]>('/contabilidad/cuentas');
      setAccounts(res || []);
    } catch (error) {
      console.error("Error fetching accounts:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleImportTemplate = async () => {
    if (!selectedTemplate) return showToast("Seleccione una plantilla", "error");
    try {
      setIsImporting(true);
      await api.post('/contabilidad/cuentas/importar-plantilla', { plantilla: selectedTemplate });
      showToast(`Plantilla ${selectedTemplate} cargada exitosamente.`, "success");
      setShowModal(false);
      fetchAccounts();
    } catch (error) {
      console.error("Error importando plantilla:", error);
      showToast("Error al importar la plantilla base.", "error");
    } finally {
      setIsImporting(false);
    }
  };

  const handleOpenEdit = (account: any) => {
    setSelectedAccount(account);
    setEditForm({
      nombre: account.nombre || '',
      tipo: account.tipo || 'ACTIVO',
      naturaleza: account.naturaleza || 'DEUDORA',
      activa: account.activa !== false
    });
    setShowEditModal(true);
  };

  const handleSaveAccount = async () => {
    if (!selectedAccount) return;
    try {
      setIsSavingAccount(true);
      await api.put(`/contabilidad/cuentas/${selectedAccount.id}`, editForm);
      showToast("Cuenta contable actualizada con éxito.", "success");
      setShowEditModal(false);
      fetchAccounts();
    } catch (error) {
      console.error("Error updating account:", error);
      showToast("Error al actualizar la cuenta contable.", "error");
    } finally {
      setIsSavingAccount(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!selectedAccount) return;
    if (!confirm(`¿Está seguro de eliminar la cuenta ${selectedAccount.codigo} - ${selectedAccount.nombre}? Esta acción no se puede deshacer.`)) return;
    try {
      setIsDeletingAccount(true);
      await api.delete(`/contabilidad/cuentas/${selectedAccount.id}`);
      showToast("Cuenta contable eliminada exitosamente.", "success");
      setShowEditModal(false);
      fetchAccounts();
    } catch (error) {
      console.error("Error deleting account:", error);
      showToast("Error al eliminar la cuenta contable. Asegúrese de que no posea asientos contables registrados.", "error");
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return accounts;
    const q = searchQuery.toLowerCase();
    return accounts.filter(a => 
      (a.codigo && a.codigo.toLowerCase().includes(q)) || 
      (a.nombre && a.nombre.toLowerCase().includes(q)) ||
      (a.tipo && a.tipo.toLowerCase().includes(q))
    );
  }, [accounts, searchQuery]);

  const auditAnalysis = useMemo(() => {
    if (!accounts || accounts.length === 0) {
      return {
        estructura: "Sin cuentas cargadas en el sistema.",
        operacion: "Módulos inactivos (esperando catálogo).",
        control: "Sin cuentas de control registradas.",
        revision: "Estructura vacía."
      };
    }

    const activos = accounts.filter(a => a.tipo === 'ACTIVO').length;
    const pasivos = accounts.filter(a => a.tipo === 'PASIVO').length;
    const patrimonio = accounts.filter(a => a.tipo === 'PATRIMONIO').length;
    const ingresos = accounts.filter(a => a.tipo === 'INGRESO').length;
    const egresos = accounts.filter(a => a.tipo === 'EGRESO').length;

    const estructuraText = `${activos} Activos, ${pasivos} Pasivos, ${patrimonio} Patrimonio, ${ingresos} Ingresos y ${egresos} Egresos cargados.`;

    const tieneCaja = accounts.some(a => a.codigo.startsWith("1.1.01") || a.codigo.startsWith("1101"));
    const tieneCxc = accounts.some(a => a.codigo.startsWith("1.1.02") || a.codigo.startsWith("1102"));
    const tieneInv = accounts.some(a => a.codigo.startsWith("1.1.03") || a.codigo.startsWith("1103"));
    
    let modulos = [];
    if (tieneCaja) modulos.push("Tesorería");
    if (tieneCxc) modulos.push("Ventas");
    if (tieneInv) modulos.push("Inventario");
    
    const operacionText = modulos.length > 0 
      ? `Cuentas operacionales vinculadas a módulos de ${modulos.join(', ')}.`
      : "No se detectan enlaces automáticos a módulos operacionales.";

    const cuentasControl = accounts.filter(a => 
      a.codigo.startsWith("1.1.01") || 
      a.codigo.startsWith("1101") || 
      a.codigo.startsWith("1.1.04") || 
      a.codigo.startsWith("1104") || 
      a.codigo.startsWith("2.1.02") || 
      a.codigo.startsWith("2102")
    ).length;

    const controlText = `Detectadas ${cuentasControl} cuentas críticas (Bancos, IVA) que requieren autorización y reglas de uso rigurosas.`;

    let desalineadas = 0;
    accounts.forEach(a => {
      if (a.nivel > 1) {
        const hasParent = accounts.some(p => a.codigo.startsWith(p.codigo) && p.codigo !== a.codigo);
        if (!hasParent) desalineadas++;
      }
    });

    const revisionText = desalineadas > 0 
      ? `Se detectaron ${desalineadas} cuentas huérfanas o con códigos de grupo mal estructurados.`
      : "Catálogo estructurado correctamente. 0 inconsistencias de jerarquía halladas.";

    return {
      estructura: estructuraText,
      operacion: operacionText,
      control: controlText,
      revision: revisionText
    };
  }, [accounts]);

  const metrics = [
    { label: 'Cuentas activas', value: accounts.length.toString(), desc: 'Disponibles para operación', color: 'text-[#0b5156]', icon: <Zap size={18} className="text-[#0b5156]" /> },
    { label: 'Cuentas operativas', value: accounts.filter(a => a.activa).length.toString(), desc: 'Con movimiento reciente', color: 'text-green-600', icon: <TrendingUp size={18} className="text-green-600" /> },
    { label: 'Cuentas bloqueadas', value: accounts.filter(a => !a.activa).length.toString(), desc: 'No permiten registro directo', color: 'text-amber-600', icon: <Lock size={18} className="text-amber-600" /> },
    { label: 'Módulos vinculados', value: '8', desc: 'Ventas, bancos, fiscal y más', color: 'text-blue-600', icon: <Layers size={18} className="text-blue-600" /> },
  ];

  return (
    <div className="space-y-2 animate-in fade-in duration-500 pb-4">
      {/* Header */}
      <header className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start mb-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <Link to="/contabilidad" className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-[#0b5156]/20 transition-all">
                <ArrowLeft size={10} /> Volver
              </Link>
              <span className="bg-[#0b5156] text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                Contabilidad
              </span>
            </div>
            <h1 className="text-xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">Plan de Cuentas</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Estructura contable, cuentas operativas, naturaleza, módulos relacionados y control de uso.</p>
          </div>
          <div className="flex gap-2">
             <button 
              onClick={() => setShowModal(true)}
              className="bg-[#0b5156] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all"
             >
                <FolderInput size={12} /> Importar Plantilla Base
             </button>
             <button onClick={() => showToast("El manual de opciones contables está en desarrollo y se incluirá en la próxima actualización.", "error")} className="bg-white text-[#0b5156] px-4 py-2 rounded-xl text-[10px] font-black uppercase border border-[#0b5156]/20 flex items-center gap-2 hover:bg-[#0b5156]/5 transition-all">
                <FileSpreadsheet size={12} /> Manual de Opción
             </button>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-2xl border border-slate-200">
           Cargando Plan de Cuentas...
        </div>
      ) : (
        <>
          {/* Metrics Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
            {metrics.map((m, i) => (
              <div key={i} className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex flex-col min-h-[105px] h-full hover:border-[#0b5156]/20 transition-all">
                <div className="flex justify-between items-start h-5">
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-tight">{m.label}</p>
                   {m.icon}
                </div>
                <div className="mt-1">
                  <strong className={`text-lg font-black ${m.color} tracking-tighter font-mono`}>{m.value}</strong>
                </div>
                <div className="mt-auto">
                  <p className="text-[9px] font-bold text-slate-400 uppercase leading-tight tracking-tight">{m.desc}</p>
                </div>
              </div>
            ))}
          </section>

          {/* Info Sections */}
          <div className="grid grid-cols-1 gap-4 items-start">
            <article className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
               <div className="mb-3">
                  <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Lectura del Plan Contable</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-tight mt-1">Análisis diagnóstico automatizado de la estructura contable activa.</p>
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 items-stretch">
                  {[
                    { label: 'Estructura', title: 'Organizado por naturaleza', desc: auditAnalysis.estructura, color: 'bg-green-500' },
                    { label: 'Operación', title: 'Cuentas vinculadas a módulos', desc: auditAnalysis.operacion, color: 'bg-blue-500' },
                    { label: 'Control', title: 'Cuentas sensibles protegidas', desc: auditAnalysis.control, color: 'bg-amber-500' },
                    { label: 'Revisión', title: 'Validación de parametrización', desc: auditAnalysis.revision, color: 'bg-red-500' },
                  ].map((item, i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1 h-full">
                       <span className={`${item.color} text-white text-[8px] font-black px-2 py-0.5 rounded uppercase`}>{item.label}</span>
                       <h3 className="text-xs font-black text-[#0b5156] uppercase tracking-tight leading-none">{item.title}</h3>
                       <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{item.desc}</p>
                    </div>
                  ))}
               </div>
            </article>
          </div>

          {/* Main Table */}
          <article className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-500 ${isFullScreen ? 'fixed inset-0 z-[100] m-4 rounded-[2.5rem]' : 'relative'}`}>
            <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-50/30">
              <div className="space-y-1">
                <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Catálogo de Cuentas</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Listado jerárquico de la estructura contable.</p>
              </div>
              <div className="flex gap-2 w-full md:w-auto">
                 <button 
                  onClick={() => setIsFullScreen(!isFullScreen)}
                  className="p-2 bg-white text-[#0b5156] rounded-lg border border-slate-200 hover:bg-[#0b5156]/5 shadow-sm transition-all flex items-center gap-2"
                  title={isFullScreen ? "Salir de Pantalla Completa" : "Ver en Pantalla Completa"}
                 >
                    {isFullScreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    <span className="text-[10px] font-black uppercase">{isFullScreen ? 'Reducir' : 'Pantalla Completa'}</span>
                 </button>
                 <div className="relative flex-1 md:flex-none">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={14} />
                    <input 
                      type="text" 
                      placeholder="Buscar cuenta o código..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full md:w-64 bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-1.5 text-xs font-bold text-[#0b5156] outline-none focus:border-[#0b5156] shadow-sm" 
                    />
                 </div>
                 <button className="p-2 bg-white text-slate-600 rounded-lg border border-slate-200 hover:bg-slate-50 shadow-sm transition-all">
                    <Filter size={14} />
                 </button>
              </div>
            </div>

            <div className={`overflow-x-auto ${isFullScreen ? 'h-[calc(100vh-200px)]' : ''}`}>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/50">
                    <th className="py-2.5 px-4">Código / Grupo</th>
                    <th className="py-2.5 px-4">Cuenta Contable</th>
                    <th className="py-2.5 px-4">Tipo</th>
                    <th className="py-2.5 px-4">Naturaleza</th>
                    <th className="py-2.5 px-4 text-center">Módulo</th>
                    <th className="py-2.5 px-4">Uso / Propósito</th>
                    <th className="py-2.5 px-4 text-center">Estatus</th>
                    <th className="py-2.5 px-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 text-xs">
                  {filteredAccounts.length > 0 ? filteredAccounts.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors group">
                      <td className="py-2.5 px-4">
                        <div className="flex flex-col">
                           <strong className="text-[#0b5156] font-mono text-xs">{row.codigo || row.code}</strong>
                           <span className="text-[9px] font-bold text-slate-400 uppercase">{row.grupo || row.group || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-black text-slate-700 uppercase">{row.nombre || row.name}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-500 uppercase">{row.tipo || row.type || 'N/A'}</td>
                      <td className="py-2.5 px-4 font-bold text-slate-500 uppercase">{row.naturaleza || row.nature || 'N/A'}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="bg-white text-slate-600 px-2 py-0.5 rounded text-[9px] font-black uppercase border border-slate-200">{row.modulo || row.module || 'Contabilidad'}</span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-400 font-bold uppercase text-[10px] leading-tight">{row.uso || row.usage || 'General'}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className={`${row.activa ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight`}>
                          {row.activa ? 'Activa' : 'Inactiva'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <button 
                          onClick={() => handleOpenEdit(row)}
                          className="p-2 text-slate-400 hover:text-[#0b5156] transition-colors"
                        >
                           <Settings2 size={14} />
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                        No se encontraron cuentas contables
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </>
      )}

      {/* Template Modal */}
      {showModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
           <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setShowModal(false)} />
           <div className="relative bg-white w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                 <div className="space-y-1">
                    <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Inicializar Catálogo de Cuentas</h2>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Selecciona la estructura contable base para tu sector económico.</p>
                 </div>
                 <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                    <X size={20} />
                 </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1 space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
                    {[
                      { id: 'Comercial', icon: <Store className="w-8 h-8 mx-auto text-blue-600 group-hover:scale-110 transition-transform" />, label: 'Comercial', desc: 'Optimizado para compra/venta, inventario y retail.', count: '34 Cuentas', color: 'text-blue-600' },
                      { id: 'Servicios', icon: <Wrench className="w-8 h-8 mx-auto text-green-600 group-hover:scale-110 transition-transform" />, label: 'Servicios', desc: 'Foco en honorarios, gastos operativos y activos fijos.', count: '32 Cuentas', color: 'text-green-600' },
                      { id: 'Industrial', icon: <Factory className="w-8 h-8 mx-auto text-amber-600 group-hover:scale-110 transition-transform" />, label: 'Industrial', desc: 'Incluye centros de costo, materia prima y producción.', count: '36 Cuentas', color: 'text-amber-600' },
                    ].map((tpl, i) => (
                      <div 
                        key={i} 
                        onClick={() => setSelectedTemplate(tpl.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer group text-center flex flex-col justify-between h-full ${selectedTemplate === tpl.id ? 'border-[#0b5156] bg-[#0b5156]/5' : 'bg-slate-50 border-slate-100 hover:border-[#0b5156] hover:bg-white'}`}
                      >
                         <div className="space-y-2 flex flex-col items-center">
                            <div className="h-10 flex items-center justify-center">{tpl.icon}</div>
                            <strong className="text-base font-black text-[#0b5156] uppercase block tracking-tighter">{tpl.label}</strong>
                            <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight tracking-tight mt-1">{tpl.desc}</p>
                          </div>
                          <div className="mt-3">
                             <span className={`inline-block px-2 py-0.5 bg-white rounded text-[9px] font-black uppercase shadow-sm ${tpl.color}`}>{tpl.count}</span>
                          </div>
                       </div>
                    ))}
                 </div>

                 {/* Preview Section */}
                 <div className="space-y-1">
                    <strong className="text-[10px] font-black text-[#0b5156] uppercase tracking-widest block">Cuentas que se Cargarán en Base de Datos ({TEMPLATE_ACCOUNTS[selectedTemplate]?.length || 0} Cuentas)</strong>
                    <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50 p-2.5 max-h-36 overflow-y-auto">
                       <table className="w-full text-left text-[10px]">
                          <thead>
                             <tr className="text-slate-400 font-bold uppercase tracking-wider border-b border-slate-200">
                                <th className="pb-1 w-1/4">Código</th>
                                <th className="pb-1 w-1/2">Cuenta Contable</th>
                                <th className="pb-1 w-1/4">Tipo</th>
                             </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-[10px]">
                             {TEMPLATE_ACCOUNTS[selectedTemplate]?.map((a, idx) => (
                                <tr key={idx} className="hover:bg-white/50">
                                   <td className="py-1 text-[#0b5156] font-bold">{a.codigo}</td>
                                   <td className="py-1 text-slate-700 font-bold uppercase">{a.nombre}</td>
                                   <td className="py-1 text-slate-500 uppercase">{a.tipo}</td>
                                </tr>
                             ))}
                          </tbody>
                       </table>
                    </div>
                 </div>

                 <div className="p-4 bg-red-50 rounded-2xl border border-red-100 flex gap-3">
                    <ShieldAlert size={20} className="text-red-500 shrink-0" />
                    <div className="space-y-0.5">
                       <h4 className="text-xs font-black text-red-800 uppercase">Advertencia de Reemplazo</h4>
                       <p className="text-[9px] text-red-700 font-bold uppercase leading-relaxed opacity-80">
                         Inicializar un catálogo reemplazará cualquier estructura de cuentas que no tenga movimientos. Esta acción es irreversible y podría afectar la configuración de los módulos.
                       </p>
                    </div>
                 </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3 shrink-0">
                 <button onClick={() => setShowModal(false)} className="px-6 py-2.5 text-[10px] font-black uppercase text-slate-500 hover:text-slate-700">Cancelar</button>
                 <button 
                  onClick={handleImportTemplate}
                  disabled={!selectedTemplate || isImporting}
                  className="px-8 py-2.5 bg-[#0b5156] text-white rounded-2xl text-[10px] font-black uppercase shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                    {isImporting ? 'Cargando...' : 'Confirmar Selección'}
                  </button>
              </div>
           </div>
        </div>,
        document.body
      )}

      {/* Edit Modal */}
      {showEditModal && selectedAccount && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
           <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setShowEditModal(false)} />
           <div className="relative bg-white w-full max-w-md max-h-[90vh] flex flex-col rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
                 <div className="space-y-1">
                    <h2 className="text-base font-black text-[#0b5156] uppercase tracking-tighter leading-none">Gestionar Cuenta Contable</h2>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Código: {selectedAccount.codigo}</p>
                 </div>
                 <button onClick={() => setShowEditModal(false)} className="p-1.5 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                    <X size={16} />
                 </button>
              </div>

              <div className="p-5 overflow-y-auto flex-1 space-y-4">
                 <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Nombre de la Cuenta</label>
                    <input 
                      type="text" 
                      value={editForm.nombre}
                      onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs uppercase font-bold focus:outline-none focus:border-[#0b5156]"
                    />
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Tipo</label>
                       <select 
                         value={editForm.tipo}
                         onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value })}
                         className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                       >
                          {['ACTIVO', 'PASIVO', 'PATRIMONIO', 'INGRESO', 'EGRESO'].map(t => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                       </select>
                    </div>

                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Naturaleza</label>
                       <select 
                         value={editForm.naturaleza}
                         onChange={(e) => setEditForm({ ...editForm, naturaleza: e.target.value })}
                         className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#0b5156]"
                       >
                          {['DEUDORA', 'ACREEDORA'].map(n => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                       </select>
                    </div>
                 </div>

                 <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="space-y-0.5">
                       <strong className="text-xs font-black text-slate-700 uppercase">Estatus de Operación</strong>
                       <p className="text-[9px] text-slate-400 font-bold uppercase leading-none">Permitir registros en transacciones</p>
                    </div>
                    <input 
                      type="checkbox" 
                      checked={editForm.activa}
                      onChange={(e) => setEditForm({ ...editForm, activa: e.target.checked })}
                      className="w-4 h-4 text-[#0b5156] border-slate-300 rounded focus:ring-[#0b5156]"
                    />
                 </div>
              </div>

              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center gap-2 shrink-0">
                 <button 
                   onClick={handleDeleteAccount}
                   disabled={isDeletingAccount}
                   className="px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-[10px] font-black uppercase hover:bg-red-100 transition-all flex items-center gap-1.5 disabled:opacity-50"
                 >
                    <Trash2 size={12} /> {isDeletingAccount ? 'Eliminando...' : 'Eliminar'}
                 </button>
                 <div className="flex gap-2">
                    <button onClick={() => setShowEditModal(false)} className="px-4 py-2 text-[10px] font-black uppercase text-slate-500 hover:text-slate-700">Cancelar</button>
                    <button 
                      onClick={handleSaveAccount}
                      disabled={isSavingAccount}
                      className="px-6 py-2 bg-[#0b5156] text-white rounded-xl text-[10px] font-black uppercase hover:bg-[#083a3d] transition-all flex items-center gap-1.5 disabled:opacity-50"
                    >
                       <Save size={12} /> {isSavingAccount ? 'Guardando...' : 'Guardar'}
                    </button>
                 </div>
              </div>
           </div>
        </div>,
        document.body
      )}

      {/* Toast Notification */}
      {toast && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-5 right-5 z-[9999] animate-in fade-in slide-in-from-bottom duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border ${toast.type === 'success' ? 'bg-[#0b5156] border-[#0b5156]/20 text-white' : 'bg-red-600 border-red-500 text-white'}`}>
            {toast.type === 'success' ? <Zap size={20} /> : <ShieldAlert size={20} />}
            <span className="font-bold text-xs tracking-wide uppercase font-mono">{toast.message}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default ChartOfAccounts;
