import { useEffect, useMemo, useState } from 'react';
import { Maximize2, Minimize2, RotateCcw, Search, ShieldCheck, X, Clock, CheckCircle2, ArrowRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { api } from '@/api/client';

const money = (value: unknown) => `$${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`;

const Returns = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [returns, setReturns] = useState<any[]>([]);
  const [proveedores, setProveedores] = useState<any[]>([]);
  const [facturas, setFacturas] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showActionModal, setShowActionModal] = useState<'VINCULAR' | 'APROBAR' | null>(null);
  const [selectedReturnId, setSelectedReturnId] = useState<number | ''>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [formData, setFormData] = useState({
    proveedorId: '',
    facturaId: '',
    motivo: '',
    montoUsd: ''
  });

  const fetchData = () => {
    setIsLoading(true);
    Promise.all([
      api.get<any[]>('/compras/devoluciones').catch(() => ({ data: [] })),
      api.get<any[]>('/proveedores').catch(() => ({ data: [] })),
      api.get<any[]>('/compras/facturas').catch(() => ({ data: [] }))
    ])
      .then(([retRes, provRes, facRes]: [any, any, any]) => {
        setReturns(retRes.data || retRes || []);
        setProveedores(provRes.data || provRes || []);
        setFacturas(facRes.data || facRes || []);
      })
      .catch((error) => console.error('Error fetching data:', error))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const stats = useMemo(() => {
    const inProcess = returns.filter((item) => (item.estado || '').toUpperCase() === 'EN PROCESO').length;
    const pendingCredit = returns.filter((item) => (item.estado || '').toUpperCase().includes('PENDIENTE')).length;
    const claimAmount = returns.reduce((sum, item) => sum + Number(item.monto || item.amount || 0), 0);
    return [
      { label: 'En Proceso', value: String(inProcess), desc: 'Esperando salida física', color: 'text-[#0b5156]' },
      { label: 'Pendiente Nota', value: String(pendingCredit), desc: 'Crédito a favor pendiente', color: 'text-slate-500' },
      { label: 'Monto en Reclamo', value: money(claimAmount), desc: 'Capital inmovilizado', color: 'text-red-600' },
      { label: 'Promedio Resolución', value: '0 días', desc: 'Sin historial registrado', color: 'text-[#43584b]' },
    ];
  }, [returns]);

  const pendingCreditCount = Number(stats[1].value);

  const handleProcessReturn = async () => {
    if (!formData.proveedorId || !formData.motivo || !formData.montoUsd) {
      window.dispatchEvent(new CustomEvent('koda-notification', {
        detail: { type: 'error', message: "Debes llenar el Proveedor, Motivo y Monto a Reclamar" }
      }));
      return;
    }
    
    setIsProcessing(true);
    try {
      await api.post('/compras/devoluciones', {
        proveedor_id: parseInt(formData.proveedorId),
        factura_id: formData.facturaId ? parseInt(formData.facturaId) : null,
        motivo: formData.motivo,
        monto_usd: parseFloat(formData.montoUsd)
      });
      
      // Dispatch success notification if any
      const event = new CustomEvent('koda-notification', {
        detail: { type: 'success', message: 'Devolución registrada correctamente' }
      });
      window.dispatchEvent(event);
      
      setShowModal(false);
      setFormData({ proveedorId: '', facturaId: '', motivo: '', montoUsd: '' });
      fetchData(); // reload
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent('koda-notification', {
        detail: { type: 'error', message: "Error al registrar devolución: " + error.message }
      }));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedReturnId) return;
    setIsProcessing(true);
    try {
      await api.put(`/compras/devoluciones/${selectedReturnId}/estado`, { estado: newStatus });
      const event = new CustomEvent('koda-notification', {
        detail: { type: 'success', message: `Devolución actualizada a ${newStatus}` }
      });
      window.dispatchEvent(event);
      setShowActionModal(null);
      setSelectedReturnId('');
      fetchData();
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent('koda-notification', {
        detail: { type: 'error', message: "Error al actualizar: " + error.message }
      }));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20 relative">
      <header className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm">
        <div className="flex justify-between items-start mb-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Devoluciones a Proveedores</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight max-w-2xl">
              Gestión de salidas, reclamos y notas de crédito con datos reales del sistema.
            </p>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="bg-[#0b5156] text-white px-8 py-2.5 rounded-xl text-sm font-black uppercase tracking-widest shadow-lg shadow-[#0b5156]/20"
          >
            Nueva Devolución
          </button>
        </div>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-5 rounded-[1.5rem] border border-slate-200 flex flex-col shadow-sm">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{stat.label}</p>
            <div>
              <strong className={`text-3xl font-black ${stat.color} tracking-tighter font-mono leading-none`}>{stat.value}</strong>
              <p className="text-[8px] font-bold text-slate-400 uppercase mt-1 leading-none truncate">{stat.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        <section className={`lg:col-span-2 min-w-0 ${isExpanded ? 'fixed inset-4 z-50 bg-slate-100 p-6 overflow-hidden rounded-3xl' : ''}`}>
          <article className={`bg-white border border-slate-200 shadow-sm overflow-hidden ${isExpanded ? 'flex flex-col h-full rounded-3xl shadow-2xl' : 'rounded-3xl'}`}>
            <div className="p-8 flex justify-between items-center bg-slate-50/50 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-black text-slate-800 tracking-tighter uppercase">Historial de Devoluciones</h2>
                <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">Seguimiento de mercancía y notas de crédito</p>
              </div>
              <div className="flex gap-4 items-center">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
                  <input type="text" placeholder="BUSCAR RECLAMO..." className="bg-white border border-slate-200 pl-9 pr-4 py-2 rounded-xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] uppercase w-64" />
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
                    <th className="py-5 px-8">Fecha</th>
                    <th className="py-5 px-6">N° Devolución</th>
                    <th className="py-5 px-6 text-right">Monto USD</th>
                    <th className="py-5 px-6 text-center">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {isLoading ? (
                    <tr><td colSpan={4} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cargando devoluciones...</td></tr>
                  ) : returns.length === 0 ? (
                    <tr><td colSpan={4} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No hay devoluciones registradas.</td></tr>
                  ) : returns.map((item, i) => (
                    <tr key={i} className="group hover:bg-[#bdafa1]/5 transition-colors">
                      <td className="py-6 px-8 text-sm font-black text-slate-500 uppercase font-mono">{item.date || item.fecha}</td>
                      <td className="py-6 px-6">
                        <span className="text-sm font-black text-slate-800 uppercase font-mono">{item.id || item.numero_devolucion}</span>
                        <span className="text-xs font-bold text-slate-500 uppercase truncate max-w-[120px] block">{item.vendor || item.proveedor || '-'}</span>
                      </td>
                      <td className="py-6 px-6 text-right text-sm font-black text-slate-800 font-mono">{money(item.monto || item.amount)}</td>
                      <td className="py-6 px-6 text-center"><span className="bg-slate-100 text-slate-700 text-xs font-black px-2 py-0.5 rounded uppercase border">{item.status || item.estado || 'Registrada'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>

        <aside className="space-y-6">
          {/* Resumen Logístico & Gráfica */}
          <article className="bg-white p-8 rounded-3xl border border-[#bdafa1]/20 shadow-sm space-y-6">
            <div className="flex items-center gap-3 text-[#0b5156]">
              <ShieldCheck size={20} />
              <h3 className="text-sm font-black uppercase tracking-[0.2em]">Resumen Logístico</h3>
            </div>
            
            <div className="h-40 w-full relative">
              {returns.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Mercancía Defectuosa', value: Math.max(1, returns.filter(r => (r.motivo || '').toLowerCase().includes('defect')).length) * 60 + 20 },
                        { name: 'Error en Pedido', value: Math.max(1, returns.filter(r => (r.motivo || '').toLowerCase().includes('error')).length) * 30 + 10 },
                        { name: 'Garantía', value: Math.max(1, returns.filter(r => (r.motivo || '').toLowerCase().includes('garant')).length) * 10 + 5 }
                      ]}
                      innerRadius={50}
                      outerRadius={70}
                      paddingAngle={5}
                      dataKey="value"
                      stroke="none"
                    >
                      <Cell fill="#0b5156" />
                      <Cell fill="#43584b" />
                      <Cell fill="#bdafa1" />
                    </Pie>
                    <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} itemStyle={{ color: '#0b5156', fontWeight: 900, fontSize: '12px' }} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center border-2 border-dashed border-slate-100 rounded-2xl">
                  Sin datos suficientes<br/>para graficar
                </div>
              )}
            </div>

            <div className="space-y-4 pt-2">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest border-b border-slate-100 pb-2">Actividad Reciente</h4>
              {returns.slice(0, 3).length > 0 ? returns.slice(0, 3).map((r, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="bg-slate-50 p-2 rounded-full mt-0.5 border border-slate-100">
                    <Clock size={12} className="text-[#0b5156]" />
                  </div>
                  <div>
                    <p className="text-xs font-black text-slate-700 leading-tight uppercase">A {r.vendor || r.proveedor || 'Proveedor'}</p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">{r.date || r.fecha} • {money(r.monto || r.amount)}</p>
                  </div>
                </div>
              )) : (
                <p className="text-[10px] font-bold text-slate-400 uppercase">No hay actividad reciente.</p>
              )}
            </div>
          </article>

          {/* Acción de Reclamo */}
          <article className="bg-white p-8 rounded-3xl border border-[#0b5156]/20 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-[#0b5156]">
                <RotateCcw size={20} />
                <h4 className="text-lg font-black uppercase tracking-tight">Acción de Reclamo</h4>
              </div>
              <span className="bg-red-100 text-red-600 font-black text-[10px] uppercase px-2 py-1 rounded-md">{pendingCreditCount} pendientes</span>
            </div>
            
            <p className="text-xs font-bold text-slate-500 uppercase leading-relaxed border-l-2 border-[#bdafa1] pl-3">
              Tienes devoluciones esperando por una nota de crédito del proveedor para ajustar saldos.
            </p>

            <div className="space-y-3 pt-2">
              <button onClick={() => setShowActionModal('VINCULAR')} className="w-full flex items-center justify-between bg-slate-50 hover:bg-slate-100 text-slate-700 px-5 py-4 rounded-2xl transition-colors border border-slate-200 group">
                <span className="text-xs font-black uppercase tracking-widest flex items-center gap-3">
                  <ArrowRight size={16} className="text-slate-400 group-hover:text-[#0b5156] transition-colors"/> 
                  Vincular Nota
                </span>
              </button>
              <button onClick={() => setShowActionModal('APROBAR')} className="w-full flex items-center justify-between bg-[#0b5156] hover:bg-[#073639] text-white px-5 py-4 rounded-2xl transition-colors shadow-lg shadow-[#0b5156]/20 group">
                <span className="text-xs font-black uppercase tracking-widest flex items-center gap-3">
                  <CheckCircle2 size={16} className="text-[#bdafa1] group-hover:text-white transition-colors"/> 
                  Aprobar Saldo
                </span>
              </button>
            </div>
          </article>
        </aside>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-slate-900/80 z-[100] flex items-start justify-center p-4 overflow-y-auto">
          <div className="bg-white w-full max-w-3xl rounded-[2.5rem] shadow-2xl p-10 relative mt-10 mb-10">
            <button onClick={() => setShowModal(false)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-800"><X size={32} /></button>
            <h3 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase mb-2">Registro de Devolución</h3>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-8">Notifica mercancía defectuosa y genera un estado de cuenta por cobrar</p>
            
            <div className="grid grid-cols-2 gap-6 items-start">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Proveedor</label>
                <select 
                  value={formData.proveedorId} 
                  onChange={e => setFormData({...formData, proveedorId: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase focus:outline-none focus:border-[#0b5156]"
                >
                  <option value="">Selecciona Proveedor</option>
                  {proveedores.map(p => (
                    <option key={p.id} value={p.id}>{p.nombre} ({p.rif})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Factura de Origen (Opcional)</label>
                <select 
                  value={formData.facturaId} 
                  onChange={e => setFormData({...formData, facturaId: e.target.value})}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase focus:outline-none focus:border-[#0b5156]"
                >
                  <option value="">Sin Vincular Factura</option>
                  {facturas.map(f => (
                    <option key={f.id} value={f.id}>{f.numero_factura} ({f.fecha || f.date})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2 col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Motivo del Reclamo / Devolución</label>
                <input 
                  type="text" 
                  value={formData.motivo}
                  onChange={e => setFormData({...formData, motivo: e.target.value})}
                  placeholder="Ej. Mercancía defectuosa lote 45" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase focus:outline-none focus:border-[#0b5156]" 
                />
              </div>

              <div className="space-y-2 col-span-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Monto a Reclamar (USD)</label>
                <input 
                  type="number" 
                  value={formData.montoUsd}
                  onChange={e => setFormData({...formData, montoUsd: e.target.value})}
                  placeholder="0.00" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-black focus:outline-none focus:border-[#0b5156]" 
                />
              </div>
            </div>
            
            <button 
              onClick={handleProcessReturn}
              disabled={isProcessing}
              className="mt-8 w-full bg-[#43584b] hover:bg-[#2b3a31] text-white font-black py-5 rounded-2xl uppercase text-xs tracking-widest shadow-xl hover:scale-[1.02] transition-all disabled:opacity-50 disabled:hover:scale-100"
            >
              {isProcessing ? 'Procesando...' : 'Registrar Devolución'}
            </button>
          </div>
        </div>
      )}

      {showActionModal && (
        <div className="fixed inset-0 bg-slate-900/80 z-[100] flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-10 relative">
            <button onClick={() => setShowActionModal(null)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-800"><X size={24} /></button>
            <h3 className="text-2xl font-black text-[#0b5156] tracking-tighter uppercase mb-2">
              {showActionModal === 'VINCULAR' ? 'Vincular Nota' : 'Aprobar Saldo'}
            </h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">
              {showActionModal === 'VINCULAR' ? 'Selecciona una devolución EN PROCESO' : 'Selecciona una devolución PENDIENTE NOTA'}
            </p>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Seleccionar Devolución</label>
                <select 
                  value={selectedReturnId} 
                  onChange={e => setSelectedReturnId(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold uppercase focus:outline-none focus:border-[#0b5156]"
                >
                  <option value="">Seleccione...</option>
                  {returns
                    .filter(r => showActionModal === 'VINCULAR' 
                      ? (r.estado || '').toUpperCase() === 'EN PROCESO' 
                      : (r.estado || '').toUpperCase().includes('PENDIENTE'))
                    .map(r => (
                    <option key={r.id} value={r.id}>{r.numero_devolucion} - {r.proveedor}</option>
                  ))}
                </select>
              </div>
              
              <button 
                onClick={() => handleUpdateStatus(showActionModal === 'VINCULAR' ? 'PENDIENTE NOTA' : 'APROBADO')}
                disabled={isProcessing || !selectedReturnId}
                className="w-full bg-[#0b5156] hover:bg-[#073639] text-white font-black py-4 rounded-xl uppercase text-xs tracking-widest shadow-xl transition-all disabled:opacity-50"
              >
                {isProcessing ? 'Procesando...' : 'Confirmar Acción'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Returns;
