import { useEffect, useMemo, useState } from 'react';
import { Search, UserCheck, Maximize2, Minimize2, Check, X, AlertTriangle, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { api } from '@/api/client';

const money = (value: unknown) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

const Approvals = () => {
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchApprovals = () => {
    setIsLoading(true);
    api.get<any[]>('/compras/aprobaciones')
      .then((data) => setApprovals(data || []))
      .catch((error) => console.error('Error fetching approvals:', error))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const filteredApprovals = useMemo(() => {
    const term = searchTerm.trim().toUpperCase();
    if (!term) return approvals;
    return approvals.filter((item) => {
      const referencia = String(item.referencia || item.numero || item.id || '').toUpperCase();
      const solicitante = String(item.solicitante || '').toUpperCase();
      return referencia.includes(term) || solicitante.includes(term);
    });
  }, [approvals, searchTerm]);

  const stats = useMemo(() => {
    const totalAmount = approvals.reduce((sum, item) => sum + Number(item.monto || item.monto_estimado || 0), 0);
    const critical = approvals.filter((item) => (item.prioridad || '').toUpperCase().includes('CRIT')).length;
    const approvedToday = approvals.filter((item) => (item.estado || '').toUpperCase().includes('APROB')).length;
    return [
      { label: 'Pendientes de Aprobación', value: String(approvals.length), desc: 'Requieren decisión', color: 'text-[#0b5156]' },
      { label: 'Monto Comprometido', value: money(totalAmount), desc: 'Si todo se aprueba', color: 'text-slate-800' },
      { label: 'Críticas', value: String(critical), desc: 'Impactan operación', color: 'text-red-600' },
      { label: 'Aprobadas Hoy', value: String(approvedToday), desc: 'Listas para orden', color: 'text-[#43584b]' },
    ];
  }, [approvals]);

  const handleDecision = async (item: any, decision: 'aprobar' | 'rechazar') => {
    const requisicionId = item.requisicion_id ?? item.id;
    if (!requisicionId) return;
    setProcessingId(requisicionId);
    try {
      await api.post(`/compras/requisiciones/${requisicionId}/${decision}`, decision === 'rechazar' ? { motivo: null } : undefined);
      showToast(decision === 'aprobar' ? 'Requisición aprobada' : 'Requisición rechazada', 'success');
      fetchApprovals();
    } catch (error: any) {
      showToast(error?.response?.data?.detail || 'Error al procesar la decisión', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Aprobaciones de Compra</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight max-w-2xl">
              Autorización de solicitudes y cotizaciones registradas en el sistema.
            </p>
          </div>
          <button
            onClick={() => navigate('/compras/ordenes/nueva')}
            className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-[#0b5156]/20"
          >
            Crear Orden
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-start">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-8 rounded-3xl border border-slate-200 flex flex-col justify-between h-40 shadow-sm">
            <p className="text-sm font-black text-slate-500 uppercase tracking-widest">{stat.label}</p>
            <div>
              <strong className={`text-4xl font-black ${stat.color} tracking-tighter font-mono`}>{stat.value}</strong>
              <p className="text-sm font-bold text-slate-400 uppercase mt-2">{stat.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <section className={`lg:col-span-2 min-w-0 ${isExpanded ? 'fixed inset-4 z-50 bg-slate-100 p-6 overflow-hidden rounded-3xl' : ''}`}>
          <article className={`bg-white border border-slate-200 shadow-sm overflow-hidden ${isExpanded ? 'flex flex-col h-full rounded-3xl shadow-2xl' : 'rounded-3xl'}`}>
            <div className="p-8 flex justify-between items-center bg-slate-50/50 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Pendientes de Aprobación</h2>
                <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">Documentos que requieren validación</p>
              </div>
              <div className="flex gap-4 items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="BUSCAR REFERENCIA..."
                    className="bg-white border border-slate-200 pl-9 pr-4 py-2 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] uppercase w-64"
                  />
                </div>
                <button onClick={() => setIsExpanded(!isExpanded)} className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl">
                  {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>
            </div>
            <div className={`overflow-x-auto no-scrollbar ${isExpanded ? 'flex-1' : ''}`}>
              <table className="w-full text-left">
                <thead>
                  <tr className="text-xs font-black text-slate-500 uppercase tracking-widest border-b border-slate-100 bg-slate-50/30">
                    <th className="py-5 px-8">Referencia</th>
                    <th className="py-5 px-6">Tipo</th>
                    <th className="py-5 px-6">Proveedor</th>
                    <th className="py-5 px-6 text-right">Monto</th>
                    <th className="py-5 px-6 text-center">Estado</th>
                    <th className="py-5 px-8 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                    <tr><td colSpan={6} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cargando aprobaciones...</td></tr>
                  ) : filteredApprovals.length === 0 ? (
                    <tr><td colSpan={6} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No hay aprobaciones pendientes.</td></tr>
                  ) : filteredApprovals.map((item, i) => (
                    <tr key={i} className="group hover:bg-[#bdafa1]/5 transition-colors">
                      <td className="py-6 px-8 text-sm font-black text-slate-800 uppercase font-mono">{item.referencia || item.numero || item.id}</td>
                      <td className="py-6 px-6 text-sm font-black text-slate-500 uppercase">{item.tipo || 'Solicitud'}</td>
                      <td className="py-6 px-6 text-sm font-black text-slate-800 uppercase">{item.proveedor || '-'}</td>
                      <td className="py-6 px-6 text-right text-sm font-black text-slate-800 font-mono">{money(item.monto || item.monto_estimado)}</td>
                      <td className="py-6 px-6 text-center">
                        <span className="text-xs font-black px-2 py-0.5 rounded uppercase border bg-slate-100 text-slate-700">{item.estado || 'PENDIENTE'}</span>
                      </td>
                      <td className="py-6 px-8 text-right">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => handleDecision(item, 'aprobar')}
                            disabled={processingId === (item.requisicion_id ?? item.id)}
                            title="Aprobar"
                            className="p-2.5 bg-green-100 text-green-700 rounded-xl hover:bg-green-600 hover:text-white transition-all shadow-sm disabled:opacity-50"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            onClick={() => handleDecision(item, 'rechazar')}
                            disabled={processingId === (item.requisicion_id ?? item.id)}
                            title="Rechazar"
                            className="p-2.5 bg-red-100 text-red-700 rounded-xl hover:bg-red-600 hover:text-white transition-all shadow-sm disabled:opacity-50"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <aside className="space-y-8">
          <article className="bg-white p-8 rounded-3xl border border-[#0b5156]/20 shadow-sm space-y-4">
            <div className="flex items-center gap-3 text-[#0b5156]">
              <UserCheck size={20} />
              <h4 className="text-lg font-black uppercase tracking-tight">Acción de Firma</h4>
            </div>
            <p className="text-sm font-bold text-slate-500 uppercase leading-relaxed">
              {approvals.length > 0 ? `${approvals.length} documento(s) requieren revisión.` : 'No hay documentos pendientes de firma.'}
            </p>
          </article>
        </aside>
      </div>

      {toast && typeof document !== 'undefined' && createPortal(
        <div className="fixed bottom-5 right-5 z-[9999] animate-in slide-in-from-bottom duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 ${toast.type === 'success' ? 'bg-[#0b5156] border border-[#0b5156]/20 text-white' : 'bg-red-600 border border-red-500 text-white'}`}>
            {toast.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
            <span className="font-bold text-sm tracking-wide uppercase font-mono">{toast.message}</span>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Approvals;
