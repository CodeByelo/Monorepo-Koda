import { useState, useEffect } from 'react';
import {
  CheckCircle,
  AlertTriangle,
  PackageSearch,
  ArrowLeft,
  Clock
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '@/api/client';

interface Adjustment {
  id: number;
  producto_id: number;
  cantidad: number;
  motivo: string;
  estado: string;
  fecha_solicitud: string;
}

const InventoryApprovals = () => {
  const [pendingAdjustments, setPendingAdjustments] = useState<Adjustment[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPending = async () => {
    try {
      setIsLoading(true);
      // Asumiendo que envías un token Bearer real en producción
      const data = await api.get<Adjustment[]>('/inventario/ajustes/pendientes');
      setPendingAdjustments(data);
    } catch (error) {
      console.error("Error al cargar ajustes pendientes:", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, []);

  const handleApprove = async (id: number) => {
    if (!window.confirm("¿Estás seguro de aprobar este ajuste? Esta acción afectará el stock, el Kardex y generará un asiento contable automático.")) {
      return;
    }

    try {
      await api.post(`/inventario/ajustes/${id}/aprobar`);
      alert("✅ Ajuste aprobado, Kardex actualizado y Asiento Contable generado.");
      fetchPending(); // Refrescar la lista
    } catch (error) {
      alert("❌ Error al aprobar el ajuste.");
      console.error(error);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-500 pb-10">
      {/* Header */}
      <header className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="flex items-center gap-2 mb-2">
              <Link to="/inventario" className="bg-koda-main/10 text-koda-main text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1 hover:bg-koda-main/20 transition-all">
                <ArrowLeft size={10} /> Volver a Inventario
              </Link>
              <span className="bg-orange-500 text-white text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest flex items-center gap-1">
                <Clock size={10} /> Panel Maker-Checker
              </span>
            </div>
            <h1 className="text-xl font-black text-koda-main tracking-tighter uppercase leading-none">Aprobación de Ajustes</h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">Centro de auditoría para mermas y sobrantes de inventario reportados.</p>
          </div>
        </div>
      </header>

      {/* Info Banner */}
      <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 flex gap-3">
        <AlertTriangle size={20} className="text-orange-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
           <h4 className="text-xs font-black text-orange-800 uppercase tracking-widest">Auditoría Requerida</h4>
           <p className="text-[10px] font-bold text-orange-700/80 leading-relaxed uppercase">
             Los movimientos listados a continuación se encuentran en estado de cuarentena. No han afectado el inventario real ni el libro diario. Su aprobación generará firmas inmutables en el Kardex e impactará las cuentas de pérdidas o ganancias.
           </p>
        </div>
      </div>

      {/* Table */}
      <article className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 bg-slate-50/50">
              <th className="py-4 px-6">ID / Fecha</th>
              <th className="py-4 px-6">Producto ID</th>
              <th className="py-4 px-6">Motivo Declarado</th>
              <th className="py-4 px-6 text-right">Variación</th>
              <th className="py-4 px-6 text-center">Acción de Gerencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 text-xs">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">
                  Sincronizando con KODA Cloud...
                </td>
              </tr>
            ) : pendingAdjustments.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12">
                   <div className="flex flex-col items-center justify-center text-slate-300 space-y-3">
                      <PackageSearch size={40} className="opacity-50" />
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">No hay ajustes pendientes de aprobación.</p>
                   </div>
                </td>
              </tr>
            ) : (
              pendingAdjustments.map((adj) => (
                <tr key={adj.id} className="hover:bg-slate-50/50 transition-all group">
                  <td className="py-3 px-6">
                    <div className="space-y-0.5">
                      <strong className="text-koda-main uppercase font-black block leading-tight">SOL-{String(adj.id).padStart(5, '0')}</strong>
                      <span className="text-[9px] font-mono text-slate-400">{new Date(adj.fecha_solicitud).toLocaleString('es-VE')}</span>
                    </div>
                  </td>
                  <td className="py-3 px-6 font-mono text-slate-600 font-bold">
                    # {adj.producto_id}
                  </td>
                  <td className="py-3 px-6">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{adj.motivo}</span>
                  </td>
                  <td className="py-3 px-6 text-right">
                    <span className={`inline-block px-3 py-1 rounded-lg font-black font-mono text-xs ${adj.cantidad < 0 ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>
                      {adj.cantidad > 0 ? '+' : ''}{adj.cantidad} UND
                    </span>
                  </td>
                  <td className="py-3 px-6">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => handleApprove(adj.id)} className="p-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-500 hover:text-white transition-all shadow-sm flex gap-2 items-center text-[9px] font-black uppercase tracking-widest">
                         <CheckCircle size={14} /> Aprobar
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </article>
    </div>
  );
};

export default InventoryApprovals;