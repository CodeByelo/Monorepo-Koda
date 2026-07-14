import React, { useState, useEffect } from 'react';
import { 
  Send, 
  Copy, 
  Check, 
  ExternalLink, 
  ShieldCheck, 
  Terminal, 
  RefreshCw,
  Info,
  AlertCircle,
  X,
  MessageSquare,
  Plus,
  Trash2,
  Clock
} from 'lucide-react';
import { api } from '@/api/client';

export default function TelegramLinker() {
  const [loading, setLoading] = useState(false);
  const [linkingCode, setLinkingCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estados para Gestor de Comandos
  const [commands, setCommands] = useState<any[]>([]);
  const [loadingCommands, setLoadingCommands] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newTrigger, setNewTrigger] = useState('');
  const [newResponse, setNewResponse] = useState('');
  const [newAction, setNewAction] = useState('');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Cuenta regresiva del token (10 minutos)
  const [timeLeft, setTimeLeft] = useState<number>(600);

  useEffect(() => {
    if (!linkingCode) return;
    setTimeLeft(600);
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setLinkingCode(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [linkingCode]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const fetchCommands = async () => {
    setLoadingCommands(true);
    try {
      const data = await api.get<any[]>('/webhook/telegram/commands');
      setCommands(data || []);
    } catch (err) {
      console.error('Error al cargar comandos:', err);
    } finally {
      setLoadingCommands(false);
    }
  };

  useEffect(() => {
    fetchCommands();
  }, []);

  const handleDeleteCommand = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este comando?')) return;
    try {
      await api.delete(`/webhook/telegram/commands/${id}`);
      setCommands(prev => prev.filter(c => c.id !== id));
    } catch (err: any) {
      console.error('Error al eliminar comando:', err);
      alert(err.message || 'Error al eliminar el comando.');
    }
  };

  const handleCreateCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const trigger = newTrigger.trim();
    const responseText = newResponse.trim();
    
    if (!trigger || !responseText) {
      setFormError('Todos los campos obligatorios deben estar completos.');
      return;
    }
    
    if (!trigger.startsWith('/')) {
      setFormError('El comando de activación debe iniciar con una barra diagonal "/".');
      return;
    }
    
    setCreating(true);
    try {
      await api.post('/webhook/telegram/commands', {
        trigger_command: trigger,
        response_text: responseText,
        internal_action: newAction.trim() || null,
        is_active: true
      });
      
      setNewTrigger('');
      setNewResponse('');
      setNewAction('');
      setShowForm(false);
      fetchCommands();
    } catch (err: any) {
      console.error('Error al crear comando:', err);
      setFormError(err.message || 'Error al conectar con el servidor.');
    } finally {
      setCreating(false);
    }
  };

  const handleStartLinking = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.post<any>('/webhook/telegram/generate-token', {});
      setLinkingCode(data.code);
    } catch (err: any) {
      console.error('Error al generar token de Telegram:', err);
      setError(err.message || 'Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCommand = async () => {
    if (!linkingCode) return;
    const commandText = `/start ${linkingCode}`;
    try {
      await navigator.clipboard.writeText(commandText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('No se pudo copiar el comando:', err);
    }
  };

  return (
    <div className="space-y-8">
      {/* SECCIÓN 1: VINCULACIÓN BOT */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 text-slate-800 shadow-sm space-y-6 relative overflow-hidden">
        
        {/* Cabecera del Módulo */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-5 border-b border-slate-150">
          <div className="space-y-1">
            <span className="bg-[#0b5156]/10 text-[#0b5156] text-[9px] font-black px-2.5 py-0.5 rounded border border-[#0b5156]/20 uppercase tracking-widest inline-flex items-center gap-1.5 mb-1.5">
              <Terminal size={10} /> Canal Seguro
            </span>
            <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">
              Vinculación de Telegram Bot
            </h2>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              Notificaciones en tiempo real y comandos remotos para tu organización
            </p>
          </div>
          <div className="flex items-center gap-1 text-[#0b5156] bg-[#0b5156]/10 px-3 py-1.5 rounded-xl border border-[#0b5156]/20 text-[9px] font-black uppercase tracking-widest">
            <ShieldCheck size={12} /> RLS ACTIVO
          </div>
        </div>

        {/* Cuerpo principal */}
        {!linkingCode && !loading && (
          <div className="space-y-6 py-2">
            <div className="bg-slate-50 border border-slate-200 p-6 rounded-2xl space-y-4 shadow-xs">
              <div className="flex gap-4 items-start">
                <div className="p-3 bg-[#0b5156]/10 border border-[#0b5156]/20 text-[#0b5156] rounded-xl shrink-0">
                  <Send size={20} />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-black uppercase text-[#0b5156] tracking-tight">
                    ¿Por qué vincular el Bot Corporativo?
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                    Al conectar el bot oficial de KODA, podrás autorizar transacciones críticas, recibir reportes de tesorería y controlar el estado operativo directamente desde Telegram mediante comandos encriptados bajo aislamiento de seguridad multi-tenant.
                  </p>
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 text-[10px] uppercase tracking-wider font-black text-[#0b5156]/80">
                <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0b5156]" />
                  Autorización de Nóminas
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0b5156]" />
                  Alertas Financieras Críticas
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0b5156]" />
                  Consulta de Tasa BCV
                </div>
                <div className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-slate-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#0b5156]" />
                  Logs de Seguridad SOC
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 p-4 rounded-xl text-red-700 text-xs font-bold text-center max-w-md mx-auto mb-4 animate-in fade-in duration-200">
                {error}
              </div>
            )}

            <div className="text-center pt-2">
              <button
                onClick={handleStartLinking}
                className="bg-[#0b5156] hover:bg-[#083a3d] text-white font-black px-8 py-4 rounded-xl text-xs uppercase tracking-widest shadow-md hover:shadow-lg active:scale-95 transition-all w-full md:w-auto"
              >
                Vincular cuenta de Telegram
              </button>
            </div>
          </div>
        )}

        {/* Pantalla de Carga */}
        {loading && (
          <div className="flex flex-col justify-center items-center py-16 space-y-6">
            <div className="relative w-20 h-20 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full bg-[#0b5156]/5 opacity-20 blur-lg animate-pulse" />
              <div className="absolute inset-0 rounded-full border-4 border-dashed border-slate-200 border-t-[#0b5156] animate-spin" style={{ animationDuration: '3s' }} />
              <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center">
                <RefreshCw size={12} className="text-[#0b5156] animate-spin" />
              </div>
            </div>
            <div className="text-center space-y-1.5">
              <p className="text-[#0b5156] font-black text-xs uppercase tracking-widest animate-pulse">
                Generando Token Seguro
              </p>
              <p className="text-slate-400 text-[9px] font-bold uppercase tracking-wider">
                Comunicando con el canal de seguridad multi-tenant...
              </p>
            </div>
          </div>
        )}

        {/* Pantalla con Instrucciones y Código de Vinculación */}
        {linkingCode && !loading && (
          <div className="space-y-6 py-2 animate-in fade-in zoom-in-95 duration-300">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Columna de Pasos de Configuración */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase text-[#0b5156] tracking-widest mb-2 flex items-center gap-1.5">
                  <Info size={12} /> Instrucciones de Activación
                </h3>
                
                {/* Paso 1 */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex gap-3.5 items-start">
                  <div className="w-6 h-6 rounded-full bg-[#0b5156]/10 border border-[#0b5156]/20 flex items-center justify-center text-[#0b5156] font-mono text-xs font-black shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="space-y-1.5">
                    <h4 className="text-[11px] font-black uppercase text-slate-800 tracking-wider">
                      Buscar el Bot Oficial
                    </h4>
                    <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                      Abre tu aplicación de Telegram y busca nuestro bot de seguridad corporativo.
                  </p>
                    <a
                      href="https://t.me/KodaMonitor_bot"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[9px] font-black text-[#0b5156] uppercase border-b border-[#0b5156]/40 hover:border-[#0b5156] pb-0.5 transition-colors"
                    >
                      Ir al Bot @KodaMonitor_bot <ExternalLink size={10} />
                    </a>
                  </div>
                </div>

                {/* Paso 2 */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex gap-3.5 items-start">
                  <div className="w-6 h-6 rounded-full bg-[#0b5156]/10 border border-[#0b5156]/20 flex items-center justify-center text-[#0b5156] font-mono text-xs font-black shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-[11px] font-black uppercase text-slate-800 tracking-wider">
                      Establecer Conexión
                    </h4>
                    <p className="text-[10px] text-slate-500 font-semibold leading-relaxed">
                      Envía el comando de inicio encriptado que se detalla en el panel derecho. Esto asociará tu identificador de Telegram con el tenant activo de forma segura.
                    </p>
                  </div>
                </div>
              </div>

              {/* Columna del Comando Generado */}
              <div className="flex flex-col justify-between bg-slate-50 border border-slate-200 rounded-2xl p-5 shadow-xs relative overflow-hidden">
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-1">
                      <Terminal size={10} /> Consola de Comando
                    </span>
                    <span className="text-[8px] font-mono text-[#0b5156] bg-[#0b5156]/10 border border-[#0b5156]/20 px-1.5 py-0.5 rounded font-bold uppercase">
                      Un Solo Uso
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-600 font-bold uppercase tracking-tight">
                    Envía este comando exacto al bot en Telegram:
                  </p>
                </div>

                {/* Bloque de comando destacado con botón de copia integrado */}
                <div className="my-5 bg-white border border-slate-250 rounded-xl p-3.5 flex items-center justify-between gap-4 font-mono shadow-inner group hover:border-[#0b5156]/30 transition-all">
                  <div className="text-xs font-black tracking-wider text-[#0b5156] select-all overflow-x-auto no-scrollbar">
                    /start <span className="text-slate-800 font-black">{linkingCode}</span>
                  </div>
                  <button
                    onClick={handleCopyCommand}
                    className={`p-2 rounded-lg border text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shrink-0 active:scale-95 ${
                      copied 
                        ? 'bg-[#0b5156]/10 border-[#0b5156]/30 text-[#0b5156]' 
                        : 'bg-slate-50 border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-350'
                    }`}
                    title="Copiar comando completo"
                  >
                    {copied ? (
                      <>
                        <Check size={13} strokeWidth={2.5} />
                        <span className="text-[9px]">¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={13} />
                        <span className="text-[9px]">Copiar</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Alerta de seguridad con Cuenta Regresiva */}
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2.5 items-center text-amber-800">
                  <Clock size={16} className="shrink-0 text-amber-600 animate-pulse" />
                  <div className="flex-1 flex justify-between items-center text-[9px] uppercase tracking-wide font-black">
                    <span>El código de vinculación expira en:</span>
                    <span className="font-mono bg-amber-100 px-2 py-0.5 rounded text-amber-900 text-xs font-bold">{formatTime(timeLeft)}</span>
                  </div>
                </div>
              </div>

            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4 border-t border-slate-150">
              <button
                onClick={() => setLinkingCode(null)}
                className="bg-transparent border border-slate-200 text-slate-500 hover:text-slate-800 hover:border-slate-350 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors active:scale-95"
              >
                Cancelar Proceso
              </button>
              <button
                onClick={handleStartLinking}
                className="bg-[#0b5156] hover:bg-[#083a3d] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm"
              >
                Generar Nuevo Token
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECCIÓN 2: GESTOR DE COMANDOS DINÁMICOS */}
      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-8 text-slate-800 shadow-sm space-y-6 relative overflow-hidden">
        
        {/* Cabecera */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-5 border-b border-slate-150">
          <div className="space-y-1">
            <span className="bg-[#0b5156]/10 text-[#0b5156] text-[9px] font-black px-2.5 py-0.5 rounded border border-[#0b5156]/20 uppercase tracking-widest inline-flex items-center gap-1.5 mb-1.5">
              <Terminal size={10} /> Automatización
            </span>
            <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter">
              Gestor de Comandos
            </h2>
            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
              Configura respuestas personalizadas del bot para tu organización
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="bg-[#0b5156] hover:bg-[#083a3d] text-white font-black px-4 py-2.5 rounded-xl text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0 active:scale-95 shadow-sm"
          >
            <Plus size={12} /> Nuevo Comando
          </button>
        </div>

        {/* Listado de Comandos */}
        <div className="space-y-4">
          {loadingCommands ? (
            <div className="flex justify-center items-center py-12">
              <RefreshCw size={20} className="text-[#0b5156] animate-spin" />
            </div>
          ) : commands.length === 0 ? (
            <div className="bg-slate-50 border border-slate-200 p-8 rounded-2xl text-center space-y-3">
              <MessageSquare size={28} className="text-slate-350 mx-auto" />
              <div className="space-y-1">
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wide">Sin comandos activos</p>
                <p className="text-[10px] text-slate-400 font-semibold leading-relaxed max-w-xs mx-auto">
                  No hay comandos registrados para esta organización. Crea uno nuevo para empezar a automatizar respuestas.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-2xl bg-white shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-50">
                    <th className="py-4 px-6">Comando</th>
                    <th className="py-4 px-6">Respuesta del Bot</th>
                    <th className="py-4 px-6">Acción Interna</th>
                    <th className="py-4 px-6">Estado</th>
                    <th className="py-4 px-6 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[11px] font-semibold text-slate-700">
                  {commands.map((cmd) => (
                    <tr key={cmd.id} className="hover:bg-slate-55 transition-colors">
                      <td className="py-4 px-6 font-mono text-[#0b5156] font-black">{cmd.trigger_command}</td>
                      <td className="py-4 px-6 max-w-xs truncate" title={cmd.response_text}>{cmd.response_text}</td>
                      <td className="py-4 px-6 font-mono text-[10px] text-slate-500">
                        {cmd.internal_action || <span className="italic text-slate-400">Ninguna</span>}
                      </td>
                      <td className="py-4 px-6">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${
                          cmd.is_active 
                            ? 'bg-[#0b5156]/10 text-[#0b5156] border-[#0b5156]/25' 
                            : 'bg-slate-100 text-slate-500 border-slate-200'
                        }`}>
                          <span className={`w-1 h-1 rounded-full ${cmd.is_active ? 'bg-[#0b5156]' : 'bg-slate-400'}`} />
                          {cmd.is_active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleDeleteCommand(cmd.id)}
                          className="p-1.5 hover:bg-red-50 hover:text-red-600 border border-transparent hover:border-red-200 rounded-lg text-slate-400 transition-all active:scale-90"
                          title="Eliminar comando"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Formulario Modal */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs animate-in fade-in duration-200 p-4">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md space-y-4 shadow-xl relative text-slate-800">
              <button 
                onClick={() => setShowForm(false)} 
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 transition-colors"
              >
                <X size={16} />
              </button>
              
              <div className="space-y-1">
                <span className="bg-[#0b5156]/10 text-[#0b5156] text-[8px] font-black px-2 py-0.5 rounded border border-[#0b5156]/20 uppercase tracking-widest inline-flex items-center gap-1.5">
                  <Terminal size={10} /> Creación
                </span>
                <h3 className="text-base font-black uppercase text-[#0b5156] tracking-tight">
                  Nuevo Comando
                </h3>
                <p className="text-slate-400 text-[9px] font-bold uppercase tracking-wide">
                  Registra un activador del bot para respuestas automáticas
                </p>
              </div>

              <form onSubmit={handleCreateCommand} className="space-y-4 pt-2">
                {formError && (
                  <div className="bg-red-50 border border-red-200 p-3 rounded-xl text-red-700 text-[9px] font-black uppercase tracking-wider text-center">
                    {formError}
                  </div>
                )}
                
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">
                    Comando de Activación *
                  </label>
                  <input 
                    type="text" 
                    placeholder="/nomina" 
                    value={newTrigger}
                    onChange={(e) => setNewTrigger(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0b5156] transition-all font-mono"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">
                    Respuesta del Bot *
                  </label>
                  <textarea 
                    placeholder="Introduce la respuesta que enviará el bot..." 
                    value={newResponse}
                    onChange={(e) => setNewResponse(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0b5156] transition-all h-24 resize-none"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[9px] font-black uppercase text-slate-500 tracking-wider">
                    Acción Interna (Opcional)
                  </label>
                  <input 
                    type="text" 
                    placeholder="ej. run_sync" 
                    value={newAction}
                    onChange={(e) => setNewAction(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#0b5156] transition-all font-mono"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2 text-[10px] font-black uppercase tracking-wider">
                  <button 
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="bg-transparent border border-slate-200 text-slate-500 hover:text-slate-800 px-5 py-3 rounded-xl transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    disabled={creating}
                    className="bg-[#0b5156] hover:bg-[#083a3d] text-white px-5 py-3 rounded-xl transition-all flex items-center gap-1.5 disabled:opacity-50 shadow-sm"
                  >
                    {creating ? (
                      <>
                        <RefreshCw size={10} className="animate-spin" /> Guardando...
                      </>
                    ) : (
                      'Guardar Comando'
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
