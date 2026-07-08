import React, { useState } from 'react';
import { ShieldCheck, Copy, CheckCircle2, Clock, Building2, User, Key, AlertCircle } from 'lucide-react';
import { api } from '@/api/client';

const AuditConfig = () => {
  const [formData, setFormData] = useState({
    auditor_name: '',
    organization: 'SENIAT',
    scope: 'all',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date().toISOString().split('T')[0],
    expires_in_hours: 8
  });

  const [isLoading, setIsLoading] = useState(false);
  const [generatedSession, setGeneratedSession] = useState<any>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    try {
      const requestPayload = {
        tenant_id: 'default_tenant',
        auditor_name: formData.auditor_name,
        organization: formData.organization,
        scope: formData.scope,
        start_date: formData.start_date,
        end_date: formData.end_date,
        expires_in_hours: formData.expires_in_hours
      };
      
      const res = await api.post('/audit/session/enable', requestPayload);
      setGeneratedSession(res);
    } catch (error) {
      console.error('Error al generar sesión:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (!generatedSession) return;
    const magicLink = `${window.location.origin}/auditoria/ledger?token=${generatedSession.access_token}`;
    navigator.clipboard.writeText(magicLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const setQuickDateRange = (yearsBack: number) => {
    const end = new Date();
    const start = new Date();
    start.setFullYear(end.getFullYear() - yearsBack);
    
    setFormData({
      ...formData,
      start_date: start.toISOString().split('T')[0],
      end_date: end.toISOString().split('T')[0]
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500 opacity-10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
        <div className="relative z-10 flex items-start gap-5">
          <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center shrink-0 border border-white/20">
            <ShieldCheck size={28} className="text-emerald-400" />
          </div>
          <div>
            <h2 className="text-2xl font-black tracking-tight mb-2">Modo Seguro de Auditoría</h2>
            <p className="text-slate-300 font-medium leading-relaxed max-w-2xl text-sm">
              Genera un acceso temporal de solo-lectura y estrictamente trazable para auditores externos o fiscales del SENIAT. El acceso será inmutable y expirará automáticamente.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Formulario */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-sm">
          <h3 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
            <Building2 size={20} className="text-emerald-600" />
            Parámetros de la Auditoría
          </h3>
          
          <form onSubmit={handleGenerate} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Ente / Organización</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
                  value={formData.organization}
                  onChange={e => setFormData({...formData, organization: e.target.value})}
                >
                  <option value="SENIAT">SENIAT</option>
                  <option value="Alcaldia">Alcaldía / Sindicatura</option>
                  <option value="Auditor Externo">Auditor Privado</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Nombre del Fiscal</label>
                <div className="relative">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Ej. Juan Pérez"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={formData.auditor_name}
                    onChange={e => setFormData({...formData, auditor_name: e.target.value})}
                    required
                  />
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Periodo a Auditar</label>
              
              <div className="flex gap-2 mb-3">
                <button type="button" onClick={() => setQuickDateRange(1)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black uppercase py-2 rounded-lg transition-colors border border-slate-200">1 Año</button>
                <button type="button" onClick={() => setQuickDateRange(5)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-black uppercase py-2 rounded-lg transition-colors border border-slate-200">5 Años</button>
                <button type="button" onClick={() => setQuickDateRange(10)} className="flex-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase py-2 rounded-lg transition-colors shadow-sm">10 Años</button>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Desde</label>
                  <input 
                    type="date" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={formData.start_date}
                    onChange={e => setFormData({...formData, start_date: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Hasta</label>
                  <input 
                    type="date" 
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
                    value={formData.end_date}
                    onChange={e => setFormData({...formData, end_date: e.target.value})}
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Vigencia del Token</label>
              <div className="relative">
                <Clock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-semibold focus:ring-2 focus:ring-emerald-500 outline-none"
                  value={formData.expires_in_hours}
                  onChange={e => setFormData({...formData, expires_in_hours: parseInt(e.target.value)})}
                >
                  <option value={4}>4 Horas</option>
                  <option value={8}>8 Horas (Jornada Laboral)</option>
                  <option value={24}>24 Horas</option>
                  <option value={48}>48 Horas</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl mt-4 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Key size={18} />
                  Generar Link de Acceso
                </>
              )}
            </button>
          </form>
        </div>

        {/* Resultado */}
        <div>
          {generatedSession ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-8 animate-in fade-in slide-in-from-bottom-4 shadow-sm h-full flex flex-col justify-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-200 blur-3xl rounded-full opacity-50 translate-x-1/2 -translate-y-1/2"></div>
              
              <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-6 relative z-10">
                <ShieldCheck size={32} className="text-emerald-600" />
              </div>
              
              <h3 className="text-2xl font-black text-emerald-950 mb-2 relative z-10">¡Acceso Generado!</h3>
              <p className="text-emerald-800 font-medium text-sm mb-8 relative z-10">
                El entorno seguro está aislado. El auditor solo podrá visualizar el libro mayor dentro del rango de fechas especificado. Todo será registrado inmutablemente.
              </p>

              <div className="bg-white rounded-2xl p-4 border border-emerald-100 mb-6 shadow-sm relative z-10 group">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-2 tracking-wider">Link Mágico (1 solo uso)</p>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-xs font-mono text-slate-600 truncate">
                    {window.location.origin}/auditoria/ledger?token={generatedSession.access_token.substring(0, 20)}...
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className="w-10 h-10 shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center justify-center transition-colors shadow-sm"
                  >
                    {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-3 bg-amber-50 p-4 rounded-xl border border-amber-200/50 relative z-10">
                <AlertCircle size={20} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs font-medium text-amber-800 leading-relaxed">
                  Por seguridad, este token solo se mostrará una vez. Expirará automáticamente el <strong>{new Date(generatedSession.expires_at).toLocaleString()}</strong>.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 border border-dashed border-slate-300 rounded-3xl h-full min-h-[400px] flex flex-col items-center justify-center text-slate-400 p-8 text-center">
              <ShieldCheck size={48} className="mb-4 opacity-20" />
              <p className="font-semibold text-sm text-slate-500">Configura los parámetros a la izquierda para generar un acceso seguro para el auditor.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditConfig;
