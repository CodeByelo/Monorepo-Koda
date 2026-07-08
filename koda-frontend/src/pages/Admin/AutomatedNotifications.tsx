import { 
  Bell, 
  Save, 
  Mail, 
  Code,
  CheckCircle2,
  AlertTriangle,
  Users
} from 'lucide-react';
import { useState } from 'react';

const AutomatedNotifications = () => {
  const [activeTrigger, setActiveTrigger] = useState('factura');
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => setSaving(false), 1500);
  };

  const triggers = [
    { id: 'factura', title: 'Nueva Factura', icon: <Mail size={16} />, desc: 'Se envía al cliente cuando se procesa una factura de venta.', enabled: true },
    { id: 'pago', title: 'Pago Recibido', icon: <CheckCircle2 size={16} />, desc: 'Notificación de confirmación de cobro o abono.', enabled: true },
    { id: 'stock', title: 'Stock Bajo', icon: <AlertTriangle size={16} />, desc: 'Alerta interna para compras cuando un SKU llega al mínimo.', enabled: true },
    { id: 'usuario', title: 'Nuevo Usuario', icon: <Users size={16} />, desc: 'Bienvenida y credenciales de acceso para nuevos empleados.', enabled: false },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Header */}
      <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="bg-[#0b5156]/10 text-[#0b5156] text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-widest inline-block mb-2">
              Administración / Comunicación
            </span>
            <h1 className="text-3xl font-black text-[#0b5156] tracking-tighter uppercase leading-none">
              Notificaciones Automáticas
            </h1>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-tight">
              Configure los disparadores de email y personalice las plantillas dinámicas.
            </p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={handleSave}
              disabled={saving}
              className="bg-[#0b5156] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg shadow-green-900/20 hover:bg-[#083a3d] transition-all disabled:opacity-50"
            >
              <Save size={14} /> 
              {saving ? 'Guardando...' : 'Guardar Configuración'}
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Sidebar: Triggers */}
        <aside className="lg:col-span-1 space-y-4">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-black text-[#0b5156] uppercase tracking-tighter mb-4 flex items-center gap-2">
              <Bell size={16} /> Eventos del Sistema
            </h3>
            
            <div className="space-y-3">
              {triggers.map((trigger) => (
                <div 
                  key={trigger.id}
                  onClick={() => setActiveTrigger(trigger.id)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    activeTrigger === trigger.id 
                      ? 'border-[#0b5156] bg-slate-50 shadow-sm' 
                      : 'border-slate-200 hover:border-[#0b5156]/30 bg-white'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className={`flex items-center gap-2 text-sm font-black uppercase tracking-tighter ${activeTrigger === trigger.id ? 'text-[#0b5156]' : 'text-slate-700'}`}>
                      {trigger.icon} {trigger.title}
                    </div>
                    <div className={`w-8 h-4 rounded-full flex items-center p-0.5 ${trigger.enabled ? 'bg-green-500 justify-end' : 'bg-slate-300 justify-start'}`}>
                      <div className="w-3 h-3 rounded-full bg-white shadow-sm"></div>
                    </div>
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 leading-relaxed">
                    {trigger.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Main: Template Editor */}
        <div className="lg:col-span-2 space-y-6">
          <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
            <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter mb-1">Editor de Plantilla: Nueva Factura</h2>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Edite el formato del correo saliente.</span>
              </div>
              <span className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 border border-blue-200">
                <Code size={12} /> HTML Soportado
              </span>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Asunto del Email</label>
                <input 
                  type="text" 
                  defaultValue="KODA ERP: Nueva Factura generada para {nombre_cliente}"
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-700 focus:outline-none focus:border-[#0b5156] focus:ring-1 focus:ring-[#0b5156] transition-all"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Variables Dinámicas</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap gap-2">
                  {['{nombre_cliente}', '{rif_cliente}', '{nro_factura}', '{monto_total}', '{fecha_vencimiento}', '{link_descarga}'].map(v => (
                    <span key={v} className="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-1 rounded-md text-[10px] font-mono font-bold cursor-pointer hover:bg-indigo-600 hover:text-white transition-colors">
                      {v}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Cuerpo del Mensaje</label>
                <textarea 
                  rows={8}
                  defaultValue={`Hola <strong>{nombre_cliente}</strong>,\n\nLe informamos que se ha generado la factura <strong>{nro_factura}</strong> por un monto total de <strong>{monto_total}</strong>.\n\nPuede descargar su documento legal haciendo clic aquí: <a href="{link_descarga}">Ver Factura</a>.\n\nGracias por confiar en nosotros.`}
                  className="w-full border border-slate-200 rounded-xl p-4 text-sm font-mono text-slate-700 focus:outline-none focus:border-[#0b5156] focus:ring-1 focus:ring-[#0b5156] transition-all bg-slate-50"
                />
              </div>

              {/* Live Preview Box */}
              <div className="mt-8">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Previsualización (Renderizado)</label>
                <div className="border border-slate-200 rounded-2xl p-8 bg-white shadow-inner">
                  <div className="border-b-2 border-[#0b5156] pb-4 mb-6">
                    <h2 className="text-xl font-black text-[#0b5156] tracking-tighter m-0">EMPRESA DEMO, C.A.</h2>
                  </div>
                  <div className="space-y-4 text-sm text-slate-700 leading-relaxed">
                    <p>Hola <strong>Juan Pérez</strong>,</p>
                    <p>Le informamos que se ha generado la factura <strong>FAC-2026-4421</strong> por un monto total de <strong>$150.00</strong>.</p>
                    <p>Puede descargar su documento legal haciendo clic aquí: <a href="#" className="text-[#0b5156] font-bold hover:underline">Ver Factura</a>.</p>
                    <p>Gracias por confiar en nosotros.</p>
                  </div>
                  <div className="mt-8 pt-4 border-t border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    Enviado automáticamente por KODA ERP.
                  </div>
                </div>
              </div>

            </div>
          </article>
        </div>

      </div>
    </div>
  );
};

export default AutomatedNotifications;
