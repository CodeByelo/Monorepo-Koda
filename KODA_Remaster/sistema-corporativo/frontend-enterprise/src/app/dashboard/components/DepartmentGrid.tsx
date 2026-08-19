import React, { useState } from 'react';
import { ChevronRight, Building2, Users, Briefcase, Zap, Factory, Shield, LayoutGrid } from 'lucide-react';

import { OrgCategory } from '../types';

interface DepartmentGridProps {
    orgStructure: OrgCategory[];
    darkMode: boolean;
    onSelectDepartment: (deptName: string) => void;
}

const ICON_MAP: Record<string, React.ElementType> = {
    Shield,
    Briefcase,
    Zap,
    Users,
    Factory,
    Building2 // Default
};

export const DepartmentGrid: React.FC<DepartmentGridProps> = ({
    orgStructure,
    darkMode,
    onSelectDepartment
}) => {
    const [hoveredDept, setHoveredDept] = useState<string | null>(null);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            <div className="flex items-center gap-3 mb-6">
                <div className={`p-3 rounded-lg ${darkMode ? 'bg-red-900/20 text-red-500' : 'bg-red-50 text-red-600'}`}>
                    <LayoutGrid size={24} />
                </div>
                <div>
                    <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        Seleccione una Gerencia
                    </h2>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Explora métricas detalladas, documentos y tickets por departamento
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {orgStructure.map((group, groupIdx) => {
                    const GroupIcon = ICON_MAP[group.icon] || Building2;

                    return (
                        <div
                            key={groupIdx}
                            className={`rounded-xl border overflow-hidden transition-all duration-300 ${darkMode
                                    ? 'bg-slate-900 border-slate-800 hover:border-slate-700'
                                    : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-lg'
                                }`}
                        >
                            <div className={`px-4 py-3 border-b flex items-center gap-2 ${darkMode ? 'bg-slate-950/50 border-slate-800' : 'bg-slate-50 border-slate-100'
                                }`}>
                                <GroupIcon size={16} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
                                <h3 className={`text-xs font-bold uppercase tracking-wider ${darkMode ? 'text-slate-300' : 'text-slate-700'
                                    }`}>
                                    {group.category}
                                </h3>
                            </div>

                            <div className="p-2">
                                {group.items.map((deptName, deptIdx) => (
                                    <button
                                        key={deptIdx}
                                        onClick={() => onSelectDepartment(deptName)}
                                        onMouseEnter={() => setHoveredDept(deptName)}
                                        onMouseLeave={() => setHoveredDept(null)}
                                        className={`w-full text-left px-3 py-3 rounded-lg mb-1 flex items-center justify-between group transition-all duration-200 ${darkMode
                                                ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                                                : 'hover:bg-slate-50 text-slate-600 hover:text-slate-900'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${hoveredDept === deptName ? 'bg-red-500' : (darkMode ? 'bg-slate-700' : 'bg-slate-300')
                                                }`} />
                                            <span className="text-sm font-medium truncate pr-2">
                                                {deptName}
                                            </span>
                                        </div>

                                        <ChevronRight
                                            size={14}
                                            className={`transition-transform duration-300 ${hoveredDept === deptName ? 'translate-x-0 opacity-100 text-red-500' : '-translate-x-2 opacity-0'
                                                }`}
                                        />
                                    </button>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
