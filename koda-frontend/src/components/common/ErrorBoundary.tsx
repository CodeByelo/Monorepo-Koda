import React, { Component, ErrorInfo, ReactNode } from 'react';
import { TriangleAlert, RefreshCcw, Home } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white max-w-lg w-full p-8 rounded-3xl border border-slate-200 shadow-xl text-center space-y-6">
            <div className="w-20 h-20 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <TriangleAlert size={40} />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">Error del Sistema</h1>
              <p className="text-sm font-bold text-slate-500 uppercase">
                Se ha detectado una excepción no controlada. Hemos registrado el incidente para su revisión.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-left overflow-auto max-h-32">
                <code className="text-[10px] font-mono text-red-500 break-words">
                  {this.state.error.message}
                </code>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-4">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 bg-[#0b5156] text-white px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest flex justify-center items-center gap-2 hover:bg-[#083a3d] transition-colors shadow-lg shadow-teal-900/20"
              >
                <RefreshCcw size={16} /> Reintentar
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="flex-1 bg-white border border-slate-200 text-slate-600 px-6 py-3 rounded-xl text-xs font-black uppercase tracking-widest flex justify-center items-center gap-2 hover:bg-slate-50 transition-colors"
              >
                <Home size={16} /> Ir al Inicio
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
