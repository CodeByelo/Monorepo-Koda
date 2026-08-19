import React from 'react';
import { Calendar, Filter } from 'lucide-react';

interface FilterBarProps {
    darkMode: boolean;
    departments: string[];
    selectedDept: string;
    onDeptChange: (dept: string) => void;
    selectedDate: Date | null;
    onDateChange: (date: Date | null) => void;
    // selectedMonth is now a 'YYYY-MM' string for native <input type="month">
    selectedMonth: string | null;
    onMonthChange: (month: string | null) => void;
}

export const FilterBar: React.FC<FilterBarProps> = ({
    darkMode,
    departments,
    selectedDept,
    onDeptChange,
    selectedDate,
    onDateChange,
    selectedMonth,
    onMonthChange,
}) => {
    const inputClass = `w-full px-3 py-2 rounded-md border text-sm outline-none cursor-pointer transition-colors ${
        darkMode
            ? 'bg-slate-950 border-slate-700 text-slate-200 focus:border-slate-500'
            : 'bg-slate-50 border-slate-300 text-slate-700 focus:border-slate-400'
    }`;

    return (
        <div className={`p-4 rounded-lg border mb-6 flex flex-wrap gap-4 items-center ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}` }>
            <div className="flex items-center gap-2 mr-2">
                <Filter size={20} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                <span className={`text-sm font-bold uppercase tracking-wider ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Filtros</span>
            </div>

            {/* Selector de Gerencia */}
            <div className="flex-1 min-w-[200px]">
                <select
                    value={selectedDept}
                    onChange={(e) => onDeptChange(e.target.value)}
                    className={inputClass}
                >
                    {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                    ))}
                </select>
            </div>

            {/* Selector de Mes — input nativo que abre el calendario de mes */}
            <div className="min-w-[180px] relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none z-10">
                    <Calendar size={14} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                </div>
                <input
                    type="month"
                    value={selectedMonth ?? ''}
                    onChange={(e) => {
                        if (e.target.value) {
                            onMonthChange(e.target.value);
                            onDateChange(null); // limpiar fecha puntual
                        } else {
                            onMonthChange(null);
                        }
                    }}
                    className={`pl-9 pr-3 py-2 rounded-md border text-sm outline-none cursor-pointer transition-colors w-full ${
                        darkMode
                            ? 'bg-slate-950 border-slate-700 text-slate-200 focus:border-slate-500 [color-scheme:dark]'
                            : 'bg-slate-50 border-slate-300 text-slate-700 focus:border-slate-400'
                    }`}
                />
            </div>

            {/* Selector de Fecha Específica */}
            <div className="min-w-[160px] relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                    <Calendar size={14} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                </div>
                <input
                    type="date"
                    value={selectedDate ? selectedDate.toISOString().split('T')[0] : ''}
                    onChange={(e) => {
                        if (e.target.value) {
                            const [year, month, day] = e.target.value.split('-').map(Number);
                            onDateChange(new Date(year, month - 1, day));
                            onMonthChange(null); // limpiar mes al seleccionar fecha puntual
                        } else {
                            onDateChange(null);
                        }
                    }}
                    className={`pl-9 pr-3 py-2 rounded-md border text-sm outline-none cursor-pointer transition-colors w-full ${
                        darkMode
                            ? 'bg-slate-950 border-slate-700 text-slate-200 focus:border-slate-500 [color-scheme:dark]'
                            : 'bg-slate-50 border-slate-300 text-slate-700 focus:border-slate-400'
                    }`}
                />
            </div>

            {/* Botón Limpiar */}
            {(selectedDate || selectedMonth) && (
                <button
                    onClick={() => { onDateChange(null); onMonthChange(null); }}
                    className={`px-3 py-2 text-xs font-bold uppercase rounded-md border transition-colors ${
                        darkMode ? 'border-red-900/50 text-red-400 hover:bg-red-900/20' : 'border-red-200 text-red-600 hover:bg-red-50'
                    }`}
                >
                    Limpiar
                </button>
            )}
        </div>
    );
};
