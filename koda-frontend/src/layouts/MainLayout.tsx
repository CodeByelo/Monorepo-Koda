import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import QuickSearch from '@/components/common/QuickSearch';
import { Menu } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSystem, SystemKey } from '@/providers/SystemProvider';
import { SessionGuard } from '@/components/common/SessionGuard';
import { useAuth } from '@/providers/AuthProvider';

const isPathAllowed = (path: string, system: SystemKey): boolean => {
  if (system === 'all' || path === '/' || path === '/alertas') return true;
  
  if (system === 'administrativo') {
    return path.startsWith('/ventas') || 
           path.startsWith('/compras') || 
           path.startsWith('/inventario') || 
           path.startsWith('/reportes') || 
           path.startsWith('/admin') ||
           ['/historial', '/nueva', '/nueva-fiscal', '/clientes', '/notas', '/pos'].some(p => path === p || path.startsWith(p + '/'));
  }
  if (system === 'financiero') {
    return path.startsWith('/cobranzas') || path.startsWith('/pagos') || path.startsWith('/tesoreria') || path.startsWith('/reportes') || path.startsWith('/admin');
  }
  if (system === 'contable') {
    return path.startsWith('/contabilidad') || path.startsWith('/reportes') || path.startsWith('/admin');
  }
  if (system === 'fiscal') {
    return path.startsWith('/fiscal') || path.startsWith('/reportes') || path.startsWith('/admin');
  }
  if (system === 'nomina') {
    return path.startsWith('/nomina') || path.startsWith('/reportes') || path.startsWith('/admin');
  }
  return false;
};

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { activeSystem } = useSystem();
  const { userName, userRole, tenantName } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const isIframe = window !== window.parent;

  const displayName = userName
    ? userName.split('@')[0].charAt(0).toUpperCase() + userName.split('@')[0].slice(1)
    : 'Usuario';
  const displayRole = userRole || 'Usuario';
  const initials = displayName.slice(0, 2).toUpperCase();

  // Redirection guard when switching active system
  useEffect(() => {
    if (!isPathAllowed(location.pathname, activeSystem)) {
      navigate('/');
    }
  }, [activeSystem, location.pathname, navigate]);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex min-h-screen bg-koda-bg print:bg-white print:block">
      <SessionGuard />
      {!isIframe && <Sidebar isOpen={isSidebarOpen} />}
      <main className="flex-1 flex flex-col min-w-0 print:block">
        {!isIframe && (
          <header className="print:hidden h-14 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-40">
            <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-100 rounded-xl text-slate-500 hover:text-[#0b5156] transition-all flex items-center justify-center border border-slate-100 shadow-sm"
              title={isSidebarOpen ? "Ocultar menú" : "Mostrar menú"}
            >
              <Menu size={16} />
            </button>
            <div className="flex items-center gap-2">
              <h3 className="text-[10px] font-black text-[#0b5156] uppercase tracking-widest">Omni 360 | Enterprise Ledger</h3>
              {tenantName && (
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">| {tenantName}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 border-r border-slate-300 pr-6">
               <div className="text-right leading-none">
                  <p className="text-xs font-black text-slate-800">{displayName}</p>
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">{displayRole}</p>
               </div>
               <div className="w-8 h-8 rounded-full bg-[#0b5156] flex items-center justify-center text-white font-black text-xs border border-white shadow-sm" title={userName || ''}>
                 {initials}
               </div>
            </div>
            {displayRole.toLowerCase() === 'desarrollador' && (
              <span className="bg-[#0b5156] text-white text-[8px] font-black px-1.5 py-0.5 rounded uppercase">Dev Mode</span>
            )}
          </div>
        </header>
        )}
        <div className={`flex-1 overflow-y-auto no-scrollbar ${!isIframe ? 'p-6' : 'p-0'} print:p-0 print:overflow-visible`}>
          <div key={location.pathname} className="animate-page-transition h-full">
            {children}
          </div>
        </div>
      </main>
      
      {/* Dynamic Command Palette / Quick Search Modal */}
      {!isIframe && <QuickSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />}
      


    </div>
  );
};

export default MainLayout;
