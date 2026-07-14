import {
  Home, Bell, ShoppingBag, FileText, ShoppingCart,
  Package, ShieldCheck, CreditCard, Landmark,
  Layers, BookOpen, PieChart, Settings, ChevronDown,
  Users, Truck
} from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { useSystem, SystemKey } from '@/providers/SystemProvider';
import { useAuth } from '@/providers/AuthProvider';

const navItems = [
  { icon: Home, label: 'Inicio', path: '/', hasSub: false },
  { icon: Bell, label: 'Centro de Alertas', path: '/alertas', hasSub: false },
  {
    icon: ShoppingBag,
    label: 'Ventas',
    path: '/ventas',
    hasSub: true,
    subItems: [
      { label: 'ANÁLISIS COMERCIAL' },
      { label: 'Dashboard Comercial', path: '/ventas' },
      { label: 'ESTRATEGIA & PRECIOS' },
      { label: 'Listas de Precios', path: '/ventas/precios' },
      { label: 'DOCUMENTOS DE VENTA' },
      { label: 'Cotizaciones', path: '/ventas/cotizaciones' },
      { label: 'Órdenes de Venta', path: '/ventas/ordenes' },
      { label: 'Notas de Entrega', path: '/ventas/entregas' },
    ]
  },
  {
    icon: FileText,
    label: 'Facturación',
    path: '/',
    hasSub: true,
    subItems: [
      { label: 'EMISIÓN FISCAL' },
      { label: 'Facturas Emitidas', path: '/historial' },
      { label: 'Nueva Factura', path: '/nueva' },
      { label: 'Nueva Factura Fiscal', path: '/nueva-fiscal' },
      { label: 'Punto de Venta (POS)', path: '/pos' },
      { label: 'MAESTROS & NOTAS' },
      { label: 'Maestro de Clientes', path: '/clientes' },
      { label: 'Notas Crédito/Débito', path: '/notas' },
    ]
  },
  {
    icon: ShoppingCart,
    label: 'Compras',
    path: '/compras',
    hasSub: true,
    subItems: [
      { label: 'ANÁLISIS & PROVEEDORES' },
      { label: 'Dashboard Compras', path: '/compras' },
      { label: 'Anteproyecto de Costos', path: '/compras/anteproyecto' },
      { label: 'Maestro Proveedores', path: '/compras/proveedores' },
      { label: 'REQUERIMIENTOS' },
      { label: 'Solicitudes', path: '/compras/requisiciones' },
      { label: 'Órdenes de Compra', path: '/compras/ordenes' },
      { label: 'Aprobaciones', path: '/compras/aprobaciones' },
      { label: 'RECEPCIÓN & PAGOS' },
      { label: 'Recepción Stock', path: '/compras/recepcion' },
      { label: 'Facturas Proveedor', path: '/compras/facturas' },
      { label: 'Devoluciones', path: '/compras/devoluciones' },
      { label: 'HISTORIAL' },
      { label: 'Historial Total', path: '/compras/historial' },
    ]
  },
  {
    icon: Package,
    label: 'Inventario',
    path: '/inventario',
    hasSub: true,
    subItems: [
      { label: 'MONITOR DE ALMACÉN' },
      { label: 'Resumen Almacén', path: '/inventario' },
      { label: 'CATÁLOGO & STOCK' },
      { label: 'Catálogo Productos', path: '/inventario/productos' },
      { label: 'Existencias', path: '/inventario/existencias' },
      { label: 'Stock Crítico', path: '/inventario/critico' },
      { label: 'TRAZABILIDAD' },
      { label: 'Libro Kardex', path: '/inventario/kardex' },
      { label: 'Maestro Almacenes', path: '/inventario/almacenes' },
      { label: 'OPERACIONES' },
      { label: 'Transferencias', path: '/inventario/transferencias' },
      { label: 'Ajustes Stock', path: '/inventario/ajustes' },
      { label: 'Toma Física', path: '/inventario/fisico' },
    ]
  },
  {
    icon: Truck,
    label: 'Logística',
    path: '/logistica',
    hasSub: true,
    subItems: [
      { label: 'OPERACIONES' },
      { label: 'Tablero de Despacho', path: '/logistica' },
      { label: 'Planificación Semanal (Gantt)', path: '/logistica/planificacion' },
      { label: 'REGISTRO Y PERSONAL' },
      { label: 'Registro de Choferes', path: '/logistica/choferes' },
      { label: 'Organigrama y Personal', path: '/logistica/personal' },
      { label: 'GESTIÓN DE ACTIVOS' },
      { label: 'Maestro de Vehículos (Autos)', path: '/logistica/vehiculos' },
      { label: 'Registro de Servicios', path: '/logistica/mantenimiento' },
    ]
  },
  {
    icon: ShieldCheck,
    label: 'Cobranzas',
    path: '/cobranzas',
    hasSub: true,
    subItems: [
      { label: 'GESTIÓN DE COBROS' },
      { label: 'Dashboard Cobros', path: '/cobranzas' },
      { label: 'Cartera CxC', path: '/cobranzas/cartera' },
      { label: 'Aplicar Cobro', path: '/cobranzas/aplicar' },
      { label: 'ANÁLISIS DE RIESGO' },
      { label: 'Antigüedad Saldos', path: '/cobranzas/antiguedad' },
      { label: 'Estado de Cuenta', path: '/cobranzas/estado-cuenta' },
      { label: 'Flujo de Caja', path: '/cobranzas/flujo' },
      { label: 'Anticipos (Saldos)', path: '/cobranzas/anticipos' },
    ]
  },
  {
    icon: CreditCard,
    label: 'Pagos',
    path: '/pagos',
    hasSub: true,
    subItems: [
      { label: 'CONTROL DE EGRESOS' },
      { label: 'Dashboard Pagos', path: '/pagos' },
      { label: 'Cartera CxP', path: '/pagos/cuentas-por-pagar' },
      { label: 'OPERACIONES DE PAGO' },
      { label: 'Órdenes de Pago', path: '/pagos/ordenes' },
      { label: 'Lotes de Pago', path: '/pagos/lotes' },
      { label: 'Programación', path: '/pagos/programacion' },
    ]
  },
  {
    icon: Landmark,
    label: 'Tesorería',
    path: '/tesoreria',
    hasSub: true,
    subItems: [
      { label: 'POSICIÓN FINANCIERA' },
      { label: 'Posición Consolidada', path: '/tesoreria' },
      { label: 'Tasas de Cambio', path: '/tesoreria/tasas' },
      { label: 'CONCILIACIÓN & BANCOS' },
      { label: 'Cuentas Bancarias', path: '/tesoreria/bancos' },
      { label: 'Movimientos Bancarios', path: '/tesoreria/movimientos-bancarios' },
      { label: 'Conciliación', path: '/tesoreria/conciliacion' },
      { label: 'OPERACIONES & TURNOS' },
      { label: 'Transferencias', path: '/tesoreria/transferencias' },
      { label: 'Caja Chica', path: '/tesoreria/caja-chica' },
      { label: 'Arqueos de Caja', path: '/tesoreria/arqueo' },
      { label: 'Movimientos de Caja', path: '/tesoreria/movimientos-caja' },
      { label: 'PROYECCIONES' },
      { label: 'Flujo de Caja', path: '/tesoreria/flujo' },
      { label: 'Integridad de Turnos', path: '/tesoreria/turnos' },
      { label: 'Préstamos UVC', path: '/tesoreria/prestamos' },
      { label: 'Desviación Presup.', path: '/tesoreria/presupuesto' },
      { label: 'Rendimiento Inv.', path: '/tesoreria/inversiones' },
      { label: 'EXTRACTOS' },
      { label: 'Importar Extracto', path: '/tesoreria/importar' },
    ]
  },
  {
    icon: Layers,
    label: 'Fiscal',
    path: '/fiscal',
    hasSub: true,
    subItems: [
      { label: 'LIBROS FISCALES' },
      { label: 'Dashboard Fiscal', path: '/fiscal' },
      { label: 'Libro de Ventas', path: '/fiscal/libro-ventas' },
      { label: 'Libro de Compras', path: '/fiscal/libro-compras' },
      { label: 'IMPUESTOS DIRECTOS' },
      { label: 'Declaración IVA', path: '/fiscal/declaracion-iva' },
      { label: 'Retenciones IVA', path: '/fiscal/retenciones-iva' },
      { label: 'Retenciones ISLR', path: '/fiscal/retenciones-islr' },
      { label: 'Declaración ISLR', path: '/fiscal/declaracion-islr' },
      { label: 'GESTIÓN & REPORTES' },
      { label: 'Calendario Fiscal', path: '/fiscal/calendario' },
      { label: 'Obligaciones', path: '/fiscal/obligaciones' },
      { label: 'Conceptos ISLR', path: '/fiscal/conceptos-islr' },
      { label: 'Generador ARC', path: '/fiscal/arc' },
      { label: 'Impuesto IGTF', path: '/fiscal/igtf' },
    ]
  },
  {
    icon: BookOpen,
    label: 'Contabilidad',
    path: '/contabilidad',
    hasSub: true,
    subItems: [
      { label: 'AUDITORÍA ANALÍTICA' },
      { label: 'Panel Contable', path: '/contabilidad' },
      { label: 'Libro Diario', path: '/contabilidad/diario' },
      { label: 'Libro Mayor', path: '/contabilidad/mayor' },
      { label: 'ESTADOS FINANCIEROS' },
      { label: 'Bal. Comprobación', path: '/contabilidad/balance-comprobacion' },
      { label: 'Balance General', path: '/contabilidad/balance-general' },
      { label: 'Estado Resultados', path: '/contabilidad/estado-resultados' },
      { label: 'Flujo de Efectivo', path: '/contabilidad/flujo-caja' },
      { label: 'OPERACIONES DIARIAS' },
      { label: 'Plan de Cuentas', path: '/contabilidad/catalogo' },
      { label: 'Asiento Manual', path: '/contabilidad/asiento-manual' },
      { label: 'Cierre de Período', path: '/contabilidad/cierre' },
      { label: 'Centros de Costo', path: '/contabilidad/centros-costo' },
      { label: 'AJUSTES & CONSOLIDACIÓN' },
      { label: 'Ajuste Cambiario', path: '/contabilidad/ajuste-cambiario' },
      { label: 'Ajuste Inflación', path: '/contabilidad/ajuste-inflacion' },
      { label: 'Auditoría Diario', path: '/contabilidad/auditoria-diario' },
      { label: 'Consolidación', path: '/contabilidad/consolidacion' },
      { label: 'Config. Contable', path: '/contabilidad/admin' },
    ]
  },
  {
    icon: PieChart,
    label: 'Reportes',
    path: '/reportes',
    hasSub: true,
    subItems: [
      { label: 'DASHBOARD GENERAL' },
      { label: 'Centro de Reportes', path: '/reportes' },
      { label: 'REPORTES OPERATIVOS' },
      { label: 'Reporte de Ventas', path: '/reportes/ventas' },
      { label: 'Análisis de Compras', path: '/reportes/compras' },
      { label: 'Eficiencia Operativa', path: '/reportes/eficiencia' },
      { label: 'Gestión Vendedores', path: '/reportes/vendedores' },
      { label: 'AUDITORÍA & RIESGO' },
      { label: 'Antigüedad Cartera', path: '/reportes/antiguedad-cartera' },
      { label: 'Diferencial Cambiario', path: '/reportes/diferencial-cambiario' },
      { label: 'Matriz ABC Stock', path: '/reportes/matriz-abc' },
      { label: 'Rentabilidad Prods', path: '/reportes/rentabilidad' },
      { label: 'Auditoría Excepciones', path: '/reportes/excepciones' },
      { label: 'FISCAL & EXPORTACIÓN' },
      { label: 'Libro Fiscal', path: '/reportes/libro-fiscal' },
      { label: 'Data Export (BI)', path: '/reportes/query-builder' },
    ]
  },
  {
    icon: Settings,
    label: 'Configuración',
    path: '/admin',
    hasSub: true,
    subItems: [
      { label: 'AJUSTES GENERALES' },
      { label: 'Datos de Empresa', path: '/admin' },
      { label: 'Control Numeración', path: '/admin/numeracion' },
      { label: 'Monedas y Tasas BCV', path: '/admin/monedas' },
      { label: 'Sucursales y Almacenes', path: '/admin/sucursales' },
      { label: 'Notificaciones Autom.', path: '/admin/notificaciones' },
      { label: 'SEGURIDAD Y CONTROL' },
      { label: 'Usuarios y Roles', path: '/admin/usuarios' },
      { label: 'Bot de Telegram', path: '/admin/telegram' },
      { label: 'Auditoría Logs', path: '/admin/auditoria' },
      { label: 'Monitoreo Omniscience', path: '/admin/omniscience' },
      { label: 'PANEL DE IMPORTACIÓN' },
      { label: 'Importador Maestro', path: '/admin/importacion' },
      { label: 'Historial Importaciones', path: '/admin/importacion/historial' },
      { label: 'Importación Rápida', path: '/admin/importacion/rapida' },
      { label: 'MANTENIMIENTO' },
      { label: 'Respaldos en la Nube', path: '/admin/respaldos' },
      { label: 'Salud del Sistema', path: '/admin/salud' },
    ]
  },
];

