import React, { useState, useEffect, useRef } from 'react';
import { X, UserPlus, ShieldCheck, Users, Phone, Mail, Loader2, AlertCircle } from 'lucide-react';
import { api } from '@/api/client';

interface QuickCreateClienteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (cliente: any) => void;
}

export const QuickCreateClienteModal: React.FC<QuickCreateClienteModalProps> = ({ isOpen, onClose, onCreated }) => {
  const [rif, setRif] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const rifInputRef = useRef<HTMLInputElement>(null);

  // Auto-foco inmediato en el campo RIF al abrir el modal
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        rifInputRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const resetForm = () => {
    setRif('');
    setNombre('');
    setTelefono('');
    setEmail('');
    setFormError(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    // Validación mínima en cliente, alineada con backend/schemas/operations.py
    if (rif.trim().length < 3) {
      setFormError('El RIF/Cédula debe tener al menos 3 caracteres.');
      rifInputRef.current?.focus();
      return;
    }
    if (nombre.trim().length < 3) {
      setFormError('El Nombre o Razón Social debe tener al menos 3 caracteres.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        rif: rif.trim().toUpperCase(),
        nombre: nombre.trim().toUpperCase(),
        telefono: telefono.trim() || null,
        email: email.trim().toLowerCase() || null,
        direccion: '',
        es_contribuyente_especial: false,
      };
      const cliente = await api.post<any>('/clientes', payload);
      onCreated(cliente);
      resetForm();
      onClose();
    } catch (err: any) {
      // El backend responde 400 con detail "El RIF/Cédula ya existe" si está duplicado.
      // El modal permanece abierto para que el vendedor corrija sin perder los datos ingresados.
      const rawMsg = err.message || '';
      if (rawMsg.toLowerCase().includes('already exists') || rawMsg.toLowerCase().includes('ya existe') || rawMsg.toLowerCase().includes('duplicate')) {
        setFormError('El RIF o Cédula ya está registrado en el sistema. Ingrese uno diferente.');
      } else if (rawMsg) {
        setFormError(rawMsg);
      } else {
        setFormError('No se pudo crear el cliente. Por favor verifique los datos e intente nuevamente.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div 
        className="bg-white w-full max-w-md rounded-[2rem] p-6 sm:p-8 border border-slate-200 shadow-2xl animate-in zoom-in-95 duration-200 relative overflow-hidden my-auto max-h-[92vh] flex flex-col justify-between"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-customer-modal-title"
      >
        {/* Elemento de marca decorativo de fondo */}
        <div className="absolute top-0 right-0 p-6 opacity-[0.03] pointer-events-none select-none">
          <Users size={160} className="text-[#0b5156] -rotate-12" />
        </div>

        <div>
          {/* Header */}
          <div className="flex justify-between items-start mb-6 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-[#0b5156]/10 text-[#0b5156] rounded-2xl">
                <UserPlus size={20} />
              </div>
              <div>
                <h2 id="quick-customer-modal-title" className="text-xl sm:text-2xl font-black text-slate-800 uppercase tracking-tighter mb-0.5 font-mono">
                  Nuevo Cliente
                </h2>
                <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Registro rápido para punto de venta
                </p>
              </div>
            </div>
            <button 
              type="button" 
              onClick={handleClose} 
              disabled={isSubmitting}
              className="p-2 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 text-slate-400 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
              aria-label="Cerrar modal"
            >
              <X size={16} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5 relative z-10">
            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                RIF / Cédula <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <ShieldCheck size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  ref={rifInputRef}
                  type="text"
                  value={rif}
                  onChange={(e) => setRif(e.target.value)}
                  disabled={isSubmitting}
                  required
                  placeholder="Ej. J-12345678-9 o V-12345678"
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black uppercase focus:outline-none focus:border-[#0b5156] focus:ring-4 focus:ring-[#0b5156]/10 transition-all font-mono disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">
                Nombre / Razón Social <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Users size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  disabled={isSubmitting}
                  required
                  placeholder="Ej. Distribuidora Andina, C.A."
                  className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black uppercase focus:outline-none focus:border-[#0b5156] focus:ring-4 focus:ring-[#0b5156]/10 transition-all disabled:opacity-60"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Teléfono</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Opcional"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-black uppercase focus:outline-none focus:border-[#0b5156] focus:ring-4 focus:ring-[#0b5156]/10 transition-all font-mono disabled:opacity-60"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Correo</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="Opcional"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-[11px] font-black lowercase focus:outline-none focus:border-[#0b5156] focus:ring-4 focus:ring-[#0b5156]/10 transition-all font-mono disabled:opacity-60"
                  />
                </div>
              </div>
            </div>

            {formError && (
              <div className="p-3 bg-red-50/80 border border-red-200 rounded-2xl flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1 duration-200">
                <AlertCircle size={15} className="text-red-600 shrink-0 mt-0.5" />
                <p className="text-[11px] font-black text-red-600 leading-snug">{formError}</p>
              </div>
            )}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#0b5156] hover:bg-[#083a3d] disabled:opacity-60 disabled:cursor-not-allowed text-white font-black py-3.5 sm:py-4 rounded-2xl uppercase text-xs tracking-widest shadow-xl shadow-[#0b5156]/20 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin text-white" />
                    <span>Guardando Cliente...</span>
                  </>
                ) : (
                  <>
                    <UserPlus size={16} />
                    <span>Crear y Seleccionar</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default QuickCreateClienteModal;
