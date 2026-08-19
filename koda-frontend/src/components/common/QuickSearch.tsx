import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Compass, CornerDownLeft, X } from 'lucide-react';

interface QuickSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SearchItem {
  category: string;
  label: string;
  path: string;
  keywords: string;
}

const searchDatabase: SearchItem[] = [
  // Inicio
  { category: 'General', label: 'Inicio / Principal', path: '/', keywords: 'inicio home principal dashboard koda' },
  { category: 'General', label: 'Centro de Alertas', path: '/alertas', keywords: 'alertas notificaciones avisos logs centro' },
  
  // Ventas
  { category: 'Ventas', label: 'Dashboard Comercial', path: '/ventas', keywords: 'ventas comercial dashboard graficos estadisticas' },
  { category: 'Ventas', label: 'Listas de Precios', path: '/ventas/precios', keywords: 'precios listas productos catalogo margen' },
  { category: 'Ventas', label: 'Cotizaciones', path: '/ventas/cotizaciones', keywords: 'cotizaciones presupuestos ofertas clientes' },
  { category: 'Ventas', label: 'Órdenes de Venta', path: '/ventas/ordenes', keywords: 'ordenes pedidos facturar ventas solicitudes' },
  { category: 'Ventas', label: 'Notas de Entrega', path: '/ventas/entregas', keywords: 'notas entrega despachos envios guias' },

  // Facturación
  { category: 'Facturación', label: 'Facturas Emitidas', path: '/historial', keywords: 'facturas emitidas libro cobradas fiscal' },
  { category: 'Facturación', label: 'Nueva Factura', path: '/nueva', keywords: 'nueva factura crear emitir pos cobro' },
  { category: 'Facturación', label: 'Maestro de Clientes', path: '/clientes', keywords: 'clientes maestro directorio base de datos cxc' },
  { category: 'Facturación', label: 'Notas de Crédito y Débito', path: '/notas', keywords: 'notas credito debito devoluciones fiscal' },
  { category: 'Facturación', label: 'Punto de Venta (POS)', path: '/pos', keywords: 'pos caja facturar rapido punto venta' },

  // Compras
  { category: 'Compras', label: 'Dashboard de Compras', path: '/compras', keywords: 'compras dashboard gastos proveedores' },
  { category: 'Compras', label: 'Anteproyecto de Costos', path: '/compras/anteproyecto', keywords: 'anteproyecto costos estimaciones presupuestos' },
  { category: 'Compras', label: 'Maestro de Proveedores', path: '/compras/proveedores', keywords: 'proveedores maestro directorio compras cxp' },
  { category: 'Compras', label: 'Solicitudes de Compra', path: '/compras/requisiciones', keywords: 'solicitudes requisiciones pedidos internos' },
  { category: 'Compras', label: 'Órdenes de Compra', path: '/compras/ordenes', keywords: 'ordenes compra b2b solicitudes proveedores' },
  { category: 'Compras', label: 'Aprobaciones de Procura', path: '/compras/aprobaciones', keywords: 'aprobaciones autorizar firmas gerencia compras' },
  { category: 'Compras', label: 'Recepción de Stock', path: '/compras/recepcion', keywords: 'recepcion stock almacen entradas mercancia' },
  { category: 'Compras', label: 'Facturas de Proveedor', path: '/compras/facturas', keywords: 'facturas proveedor cuentas pagar cxp' },
  { category: 'Compras', label: 'Devoluciones a Proveedores', path: '/compras/devoluciones', keywords: 'devoluciones fallas compras roturas' },
  { category: 'Compras', label: 'Historial Total de Compras', path: '/compras/historial', keywords: 'historial compras transacciones auditoria b2b' },

  // Inventario
  { category: 'Inventario', label: 'Resumen de Almacén', path: '/inventario', keywords: 'almacen resumen stock valorizado inventario' },
  { category: 'Inventario', label: 'Catálogo de Productos', path: '/inventario/productos', keywords: 'productos catalogo sku maestro stock' },
  { category: 'Inventario', label: 'Existencias Físicas', path: '/inventario/existencias', keywords: 'existencias stock disponibles lotes ubicaciones' },
  { category: 'Inventario', label: 'Libro Kardex', path: '/inventario/kardex', keywords: 'kardex libro movimientos trazabilidad cpp' },
  { category: 'Inventario', label: 'Maestro de Almacenes', path: '/inventario/almacenes', keywords: 'almacenes maestro sucursales depositos' },
  { category: 'Inventario', label: 'Transferencias Internas', path: '/inventario/transferencias', keywords: 'transferencias internas stock traslados' },
  { category: 'Inventario', label: 'Ajustes de Stock', path: '/inventario/ajustes', keywords: 'ajustes stock mermas perdidas diferencias' },
  { category: 'Inventario', label: 'Stock Crítico y Reposición', path: '/inventario/critico', keywords: 'stock critico bajo minimo reponer alerta' },
  { category: 'Inventario', label: 'Toma Física / Conciliación', path: '/inventario/fisico', keywords: 'toma fisica conteo snapshot inventario' },

  // Cobranzas
  { category: 'Cobranzas', label: 'Dashboard de Cobros', path: '/cobranzas', keywords: 'cobros cobranzas cxc cartera vencido' },
  { category: 'Cobranzas', label: 'Cartera CxC', path: '/cobranzas/cartera', keywords: 'cartera cxc clientes saldos facturas' },
  { category: 'Cobranzas', label: 'Aplicar Cobro', path: '/cobranzas/aplicar', keywords: 'aplicar cobro registrar pago abono ingreso bcv' },
  { category: 'Cobranzas', label: 'Antigüedad de Saldos', path: '/cobranzas/antiguedad', keywords: 'antiguedad saldos vencimiento dias mora' },
  { category: 'Cobranzas', label: 'Estado de Cuenta', path: '/cobranzas/estado-cuenta', keywords: 'estado cuenta reportes transacciones cliente' },
  { category: 'Cobranzas', label: 'Flujo de Caja Proyectado', path: '/cobranzas/flujo', keywords: 'flujo caja cxc cobros planificacion' },
  { category: 'Cobranzas', label: 'Anticipos recibidos', path: '/cobranzas/anticipos', keywords: 'anticipos saldos pasivos proteccion caja' },

  // Pagos
  { category: 'Pagos', label: 'Dashboard de Pagos', path: '/pagos', keywords: 'pagos cxp proveedores pasivos egresos' },
  { category: 'Pagos', label: 'Cartera CxP', path: '/pagos/cuentas-por-pagar', keywords: 'cartera cxp facturas pagar deudas proveedores' },
  { category: 'Pagos', label: 'Órdenes de Pago', path: '/pagos/ordenes', keywords: 'ordenes pago autorizar egresos tesoreria' },
  { category: 'Pagos', label: 'Lotes de Pago Masivo', path: '/pagos/lotes', keywords: 'lotes pago masivo transferencias bancos' },
  { category: 'Pagos', label: 'Programación de Egresos', path: '/pagos/programacion', keywords: 'programacion pagos flujo egresos vencimiento' },

  // Tesorería
  { category: 'Tesorería', label: 'Posición Consolidada', path: '/tesoreria', keywords: 'tesoreria posicion consolidada caja bancos efectivo' },
  { category: 'Tesorería', label: 'Cuentas Bancarias', path: '/tesoreria/bancos', keywords: 'cuentas bancarias conciliacion bcv saldos' },
  { category: 'Tesorería', label: 'Movimientos Bancarios', path: '/tesoreria/movimientos-bancarios', keywords: 'movimientos bancarios transacciones ingresos egresos' },
  { category: 'Tesorería', label: 'Conciliación Bancaria', path: '/tesoreria/conciliacion', keywords: 'conciliacion extracto libros saldo diferencias' },
  { category: 'Tesorería', label: 'Tasas de Cambio BCV', path: '/tesoreria/tasas', keywords: 'tasas cambio bcv divisas fluctuacion dolares' },
  { category: 'Tesorería', label: 'Caja Chica', path: '/tesoreria/caja-chica', keywords: 'caja chica gastos menores reembolsos custodio' },
  { category: 'Tesorería', label: 'Arqueos de Caja', path: '/tesoreria/arqueo', keywords: 'arqueos caja cierres turnos sobrantes faltantes' },
  { category: 'Tesorería', label: 'Movimientos de Caja', path: '/tesoreria/movimientos-caja', keywords: 'movimientos caja efectivo egresos ingresos' },
  { category: 'Tesorería', label: 'Integridad de Turnos', path: '/tesoreria/turnos', keywords: 'integridad turnos auditoria cajeros fraudes' },
  { category: 'Tesorería', label: 'Préstamos UVC', path: '/tesoreria/prestamos', keywords: 'prestamos uvc indexados bancos indexacion' },
  { category: 'Tesorería', label: 'Desviación Presupuestaria', path: '/tesoreria/presupuesto', keywords: 'desviacion presupuesto ejecutado planificado' },
  { category: 'Tesorería', label: 'Rendimiento de Inversiones', path: '/tesoreria/inversiones', keywords: 'rendimiento inversiones intereses colocaciones yields' },
  { category: 'Tesorería', label: 'Importar Extracto Bancario', path: '/tesoreria/importar', keywords: 'importar extracto excel csv bancos conciliacion' },

  // Fiscal
  { category: 'Fiscal', label: 'Dashboard Fiscal', path: '/fiscal', keywords: 'fiscal impuestos retenciones declaracion' },
  { category: 'Fiscal', label: 'Libro de Ventas', path: '/fiscal/libro-ventas', keywords: 'libro ventas seniat debito fiscal iva' },
  { category: 'Fiscal', label: 'Libro de Compras', path: '/fiscal/libro-compras', keywords: 'libro compras seniat credito fiscal iva' },
  { category: 'Fiscal', label: 'Declaración de IVA', path: '/fiscal/declaracion-iva', keywords: 'declaracion iva seniat contribuyentes' },
  { category: 'Fiscal', label: 'Retenciones de IVA', path: '/fiscal/retenciones-iva', keywords: 'retenciones iva clientes proveedores comprobantes' },
  { category: 'Fiscal', label: 'Retenciones de ISLR', path: '/fiscal/retenciones-islr', keywords: 'retenciones islr seniat comprobantes' },
  { category: 'Fiscal', label: 'Declaración de ISLR', path: '/fiscal/declaracion-islr', keywords: 'declaracion islr estimada definitiva seniat' },
  { category: 'Fiscal', label: 'Calendario Fiscal Sujetos Pasivos', path: '/fiscal/calendario', keywords: 'calendario fiscal fechas limites seniat' },
  { category: 'Fiscal', label: 'Obligaciones y Providencias', path: '/fiscal/obligaciones', keywords: 'obligaciones providencias normativas seniat' },
  { category: 'Fiscal', label: 'Conceptos de ISLR', path: '/fiscal/conceptos-islr', keywords: 'conceptos islr tarifas porcentajes' },
  { category: 'Fiscal', label: 'Generador de ARC Fiscal', path: '/fiscal/arc', keywords: 'generador arc comprobantes retencion anual' },
  { category: 'Fiscal', label: 'Impuesto IGTF', path: '/fiscal/igtf', keywords: 'impuesto igtf transacciones divisas efectivo' },

  // Contabilidad
  { category: 'Contabilidad', label: 'Panel Contable', path: '/contabilidad', keywords: 'contabilidad panel principal balances' },
  { category: 'Contabilidad', label: 'Libro Diario', path: '/contabilidad/diario', keywords: 'libro diario asientos transacciones partidas' },
  { category: 'Contabilidad', label: 'Libro Mayor', path: '/contabilidad/mayor', keywords: 'libro mayor cuentas analitico auxiliares' },
  { category: 'Contabilidad', label: 'Balance de Comprobación', path: '/contabilidad/balance-comprobacion', keywords: 'balance comprobacion sumas saldos' },
  { category: 'Contabilidad', label: 'Balance General', path: '/contabilidad/balance-general', keywords: 'balance general activos pasivos patrimonio' },
  { category: 'Contabilidad', label: 'Estado de Resultados', path: '/contabilidad/estado-resultados', keywords: 'estado resultados ingresos costos gastos' },
  { category: 'Contabilidad', label: 'Flujo de Efectivo Contable', path: '/contabilidad/flujo-caja', keywords: 'flujo efectivo indirecto directo' },
  { category: 'Contabilidad', label: 'Plan de Cuentas (Catálogo)', path: '/contabilidad/catalogo', keywords: 'plan cuentas catalogo codigos contables' },
  { category: 'Contabilidad', label: 'Asiento Diario Manual', path: '/contabilidad/asiento-manual', keywords: 'asiento manual diario contabilidad' },
  { category: 'Contabilidad', label: 'Cierre de Período Contable', path: '/contabilidad/cierre', keywords: 'cierre periodo fiscal anual mensual' },
  { category: 'Contabilidad', label: 'Centros de Costo', path: '/contabilidad/centros-costo', keywords: 'centros costo departamentos proyectos prorrateo' },
  { category: 'Contabilidad', label: 'Ajuste por Diferencia Cambiaria', path: '/contabilidad/ajuste-cambiario', keywords: 'ajuste diferencia cambiaria reexpresion' },
  { category: 'Contabilidad', label: 'Ajuste por Inflación (DPC-10)', path: '/contabilidad/ajuste-inflacion', keywords: 'ajuste inflacion ipc dpc10 reexpresado' },
  { category: 'Contabilidad', label: 'Auditoría de Diario', path: '/contabilidad/auditoria-diario', keywords: 'auditoria diario descuadres partidas dobles' },
  { category: 'Contabilidad', label: 'Consolidación de Balances', path: '/contabilidad/consolidacion', keywords: 'consolidacion balances filiales matriz' },
  { category: 'Contabilidad', label: 'Configuración Contable', path: '/contabilidad/admin', keywords: 'configuracion contable reglas integracion' },

  // Reportes
  { category: 'Reportes', label: 'Centro de Reportes BI', path: '/reportes', keywords: 'centro reportes dashboard bi inteligencia' },
  { category: 'Reportes', label: 'Reporte Analítico de Ventas', path: '/reportes/ventas', keywords: 'reporte ventas rentabilidad vendedores' },
  { category: 'Reportes', label: 'Análisis de Compras y Procura', path: '/reportes/compras', keywords: 'analisis compras precios proveedores' },
  { category: 'Reportes', label: 'Eficiencia Operativa', path: '/reportes/eficiencia', keywords: 'eficiencia operativa mermas tiempos procesos' },
  { category: 'Reportes', label: 'Antigüedad CxC / CxP', path: '/reportes/antiguedad-cartera', keywords: 'antiguedad cxc cxp morosidad dias promedio' },
  { category: 'Reportes', label: 'Diferencial Cambiario', path: '/reportes/diferencial-cambiario', keywords: 'diferencial cambiario ganancias perdidas' },
  { category: 'Reportes', label: 'Matriz ABC de Stock', path: '/reportes/matriz-abc', keywords: 'matriz abc stock inventario valor rotacion' },
  { category: 'Reportes', label: 'Rentabilidad de Productos', path: '/reportes/rentabilidad', keywords: 'rentabilidad productos margen utilidad bruto' },
  { category: 'Reportes', label: 'Gestión de Vendedores', path: '/reportes/vendedores', keywords: 'gestion vendedores comisiones cuotas metas' },
  { category: 'Reportes', label: 'Auditoría de Excepciones', path: '/reportes/excepciones', keywords: 'auditoria excepciones anulaciones descuentos' },
  { category: 'Reportes', label: 'Libros Fiscales Exportables', path: '/reportes/libro-fiscal', keywords: 'libros fiscales compras ventas seniat txt' },
  { category: 'Reportes', label: 'Data Export (Query Builder)', path: '/reportes/query-builder', keywords: 'data export query builder sql excel' },

  // Configuración / Administración
  { category: 'Configuración', label: 'Datos de la Empresa', path: '/admin/empresa', keywords: 'empresa datos rif nombre direccion' },
  { category: 'Configuración', label: 'Control de Numeración Fiscal', path: '/admin/numeracion', keywords: 'control numeracion facturas notas control' },
  { category: 'Configuración', label: 'Monedas y Tasas de Cambio', path: '/admin/monedas', keywords: 'monedas tasas divisas bcv dolares' },
  { category: 'Configuración', label: 'Sucursales y Almacenes', path: '/admin/sucursales', keywords: 'sucursales almacenes puntos venta' },
  { category: 'Configuración', label: 'Notificaciones Automáticas', path: '/admin/notificaciones', keywords: 'notificaciones automaticas correos sms alertas' },
  { category: 'Configuración', label: 'Usuarios, Roles y Permisos', path: '/admin/usuarios', keywords: 'usuarios roles permisos seguridad accesos' },
  { category: 'Configuración', label: 'Logs de Auditoría / Seguridad', path: '/admin/auditoria', keywords: 'logs auditoria seguridad ingresos operaciones' },
  { category: 'Configuración', label: 'Importador Maestro de Catálogos', path: '/admin/importacion', keywords: 'importador maestro catalogos excel csv' },
  { category: 'Configuración', label: 'Historial de Importaciones', path: '/admin/importacion/historial', keywords: 'historial importaciones logs cargas' },
  { category: 'Configuración', label: 'Importación Rápida de Inventario', path: '/admin/importacion/rapida', keywords: 'importacion rapida inventario stock excel' },
  { category: 'Configuración', label: 'Respaldos en la Nube', path: '/admin/respaldos', keywords: 'respaldos nube copias seguridad db' },
  { category: 'Configuración', label: 'Salud del Sistema y Diagnóstico', path: '/admin/salud', keywords: 'salud sistema recursos cpu base de datos' },

];

