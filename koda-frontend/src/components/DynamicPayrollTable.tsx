import { useEffect, useMemo, useState } from 'react';
import { Calculator, CheckCircle2, Loader2, Plus, Save, X, Edit2, AlertCircle } from 'lucide-react';
import { api } from '@/api/client';
import type {
  ConceptType,
  PayrollDetailInput,
  PrePayrollResponse,
  RHConcept,
  RHEmployee,
  RHPayrollDetail,
  RHPayrollPeriod,
} from '@/types/payroll';

type DetailValues = Record<string, Record<number, number>>;

const money = (value: string | number) => Number(value || 0);

const DynamicPayrollTable = () => {
  const [employees, setEmployees] = useState<RHEmployee[]>([]);
  const [concepts, setConcepts] = useState<RHConcept[]>([]);
  const [periods, setPeriods] = useState<RHPayrollPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [values, setValues] = useState<DetailValues>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [report, setReport] = useState<PrePayrollResponse | null>(null);
  const [newConcept, setNewConcept] = useState<{ nombre: string; tipo: ConceptType }>({
    nombre: '',
    tipo: 'asignacion',
  });
  const [editingEmployee, setEditingEmployee] = useState<RHEmployee | null>(null);
  const [editBaseSalary, setEditBaseSalary] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [toast, setToast] = useState('');
  const [isNewPeriodOpen, setIsNewPeriodOpen] = useState(false);
  const [newPeriod, setNewPeriod] = useState({ nombre_periodo: '', fecha_inicio: '', fecha_fin: '' });

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const selectedPeriod = periods.find((period) => period.id === selectedPeriodId);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [employeesRes, conceptsRes, periodsRes] = await Promise.all([
        api.get<RHEmployee[]>('/payroll/employees'),
        api.get<RHConcept[]>('/payroll/concepts'),
        api.get<RHPayrollPeriod[]>('/payroll/periods'),
      ]);
      setEmployees(employeesRes);
      setConcepts(conceptsRes);
      setPeriods(periodsRes);
      setSelectedPeriodId((current) => current || periodsRes[0]?.id || null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData().catch((error) => {
      console.error(error);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!selectedPeriodId) {
      setValues({});
      return;
    }

    api
      .get<RHPayrollDetail[]>(`/payroll/details?period_id=${selectedPeriodId}`)
      .then((details) => {
        const nextValues: DetailValues = {};
        details.forEach((detail) => {
          nextValues[detail.employee_id] = {
            ...(nextValues[detail.employee_id] || {}),
            [detail.concept_id]: money(detail.monto),
          };
        });
        setValues(nextValues);
      })
      .catch((error) => console.error(error));
  }, [selectedPeriodId]);

  const periodMultiplier = useMemo(() => {
    if (!selectedPeriod) return 0.5;
    const start = new Date(`${selectedPeriod.fecha_inicio}T00:00:00`);
    const end = new Date(`${selectedPeriod.fecha_fin}T00:00:00`);
    const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    return days <= 16 ? 0.5 : 1;
  }, [selectedPeriod]);

  const getEmployeeTotals = (employee: RHEmployee) => {
    const base = money(employee.sueldo_base_mensual) * periodMultiplier;
    const rowValues = values[employee.id] || {};
    const asignaciones = concepts
      .filter((concept) => concept.tipo === 'asignacion')
      .reduce((acc, concept) => acc + (rowValues[concept.id] || 0), 0);
    const deducciones = concepts
      .filter((concept) => concept.tipo === 'deduccion')
      .reduce((acc, concept) => acc + (rowValues[concept.id] || 0), 0);
    return { base, asignaciones, deducciones, neto: base + asignaciones - deducciones };
  };

  const summary = employees.reduce(
    (acc, employee) => {
      const totals = getEmployeeTotals(employee);
      acc.base += totals.base;
      acc.asignaciones += totals.asignaciones;
      acc.deducciones += totals.deducciones;
      acc.neto += totals.neto;
      return acc;
    },
    { base: 0, asignaciones: 0, deducciones: 0, neto: 0 }
  );

  const updateValue = (employeeId: string, conceptId: number, amount: number) => {
    setValues((current) => ({
      ...current,
      [employeeId]: {
        ...(current[employeeId] || {}),
        [conceptId]: Math.max(0, amount || 0),
      },
    }));
  };

  const saveDetails = async () => {
    if (!selectedPeriodId) return;
    setSaving(true);
    setMessage('');
    const details: PayrollDetailInput[] = [];
    employees.forEach((employee) => {
      concepts.forEach((concept) => {
        details.push({
          employee_id: employee.id,
          period_id: selectedPeriodId,
          concept_id: concept.id,
          monto: values[employee.id]?.[concept.id] || 0,
          cantidad_horas_dias: 0,
        });
      });
    });

    try {
      await api.post('/payroll/details/bulk', { period_id: selectedPeriodId, details });
      showToast('Variables guardadas correctamente.');
    } catch (error: any) {
      showToast(error.message || 'No se pudieron guardar las variables.');
    } finally {
      setSaving(false);
    }
  };

  const processPayroll = async () => {
    if (!selectedPeriodId) return;
    setProcessing(true);
    try {
      const response = await api.post<PrePayrollResponse>(`/payroll/process?period_id=${selectedPeriodId}`);
      setReport(response);
    } catch (error: any) {
      showToast(error.message || 'No se pudo calcular la pre-nómina.');
    } finally {
      setProcessing(false);
    }
  };

  const createConcept = async () => {
    const name = newConcept.nombre.trim();
    if (!name) return;
    try {
      const created = await api.post<RHConcept>('/payroll/concepts', {
        nombre: name,
        tipo: newConcept.tipo,
        afecta_salario_base: false,
      });
      setConcepts((current) => [...current, created]);
      setNewConcept({ nombre: '', tipo: 'asignacion' });
      showToast('Concepto creado exitosamente.');
    } catch (error: any) {
      showToast(error.message || 'No se pudo crear el concepto.');
    }
  };

  const saveEmployeeBase = async () => {
    if (!editingEmployee) return;
    try {
      const updated = await api.patch<RHEmployee>(`/payroll/employees/${editingEmployee.id}`, {
        sueldo_base_mensual: Number(editBaseSalary)
      });
      setEmployees((current) => current.map(emp => emp.id === updated.id ? updated : emp));
      setEditingEmployee(null);
      showToast('Salario base actualizado.');
    } catch (error: any) {
      showToast(error.message || 'No se pudo actualizar el salario base.');
    }
  };

  const createPeriod = async () => {
    if (!newPeriod.nombre_periodo || !newPeriod.fecha_inicio || !newPeriod.fecha_fin) {
      showToast('Por favor completa todos los campos del período.');
      return;
    }
    try {
      const created = await api.post<RHPayrollPeriod>('/payroll/periods', newPeriod);
      setPeriods((current) => [created, ...current]);
      setSelectedPeriodId(created.id);
      setIsNewPeriodOpen(false);
      setNewPeriod({ nombre_periodo: '', fecha_inicio: '', fecha_fin: '' });
      showToast('Período creado exitosamente.');
    } catch (error: any) {
      showToast(error.message || 'No se pudo crear el período.');
    }
  };

  const confirmPayroll = async () => {
    if (!report) return;
    setIsConfirming(true);
    try {
      await api.post(`/payroll/process/confirm?period_id=${report.period_id}`);
      showToast('Nómina confirmada y contabilizada exitosamente.');
      setReport(null);
    } catch (error: any) {
      showToast(error.message || 'Error al confirmar la nómina.');
    } finally {
      setIsConfirming(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[360px] flex items-center justify-center rounded-2xl border border-slate-200 bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-[#9d174d]" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black uppercase tracking-widest text-emerald-800 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 size={18} />
          {toast}
        </div>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#9d174d]">Nómina dinámica</p>
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-800">Variables por período</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_minmax(260px,1fr)_auto]">
            <div className="flex gap-2">
              <select
                value={selectedPeriodId || ''}
                onChange={(event) => setSelectedPeriodId(Number(event.target.value))}
                className="h-11 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold uppercase text-slate-700 outline-none focus:border-[#9d174d]"
              >
                {periods.length === 0 && <option value="">Sin períodos</option>}
                {periods.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.nombre_periodo}
                  </option>
                ))}
              </select>
              <button 
                onClick={() => setIsNewPeriodOpen(true)}
                className="h-11 w-11 flex-shrink-0 grid place-items-center rounded-xl bg-slate-100 text-slate-500 hover:bg-[#9d174d] hover:text-white transition"
                title="Crear nuevo período"
              >
                <Plus size={18} />
              </button>
            </div>
            <div className="flex min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              <select
                value={newConcept.tipo}
                onChange={(event) => setNewConcept((current) => ({ ...current, tipo: event.target.value as ConceptType }))}
                className="w-32 border-r border-slate-200 bg-white px-2 text-[10px] font-black uppercase text-slate-600 outline-none"
              >
                <option value="asignacion">Asignación</option>
                <option value="deduccion">Deducción</option>
              </select>
              <input
                value={newConcept.nombre}
                onChange={(event) => setNewConcept((current) => ({ ...current, nombre: event.target.value }))}
                placeholder="Nuevo concepto"
                className="min-w-0 flex-1 bg-transparent px-3 text-xs font-bold text-slate-700 outline-none"
              />
              <button
                type="button"
                onClick={createConcept}
                className="grid h-11 w-11 place-items-center bg-[#9d174d] text-white transition hover:bg-[#831843]"
                title="Crear concepto"
              >
                <Plus size={17} />
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveDetails}
                disabled={!selectedPeriodId || saving}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-slate-700 disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Guardar
              </button>
              <button
                type="button"
                onClick={processPayroll}
                disabled={!selectedPeriodId || processing}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#9d174d] px-4 text-xs font-black uppercase tracking-widest text-white shadow-sm transition hover:bg-[#831843] disabled:opacity-50"
              >
                {processing ? <Loader2 size={16} className="animate-spin" /> : <Calculator size={16} />}
                Pre-nómina
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-4">
        <Metric label="Base" value={summary.base} />
        <Metric label="Asignaciones" value={summary.asignaciones} accent="text-emerald-600" prefix="+" />
        <Metric label="Deducciones" value={summary.deducciones} accent="text-amber-600" prefix="-" />
        <Metric label="Neto" value={summary.neto} accent="text-[#9d174d]" />
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400">
                <th className="sticky left-0 z-10 bg-slate-50 px-5 py-4">Empleado</th>
                <th className="px-4 py-4 text-right">Base período</th>
                {concepts.map((concept) => (
                  <th
                    key={concept.id}
                    className={`px-3 py-4 text-right ${concept.tipo === 'asignacion' ? 'text-emerald-600' : 'text-amber-600'}`}
                  >
                    {concept.nombre}
                  </th>
                ))}
                <th className="px-5 py-4 text-right text-[#9d174d]">Neto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {employees.map((employee) => {
                const totals = getEmployeeTotals(employee);
                return (
                  <tr key={employee.id} className="hover:bg-slate-50/60">
                    <td className="sticky left-0 z-10 bg-white px-5 py-4">
                      <strong className="block font-black uppercase text-slate-800">{employee.nombres}</strong>
                      <span className="font-mono text-[10px] font-bold text-slate-500">{employee.cedula} · {employee.cargo}</span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingEmployee(employee);
                            setEditBaseSalary(employee.sueldo_base_mensual.toString());
                          }}
                          className="text-slate-400 hover:text-[#9d174d] transition"
                        >
                          <Edit2 size={14} />
                        </button>
                        <span className="font-mono font-black text-slate-700">${totals.base.toFixed(2)}</span>
                      </div>
                    </td>
                    {concepts.map((concept) => (
                      <td key={concept.id} className="px-3 py-3">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={values[employee.id]?.[concept.id] ?? 0}
                          onChange={(event) => updateValue(employee.id, concept.id, Number(event.target.value))}
                          className="h-10 w-28 rounded-lg border border-slate-200 bg-slate-50 px-2 text-right font-mono text-xs font-bold text-slate-700 outline-none focus:border-[#9d174d] focus:bg-white"
                        />
                      </td>
                    ))}
                    <td className="px-5 py-4 text-right font-mono text-sm font-black text-[#9d174d]">${totals.neto.toFixed(2)}</td>
                  </tr>
                );
              })}
              {employees.length === 0 && (
                <tr>
                  <td colSpan={concepts.length + 3} className="px-5 py-16 text-center text-xs font-black uppercase tracking-widest text-slate-400">
                    No hay empleados activos para este tenant.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {report && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <section className="max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-2xl bg-white shadow-2xl">
            <header className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#9d174d]">{report.tipo_periodo} · {report.dias_periodo} días</p>
                <h3 className="text-xl font-black uppercase tracking-tight text-slate-800">{report.nombre_periodo}</h3>
              </div>
              <button
                type="button"
                onClick={() => setReport(null)}
                className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50"
                title="Cerrar"
              >
                <X size={18} />
              </button>
            </header>
            <div className="grid gap-4 border-b border-slate-100 p-5 sm:grid-cols-4">
              <Metric label="Base" value={money(report.total_base)} />
              <Metric label="Asignaciones" value={money(report.total_asignaciones)} accent="text-emerald-600" prefix="+" />
              <Metric label="Deducciones" value={money(report.total_deducciones)} accent="text-amber-600" prefix="-" />
              <Metric label="Neto" value={money(report.total_neto)} accent="text-[#9d174d]" />
            </div>
            <div className="max-h-[48vh] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-400">
                  <tr>
                    <th className="px-5 py-3">Empleado</th>
                    <th className="px-4 py-3 text-right">Base</th>
                    <th className="px-4 py-3 text-right">Asignaciones</th>
                    <th className="px-4 py-3 text-right">Deducciones</th>
                    <th className="px-5 py-3 text-right">Neto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {report.employees.map((employee) => (
                    <tr key={employee.employee_id}>
                      <td className="px-5 py-3">
                        <strong className="block uppercase text-slate-800">{employee.nombres}</strong>
                        <span className="font-mono text-[10px] text-slate-500">{employee.cedula}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono">${money(employee.sueldo_base).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono text-emerald-600">+${money(employee.asignaciones).toFixed(2)}</td>
                      <td className="px-4 py-3 text-right font-mono text-amber-600">-${money(employee.deducciones).toFixed(2)}</td>
                      <td className="px-5 py-3 text-right font-mono font-black text-[#9d174d]">${money(employee.neto).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="border-t border-slate-100 p-4 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
              <button
                type="button"
                onClick={() => setReport(null)}
                className="px-6 py-2.5 rounded-xl border border-slate-200 text-xs font-black uppercase text-slate-600 hover:bg-slate-100 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmPayroll}
                disabled={isConfirming}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#9d174d] text-white text-xs font-black uppercase shadow-sm hover:bg-[#831843] transition disabled:opacity-50"
              >
                {isConfirming ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                Confirmar y Contabilizar
              </button>
            </footer>
          </section>
        </div>
      )}

      {editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
            <header className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">Editar Salario Base</h3>
              <button onClick={() => setEditingEmployee(null)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </header>
            <div className="p-5 space-y-4">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Empleado</p>
                <p className="text-sm font-bold text-slate-700">{editingEmployee.nombres}</p>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                  Sueldo Base Mensual ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editBaseSalary}
                  onChange={e => setEditBaseSalary(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-[#9d174d]"
                  autoFocus
                />
              </div>
            </div>
            <footer className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingEmployee(null)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveEmployeeBase}
                className="px-4 py-2 rounded-lg bg-[#9d174d] text-white text-xs font-bold shadow-sm hover:bg-[#831843] transition"
              >
                Guardar
              </button>
            </footer>
          </div>
        </div>
      )}

      {isNewPeriodOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden">
            <header className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-tight text-slate-800">Nuevo Período</h3>
              <button onClick={() => setIsNewPeriodOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={16} />
              </button>
            </header>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                  Nombre del período
                </label>
                <input
                  type="text"
                  placeholder="Ej. Quincena 1 - Julio"
                  value={newPeriod.nombre_periodo}
                  onChange={e => setNewPeriod({...newPeriod, nombre_periodo: e.target.value})}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-[#9d174d]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Fecha Inicio
                  </label>
                  <input
                    type="date"
                    value={newPeriod.fecha_inicio}
                    onChange={e => setNewPeriod({...newPeriod, fecha_inicio: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-[#9d174d]"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                    Fecha Fin
                  </label>
                  <input
                    type="date"
                    value={newPeriod.fecha_fin}
                    onChange={e => setNewPeriod({...newPeriod, fecha_fin: e.target.value})}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-[#9d174d]"
                  />
                </div>
              </div>
            </div>
            <footer className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsNewPeriodOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={createPeriod}
                className="px-4 py-2 rounded-lg bg-[#9d174d] text-white text-xs font-bold shadow-sm hover:bg-[#831843] transition"
              >
                Crear Período
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

const Metric = ({
  label,
  value,
  accent = 'text-slate-800',
  prefix = '',
}: {
  label: string;
  value: number;
  accent?: string;
  prefix?: string;
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
    <strong className={`mt-1 block font-mono text-2xl font-black ${accent}`}>
      {prefix}${value.toFixed(2)}
    </strong>
  </div>
);

export default DynamicPayrollTable;