const systemsConfig = {
  all: {
    label: 'Suite Completa',
    icon: Layers,
    gradient: 'from-[#0b5156] to-[#126b71]',
    badge: 'Consolidado'
  },
  administrativo: {
    label: 'S. Administrativo',
    icon: ShoppingBag,
    gradient: 'from-emerald-600 to-teal-600',
    badge: 'Operaciones'
  },
  financiero: {
    label: 'S. Financiero',
    icon: Landmark,
    gradient: 'from-blue-600 to-indigo-600',
    badge: 'Finanzas'
  },
  contable: {
    label: 'S. Contable',
    icon: BookOpen,
    gradient: 'from-violet-600 to-purple-600',
    badge: 'Contabilidad'
  },
  fiscal: {
    label: 'S. Fiscal',
    icon: FileText,
    gradient: 'from-amber-500 to-orange-600',
    badge: 'Tributos'
  },
  nomina: {
    label: 'S. Nómina',
    icon: Users,
    gradient: 'from-pink-600 to-rose-600',
    badge: 'Personal'
  }
};

const isPathReleasingToSystem = (path: string, system: SystemKey): boolean => {
  if (system === 'all') return true;

  if (system === 'administrativo') {
    if (path.startsWith('/ventas') || path.startsWith('/compras') || path.startsWith('/inventario') || ['/', '/historial', '/nueva', '/nueva-fiscal', '/clientes', '/notas', '/pos'].some(p => path === p || path.startsWith(p + '/'))) return true;
    if (path === '/reportes' || path === '/reportes/ventas' || path === '/reportes/compras' || path === '/reportes/eficiencia' || path === '/reportes/vendedores' || path === '/reportes/matriz-abc' || path === '/reportes/rentabilidad') return true;
    if (path === '/admin' || path === '/admin/empresa' || path === '/admin/sucursales' || path === '/admin/numeracion' || path === '/admin/notificaciones' || path === '/admin/usuarios' || path === '/admin/telegram') return true;
  }

  if (system === 'financiero') {
    if (path.startsWith('/cobranzas') || path.startsWith('/pagos') || path.startsWith('/tesoreria')) return true;
    if (path === '/reportes' || path === '/reportes/antiguedad-cartera') return true;
    if (path === '/admin' || path === '/admin/empresa' || path === '/admin/monedas' || path === '/admin/notificaciones' || path === '/admin/usuarios' || path === '/admin/telegram') return true;
  }

  if (system === 'contable') {
    if (path.startsWith('/contabilidad')) return true;
    if (path === '/reportes' || path === '/reportes/diferencial-cambiario' || path === '/reportes/excepciones' || path === '/reportes/query-builder') return true;
    if (path === '/admin' || path === '/admin/empresa' || path === '/admin/usuarios' || path === '/admin/telegram' || path === '/admin/auditoria' || path === '/admin/importacion' || path === '/admin/importacion/historial' || path === '/admin/importacion/rapida' || path === '/admin/respaldos' || path === '/admin/salud' || path === '/admin/omniscience') return true;
  }

  if (system === 'fiscal') {
    if (path.startsWith('/fiscal')) return true;
    if (path === '/reportes' || path === '/reportes/libro-fiscal') return true;
    if (path === '/admin' || path === '/admin/empresa' || path === '/admin/usuarios' || path === '/admin/telegram') return true;
  }

  if (system === 'nomina') {
    if (path.startsWith('/nomina')) return true;
    if (path === '/reportes') return true;
    if (path === '/admin' || path === '/admin/empresa' || path === '/admin/usuarios' || path === '/admin/telegram') return true;
  }

  return false;
};

