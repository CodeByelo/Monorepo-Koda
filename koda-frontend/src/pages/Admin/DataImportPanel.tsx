import { 
  FileUp, 
  BookTemplate,
  AlertCircle,
  CheckCircle2,
  Database,
  ArrowRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const DataImportPanel = () => {
  const [empresa, setEmpresa] = useState<any>(null);
  const [kpis, setKpis] = useState<any>(null);

  useEffect(() => {
    Promise.all([
      api.get<any>('/entidades/empresa/perfil'),
      api.get<any>('/admin/importaciones')
    ]).then(([empRes, impRes]) => {
      setEmpresa(empRes);
      if (impRes?.kpis) {
        setKpis(impRes.kpis);
      }
    }).catch(console.error);
  }, []);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-block mb-2">
              Administración / Base de Datos
            </span>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">
              Importador de Datos
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">
              Centro visual para migración inicial, cargas operativas, perfiles, validación e historial.
            </p>
          </div>
          <div className="flex gap-3">
            <Link to="/admin/importacion/rapida" className="bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-sm hover:bg-slate-50 transition-all">
              <BookTemplate size={14} /> Usar Perfil
            </Link>
            <button className="bg-[#0b5156] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all">
              <FileUp size={14} /> Nueva Importación
            </button>
          </div>
        </div>
      </header>

      {/* KPI Grid */}
      <section className="grid grid-cols-1 md:grid-cols-5 gap-4 items-start">
        {[
          { label: 'Empresa activa', value: empresa?.nombre_comercial || 'Cargando...', desc: empresa?.rif || 'Sin RIF', color: 'text-[#0b5156]', bg: 'bg-white' },
          { label: 'Cargas del mes', value: String(kpis?.lotesTotales || 0), desc: 'Procesos registrados', color: 'text-slate-800', bg: 'bg-white' },
          { label: 'Perfiles guardados', value: '3', desc: 'Formatos conocidos', color: 'text-green-600', bg: 'bg-green-50' },
          { label: 'Pendientes', value: String(kpis?.enRevision || 0), desc: 'Requieren validación', color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Con errores', value: String(kpis?.rechazados || 0), desc: 'Corregir antes de subir', color: 'text-red-600', bg: 'bg-red-50' },
        ].map((kpi, i) => (
          <div key={i} className={`p-5 rounded-2xl border border-slate-200 ${kpi.bg} shadow-sm flex flex-col justify-between`}>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-2">{kpi.label}</span>
            <strong className={`text-xl font-black ${kpi.color} tracking-tighter leading-none mb-1 block`}>{kpi.value}</strong>
            <span className="text-[10px] font-bold text-slate-500 uppercase leading-tight">{kpi.desc}</span>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          
          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter mb-1">¿Qué tipo de carga vas a realizar?</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Selecciona el flujo según el contexto de los datos.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
              <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col justify-between group hover:bg-white hover:border-[#0b5156]/20 transition-all cursor-pointer">
                <div>
                  <span className="bg-[#0b5156]/10 text-[#0b5156] text-[9px] font-black px-2 py-0.5 rounded uppercase mb-3 inline-block">Empresa Nueva</span>
                  <h3 className="text-sm font-black text-slate-800 uppercase mb-2">Migración Inicial</h3>
                  <p className="text-xs font-bold text-slate-500 leading-relaxed">Para traer la base de una empresa nueva: clientes, productos, proveedores, saldos iniciales.</p>
                </div>
                <button className="mt-6 text-[#0b5156] text-[10px] font-black uppercase flex items-center gap-1 group-hover:gap-2 transition-all">Ver Opciones <ArrowRight size={14} /></button>
              </div>

              <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col justify-between group hover:bg-white hover:border-green-500/20 transition-all cursor-pointer">
                <div>
                  <span className="bg-green-100 text-green-700 text-[9px] font-black px-2 py-0.5 rounded uppercase mb-3 inline-block">Día a Día</span>
                  <h3 className="text-sm font-black text-slate-800 uppercase mb-2">Carga Operativa</h3>
                  <p className="text-xs font-bold text-slate-500 leading-relaxed">Para subir facturas, pagos, movimientos bancarios o actualizaciones puntuales de inventario.</p>
                </div>
                <button className="mt-6 text-green-600 text-[10px] font-black uppercase flex items-center gap-1 group-hover:gap-2 transition-all">Ver Opciones <ArrowRight size={14} /></button>
              </div>

              <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col justify-between group hover:bg-white hover:border-amber-500/20 transition-all cursor-pointer">
                <div>
                  <span className="bg-amber-100 text-amber-700 text-[9px] font-black px-2 py-0.5 rounded uppercase mb-3 inline-block">Formato Conocido</span>
                  <h3 className="text-sm font-black text-slate-800 uppercase mb-2">Importación Rápida</h3>
                  <p className="text-xs font-bold text-slate-500 leading-relaxed">Para archivos recurrentes cuyo mapeo ya fue guardado como perfil en el sistema.</p>
                </div>
                <Link to="/admin/importacion/rapida" className="mt-6 text-amber-600 text-[10px] font-black uppercase flex items-center gap-1 group-hover:gap-2 transition-all">Usar Perfil <ArrowRight size={14} /></Link>
              </div>

              <div className="p-6 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col justify-between group hover:bg-white hover:border-slate-300 transition-all cursor-pointer">
                <div>
                  <span className="bg-slate-200 text-slate-700 text-[9px] font-black px-2 py-0.5 rounded uppercase mb-3 inline-block">Auditoría</span>
                  <h3 className="text-sm font-black text-slate-800 uppercase mb-2">Historial de Cargas</h3>
                  <p className="text-xs font-bold text-slate-500 leading-relaxed">Para revisar qué archivos se cargaron, quién los cargó, y qué errores tuvieron.</p>
                </div>
                <Link to="/admin/importacion/historial" className="mt-6 text-slate-600 text-[10px] font-black uppercase flex items-center gap-1 group-hover:gap-2 transition-all">Ver Historial <ArrowRight size={14} /></Link>
              </div>
            </div>
          </article>

        </div>

        {/* Sidebar Guidelines */}
        <aside className="lg:col-span-1 space-y-6">
          <div className="bg-[#0b5156] p-8 rounded-3xl shadow-xl relative overflow-hidden">
            <div className="relative z-10">
              <h3 className="text-lg font-black text-white uppercase tracking-tighter mb-6">Reglas del Importador</h3>
              
              <div className="space-y-6">
                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <Database size={14} className="text-white" />
                  </div>
                  <div>
                    <strong className="text-xs font-black text-white uppercase block mb-1">Empresa Activa</strong>
                    <p className="text-[10px] text-white/70 font-bold uppercase leading-relaxed">Evita mezclar datos entre empresas distintas. El destino debe ser explícito.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                    <CheckCircle2 size={14} className="text-white" />
                  </div>
                  <div>
                    <strong className="text-xs font-black text-white uppercase block mb-1">Reutilización</strong>
                    <p className="text-[10px] text-white/70 font-bold uppercase leading-relaxed">Los formatos conocidos deben usar perfiles guardados para no mapear desde cero.</p>
                  </div>
                </div>

                <div className="flex gap-4 items-start">
                  <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0 border border-red-500/50">
                    <AlertCircle size={14} className="text-red-400" />
                  </div>
                  <div>
                    <strong className="text-xs font-black text-red-200 uppercase block mb-1">Bloqueo de Errores</strong>
                    <p className="text-[10px] text-red-100/70 font-bold uppercase leading-relaxed">Los registros con errores quedan fuera hasta ser corregidos en el archivo fuente.</p>
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -right-20 -bottom-20 w-64 h-64 bg-white/5 rounded-full blur-3xl"></div>
          </div>
        </aside>

      </div>
    </div>
  );
};

export default DataImportPanel;
