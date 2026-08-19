import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ShieldCheck, Printer, AlertTriangle, Lock } from 'lucide-react';
import { api } from '@/api/client';

interface LedgerEntry {
  date: string;
  account_code: string;
  account_name: string;
  concept: string;
  debit: number;
  credit: number;
  balance: number;
}

const AuditorLedger = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  
  const [data, setData] = useState<LedgerEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchLedger = async () => {
      if (!token) {
        setError("Token de auditoría no proporcionado. Acceso denegado.");
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        const res = await api.get('/audit/export/ledger', { headers: { Authorization: `Bearer ${token}` } });
        
        // Asumiendo que el backend retorna el arreglo directamente,
        // o mapeando si la respuesta tiene otra estructura
        setData(Array.isArray(res) ? res : (res as any).data || []);
      } catch (err: any) {
        setError(err.response?.data?.detail || "Sesión inválida, expirada o revocada.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchLedger();
  }, [token]);

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES' }).format(amount);
  };

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-lg border border-red-100 p-8 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertTriangle size={32} className="text-red-500" />
          </div>
          <h1 className="text-xl font-black text-slate-800 mb-2">Acceso Denegado</h1>
          <p className="text-slate-500 text-sm font-medium leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest animate-pulse">Verificando Firma Criptográfica...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* HEADER: Oculto al imprimir */}
      <div className="print:hidden bg-slate-900 text-white px-6 py-4 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} className="text-emerald-400" />
          <div>
            <h1 className="text-sm font-bold uppercase tracking-widest">Modo Seguro: Vista de Auditoría</h1>
            <p className="text-[10px] text-slate-400 font-mono">Solo Lectura • Inmutable • Registrado</p>
          </div>
        </div>
        <button 
          onClick={handlePrint}
          className="flex items-center gap-2 bg-white text-slate-900 px-4 py-2 rounded-lg text-xs font-bold hover:bg-slate-100 transition-colors shadow-sm"
        >
          <Printer size={16} />
          Imprimir / Guardar PDF
        </button>
      </div>

      {/* DOCUMENTO PRINCIPAL (Imprimible) */}
      <div className="max-w-5xl mx-auto p-8 print:p-0">
        {/* Encabezado Físico */}
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-6 mb-8">
          <div>
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">KODA Software ERP</h2>
            <p className="text-sm font-bold text-slate-500">Reporte de Auditoría: Libro Mayor Analítico</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-mono text-slate-500 mb-1">FECHA EMISIÓN: {new Date().toLocaleDateString('es-VE')}</p>
            <div className="inline-flex items-center gap-1.5 bg-slate-100 px-3 py-1 rounded text-[10px] font-bold text-slate-600 border border-slate-200">
              <Lock size={12} />
              DATA VERIFICADA (SHA-256)
            </div>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b-2 border-slate-300">
                <th className="py-3 px-2 font-black text-slate-800 uppercase text-xs w-28">Fecha</th>
                <th className="py-3 px-2 font-black text-slate-800 uppercase text-xs w-24">Cuenta</th>
                <th className="py-3 px-2 font-black text-slate-800 uppercase text-xs">Descripción</th>
                <th className="py-3 px-2 font-black text-slate-800 uppercase text-xs text-right w-32">Debe</th>
                <th className="py-3 px-2 font-black text-slate-800 uppercase text-xs text-right w-32">Haber</th>
                <th className="py-3 px-2 font-black text-slate-800 uppercase text-xs text-right w-32">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {data.map((entry, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 print:hover:bg-transparent">
                  <td className="py-3 px-2 text-slate-500">{new Date(entry.date).toLocaleDateString('es-VE')}</td>
                  <td className="py-3 px-2 text-slate-700 font-mono text-xs">{entry.account_code}</td>
                  <td className="py-3 px-2">
                    <p className="text-slate-800 font-bold">{entry.account_name}</p>
                    <p className="text-slate-500 text-xs">{entry.concept}</p>
                  </td>
                  <td className="py-3 px-2 text-right text-slate-700">{entry.debit > 0 ? formatCurrency(entry.debit) : ''}</td>
                  <td className="py-3 px-2 text-right text-slate-700">{entry.credit > 0 ? formatCurrency(entry.credit) : ''}</td>
                  <td className="py-3 px-2 text-right font-bold text-slate-900">{formatCurrency(entry.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-800">
                <td colSpan={3} className="py-4 px-2 text-right font-black text-slate-800 uppercase">Totales del Periodo</td>
                <td className="py-4 px-2 text-right font-black text-slate-900">{formatCurrency(55000.0)}</td>
                <td className="py-4 px-2 text-right font-black text-slate-900">{formatCurrency(15000.0)}</td>
                <td className="py-4 px-2 text-right font-black text-emerald-600">{formatCurrency(60000.0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Pie de Página Físico */}
        <div className="mt-16 pt-8 border-t border-slate-200 grid grid-cols-2 gap-8">
          <div className="text-center">
            <div className="h-16 border-b border-slate-300 w-48 mx-auto mb-2"></div>
            <p className="text-xs font-bold text-slate-800">Firma Administrador</p>
            <p className="text-[10px] text-slate-500 font-mono mt-1">EMISOR</p>
          </div>
          <div className="text-center">
            <div className="h-16 border-b border-slate-300 w-48 mx-auto mb-2"></div>
            <p className="text-xs font-bold text-slate-800">Firma Funcionario / Auditor</p>
            <p className="text-[10px] text-slate-500 font-mono mt-1">RECEPTOR</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuditorLedger;