const filterSubItems = (subItems: any[] | undefined, system: SystemKey): any[] | undefined => {
  if (!subItems) return undefined;
  if (system === 'all') return subItems;

  const filteredWithPaths = subItems.map(sub => {
    if (!sub.path) return sub; // Keep headers for now
    const isAllowed = isPathReleasingToSystem(sub.path, system);
    return isAllowed ? sub : null;
  }).filter(Boolean);

  const result: any[] = [];
  for (let i = 0; i < filteredWithPaths.length; i++) {
    const current = filteredWithPaths[i];
    if (!current.path) {
      let hasContent = false;
      for (let j = i + 1; j < filteredWithPaths.length; j++) {
        if (!filteredWithPaths[j].path) {
          break;
        } else {
          hasContent = true;
          break;
        }
      }
      if (hasContent) {
        result.push(current);
      }
    } else {
      result.push(current);
    }
  }

  return result;
};

const getFilteredNavItems = (system: SystemKey) => {
  const updatedNavItems = [...navItems];

  const hasNomina = updatedNavItems.some(item => item.path === '/nomina');
  if (!hasNomina) {
    const reportesIndex = updatedNavItems.findIndex(item => item.path === '/reportes');
    const nominaItem = {
      icon: Users,
      label: 'Nómina',
      path: '/nomina',
      hasSub: true,
      subItems: [
        { label: 'CONTROL DE PERSONAL' },
        { label: 'Panel de Nómina', path: '/nomina' }
      ]
    };
    if (reportesIndex !== -1) {
      updatedNavItems.splice(reportesIndex, 0, nominaItem);
    } else {
      updatedNavItems.push(nominaItem);
    }
  }

  if (system === 'all') return updatedNavItems;

  return updatedNavItems
    .map(item => {
      if (item.path === '/' || item.path === '/alertas') {
        return item;
      }

      let isPrimaryAllowed = false;
      if (system === 'administrativo') {
        isPrimaryAllowed = ['/ventas', '/', '/compras', '/inventario', '/reportes', '/admin'].includes(item.path);
      } else if (system === 'financiero') {
        isPrimaryAllowed = ['/cobranzas', '/pagos', '/tesoreria', '/reportes', '/admin'].includes(item.path);
      } else if (system === 'contable') {
        isPrimaryAllowed = ['/contabilidad', '/reportes', '/admin'].includes(item.path);
      } else if (system === 'fiscal') {
        isPrimaryAllowed = ['/fiscal', '/reportes', '/admin'].includes(item.path);
      } else if (system === 'nomina') {
        isPrimaryAllowed = ['/nomina', '/reportes', '/admin'].includes(item.path);
      }

      if (!isPrimaryAllowed) return null;

      return {
        ...item,
        subItems: filterSubItems(item.subItems, system)
      };
    })
    .filter(Boolean) as typeof navItems;
};

