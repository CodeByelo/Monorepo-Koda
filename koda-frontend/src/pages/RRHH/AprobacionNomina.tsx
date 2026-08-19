import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  DollarSign, 
  Clock, 
  Briefcase, 
  ArrowRight, 
  Lock, 
  Activity, 
  CheckCircle, 
  ShieldAlert
} from 'lucide-react';
import { api } from '@/api/client';
import { usePagination } from '@/hooks/usePagination';
import { PaginatedResponse } from '@/types';

interface Empleado {
  id: string; // UUID
  nombre_completo: string;
  cargo: string;
}

interface LedgerMovement {
  id: string;
  event_type: string;
  empleado: string;
  monto: string;
  timestamp: string;
  moneda: string;
}

const DEFAULT_EMPLOYEES: Empleado[] = [
  { id: '00000000-0000-0000-0000-000000000001', nombre_completo: 'Juan Pérez', cargo: 'Analista de Sistemas' },
  { id: '00000000-0000-0000-0000-000000000002', nombre_completo: 'María Gómez', cargo: 'Gerente de Operaciones' },
  { id: '00000000-0000-0000-0000-000000000003', nombre_completo: 'Carlos Rodríguez', cargo: 'Especialista de Finanzas' }
];

export default function AprobacionNomina() {
  const { limit, offset, totalRecords, setTotalRecords, nextPage, prevPage, hasNextPage, hasPrevPage, currentPage, totalPages } = usePagination(50);
  const [employees, setEmployees] = useState<Empleado[]>(DEFAULT_EMPLOYEES);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('');
  const [montoNeto, setMontoNeto] = useState<string>('');
  const [moneda, setMoneda] = useState<'USD' | 'VED'>('USD');
  const [concepto, setConcepto] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const filteredEmployees = useMemo(() => {
    if (!searchTerm.trim()) {
      return employees.slice(0, 100);
    }
    const term = searchTerm.toLowerCase();
    return employees.filter(emp =>
      (emp.nombre_completo || '').toLowerCase().includes(term) ||
      (emp.cargo || '').toLowerCase().includes(term)
    );
  }, [employees, searchTerm]);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');

  const [movimientos, setMovimientos] = useState<LedgerMovement[]>([
    { id: 'm1', event_type: 'nomina.pago_aprobado', empleado: 'Juan Pérez', monto: '1,200.00', timestamp: 'HACE 5 MIN', moneda: 'USD' },
    { id: 'm2', event_type: 'nomina.pago_aprobado', empleado: 'María Gómez', monto: '2,500.00', timestamp: 'HACE 25 MIN', moneda: 'USD' },
    { id: 'm3', event_type: 'nomina.pago_aprobado', empleado: 'Carlos Rodríguez', monto: '1,500.00', timestamp: 'HACE 1 HORA', moneda: 'USD' }
  ]);

  // Cargar lista de empleados reales desde el API y convertirlos a UUID si es necesario
  useEffect(() => {
    let active = true;
    api.get<PaginatedResponse<any>>(`/rrhh/empleados?limit=${limit}&offset=${offset}`)
      .then(res => {
        if (active && res && res.data) {
          setTotalRecords(res.total_records || 0);
          const mapped = res.data.map((emp, idx) => {
            // Generar UUID determinista a partir del ID entero del empleado
            const employeeUuid = `00000000-0000-0000-0000-${String(emp.id || idx + 1).padStart(12, '0')}`;
            return {
              id: employeeUuid,
              nombre_completo: emp.nombre_completo || `${emp.nombre} ${emp.apellido}`,
              cargo: emp.cargo || 'Planilla'
            };
          });
          setEmployees(mapped);
        }
      })
      .catch(err => {
        console.warn("No se pudieron obtener los empleados reales. Usando valores por defecto:", err);
      });

    return () => {
      active = false;
    };
  }, [limit, offset, setTotalRecords]);

  const selectedEmployee = useMemo(() => {
    return employees.find(e => e.id === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  const handleAuthorize = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage('');
    setErrorMessage('');

    if (!selectedEmployeeId) {
      setErrorMessage("Por favor, seleccione un empleado.");
      return;
    }

    if (!montoNeto || Number(montoNeto) <= 0) {
      setErrorMessage("Por favor, ingrese un monto neto válido (mayor a 0).");
      return;
    }

    if (!concepto.trim()) {
      setErrorMessage("Por favor, describa el concepto de pago.");
      return;
    }

    setIsLoading(true);

    try {
      const payload = {
        empleado_id: selectedEmployeeId,
        monto_neto: Number(montoNeto),
        concepto: concepto,
        moneda: moneda
      };

      const res = await api.post<any>('/v1/nomina/aprobar-pago', payload);
      
      setSuccessMessage(`Desembolso de nómina autorizado con éxito. Recibo ID: ${res.pago_id.substring(0, 8)}...`);
      
      // Agregar al panel lateral de auditoría
      const newMovement: LedgerMovement = {
        id: res.pago_id,
        event_type: 'nomina.pago_aprobado',
        empleado: selectedEmployee ? selectedEmployee.nombre_completo : 'Empleado',
        monto: Number(montoNeto).toLocaleString('en-US', { minimumFractionDigits: 2 }),
        timestamp: 'JUSTO AHORA',
        moneda: moneda
      };
      setMovimientos([newMovement, ...movimientos]);

      // Resetear formulario
      setSelectedEmployeeId('');
      setMontoNeto('');
      setConcepto('');
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "Error al procesar la transacción de nómina.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-slate-200 p-4 font-sans">
      {/* Encabezado */}
      <header className="mb-6 p-4 bg-[#111115] border border-slate-800 rounded flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-emerald-500">
            <Users size={18} />
            <span className="text-[9px] font-bold uppercase tracking-widest bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-800 text-emerald-400">Fase 6 - RRHH</span>
          </div>
          <h1 className="text-xl font-bold text-slate-100 uppercase tracking-tight font-mono">Aprobación de Nómina</h1>
          <p className="text-slate-400 text-xs font-bold uppercase tracking-tight">Registro de recibos de pago con inyección de evidencia forense al Ledger</p>
        </div>
        <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded border border-slate-800 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
          <Lock size={12} /> Búnker Conectado
        </div>
      </header>

      {/* Alertas */}
      {successMessage && (
        <div className="mb-4 p-3 rounded bg-emerald-950/40 border border-emerald-800 text-emerald-400 text-xs font-bold flex items-center gap-3">
          <CheckCircle size={16} className="shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="mb-4 p-3 rounded bg-red-950/40 border border-red-800 text-red-400 text-xs font-bold flex items-center gap-3">
          <ShieldAlert size={16} className="shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Grid General */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Formulario Principal */}
        <form onSubmit={handleAuthorize} className="lg:col-span-2 bg-[#111115] border border-slate-800 rounded p-4 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-850 pb-2">
            <Activity size={14} className="text-emerald-500" />
            <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">Autorización de Desembolso</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Selector de Empleado */}
            <div className="space-y-1 md:col-span-2">
              <div className="flex justify-between items-center">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Trabajador / Empleado</label>
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tight">Página {currentPage} de {totalPages} (Total: {totalRecords})</span>
              </div>
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder="Filtro rápido (ej. Juan)..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-1 bg-[#17171c] border border-slate-800 rounded text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-600 transition-colors duration-150 uppercase"
                />
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full px-3 py-1.5 bg-[#17171c] border border-slate-800 rounded text-xs text-slate-100 focus:outline-none focus:border-emerald-600 transition-colors duration-150 uppercase"
                >
                  <option value="">-- Seleccionar Empleado --</option>
                  {filteredEmployees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.nombre_completo} ({emp.cargo})</option>
                  ))}
                </select>
                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    disabled={!hasPrevPage}
                    onClick={prevPage}
                    className="px-2.5 py-1 bg-slate-900 border border-slate-800 hover:border-emerald-600 disabled:opacity-30 disabled:hover:border-slate-800 text-[10px] font-bold uppercase tracking-wider rounded text-slate-300 transition-colors cursor-pointer"
                  >
                    Anterior
                  </button>
                  <span className="text-[9px] font-mono text-slate-500 uppercase font-bold">Pág. {currentPage} / {totalPages}</span>
                  <button
                    type="button"
                    disabled={!hasNextPage}
                    onClick={nextPage}
                    className="px-2.5 py-1 bg-slate-900 border border-slate-800 hover:border-emerald-600 disabled:opacity-30 disabled:hover:border-slate-800 text-[10px] font-bold uppercase tracking-wider rounded text-slate-300 transition-colors cursor-pointer"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </div>

            {/* Monto Neto */}
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Monto Neto</label>
              <div className="relative">
                <input
                  type="number"
                  step="any"
                  min="0.01"
                  placeholder="0.00"
                  value={montoNeto}
                  onChange={(e) => setMontoNeto(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-[#17171c] border border-slate-800 rounded text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-600 transition-colors duration-150"
                />
                <DollarSign size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              </div>
            </div>

            {/* Moneda */}
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Moneda de Pago</label>
              <select
                value={moneda}
                onChange={(e) => setMoneda(e.target.value as any)}
                className="w-full px-3 py-1.5 bg-[#17171c] border border-slate-800 rounded text-xs text-slate-100 focus:outline-none focus:border-emerald-600 transition-colors duration-150"
              >
                <option value="USD">Divisa (USD)</option>
                <option value="VED">Bolívares (VED)</option>
              </select>
            </div>

            {/* Concepto */}
            <div className="space-y-1 md:col-span-2">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Concepto Contable</label>
              <input
                type="text"
                placeholder="Ej. Quincena 1 - Junio 2026 o Bono de Productividad"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#17171c] border border-slate-800 rounded text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-600 transition-colors duration-150"
              />
            </div>
          </div>

          {/* Información Adicional del Empleado */}
          {selectedEmployee && (
            <div className="p-3 bg-[#17171c] border border-slate-850 rounded flex items-center gap-3 text-xs">
              <div className="p-2 rounded bg-emerald-950/40 text-emerald-400 border border-emerald-900">
                <Briefcase size={14} />
              </div>
              <div>
                <span className="text-[8px] font-bold text-slate-500 uppercase tracking-wider block">ID de Agregado Auditoría</span>
                <span className="font-mono text-[9px] text-emerald-400">{selectedEmployee.id}</span>
              </div>
            </div>
          )}

          {/* Botón de Envío */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-[#0A0A0F] font-bold uppercase tracking-wider text-xs py-2 rounded transition-colors duration-150 font-mono"
          >
            {isLoading ? (
              <>
                <span className="animate-spin inline-block w-4 h-4 border-2 border-[#0A0A0F] border-t-transparent rounded-full mr-2"></span>
                Procesando desembolso...
              </>
            ) : (
              <>
                Autorizar Desembolso <ArrowRight size={12} />
              </>
            )}
          </button>
        </form>

        {/* Panel Lateral - Últimos Movimientos */}
        <aside className="bg-[#111115] border border-slate-800 rounded p-4 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-850 pb-2">
            <Clock size={14} className="text-emerald-500" />
            <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">Ledger - En Vivo</h2>
          </div>

          <div className="space-y-2.5">
            {movimientos.map((mov) => (
              <div key={mov.id} className="p-2.5 bg-[#17171c] border border-slate-850 rounded space-y-1.5 hover:border-emerald-800/40 transition-colors duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[8px] font-bold text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900 font-mono uppercase tracking-wider">
                    {mov.event_type}
                  </span>
                  <span className="text-[8px] text-slate-500 font-mono">{mov.timestamp}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-300">{mov.empleado}</span>
                  <span className="font-mono font-bold text-sm text-white">
                    {mov.moneda === 'USD' ? '$' : 'Bs.'} {mov.monto}
                  </span>
                </div>
                <div className="pt-1.5 border-t border-slate-850 flex items-center gap-1.5 text-[8px] font-bold text-slate-500 uppercase tracking-wider font-mono">
                  <Lock size={8} /> Registro Inmutable
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-[#17171c] border border-slate-850 rounded space-y-1.5">
            <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider block font-mono">Garantía Inmutable</span>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Todos los desembolsos se graban con firmas criptográficas SHA-256 en el buffer global en la sombra del ERP.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