// Fuzzy Levenshtein Distance & Sequence Matching Algorithms
const levenshtein = (a: string, b: string): number => {
  const tmp: number[][] = [];
  let i: number, j: number;
  for (i = 0; i <= a.length; i++) {
    tmp[i] = [i];
  }
  for (j = 0; j <= b.length; j++) {
    tmp[0][j] = j;
  }
  for (i = 1; i <= a.length; i++) {
    for (j = 1; j <= b.length; j++) {
      tmp[i][j] = Math.min(
        tmp[i - 1][j] + 1,
        tmp[i][j - 1] + 1,
        tmp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return tmp[a.length][b.length];
};

const getSearchScore = (item: SearchItem, query: string): number => {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const label = item.label.toLowerCase();
  const category = item.category.toLowerCase();
  const keywords = item.keywords.toLowerCase();
  const targetText = `${item.label} ${item.category} ${item.keywords}`.toLowerCase();

  // 1. Perfect matches
  if (label === q) return 100;
  if (label.startsWith(q)) return 80;
  if (label.includes(q)) return 60;
  if (category.includes(q)) return 40;
  if (keywords.includes(q)) return 30;

  // 2. Character sequence matching (letters in same order)
  let tIdx = 0;
  let qIdx = 0;
  while (tIdx < targetText.length && qIdx < q.length) {
    if (targetText[tIdx] === q[qIdx]) {
      qIdx++;
    }
    tIdx++;
  }
  if (qIdx === q.length) return 20;

  // 3. Word-based fuzzy Levenshtein matching (helps with typos like 'kadex' -> 'kardex')
  const queryWords = q.split(/\s+/);
  const targetWords = targetText.split(/[\s\-/\(\)]+/);
  let totalDist = 0;
  let matchedWords = 0;

  for (const qw of queryWords) {
    if (qw.length < 3) {
      if (targetWords.some(tw => tw.includes(qw))) {
        matchedWords++;
      }
      continue;
    }

    let bestWordDist = 999;
    for (const tw of targetWords) {
      if (tw.includes(qw) || qw.includes(tw)) {
        bestWordDist = 0;
      } else {
        const dist = levenshtein(tw, qw);
        if (dist < bestWordDist) {
          bestWordDist = dist;
        }
      }
    }

    // Allow 1 typo edit for words up to 4 chars, 2 typo edits for longer words
    const maxAllowedEdits = qw.length <= 4 ? 1 : 2;
    if (bestWordDist <= maxAllowedEdits) {
      totalDist += bestWordDist;
      matchedWords++;
    }
  }

  if (matchedWords === queryWords.length) {
    // Return a score between 5 and 10 depending on distance
    return 10 - totalDist;
  }

  return 0;
};

const QuickSearch: React.FC<QuickSearchProps> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Focus input when search modal is opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setResults(searchDatabase.slice(0, 5)); // Initial top 5 recommendations
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Handle dynamic query filtering
  useEffect(() => {
    if (!isOpen) return;

    if (query.trim() === '') {
      setResults(searchDatabase.slice(0, 5));
      setSelectedIndex(0);
      return;
    }

    const scored = searchDatabase
      .map(item => ({ item, score: getSearchScore(item, query) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(x => x.item);

    setResults(scored.slice(0, 6)); // Top 6 matching items
    setSelectedIndex(0);
  }, [query, isOpen]);

  // Key navigation logic
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev + 1) % results.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (results.length > 0 ? (prev - 1 + results.length) % results.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          navigate(results[selectedIndex].path);
          onClose();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose, navigate]);

  // Handle click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex justify-center items-start pt-[12vh] px-4 z-[100] animate-in fade-in duration-150">
      <div 
        ref={containerRef}
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[70vh]"
      >
        {/* Header Search Input */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <Search className="text-[#0b5156] flex-shrink-0" size={20} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar módulos, reportes o clientes..."
            className="flex-1 bg-transparent border-none text-slate-800 focus:outline-none placeholder-slate-400 text-base font-medium"
          />
          <kbd className="hidden sm:inline-flex items-center h-6 select-none pointer-events-none px-2 rounded-lg bg-slate-100 border border-slate-200 text-[10px] font-black text-slate-400 font-mono">
            ESC
          </kbd>
          <button 
            onClick={onClose}
            className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results List */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-3 space-y-1 bg-white">
          {results.length > 0 ? (
            results.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.path + idx}
                  onClick={() => {
                    navigate(item.path);
                    onClose();
                  }}
                  className={`flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all duration-150 ${
                    isSelected 
                      ? 'bg-[#0b5156] text-white shadow-lg shadow-[#0b5156]/15' 
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-xl flex items-center justify-center ${
                      isSelected ? 'bg-white/10' : 'bg-slate-100'
                    }`}>
                      <Compass size={18} className={isSelected ? 'text-white' : 'text-[#0b5156]'} />
                    </div>
                    <div className="space-y-0.5">
                      <p className={`text-sm font-black uppercase tracking-wide ${
                        isSelected ? 'text-white' : 'text-slate-800'
                      }`}>{item.label}</p>
                      <p className={`text-[10px] font-bold uppercase tracking-widest ${
                        isSelected ? 'text-white/60' : 'text-slate-400'
                      }`}>{item.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isSelected && (
                      <span className="flex items-center gap-1 text-[10px] font-black uppercase bg-white/10 px-2.5 py-1 rounded-lg">
                        Seleccionar <CornerDownLeft size={10} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-12 px-4 text-center">
              <Compass size={32} className="mx-auto text-slate-300 animate-pulse mb-3" />
              <p className="text-sm font-black text-slate-800 uppercase tracking-widest">Sin resultados</p>
              <p className="text-xs font-bold text-slate-400 uppercase mt-1">Intente buscar con otros términos o palabras clave</p>
            </div>
          )}
        </div>

        {/* Footer shortcuts helper */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest select-none">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 shadow-xs font-mono">↑↓</kbd> Navegar
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 shadow-xs font-mono">Enter</kbd> Seleccionar
            </span>
          </div>
          <span className="flex items-center gap-1.5">
            <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 shadow-xs font-mono">Esc</kbd> Cerrar
          </span>
        </div>
      </div>
    </div>
  );
};

export default QuickSearch;