interface SidebarProps {
  isOpen?: boolean;
}

const Sidebar = ({ isOpen = true }: SidebarProps) => {
  const location = useLocation();
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { activeSystem, setActiveSystem } = useSystem();
  const { userRole, userName, tenantName } = useAuth();

  const displayName = userName
    ? userName.split('@')[0].charAt(0).toUpperCase() + userName.split('@')[0].slice(1)
    : 'Usuario';
  const displayRole = userRole || 'Usuario';
  const initials = displayName.slice(0, 2).toUpperCase();

  const filteredNavItems = useMemo(() => {
    const items = getFilteredNavItems(activeSystem);
    return items;
  }, [activeSystem, userRole]);

  // Auto-expand category if current path matches
  useEffect(() => {
    const activeItem = filteredNavItems.find(item => {
      if (item.label === 'Facturación') {
        return ['/historial', '/nueva', '/nueva-fiscal', '/pos', '/clientes', '/notas'].some(p => location.pathname === p || location.pathname.startsWith(p + '/'));
      }
      return location.pathname !== '/' && location.pathname.startsWith(item.path) && item.hasSub;
    });
    if (activeItem) {
      setExpandedItem(activeItem.label);
    }
  }, [location.pathname, filteredNavItems]);

  const toggleExpand = (label: string) => {
    setExpandedItem(prev => prev === label ? null : label);
  };

  const activeConfig = systemsConfig[activeSystem];
  const ActiveIcon = activeConfig.icon;

  return (
    <aside className={`print:hidden bg-[#f4f6f8] border-slate-200 flex flex-col h-screen sticky top-0 shadow-sm overflow-hidden z-50 transition-all duration-300 ${isOpen ? 'w-60 border-r' : 'w-0 border-r-0'}`}>
      <div className="w-full overflow-hidden border-b border-slate-200/80 mb-3">
        <img
          src={`${(import.meta as any).env.BASE_URL}logorecortado.webp?v=3`}
          alt="KODA Logo"
          className="w-full h-auto block"
        />
      </div>

      {/* Switcher de Sistema Premium */}
      <div className="relative px-4 mb-4 shrink-0">
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 transition-all duration-300 shadow-sm group hover:shadow"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-1.5 rounded-lg text-white bg-gradient-to-br ${activeConfig.gradient} shadow-sm group-hover:scale-105 transition-transform`}>
              <ActiveIcon size={16} />
            </div>
            <div className="text-left min-w-0">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider leading-none mb-0.5">{activeConfig.badge}</p>
              <p className="text-xs font-black text-slate-800 truncate">{activeConfig.label}</p>
            </div>
          </div>
          <ChevronDown size={14} className={`text-slate-400 transition-transform duration-300 ${isDropdownOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown de Opciones */}
        {isDropdownOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setIsDropdownOpen(false)} />
            <div className="absolute left-4 right-4 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-40 p-2 space-y-1 animate-in fade-in slide-in-from-top-2 duration-200">
              {(Object.keys(systemsConfig) as SystemKey[]).map((key) => {
                const config = systemsConfig[key];
                const Icon = config.icon;
                const isSelected = activeSystem === key;

                return (
                  <button
                    key={key}
                    onClick={() => {
                      setActiveSystem(key);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all duration-200 ${
                      isSelected
                        ? 'bg-slate-50 text-slate-900 font-black'
                        : 'text-slate-600 hover:bg-slate-50/80 hover:text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`p-1.5 rounded-lg text-white bg-gradient-to-br ${config.gradient} shadow-sm`}>
                        <Icon size={14} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">{config.badge}</p>
                        <p className="text-xs font-bold text-slate-700 truncate">{config.label}</p>
                      </div>
                    </div>
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-[#0b5156]" />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <nav className="flex-1 px-4 space-y-0.5 overflow-y-auto sidebar-scrollbar pb-4">
        {filteredNavItems.map((item) => {
          const isExpanded = expandedItem === item.label;
          const isParentActive = item.label === 'Inicio'
            ? location.pathname === '/'
            : item.label === 'Facturación'
            ? ['/historial', '/nueva', '/nueva-fiscal', '/pos', '/clientes', '/notas'].some(p => location.pathname === p || location.pathname.startsWith(p + '/'))
            : location.pathname.startsWith(item.path);

          return (
            <div key={item.label} className="space-y-0.5">
              <NavLink
                to={item.label === 'Facturación' ? '/historial' : item.path}
                onClick={(e) => {
                  if (item.hasSub) {
                    if (e.detail >= 2) {
                      setExpandedItem(item.label);
                    } else {
                      toggleExpand(item.label);
                    }
                  }
                }}
                target={item.path === '/developer' ? '_blank' : undefined}
                rel={item.path === '/developer' ? 'noopener noreferrer' : undefined}
                className={`
                  flex items-center justify-between px-4 py-2.5 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]
                  ${isParentActive
                    ? 'bg-gradient-to-r from-[#0b5156] to-[#126b71] text-white shadow-md shadow-green-950/20 rounded-lg text-sm font-black'
                    : 'text-slate-500 hover:bg-white hover:text-slate-800 hover:shadow-sm rounded-lg text-sm font-bold hover:translate-x-1'}
                `}
              >
                {() => (
                  <>
                    <div className="flex items-center gap-3">
                      <item.icon size={17} strokeWidth={isParentActive ? 2.5 : 2} className={isParentActive ? 'drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]' : ''} />
                      <span>{item.label}</span>
                    </div>
                    {item.hasSub && (
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-300 ${isParentActive ? 'text-white' : 'opacity-50'} ${isExpanded ? 'rotate-180' : ''}`}
                      />
                    )}
                  </>
                )}
              </NavLink>

              {/* SUB-ITEMS RENDERING with conditional visibility */}
              {item.subItems && isExpanded && (
                <div className="ml-7 pl-4 border-l border-slate-200/80 py-1 space-y-1 animate-in fade-in slide-in-from-top-2 duration-300">
                  {item.subItems.map((sub) => {
                    if (!sub.path) {
                      return (
                        <div key={sub.label} className="pt-3 pb-1 text-[9px] font-black uppercase tracking-widest text-slate-800 opacity-60">
                          {sub.label}
                        </div>
                      );
                    }

                    return (
                      <NavLink
                        key={sub.path}
                        to={sub.path}
                        end
                        target={sub.path.startsWith('/developer') ? '_blank' : undefined}
                        rel={sub.path.startsWith('/developer') ? 'noopener noreferrer' : undefined}
                        className={({ isActive }) => `
                          k-submenu-link relative flex items-center py-2.5 uppercase tracking-widest transition-all text-[10px] duration-300 hover:translate-x-1.5
                          ${isActive && !sub.path.startsWith('/developer')
                            ? 'active text-slate-900 font-black'
                            : 'text-slate-400 hover:text-slate-800 font-bold'}
                        `}
                      >
                        {({ isActive }) => (
                          <>
                            {isActive && (
                              <div className="absolute -left-[21px] top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-slate-900 border-2 border-white shadow-[0_0_8px_rgba(15,23,42,0.4)] z-10 animate-sidebar-bullet"></div>
                            )}
                            <span className="truncate">{sub.label}</span>
                          </>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-200 bg-[#edf0f3]">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-[#0b5156] flex items-center justify-center text-white text-[10px] font-bold shadow-sm" title={userName || ''}>
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black text-slate-800 truncate">{displayName}</p>
            <p className="text-[8px] font-bold text-slate-400 uppercase truncate">
              {displayRole} {tenantName ? `| 🏢 ${tenantName}` : ''}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
