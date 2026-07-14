import { 
  Bell, 
  Save, 
  Mail, 
  Code,
  CheckCircle2,
  AlertTriangle,
  Users
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '@/api/client';

const AutomatedNotifications = () => {
  const [rules, setRules] = useState<any[]>([]);
  const [activeRuleId, setActiveRuleId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form states
  const [plantillaText, setPlantillaText] = useState('');
  const [ruleName, setRuleName] = useState('');
  const [ruleActive, setRuleActive] = useState(true);
  const [ruleCanal, setRuleCanal] = useState('EMAIL');

  const fetchRules = async () => {
    setLoading(true);
    try {
      const data = await api.get<any[]>('/admin/notificaciones');
      setRules(data || []);
      if (data && data.length > 0) {
        if (activeRuleId === null) {
          const first = data[0];
          setActiveRuleId(first.id);
          setRuleName(first.nombre);
          setPlantillaText(first.plantilla || '');
          setRuleActive(first.activa);
          setRuleCanal(first.canal || 'EMAIL');
        } else {
          const current = data.find(r => r.id === activeRuleId);
          if (current) {
            setRuleName(current.nombre);
            setPlantillaText(current.plantilla || '');
            setRuleActive(current.activa);
            setRuleCanal(current.canal || 'EMAIL');
          }
        }
      }
    } catch (error) {
      console.error("Error fetching notification rules:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleSelectRule = (rule: any) => {
    setActiveRuleId(rule.id);
    setRuleName(rule.nombre);
    setPlantillaText(rule.plantilla || '');
    setRuleActive(rule.activa);
    setRuleCanal(rule.canal || 'EMAIL');
  };

  const handleToggleActive = async (rule: any, newStatus: boolean) => {
    try {
      await api.put(`/admin/notificaciones/${rule.id}`, {
        activa: newStatus
      });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, activa: newStatus } : r));
      if (activeRuleId === rule.id) {
        setRuleActive(newStatus);
      }
    } catch (error) {
      console.error(error);
      alert("Error al cambiar estado de la regla.");
    }
  };

  const handleSave = async () => {
    if (activeRuleId === null) return;
    setSaving(true);
    try {
      await api.put(`/admin/notificaciones/${activeRuleId}`, {
        plantilla: plantillaText,
        activa: ruleActive,
        canal: ruleCanal
      });
      alert('Configuración de notificación guardada exitosamente.');
      await fetchRules();
    } catch (error: any) {
      console.error(error);
      alert(error.message || 'Error al guardar la configuración.');
    } finally {
      setSaving(false);
    }
  };

  const activeRule = rules.find(r => r.id === activeRuleId);

  const getRuleIcon = (nombre: string) => {
    const n = nombre.toLowerCase();
    if (n.includes('stock')) return <AlertTriangle size={16} className="text-amber-500" />;
    if (n.includes('factura')) return <Mail size={16} className="text-[#0b5156]" />;
    if (n.includes('despacho') || n.includes('cierre')) return <CheckCircle2 size={16} className="text-green-600" />;
    return <Bell size={16} className="text-slate-500" />;
  };

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
              disabled={saving || activeRuleId === null}
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
              {rules.map((rule) => (
                <div 
                  key={rule.id}
                  onClick={() => handleSelectRule(rule)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                    activeRuleId === rule.id 
                      ? 'border-[#0b5156] bg-slate-50 shadow-sm' 
                      : 'border-slate-200 hover:border-[#0b5156]/30 bg-white'
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div className={`flex items-center gap-2 text-sm font-black uppercase tracking-tighter ${activeRuleId === rule.id ? 'text-[#0b5156]' : 'text-slate-700'}`}>
                      {getRuleIcon(rule.nombre)} {rule.nombre}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleActive(rule, !rule.activa);
                      }}
                      className={`w-8 h-4 rounded-full flex items-center p-0.5 transition-colors ${rule.activa ? 'bg-green-500 justify-end' : 'bg-slate-300 justify-start'}`}
                    >
                      <div className="w-3 h-3 rounded-full bg-white shadow-sm"></div>
                    </button>
                  </div>
                  <p className="text-[10px] font-bold text-slate-500 leading-relaxed">
                    Canal: <span className="font-black text-[#0b5156]">{rule.canal}</span> · Estado: <span className={rule.activa ? 'text-green-600 font-bold' : 'text-slate-400 font-bold'}>{rule.activa ? 'ACTIVO' : 'INACTIVO'}</span>
                  </p>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Main: Template Editor */}
        <div className="lg:col-span-2 space-y-6">
          {activeRule ? (
            <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
              <div className="flex justify-between items-start mb-6 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-black text-[#0b5156] uppercase tracking-tighter mb-1">Editor de Plantilla: {ruleName}</h2>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Edite el formato del mensaje dinámico saliente.</span>
                </div>
                <span className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase flex items-center gap-1 border border-blue-200">
                  <Code size={12} /> {activeRule.canal} Soportado
                </span>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Canal de Envío</label>
                  <select 
                    value={ruleCanal}
                    onChange={(e) => setRuleCanal(e.target.value)}
                    className="w-full border border-slate-200 bg-white rounded-xl p-3 text-sm font-bold text-slate-800 focus:outline-none focus:border-[#0b5156] transition-colors"
                  >
                    <option value="TELEGRAM">TELEGRAM (Bot de Koda)</option>
                    <option value="EMAIL">EMAIL (Correo Electrónico)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Variables Dinámicas Disponibles</label>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap gap-2">
                    {['{producto}', '{factura}', '{cliente}', '{turno}', '{chofer}'].map(v => (
                      <span 
                        key={v} 
                        onClick={() => setPlantillaText(prev => prev + ' ' + v)}
                        className="bg-indigo-50 text-indigo-600 border border-indigo-100 px-2 py-1 rounded-md text-[10px] font-mono font-bold cursor-pointer hover:bg-indigo-600 hover:text-white transition-colors"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Cuerpo del Mensaje / Plantilla</label>
                  <textarea 
                    rows={8}
                    value={plantillaText}
                    onChange={e => setPlantillaText(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl p-4 text-sm font-mono text-slate-700 focus:outline-none focus:border-[#0b5156] focus:ring-1 focus:ring-[#0b5156] transition-all bg-slate-50"
                  />
                </div>

                <div className="flex items-center gap-3 py-2">
                  <input 
                    type="checkbox" 
                    id="rule-active"
                    checked={ruleActive}
                    onChange={e => setRuleActive(e.target.checked)}
                    className="w-4 h-4 text-[#0b5156] border-slate-300 rounded focus:ring-[#0b5156]"
                  />
                  <label htmlFor="rule-active" className="text-xs font-black text-slate-700 uppercase tracking-wider cursor-pointer">Regla Habilitada para Envíos</label>
                </div>

              </div>
            </article>
          ) : (
            <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Seleccione un evento del sistema para editar.</p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default AutomatedNotifications;
