import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  Shield,
  ShieldCheck,
  AlertCircle,
  Building2,
  Calendar,
  FileText,
  DollarSign,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Lock,
  ExternalLink
} from 'lucide-react';
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
        month: 'short',
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
    <div
      className="min-h-screen flex flex-col items-center justify-between p-4 sm:p-8 relative selection:bg-[#0b5156]/20 selection:text-[#0b5156]"
      style={{
        backgroundColor: '#F4F6F8',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Barra superior con branding KODA */}
      <header className="w-full max-w-xl flex items-center justify-between pb-6 border-b border-slate-200/80 mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 px-3 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-center">
            <img
              src={`${(import.meta as any).env.BASE_URL}logorecortado.webp?v=3`}
              alt="KODA ERP"
              className="h-6 w-auto object-contain"
              onError={(e) => {
                // Fallback si la imagen no carga
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black tracking-widest text-[#0b5156] uppercase font-mono">
                OMNI 360
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                | Ledger Fiscal
              </span>
            </div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
              Validación Criptográfica de Factura
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-wider">
          <Lock size={12} className="text-[#0b5156]" />
          <span>Zero-Trust</span>
        </div>
      </header>

      {/* Tarjeta Central */}
      <main className="w-full max-w-xl my-auto">
        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          {/* Encabezado de la Tarjeta */}
          <div
            className="p-6 sm:p-8 text-white relative overflow-hidden"
            style={{
              background: 'linear-gradient(135deg, #0b5156 0%, #083a3d 100%)',
            }}
          >
            {/* Patrón sutil decorativo */}
            <div
              className="absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='%23ffffff' fill-opacity='1' fill-rule='evenodd'%3E%3Cpath d='M0 40L40 0H20L0 20M40 40V20L20 40'/%3E%3C/g%3E%3C/svg%3E")`,
              }}
            />

            <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-teal-300 block mb-1">
                  Comprobante Electrónico Fiscal
                </span>
                <h1 className="text-2xl font-black tracking-tight text-white font-mono uppercase">
                  {factura ? factura.numero_factura : 'Verificación de Factura'}
                </h1>
                <p className="text-xs text-teal-100/80 font-medium mt-1">
                  Registro forense inmutable emitido en plataforma KODA ERP
                </p>
              </div>

              {factura && (
                <div className="self-start sm:self-center">
                  <span
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider shadow-sm ${
                      factura.estado === 'ACTIVA'
                        ? 'bg-emerald-500 text-white'
                        : 'bg-rose-500 text-white'
                    }`}
                  >
                    {factura.estado === 'ACTIVA' ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    {factura.estado}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Cuerpo de la Tarjeta */}
          <div className="p-6 sm:p-8">
            {/* Estado Cargando */}
            {loading && (
              <div className="py-16 flex flex-col items-center justify-center space-y-4 text-center">
                <div className="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 flex items-center justify-center text-[#0b5156]">
                  <RefreshCw className="w-6 h-6 animate-spin text-[#0b5156]" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                    Verificando Comprobante
                  </h3>
                  <p className="text-xs text-slate-400 font-medium mt-1">
                    Validando firma y token en el ledger fiscal de KODA...
                  </p>
                </div>
              </div>
            )}

            {/* Estado Error / Token Inválido */}
            {!loading && error && (
              <div className="py-10 flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center mb-4 shadow-sm">
                  <AlertCircle size={32} />
                </div>
                <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">
                  Consulta no disponible
                </h2>
                <p className="text-xs text-slate-500 max-w-sm mb-6 font-medium leading-relaxed">
                  {error}
                </p>
                <button
                  onClick={consultarFactura}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-xs uppercase tracking-wider transition-colors border border-slate-200 shadow-xs"
                >
                  <RefreshCw size={14} />
                  Reintentar Verificación
                </button>
              </div>
            )}

            {/* Estado Factura Válida */}
            {!loading && !error && factura && (
              <div className="space-y-6">
                {/* Banner de Sello de Autenticidad */}
                <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <ShieldCheck size={22} />
                  </div>
                  <div>
                    <strong className="text-xs font-black uppercase text-emerald-900 block tracking-tight">
                      Documento Válido y Auténtico
                    </strong>
                    <span className="text-[11px] text-emerald-700 font-medium leading-tight block">
                      El comprobante fue emitido conforme a las regulaciones fiscales bimonetarias.
                    </span>
                  </div>
                </div>

                {/* Empresa Emisora */}
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 text-[#0b5156] flex items-center justify-center shrink-0 shadow-xs">
                    <Building2 size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                      Empresa Emisora
                    </span>
                    <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight mt-0.5 truncate">
                      {factura.empresa_emisor}
                    </h3>
                    <span className="inline-block mt-1 text-[11px] font-mono font-black text-[#0b5156] bg-white px-2.5 py-0.5 rounded-md border border-slate-200 shadow-xs">
                      RIF: {factura.empresa_rif}
                    </span>
                  </div>
                </div>

                {/* Metadatos: Factura y Fecha */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2 text-slate-400 mb-1">
                      <FileText size={15} className="text-[#0b5156]" />
                      <span className="text-[10px] font-black uppercase tracking-wider">
                        N° de Factura
                      </span>
                    </div>
                    <p className="text-base font-black font-mono text-slate-800 tracking-tight">
                      {factura.numero_factura}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2 text-slate-400 mb-1">
                      <Calendar size={15} className="text-[#0b5156]" />
                      <span className="text-[10px] font-black uppercase tracking-wider">
                        Fecha y Hora
                      </span>
                    </div>
                    <p className="text-xs font-black text-slate-700 uppercase">
                      {formatearFecha(factura.fecha)}
                    </p>
                  </div>
                </div>

                {/* Resumen de Montos Bimonetario */}
                <div className="p-6 rounded-2xl bg-[#0b5156]/5 border border-[#0b5156]/20 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5 font-mono">
                      <DollarSign size={16} className="text-[#0b5156]" /> Total Facturado (USD)
                    </span>
                    <strong className="text-3xl font-black text-[#0b5156] font-mono tracking-tight">
                      ${Number(factura.total_usd || 0).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                  </div>

                  {factura.total_bs !== null && factura.total_bs !== undefined && (
                    <div className="pt-3 border-t border-[#0b5156]/15 flex items-center justify-between text-xs flex-wrap gap-2">
                      <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
                        Equivalente en Bolívares {factura.tasa_cambio_bs ? `(Tasa BCV: ${factura.tasa_cambio_bs.toFixed(4)})` : ''}
                      </span>
                      <strong className="text-sm font-black font-mono text-slate-700">
                        Bs. {Number(factura.total_bs || 0).toLocaleString('es-VE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </strong>
                    </div>
                  )}
                </div>

                {/* Nota de Auditoría Forense */}
                <div className="text-center pt-2">
                  <p className="text-[10px] text-slate-400 font-medium leading-relaxed max-w-md mx-auto">
                    Certificado forense emitido por el subsistema de Facturación Fiscal de KODA ERP.
                    Este portal público exhibe exclusivamente los datos mínimos para validación del documento.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Footer de Seguridad */}
      <footer className="w-full max-w-xl text-center pt-6 mt-6 border-t border-slate-200/80">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
          &copy; {new Date().getFullYear()} KODA ERP &bull; Omni 360 Enterprise Ledger
        </p>
      </footer>
    </div>
  );
}