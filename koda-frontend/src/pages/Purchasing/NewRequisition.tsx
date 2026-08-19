import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, FileText, CheckCircle, AlertCircle } from 'lucide-react';
import { api } from '@/api/client';

export default function NewRequisition() {
  const navigate = useNavigate();
  
  const [area, setArea] = useState('');
  const [solicitante, setSolicitante] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [montoEstimado, setMontoEstimado] = useState('');
  const [prioridad, setPrioridad] = useState('NORMAL');
  
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    try {
      const dataStr = sessionStorage.getItem('koda_bulk_replenish');
      if (dataStr) {
        const items = JSON.parse(dataStr);
        if (Array.isArray(items) && items.length > 0) {
          setArea('Inventario / Almacén');
          setSolicitante('Hrodriguez');
          const totalCost = items.reduce((acc, i) => acc + (i.suggested * i.cost), 0);
          setMontoEstimado(String(totalCost.toFixed(2)));
          
          const hasAgotado = items.some(i => i.isOutOfStock || i.available <= 0);
          setPrioridad(hasAgotado ? 'URGENTE' : 'ALTA');
          
          const descText = `REPOSICIÓN MASIVA DE STOCK CRÍTICO:\n\n` + 
            items.map(i => `- SKU: ${i.id} | ${i.name} (Sugerido: ${i.suggested} uds)`).join('\n');
          setDescripcion(descText);
        }
        sessionStorage.removeItem('koda_bulk_replenish');
      }
    } catch (e) {
      console.error("Error loading bulk replenish data", e);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!area || !descripcion || !montoEstimado || !solicitante) {
      setErrorMessage('Por favor completa todos los campos requeridos.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    
    try {
      const payload = {
        area,
        solicitante,
        descripcion,
        monto_estimado: parseFloat(montoEstimado),
        prioridad
      };
      
      const res: any = await api.post('/compras/requisiciones', payload);
      
      if (res && (res.ok || res.id)) {
        setSuccessMessage('¡Solicitud creada exitosamente! Redireccionando...');
        setTimeout(() => {
          navigate('/compras/requisiciones');
        }, 1500);
      } else {
        setErrorMessage('Ocurrió un error al crear la solicitud. Intenta nuevamente.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Error de conexión al guardar la solicitud.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      <Link to="/compras/requisiciones" className="inline-flex items-center gap-2 text-xs font-black text-slate-500 hover:text-[#0b5156] uppercase tracking-widest transition-colors">
        <ArrowLeft size={14} /> Volver a Solicitudes
      </Link>

      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-6">
        <div className="w-16 h-16 bg-[#0b5156]/10 text-[#0b5156] rounded-2xl flex items-center justify-center shrink-0">
          <FileText size={32} />
        </div>
        <div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">Nueva Solicitud de Compra</h1>
          <p className="text-slate-500 text-sm font-bold uppercase tracking-tight">
            Ingresa los detalles del requerimiento para su evaluación
          </p>
        </div>
      </header>

      {successMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <CheckCircle size={20} />
          <p className="text-sm font-bold uppercase">{successMessage}</p>
        </div>
      )}

      {errorMessage && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <AlertCircle size={20} />
          <p className="text-sm font-bold uppercase">{errorMessage}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8 items-start">
        <div className="xl:col-span-2 space-y-6">
          <form onSubmit={handleSubmit} className="bg-white p-8 lg:p-10 rounded-3xl border border-slate-200 shadow-sm space-y-10">
            
            <div className="space-y-2">
               <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight font-mono text-[#0b5156]">Datos del Solicitante</h2>
               <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                  Información base del departamento que requiere la compra.
               </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block">Área Origen *</label>
                <input 
                  type="text" 
                  value={area}
                  onChange={e => setArea(e.target.value)}
                  placeholder="Ej. Operaciones, IT, Recursos Humanos"
                  className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] transition-all"
                  required
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block">Solicitante *</label>
                <input 
                  type="text" 
                  value={solicitante}
                  onChange={e => setSolicitante(e.target.value)}
                  placeholder="Nombre de quien solicita"
                  className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] transition-all"
                  required
                />
              </div>
            </div>

            <hr className="border-slate-100" />

            <div className="space-y-2">
               <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight font-mono text-[#0b5156]">Detalle del Requerimiento</h2>
               <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">
                  Especificaciones técnicas y valoración de la solicitud.
               </p>
            </div>

            <div className="space-y-3">
              <label className="text-xs font-black text-slate-500 uppercase tracking-widest block">Descripción / Justificación *</label>
              <textarea 
                value={descripcion}
                onChange={e => setDescripcion(e.target.value)}
                placeholder="Detalla qué se necesita comprar y por qué es necesario..."
                rows={5}
                className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] resize-none transition-all"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-3">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block">Monto Estimado (USD) *</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input 
                    type="number" 
                    step="0.01"
                    value={montoEstimado}
                    onChange={e => setMontoEstimado(e.target.value)}
                    placeholder="0.00"
                    className="w-full bg-slate-50 border border-slate-200 p-4 pl-8 rounded-2xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] font-mono transition-all"
                    required
                  />
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-black text-slate-500 uppercase tracking-widest block">Prioridad de Atención</label>
                <div className="relative">
                  <select 
                    value={prioridad}
                    onChange={e => setPrioridad(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-4 appearance-none rounded-2xl text-sm font-black text-slate-800 focus:outline-none focus:border-[#0b5156] transition-all cursor-pointer"
                  >
                    <option value="BAJA">BAJA</option>
                    <option value="NORMAL">NORMAL</option>
                    <option value="ALTA">ALTA</option>
                    <option value="CRÍTICA">CRÍTICA</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="pt-8 flex justify-end gap-4">
              <Link 
                to="/compras/requisiciones"
                className="px-8 py-4 rounded-2xl font-black text-xs text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 uppercase tracking-widest transition-all hover:scale-[1.02]"
              >
                Cancelar
              </Link>
              <button 
                type="submit"
                disabled={isLoading}
                className="bg-[#0b5156] text-white px-10 py-4 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-[#083a3d] transition-all hover:scale-[1.02] shadow-lg shadow-[#0b5156]/20 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Procesando...' : 'Registrar Solicitud'}
              </button>
            </div>
          </form>
        </div>

        {/* Panel lateral estético y funcional */}
        <aside className="xl:col-span-1 space-y-6">
          <div className="bg-[#bdafa1]/10 p-8 rounded-3xl border border-[#bdafa1]/20">
            <h3 className="text-sm font-black uppercase tracking-widest text-[#726555] mb-6">Guía de Requisición</h3>
            
            <ul className="space-y-6">
              <li className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm text-[#726555] font-black text-xs">1</div>
                <div>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Justificación Clara</h4>
                  <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed">El comité de compras evaluará la necesidad de este requerimiento. Sé específico.</p>
                </div>
              </li>
              <li className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm text-[#726555] font-black text-xs">2</div>
                <div>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Presupuesto</h4>
                  <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed">El monto debe estar dentro de la partida presupuestaria de tu departamento.</p>
                </div>
              </li>
              <li className="flex gap-4">
                <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm text-[#726555] font-black text-xs">3</div>
                <div>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">Niveles de Prioridad</h4>
                  <p className="text-xs font-bold text-slate-500 mt-1 leading-relaxed">Usa prioridad CRÍTICA únicamente para paralizaciones operativas.</p>
                </div>
              </li>
            </ul>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <AlertCircle size={16} className="text-amber-500" />
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-800">Nota Legal</h3>
            </div>
            <p className="text-xs font-bold text-slate-500 leading-relaxed">
              Toda solicitud generará un número de correlativo auditable. Al registrarla, se iniciará el flujo de aprobaciones de gerencia antes de pasar a procuraduría.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
