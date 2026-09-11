import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Shield, ShieldCheck, AlertCircle, Building2, Calendar, FileText, DollarSign, CheckCircle2, XCircle, RefreshCw } from 'lucide-react';
import { BASE_URL } from '@/api/client';

interface FacturaPublicaData {
  empresa_emisor: string;
  empresa_rif: string;
  numero_factura: string;
  fecha: string;
  total_usd: number;
  total_bs: number | null;
  tasa_cambio_bs: number | null;
  estado: string;
}

export default function FacturaPublica() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState<boolean>(true);
  const [factura, setFactura] = useState<FacturaPublicaData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const consultarFactura = async () => {
    if (!token) {
      setLoading(false);
      setError('Esta factura no pudo ser verificada.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const endpoint = `${BASE_URL}/public/facturas/${encodeURIComponent(token)}`;
      const res = await fetch(endpoint, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (res.status === 404) {
        setError('Esta factura no pudo ser verificada.');
        setFactura(null);
        return;
      }

      if (res.status === 429) {
        setError('Se ha excedido el límite de consultas por minuto. Por favor intente más tarde.');
        setFactura(null);
        return;
      }

      if (!res.ok) {
        setError('Esta factura no pudo ser verificada.');
        setFactura(null);
        return;
      }

      const data: FacturaPublicaData = await res.json();
      setFactura(data);
    } catch {
      setError('Esta factura no pudo ser verificada.');
      setFactura(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    consultarFactura();
  }, [token]);

  const formatearFecha = (isoStr: string) => {
    if (!isoStr) return 'N/A';
    try {
      const date = new Date(isoStr);
      return new Intl.DateTimeFormat('es-VE', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(date);
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 selection:bg-teal-500/30 selection:text-teal-200 relative overflow-hidden">
      {/* Luces de fondo decorativas */}
      <div className="absolute top-[-10%] left-[20%] w-96 h-96 bg-teal-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[20%] w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Contenedor central */}
      <div className="w-full max-w-lg relative z-10">
        {/* Cabecera de marca KODA */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg mb-3"
               style={{ background: 'linear-gradient(135deg, #0b5156 0%, #14b8a6 100%)' }}>
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="text-lg font-black tracking-widest uppercase text-white">
            KODA ERP
          </h1>
          <p className="text-xs font-semibold text-teal-400/80 uppercase tracking-widest">
            Verificación Pública de Comprobante
          </p>
        </div>

        {/* Tarjeta principal */}
        <div className="bg-slate-900/90 border border-slate-800 backdrop-blur-xl rounded-3xl shadow-2xl p-6 sm:p-8 relative overflow-hidden">
          {loading && (
            <div className="py-14 flex flex-col items-center justify-center space-y-4 text-center">
              <RefreshCw className="w-10 h-10 text-teal-400 animate-spin" />
              <p className="text-sm font-semibold text-slate-400 uppercase tracking-wider">
                Verificando autenticidad del documento...
              </p>
            </div>
          )}

          {!loading && error && (
            <div className="py-8 flex flex-col items-center text-center">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mb-4">
                <AlertCircle size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-100 mb-2">
                Consulta no disponible
              </h2>
              <p className="text-sm text-slate-400 max-w-xs mb-6 font-medium leading-relaxed">
                {error}
              </p>
              <button
                onClick={consultarFactura}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-teal-400 font-bold text-xs uppercase tracking-wider transition-all border border-slate-700"
              >
                <RefreshCw size={14} />
                Reintentar
              </button>
            </div>
          )}

          {!loading && !error && factura && (
            <div>
              {/* Sello de verificación */}
              <div className="flex items-center justify-between pb-6 mb-6 border-b border-slate-800">
                <div className="flex items-center gap-2.5 text-teal-400">
                  <ShieldCheck size={22} className="shrink-0" />
                  <span className="text-xs font-bold uppercase tracking-wider text-teal-300">
                    Documento Válido y Auténtico
                  </span>
                </div>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wide ${
                  factura.estado === 'ACTIVA'
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                }`}>
                  {factura.estado === 'ACTIVA' ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                  {factura.estado}
                </span>
              </div>

              {/* Empresa emisora */}
              <div className="mb-6 bg-slate-950/50 rounded-2xl p-4 border border-slate-800/80">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400 mt-0.5">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Empresa Emisora</p>
                    <h3 className="text-sm font-bold text-slate-100 uppercase mt-0.5">
                      {factura.empresa_emisor}
                    </h3>
                    <p className="text-xs font-mono text-teal-400 mt-0.5">
                      RIF: {factura.empresa_rif}
                    </p>
                  </div>
                </div>
              </div>

              {/* Datos de la Factura */}
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="bg-slate-950/50 rounded-2xl p-3.5 border border-slate-800/80">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <FileText size={14} className="text-teal-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">N° de Factura</span>
                  </div>
                  <p className="text-sm font-black font-mono text-slate-100">
                    {factura.numero_factura}
                  </p>
                </div>

                <div className="bg-slate-950/50 rounded-2xl p-3.5 border border-slate-800/80">
                  <div className="flex items-center gap-2 text-slate-400 mb-1">
                    <Calendar size={14} className="text-teal-400" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Fecha Emisión</span>
                  </div>
                  <p className="text-xs font-bold text-slate-200">
                    {formatearFecha(factura.fecha)}
                  </p>
                </div>
              </div>

              {/* Resumen de Importes */}
              <div className="bg-gradient-to-br from-slate-950 to-slate-900 rounded-2xl p-5 border border-teal-500/20 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <DollarSign size={14} className="text-teal-400" /> Total Facturado (USD)
                  </span>
                  <span className="text-2xl font-black text-teal-300 font-mono">
                    ${factura.total_usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>

                {factura.total_bs !== null && factura.total_bs !== undefined && (
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-400">
                      Equivalente en Bs. {factura.tasa_cambio_bs ? `(Tasa BCV: ${factura.tasa_cambio_bs.toFixed(4)})` : ''}
                    </span>
                    <span className="font-bold font-mono text-slate-200">
                      Bs. {factura.total_bs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>

              {/* Aviso de privacidad y seguridad */}
              <div className="text-center">
                <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                  Comprobante digital certificado. Este portal público de consulta exhibe exclusivamente los datos fiscales mínimos del documento para verificación de autenticidad.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs font-medium text-slate-600">
          &copy; {new Date().getFullYear()} KODA ERP &bull; Verificación Segura Zero-Trust
        </div>
      </div>
    </div>
  );
}