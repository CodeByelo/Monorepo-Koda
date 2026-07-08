import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  duration?: number;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ 
  message, 
  type = 'success', 
  duration = 4000, 
  onClose 
}) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed bottom-5 right-5 z-[9999] animate-in slide-in-from-bottom duration-300">
      <div className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 transition-all duration-300 ${
        type === 'success' 
          ? 'bg-[#0b5156] border border-[#0b5156]/20 text-white' 
          : type === 'error'
          ? 'bg-red-600 border border-red-500 text-white'
          : 'bg-slate-800 border border-slate-700 text-white'
      }`}>
        {type === 'success' && <CheckCircle size={20} />}
        {type === 'error' && <AlertTriangle size={20} />}
        {type === 'info' && <Info size={20} />}
        
        <span className="font-bold text-sm tracking-wide uppercase font-mono">{message}</span>
        
        <button 
          onClick={onClose} 
          className="ml-2 p-0.5 rounded-full hover:bg-white/10 active:bg-white/20 transition-colors"
        >
          <X size={14} />
        </button>
      </div>
    </div>,
    document.body
  );
};
