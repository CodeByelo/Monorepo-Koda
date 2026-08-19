import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown, FileText, Tag, User, Clock, CalendarDays, History, CheckCircle } from 'lucide-react';
import { CombinedDataItem, SortField, SortDirection } from '../utils/departmentUtils';

interface DetailTableProps {
    data: CombinedDataItem[];
    darkMode: boolean;
    isLoading: boolean;
    sortField: SortField;
    sortDirection: SortDirection;
    onSort: (field: SortField) => void;
    onOpenTicketHistory: (ticketId: number) => void;
}

export const DetailTable: React.FC<DetailTableProps> = ({
    data,
    darkMode,
    isLoading,
    sortField,
    sortDirection,
    onSort,
    onOpenTicketHistory
}) => {

    const getSortIcon = (field: SortField) => {
        if (sortField !== field) return <ArrowUpDown size={14} className="opacity-30" />;
        return sortDirection === 'asc'
            ? <ArrowUp size={14} className="text-red-500" />
            : <ArrowDown size={14} className="text-red-500" />;
    };

    const getImportanceBadge = (importance: string) => {
        switch (importance) {
            case 'Alta':
                return (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${darkMode ? 'bg-red-900/20 text-red-400 border-red-900/30' : 'bg-red-50 text-red-700 border-red-200'
                        }`}>
                        Alta
                    </span>
                );
            case 'Media':
                return (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${darkMode ? 'bg-amber-900/20 text-amber-400 border-amber-900/30' : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                        Media
                    </span>
                );
            case 'Baja':
                return (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${darkMode ? 'bg-emerald-900/20 text-emerald-400 border-emerald-900/30' : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                        Baja
                    </span>
                );
            default:
                return null;
        }
    };

    const renderSkeletonRow = (key: number) => (
        <tr key={key} className={darkMode ? 'border-b border-slate-800' : 'border-b border-slate-100'}>
            {[...Array(8)].map((_, i) => (
                <td key={i} className="px-4 py-4">
                    <div className={`h-4 rounded animate-pulse ${darkMode ? 'bg-slate-800' : 'bg-slate-200'}`} style={{ width: i === 0 ? '80%' : '60%' }} />
                </td>
            ))}
        </tr>
    );

    return (
        <div className={`rounded-lg border overflow-hidden ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className={`border-b text-xs uppercase tracking-wider ${darkMode ? 'bg-slate-950/50 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-500'
                            }`}>
                            <th
                                className="px-4 py-3 font-bold cursor-pointer hover:text-red-500 transition-colors"
                                onClick={() => onSort('type')}
                            >
                                <div className="flex items-center gap-2">
                                    <FileText size={14} />
                                    <span>Tipo</span>
                                    {getSortIcon('type')}
                                </div>
                            </th>
                            <th className="px-4 py-3 font-bold">
                                <div className="flex items-center gap-2">
                                    <CalendarDays size={14} />
                                    <span>Fecha</span>
                                </div>
                            </th>
                            <th className="px-4 py-3 font-bold">
                                <div className="flex items-center gap-2">
                                    <Clock size={14} />
                                    <span>Hora</span>
                                </div>
                            </th>
                            <th
                                className="px-4 py-3 font-bold cursor-pointer hover:text-red-500 transition-colors"
                                onClick={() => onSort('importancia')}
                            >
                                <div className="flex items-center gap-2">
                                    <Tag size={14} />
                                    <span>Importancia</span>
                                    {getSortIcon('importancia')}
                                </div>
                            </th>
                            <th className="px-4 py-3 font-bold">
                                <div className="flex items-center gap-2">
                                    <CheckCircle size={14} />
                                    <span>Estado</span>
                                </div>
                            </th>
                            <th
                                className="px-4 py-3 font-bold cursor-pointer hover:text-red-500 transition-colors"
                                onClick={() => onSort('enviadoPor')}
                            >
                                <div className="flex items-center gap-2">
                                    <User size={14} />
                                    <span>Enviado Por</span>
                                    {getSortIcon('enviadoPor')}
                                </div>
                            </th>
                            <th
                                className="px-4 py-3 font-bold cursor-pointer hover:text-red-500 transition-colors"
                                onClick={() => onSort('recibidoPor')}
                            >
                                <div className="flex items-center gap-2">
                                    <User size={14} />
                                    <span>Recibido Por</span>
                                    {getSortIcon('recibidoPor')}
                                </div>
                            </th>
                            <th className="px-4 py-3 font-bold text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        {isLoading ? (
                            [...Array(5)].map((_, i) => renderSkeletonRow(i))
                        ) : data.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="px-4 py-12 text-center">
                                    <div className="flex flex-col items-center gap-3 opacity-50">
                                        <FileText size={48} className="stroke-1" />
                                        <p>No se encontraron registros con los filtros seleccionados</p>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            data.map((item) => (
                                <tr
                                    key={item.id}
                                    className={`border-b transition-colors ${darkMode
                                        ? 'border-slate-800 hover:bg-slate-800/50'
                                        : 'border-slate-100 hover:bg-slate-50'
                                        }`}
                                >
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-1.5 rounded ${item.type === 'Documento'
                                                ? (darkMode ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600')
                                                : (darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600')
                                                }`}>
                                                {item.type === 'Documento' ? <FileText size={14} /> : <Tag size={14} />}
                                            </div>
                                            <span className="font-medium">{item.type}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs opacity-80">
                                        {item.fechaHora.split(' ')[0]}
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs opacity-80">
                                        {item.tiempo}
                                    </td>
                                    <td className="px-4 py-3">
                                        {getImportanceBadge(item.importancia)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${darkMode ? 'bg-slate-800 text-slate-200 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                                            {item.estado}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                {item.enviadoPor.charAt(0)}
                                            </div>
                                            <span className="truncate max-w-[150px]" title={item.enviadoPor}>
                                                {item.enviadoPor}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="truncate max-w-[150px] block opacity-80" title={item.recibidoPor}>
                                            {item.recibidoPor}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        {item.type === 'Ticket' && item.ticketId ? (
                                            <button
                                                onClick={() => onOpenTicketHistory(item.ticketId as number)}
                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-bold border transition-colors ${darkMode ? 'bg-slate-800 text-slate-100 border-slate-700 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}`}
                                            >
                                                <History size={12} />
                                                Historial
                                            </button>
                                        ) : (
                                            <span className="text-xs opacity-50">-</span>
                                        )}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Footer con paginación simple (indicativa) */}
            {!isLoading && data.length > 0 && (
                <div className={`px-4 py-3 border-t text-xs flex justify-between items-center ${darkMode ? 'border-slate-800 text-slate-500' : 'border-slate-100 text-slate-400'
                    }`}>
                    <span>Mostrando {data.length} registros</span>
                    <div className="flex gap-2">
                        <button disabled className="opacity-50 cursor-not-allowed">Anterior</button>
                        <span className={darkMode ? 'text-slate-300' : 'text-slate-600'}>1</span>
                        <button disabled className="opacity-50 cursor-not-allowed">Siguiente</button>
                    </div>
                </div>
            )}
        </div>
    );
};
