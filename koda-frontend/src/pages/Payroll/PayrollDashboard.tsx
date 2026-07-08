import { Building2 } from 'lucide-react';
import DynamicPayrollTable from '@/components/DynamicPayrollTable';

const PayrollDashboard = () => {
  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <header className="flex flex-col gap-4 rounded-3xl border border-slate-200 bg-white p-8 shadow-sm lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-[#9d174d]">
            <Building2 size={14} />
            Recursos Humanos y Nómina
          </p>
          <h1 className="text-3xl font-black uppercase tracking-tight text-slate-800">Panel de Nómina</h1>
          <p className="max-w-2xl text-sm font-bold uppercase tracking-tight text-slate-500">
            Captura de variables, cálculo de pre-nómina y control por tenant con aislamiento de datos.
          </p>
        </div>
      </header>

      <DynamicPayrollTable />
    </div>
  );
};

export default PayrollDashboard;
