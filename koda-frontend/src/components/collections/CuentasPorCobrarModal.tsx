import React, { useEffect, useState } from 'react';
import { X, Wallet, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { api } from '@/api/client';

interface CuentaPorCobrarRow {
  id: number;
  cliente: string;
  rif: string;
  documento: string;
  monto_total: number;
  monto_pagado: number;
  saldo: number;
  fecha_emision: string;
  fecha_vencimiento: string;
  estado: string;
}

interface CuentasPorCobrarModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Panel superpuesto sobre la MISMA pantalla del POS (no navega a otra
// página) que muestra quién le debe dinero al negocio — pedido explícito
// del cliente de no tener que cambiar de pantalla para ver esto.
export const CuentasPorCobrarModal: React.FC<CuentasPorCobrarModalProps> = ({ isOpen, onClose }) => {
  const [rows, setRows] = useState<CuentaPorCobrarRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCuentas = () => {
    setIsLoading(true);
    setError(null);
    api.get<CuentaPorCobrarRow[]>('/cobranzas/cuentas')
      .then((data) => setRows(Array.isArray(data) ? data : []))
      .catch((err: any) => setError(err?.message || 'No se pudo cargar la cartera de cuentas por cobrar.'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    if (isOpen) {
      fetchCuentas();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const totalSaldo = rows.reduce((acc, r) => acc + (Number(r.saldo) || 0), 0);
  const hoy = new Date();
  const isVencida = (fechaVencimiento: string) => {
    const [d, m, y] = fechaVencimiento.split('/').map(Number);
    if (!d || !m || !y) return false;
    return new Date(y, m - 1, d) < hoy;
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div
        className="bg-white w-full max-w-4xl rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden my-auto max-h-[90vh] flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cxc-modal-title"
      >
        <div className="absolute top-0 right-0 p-6 opacity-[0.03] pointer-events-none select-none">
          <Wallet size={160} className="text-[#0b5156] -rotate-12" />
        </div>

        {/* Header */}
        <div className="flex justify-between items-start mb-6 relative z-10 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#0b5156]/10 text-[#0b5156] rounded-2xl">
              <Wallet size={20} />
            </div>
            <div>
              <h2 id="cxc-modal-title" className="text-xl sm:text-2xl font-black text-slate-800 uppercase tracking-tighter mb-0.5 font-mono">
                Quién Me Debe
              </h2>
              <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">
                Cuentas por cobrar pendientes
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchCuentas}
              disabled={isLoading}
              className="p-2 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-400 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
              title="Actualizar"
              aria-label="Actualizar"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
              aria-label="Cerrar"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Resumen */}
        <div className="relative z-10 shrink-0 mb-4 p-5 bg-[#0b5156]/5 border border-[#0b5156]/15 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total pendiente de cobro</p>
            <p className="text-2xl font-black text-[#0b5156] font-mono tracking-tighter">${totalSaldo.toFixed(2)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Cuentas abiertas</p>
            <p className="text-2xl font-black text-slate-800 font-mono tracking-tighter">{rows.length}</p>
          </div>
        </div>

        {/* Contenido */}
        <div className="relative z-10 flex-1 overflow-y-auto -mx-2 px-2">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-xs font-black uppercase tracking-widest">Cargando cartera...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-red-50/80 border border-red-200 rounded-2xl flex items-start gap-2.5">
              <AlertCircle size={15} className="text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs font-black text-red-600 leading-snug">{error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
              <Wallet size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider">
                No hay cuentas por cobrar pendientes.
              </p>
            </div>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-white">
                <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-100">
                  <th className="py-3 px-3">Cliente</th>
                  <th className="py-3 px-3">Documento</th>
                  <th className="py-3 px-3 text-right">Saldo</th>
                  <th className="py-3 px-3">Vencimiento</th>
                  <th className="py-3 px-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((r) => {
                  const vencida = isVencida(r.fecha_vencimiento);
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-3">
                        <p className="text-xs font-black text-slate-800 uppercase leading-tight">{r.cliente || 'Sin nombre'}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase font-mono">{r.rif}</p>
                      </td>
                      <td className="py-3 px-3 text-xs font-bold text-slate-600 font-mono">{r.documento}</td>
                      <td className="py-3 px-3 text-right text-sm font-black text-[#0b5156] font-mono">${Number(r.saldo).toFixed(2)}</td>
                      <td className={`py-3 px-3 text-xs font-bold font-mono ${vencida ? 'text-red-600' : 'text-slate-600'}`}>
                        {r.fecha_vencimiento}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className={`text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wider ${
                          vencida
                            ? 'bg-red-50 text-red-700'
                            : r.estado === 'PENDIENTE'
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}>
                          {vencida ? 'Vencida' : r.estado}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default CuentasPorCobrarModal;
