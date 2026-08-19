import React, { useState, useMemo, useEffect } from 'react';
import {
    ArrowLeft, Clock, AlertTriangle, FileText, Tag, ChevronDown, CheckCircle
} from 'lucide-react';
import {
    ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
    AreaChart, Area, XAxis, YAxis, CartesianGrid, BarChart, Bar
} from 'recharts';
import { Document } from '../types';
import { Ticket } from '../../../components/TicketSystem';
import { FilterBar } from './FilterBar';
import { DetailTable } from './DetailTable';
import { ApiTicketHistoryEvent, getTicketHistory as apiGetTicketHistory } from '../../../lib/api';
import {
    filterByDateRange,
    filterByDepartment,
    groupByDate,
    calculateImportanceDistribution,
    combineDocumentsAndTickets,
    sortTableData,
    getLastNDays,
    getLastNMonths,
    SortField,
    SortDirection
} from '../utils/departmentUtils';

interface DepartmentDetailViewProps {
    departmentName: string;
    allDepartments: string[];
    documents: Document[];
    tickets: Ticket[];
    darkMode: boolean;
    onBack: () => void;
    onDepartmentChange: (dept: string) => void;
}

export const DepartmentDetailView: React.FC<DepartmentDetailViewProps> = ({
    departmentName,
    allDepartments,
    documents,
    tickets,
    darkMode,
    onBack,
    onDepartmentChange
}) => {
    const ResponsiveContainerCompat = ResponsiveContainer as unknown as React.ComponentType<any>;
    const PieChartCompat = PieChart as unknown as React.ComponentType<any>;
    const PieCompat = Pie as unknown as React.ComponentType<any>;
    const CellCompat = Cell as unknown as React.ComponentType<any>;
    const TooltipCompat = Tooltip as unknown as React.ComponentType<any>;
    const LegendCompat = Legend as unknown as React.ComponentType<any>;
    const AreaChartCompat = AreaChart as unknown as React.ComponentType<any>;
    const AreaCompat = Area as unknown as React.ComponentType<any>;
    const XAxisCompat = XAxis as unknown as React.ComponentType<any>;
    const YAxisCompat = YAxis as unknown as React.ComponentType<any>;
    const CartesianGridCompat = CartesianGrid as unknown as React.ComponentType<any>;
    // Estados de Filtros
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

    // Estado de Tabla
    const [sortField, setSortField] = useState<SortField>('fechaHora');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Estado de Carga
    const [isLoading, setIsLoading] = useState(false);
    const [loadingStep, setLoadingStep] = useState(0); // Para simular carga progresiva
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyRows, setHistoryRows] = useState<ApiTicketHistoryEvent[]>([]);
    const [historyTicketId, setHistoryTicketId] = useState<number | null>(null);

    // Efecto de carga simulada al cambiar filtros
    useEffect(() => {
        setIsLoading(true);
        setLoadingStep(0);

        const t1 = setTimeout(() => setLoadingStep(1), 300);
        const t2 = setTimeout(() => setIsLoading(false), 800);

        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
        };
    }, [departmentName, selectedDate, selectedMonth]);

    // Lógica de Filtrado y Procesamiento
    const processedData = useMemo(() => {
        // 1. Filtrar por departamento (siempre activo en esta vista)
        const deptFiltered = filterByDepartment(documents, tickets, departmentName);

        // 2. Convertir string YYYY-MM a fechas de inicio/fin para el filtro
        let startDate: Date | null = selectedDate;
        let endDate: Date | null = selectedDate;

        if (selectedMonth && !selectedDate) {
            const [y, m] = selectedMonth.split('-').map(Number);
            startDate = new Date(y, m - 1, 1);
            endDate = new Date(y, m, 0, 23, 59, 59);
        }

        // 3. Filtrar por fecha
        const dateFiltered = filterByDateRange(
            deptFiltered.documents,
            deptFiltered.tickets,
            startDate,
            endDate
        );

        // 4. Generar datos para gráficos
        const importanceData = calculateImportanceDistribution(dateFiltered.documents, dateFiltered.tickets);
        const temporalData = groupByDate(dateFiltered.documents, dateFiltered.tickets);

        // 5. Generar y ordenar datos de tabla
        const rawTableData = combineDocumentsAndTickets(dateFiltered.documents, dateFiltered.tickets);
        const tableData = sortTableData(rawTableData, sortField, sortDirection);

        return {
            documents: dateFiltered.documents,
            tickets: dateFiltered.tickets,
            importanceData,
            temporalData,
            tableData,
            totalItems: rawTableData.length
        };
    }, [documents, tickets, departmentName, selectedDate, selectedMonth, sortField, sortDirection]);

    // Manejadores
    const handleSort = (field: SortField) => {
        if (field === sortField) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const handleOpenTicketHistory = async (ticketId: number) => {
        setHistoryTicketId(ticketId);
        setHistoryOpen(true);
        setHistoryLoading(true);
        try {
            const rows = await apiGetTicketHistory(ticketId);
            setHistoryRows(rows || []);
        } catch {
            setHistoryRows([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    return (
        <div className={`space-y-6 animate-in slide-in-from-right duration-500`}>
            {/* Header de Navegación */}
            <div className="flex items-center gap-4 border-b border-slate-200/20 pb-4">
                <button
                    onClick={onBack}
                    className={`p-2 rounded-full transition-colors ${darkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
                        }`}
                >
                    <ArrowLeft size={20} />
                </button>
                <div>
                    <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {departmentName}
                    </h2>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Vista detallada de operaciones y gestión
                    </p>
                </div>
            </div>

            {/* Barra de Filtros */}
            <FilterBar
                darkMode={darkMode}
                departments={allDepartments}
                selectedDept={departmentName}
                onDeptChange={onDepartmentChange}
                selectedDate={selectedDate}
                onDateChange={setSelectedDate}
                selectedMonth={selectedMonth}
                onMonthChange={setSelectedMonth}
            />

            {/* Seccion de Gráficos */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* KPI Summary (Opcional - Small Cards) */}
                { }

                {/* Gráfico 1: Importancia */}
                <div className={`p-6 rounded-lg border lg:col-span-1 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}>
                    <h3 className={`font-bold mb-6 text-center ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        DISTRIBUCIÓN POR IMPORTANCIA
                    </h3>
                    <div className="h-64">
                        {isLoading && loadingStep < 1 ? (
                            <div className="h-full w-full flex items-center justify-center animate-pulse">
                                <div className={`w-32 h-32 rounded-full border-4 border-t-transparent ${darkMode ? 'border-slate-700' : 'border-slate-200'}`} />
                            </div>
                        ) : (
                            <ResponsiveContainerCompat width="100%" height="100%">
                                <PieChartCompat>
                                    <PieCompat
                                        data={processedData.importanceData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {processedData.importanceData.map((entry, index) => (
                                            <CellCompat key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </PieCompat>
                                    <TooltipCompat
                                        contentStyle={{
                                            backgroundColor: darkMode ? '#0f172a' : '#fff',
                                            borderColor: darkMode ? '#1e293b' : '#e2e8f0',
                                            color: darkMode ? '#f1f5f9' : '#1e293b'
                                        }}
                                    />
                                    <LegendCompat verticalAlign="bottom" height={36} />
                                </PieChartCompat>
                            </ResponsiveContainerCompat>
                        )}
                    </div>
                </div>

                {/* Gráfico 2: Volumen Temporal */}
                <div className={`p-6 rounded-lg border lg:col-span-2 ${darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
                    }`}>
                    <h3 className={`font-bold mb-6 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                        VOLUMEN DE ACTIVIDAD (TIEMPO)
                    </h3>
                    <div className="h-64">
                        {isLoading && loadingStep < 1 ? (
                            <div className="h-full w-full flex items-end gap-2 px-8 py-4 animate-pulse">
                                {[...Array(10)].map((_, i) => (
                                    <div key={i} className={`flex-1 rounded-t ${darkMode ? 'bg-slate-800' : 'bg-slate-200'}`} style={{ height: `${Math.random() * 80 + 20}%` }} />
                                ))}
                            </div>
                        ) : (
                            <ResponsiveContainerCompat width="100%" height="100%">
                                <AreaChartCompat data={processedData.temporalData}>
                                    <defs>
                                        <linearGradient id="colorDocs" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorTickets" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                     <CartesianGridCompat strokeDasharray="3 3" stroke={darkMode ? '#334155' : '#e2e8f0'} vertical={false} />
                                    <XAxisCompat
                                        dataKey="date"
                                        stroke={darkMode ? '#94a3b8' : '#64748b'}
                                        fontSize={10}
                                        label={{ value: "Fechas", position: "insideBottom", offset: -5, fill: darkMode ? '#94a3b8' : '#64748b', fontSize: 10 }}
                                        tickFormatter={(val: string) => {
                                            // Si hay más de 10 puntos, mostrar formato corto, sino formato descriptivo
                                            if (processedData.temporalData.length > 10) return val.split('/')[0];
                                            return val.split('/').slice(0, 2).join('/'); // DD/MM
                                        }}
                                    />
                                    <YAxisCompat 
                                        stroke={darkMode ? '#94a3b8' : '#64748b'} 
                                        fontSize={10}
                                        label={{ value: "Volumen", angle: -90, position: "insideLeft", fill: darkMode ? '#94a3b8' : '#64748b', fontSize: 10 }}
                                    />
                                    <TooltipCompat
                                        contentStyle={{
                                            backgroundColor: darkMode ? '#0f172a' : '#fff',
                                            borderColor: darkMode ? '#1e293b' : '#e2e8f0',
                                            color: darkMode ? '#f1f5f9' : '#1e293b',
                                            borderRadius: '8px',
                                            fontSize: '12px'
                                        }}
                                        itemStyle={{ padding: '2px 0' }}
                                    />
                                    <LegendCompat 
                                        verticalAlign="top" 
                                        align="right" 
                                        height={36} 
                                        iconType="circle"
                                        wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
                                    />
                                    <AreaCompat type="monotone" dataKey="documentos" name="Documentos" stroke="#3b82f6" fillOpacity={1} fill="url(#colorDocs)" />
                                    <AreaCompat type="monotone" dataKey="tickets" name="Tickets" stroke="#8b5cf6" fillOpacity={1} fill="url(#colorTickets)" />
                                </AreaChartCompat>
                            </ResponsiveContainerCompat>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabla Detallada */}
            <div>
                <h3 className={`font-bold text-lg mb-4 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Registro Detallado
                </h3>
                <DetailTable
                    data={processedData.tableData}
                    darkMode={darkMode}
                    isLoading={isLoading}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    onOpenTicketHistory={handleOpenTicketHistory}
                />
            </div>

            {historyOpen && (
                <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className={`w-full max-w-4xl rounded-xl border ${darkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'}`}>
                        <div className={`px-5 py-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                            <h4 className={`font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                Historial del Ticket #{historyTicketId}
                            </h4>
                            <button
                                onClick={() => setHistoryOpen(false)}
                                className={`px-3 py-1 rounded text-sm font-semibold ${darkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700'}`}
                            >
                                Cerrar
                            </button>
                        </div>
                        <div className="max-h-[60vh] overflow-auto">
                            {historyLoading ? (
                                <div className="p-6 text-sm opacity-70">Cargando historial...</div>
                            ) : historyRows.length === 0 ? (
                                <div className="p-6 text-sm opacity-70">Sin eventos para este ticket.</div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className={darkMode ? 'text-slate-400' : 'text-slate-500'}>
                                        <tr>
                                            <th className="px-4 py-2 text-left">Fecha/Hora</th>
                                            <th className="px-4 py-2 text-left">Accion</th>
                                            <th className="px-4 py-2 text-left">Usuario</th>
                                            <th className="px-4 py-2 text-left">Detalle</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historyRows.map((row) => (
                                            <tr key={row.id} className={darkMode ? 'border-t border-slate-800' : 'border-t border-slate-100'}>
                                                <td className="px-4 py-2">{new Date(row.created_at).toLocaleString('es-ES')}</td>
                                                <td className="px-4 py-2 font-semibold">{row.action}</td>
                                                <td className="px-4 py-2">{row.actor_username || 'sistema'}</td>
                                                <td className="px-4 py-2">{row.details || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
