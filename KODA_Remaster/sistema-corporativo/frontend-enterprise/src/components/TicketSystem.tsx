"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Plus, MoreVertical, UsersRound, Clock, CheckCircle, FileText, History, X } from 'lucide-react';
import { logTicketActivity } from '../app/dashboard/security/actions';
import { UserRole } from '../context/AuthContext';
import { createTicket as apiCreateTicket, updateTicket as apiUpdateTicket, updateTicketStatus as apiUpdateTicketStatus, deleteTicket as apiDeleteTicket, getTicketHistory as apiGetTicketHistory, searchTicketHistory as apiSearchTicketHistory, ApiTicketHistoryEvent } from '../lib/api';
import { uiAlert, uiConfirm, uiPrompt } from '../lib/ui-dialog';

type TicketStatus = 'ABIERTO' | 'EN-PROCESO' | 'RESUELTO' | 'ELIMINADO';
type TicketPriority = 'ALTA' | 'MEDIA' | 'BAJA';
type TicketArea = string;

export interface Ticket {
    id: number;
    title: string;
    description: string;
    area: TicketArea;
    creatorDept?: string;
    priority: TicketPriority;
    status: TicketStatus;
    createdAt: string;
    ownerId?: string;
    resolvedAt?: string;
    owner: string;
    observations?: string;
    takenBy?: string;
    takenAt?: string;
}

const TECH_DEPT = "Gerencia Nacional de Tecnologías de la Información y la Comunicación";

export default function TicketSystem({
    darkMode,
    orgStructure = [],
    currentUser = 'Admin. General',
    currentUserId = '',
    userRole = 'Usuario',
    userDept = '',
    tickets = [],
    hasPermission,
    refreshTickets
}: {
    darkMode: boolean;
    orgStructure?: any[];
    currentUser?: string;
    currentUserId?: string;
    userRole?: UserRole;
    userDept?: string;
    tickets?: Ticket[];
    hasPermission: (permission: string) => boolean;
    refreshTickets?: () => Promise<void> | void;
}) {
    const theme = {
        panel: darkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200',
        panelMuted: darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200',
        column: darkMode ? 'bg-slate-900 border-slate-800' : 'bg-slate-50 border-slate-200',
        card: darkMode ? 'bg-slate-900 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80' : 'bg-white border-slate-200 hover:border-red-200',
        input: darkMode ? 'bg-slate-950 border-slate-800 text-white placeholder:text-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder:text-slate-400',
        text: darkMode ? 'text-white' : 'text-slate-900',
        subtext: darkMode ? 'text-slate-400' : 'text-slate-600',
        muted: darkMode ? 'text-slate-500' : 'text-slate-500',
        icon: darkMode ? 'text-slate-400' : 'text-slate-500',
        chip: darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-200 text-slate-700',
        empty: darkMode ? 'border-slate-800/20 text-slate-600' : 'border-slate-200 text-slate-500',
        modalOverlay: 'bg-black/70 backdrop-blur-md',
        modalClose: darkMode ? 'hover:bg-slate-800/40 text-slate-300' : 'hover:bg-slate-100 text-slate-600',
        secondaryButton: darkMode ? 'border-slate-800 text-slate-400 hover:bg-slate-800' : 'border-slate-200 text-slate-700 hover:bg-slate-50',
    };

    const PERMISSIONS_MASTER = {
        TICKETS_CREATE: 'TICKETS_CREATE',
        TICKETS_EDIT: 'TICKETS_EDIT',
        TICKETS_DELETE: 'TICKETS_DELETE',
        TICKETS_VIEW_ALL: 'TICKETS_VIEW_ALL',
        TICKETS_VIEW_DEPT: 'TICKETS_VIEW_DEPT',
        TICKETS_MOVE_KANBAN: 'TICKETS_MOVE_KANBAN',
        TICKETS_RESOLVE: 'TICKETS_RESOLVE',
    };

    const normalizeText = (value: string) => (value || '').toLowerCase().trim();
    const isTechUser = normalizeText(userDept).includes('tecnolog');
    const isAdminUser = normalizeText(userRole || '').includes('admin');
    const isDevUser = normalizeText(userRole || '').includes('desarrollador') || normalizeText(userRole || '').includes('dev');
    const isCeoUser = normalizeText(userRole || '') === 'ceo';
    const canOperateTicketFlow = isTechUser || isAdminUser || isDevUser;
    const canDeleteByRole = isTechUser || isAdminUser || isDevUser || isCeoUser;
    const canSeeGlobalFilters = isTechUser || isAdminUser || isDevUser || isCeoUser || hasPermission(PERMISSIONS_MASTER.TICKETS_VIEW_ALL);

    const [filterArea, setFilterArea] = useState<string>('all');
    const [filterPriority, setFilterPriority] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [historyRows, setHistoryRows] = useState<ApiTicketHistoryEvent[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyQuery, setHistoryQuery] = useState('');
    const [menuOpenId, setMenuOpenId] = useState<number | null>(null);
    const [editingTicket, setEditingTicket] = useState<Ticket | null>(null);

    const allAreas = useMemo(() => {
        const fromStructure = orgStructure.flatMap((group: any) => group.items || []);
        const fromTickets = tickets.map(t => t.creatorDept).filter(Boolean) as string[];
        return Array.from(new Set([...fromStructure, ...fromTickets]));
    }, [orgStructure, tickets]);

    const [newTitle, setNewTitle] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [newArea, setNewArea] = useState<TicketArea>(TECH_DEPT);
    const [newPriority, setNewPriority] = useState<TicketPriority>('MEDIA');
    const [newObservations, setNewObservations] = useState('');

    const openTicketHistory = async (ticketId?: number) => {
        setShowHistoryModal(true);
        setHistoryLoading(true);
        try {
            const rows = ticketId ? await apiGetTicketHistory(ticketId) : await apiSearchTicketHistory(historyQuery);
            setHistoryRows(rows || []);
        } catch (e) {
            console.error("Error loading ticket history", e);
            setHistoryRows([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    useEffect(() => {
        const handleClickOutside = () => setMenuOpenId(null);
        window.addEventListener('click', handleClickOutside);
        return () => window.removeEventListener('click', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!newArea) setNewArea(TECH_DEPT);
    }, [newArea]);

    const refreshFromServer = async () => {
        if (refreshTickets) {
            await refreshTickets();
        }
    };

    const toApiPriority = (value: TicketPriority) => value.toLowerCase();
    const toApiStatus = (value: TicketStatus) => {
        if (value === 'EN-PROCESO') return 'en-proceso';
        if (value === 'RESUELTO') return 'resuelto';
        return 'abierto';
    };

    const translateHistoryAction = (value?: string) => {
        const raw = String(value || '').trim();
        if (!raw) return '-';
        const normalized = raw
            .toLowerCase()
            .replaceAll('_', ' ')
            .replaceAll('-', ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (normalized.includes('cambio de estado')) return 'CAMBIO DE ESTADO';
        if (normalized === 'status changed' || normalized === 'status change') return 'CAMBIO DE ESTADO';
        if (normalized === 'created') return 'CREADO';
        if (normalized === 'updated') return 'ACTUALIZADO';
        if (normalized === 'deleted') return 'ELIMINADO';
        if (normalized === 'resolved') return 'RESUELTO';
        if (normalized === 'reopened') return 'REABIERTO';
        if (normalized === 'assigned') return 'ASIGNADO';
        if (normalized === 'commented') return 'COMENTARIO';
        return raw.toUpperCase();
    };

    const logAction = async (
        action: string,
        ticketTitle: string,
        status: 'success' | 'warning' | 'danger' | 'info' = 'success',
    ) => {
        await logTicketActivity({
            username: currentUser,
            evento: 'GESTION DE TICKETS',
            detalles: `Ticket "${ticketTitle}": ${action}`,
            estado: status
        });
    };

    const startEdit = (e: React.MouseEvent, ticket: Ticket) => {
        e.stopPropagation();
        window.location.href = `/dashboard/tickets/new?ticketId=${ticket.id}`;
        setMenuOpenId(null);
    };

    const deleteTicket = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (!hasPermission(PERMISSIONS_MASTER.TICKETS_DELETE) && !canDeleteByRole) {
            void uiAlert("No tienes permiso para eliminar tickets.", "Tickets");
            return;
        }
        const ticket = tickets.find(t => t.id === id);
        const ok = ticket ? await uiConfirm(`¿Estás seguro de que deseas eliminar el ticket "${ticket.title}"?`, "Eliminar ticket") : false;
        if (ticket && ok) {
            await apiDeleteTicket(id);
            await refreshFromServer();
            setMenuOpenId(null);
            logAction('ELIMINACION', ticket.title, 'danger');
        }
    };

    const filteredTickets = useMemo(() => {
        return tickets.filter((t) => {
            if (!canSeeGlobalFilters) {
                if (!t.ownerId || String(t.ownerId) !== String(currentUserId)) return false;
            }

            const matchesSearch =
                normalizeText(t.title).includes(normalizeText(searchTerm)) ||
                normalizeText(t.description).includes(normalizeText(searchTerm));
            const matchesArea = filterArea === 'all' || normalizeText(t.creatorDept || '') === normalizeText(filterArea);
            const matchesPriority = filterPriority === 'all' || normalizeText(t.priority) === normalizeText(filterPriority);
            return matchesSearch && matchesArea && matchesPriority;
        });
    }, [tickets, searchTerm, filterArea, filterPriority, currentUserId, userDept, hasPermission, canOperateTicketFlow]);

    const updateStatus = async (id: number, status: TicketStatus) => {
        const ticket = tickets.find(t => t.id === id);
        if (!ticket) return;

        if (status === 'EN-PROCESO' && !canOperateTicketFlow) {
            void uiAlert('Solo personal de Tecnología o Administración puede tomar tickets.', 'Tickets');
            return;
        }

        if (status === 'RESUELTO' && !canOperateTicketFlow) {
            void uiAlert('Solo personal de Tecnología o Administración puede resolver tickets.', 'Tickets');
            return;
        }

        if (ticket.status !== status) {
            logAction(`CAMBIO DE ESTADO (A ${status})`, ticket.title, 'info');
        }
        let observationPayload: string | null = '';
        if (canOperateTicketFlow) {
            observationPayload = await uiPrompt(
                `Observacion para el ticket #${ticket.id} (${status})`,
                '',
                'Registrar observacion',
                'Escriba una observacion o deje en blanco...',
            );
            if (observationPayload === null) {
                return;
            }
        }
        await apiUpdateTicketStatus(id, {
            estado: toApiStatus(status),
            ...(observationPayload ? { observaciones: observationPayload } : {}),
        });
        await refreshFromServer();
    };

    const handleDragStart = (e: React.DragEvent, id: number) => {
        e.dataTransfer.setData("ticketId", id.toString());
    };

    const handleDrop = async (e: React.DragEvent, status: TicketStatus) => {
        e.preventDefault();
        if (!hasPermission(PERMISSIONS_MASTER.TICKETS_MOVE_KANBAN) && !canOperateTicketFlow) return;
        const idString = e.dataTransfer.getData("ticketId");
        if (!idString) return;
        await updateStatus(parseInt(idString, 10), status);
    };

    const handleSaveTicket = async (e: React.FormEvent) => {
        e.preventDefault();

        if (editingTicket) {
            const canEditThisTicket =
                canOperateTicketFlow ||
                (editingTicket.ownerId && String(editingTicket.ownerId) === String(currentUserId)) ||
                hasPermission(PERMISSIONS_MASTER.TICKETS_EDIT);
            if (!canEditThisTicket) {
                void uiAlert("No tienes permisos para editar este ticket.", "Tickets");
                return;
            }
            await apiUpdateTicket(editingTicket.id, {
                titulo: newTitle,
                descripcion: newDesc,
                prioridad: toApiPriority(newPriority),
                ...(isTechUser ? { observaciones: newObservations } : {}),
            });
            logAction('EDICION', newTitle, 'info');
            await refreshFromServer();
        } else {
            const activeTickets = tickets.filter(t =>
                String(t.ownerId || '') === String(currentUserId) && (t.status === 'ABIERTO' || t.status === 'EN-PROCESO')
            ).length;

            if (userRole === 'Usuario' && activeTickets >= 3) {
                void uiAlert("Has alcanzado el límite máximo de 3 tickets activos.", "Tickets");
                return;
            }

            await apiCreateTicket({
                titulo: newTitle,
                descripcion: newDesc,
                prioridad: toApiPriority(userRole === 'Usuario' ? 'MEDIA' : newPriority),
                ...(isTechUser ? { observaciones: newObservations } : {}),
            });
            await refreshFromServer();
            logAction('CREACION', newTitle, 'success');
        }

        setShowModal(false);
        setEditingTicket(null);
        setNewTitle('');
        setNewDesc('');
        setNewArea(TECH_DEPT);
        setNewPriority('MEDIA');
        setNewObservations('');
    };

    const getPriorityStyles = (p: TicketPriority) => {
        switch (p) {
            case 'ALTA': return darkMode ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-red-50 text-red-700 border-red-200';
            case 'MEDIA': return darkMode ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-amber-50 text-amber-700 border-amber-200';
            case 'BAJA': return darkMode ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-green-50 text-green-700 border-green-200';
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between gap-4">
                <div className="flex flex-wrap gap-2 items-center">
                    <div className={`flex items-center px-3 py-2 rounded-lg border ${theme.panelMuted}`}>
                        <Search size={16} className={`${theme.icon} mr-2`} />
                        <input
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por título..."
                            className={`bg-transparent border-none outline-none text-sm w-48 transition-all focus:w-64 ${theme.text}`}
                        />
                    </div>
                    {canSeeGlobalFilters && (
                        <select
                            value={filterArea}
                            onChange={(e) => setFilterArea(e.target.value)}
                            className={`px-3 py-2 rounded-lg border text-sm focus:outline-none ${theme.panelMuted} ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}
                        >
                            <option value="all">Todas las Gerencias</option>
                            {[...allAreas].map(area => (
                                <option key={area} value={area}>{area}</option>
                            ))}
                        </select>
                    )}
                    <select
                        value={filterPriority}
                        onChange={(e) => setFilterPriority(e.target.value)}
                        className={`px-3 py-2 rounded-lg border text-sm focus:outline-none ${theme.panelMuted} ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}
                    >
                        <option value="all">Prioridades</option>
                        <option value="ALTA">Alta</option>
                        <option value="MEDIA">Media</option>
                        <option value="BAJA">Baja</option>
                    </select>
                </div>
                {hasPermission(PERMISSIONS_MASTER.TICKETS_CREATE) && (
                    <button
                        onClick={() => { window.location.href = "/dashboard/tickets/new"; }}
                        className="px-8 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold flex items-center gap-2 transition-all transform active:scale-95 shadow-lg shadow-red-900/40"
                    >
                        <Plus size={18} /> NUEVO TICKET
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full min-h-[560px] pb-8">
                {(['ABIERTO', 'EN-PROCESO', 'RESUELTO'] as TicketStatus[]).map((status) => (
                    <div
                        key={status}
                        className={`glass-reflect flex flex-col rounded-xl border shadow-xl ${theme.column}`}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, status)}
                    >
                        <div className={`p-4 flex justify-between items-center border-b-2 ${status === 'ABIERTO' ? 'border-blue-500' : status === 'EN-PROCESO' ? 'border-amber-500' : 'border-emerald-500'}`}>
                            <h2 className={`text-xs font-bold uppercase tracking-widest ${theme.text}`}>{status === 'EN-PROCESO' ? 'EN PROCESO' : status}</h2>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${theme.chip}`}>
                                {filteredTickets.filter(t => t.status === status).length}
                            </span>
                        </div>

                        <div className="p-3 flex-1 overflow-y-auto no-scrollbar space-y-4 custom-scrollbar">
                            {filteredTickets.filter(t => t.status === status).map((ticket) => (
                                <div
                                    key={ticket.id}
                                    draggable={hasPermission(PERMISSIONS_MASTER.TICKETS_MOVE_KANBAN) || canOperateTicketFlow}
                                    onDragStart={(e) => handleDragStart(e, ticket.id)}
                                    className={`group relative p-4 rounded-lg border transition-all cursor-grab active:cursor-grabbing hover:shadow-lg ${theme.card}`}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded border uppercase ${getPriorityStyles(ticket.priority)}`}>
                                            {ticket.priority}
                                        </span>
                                        <div className="relative">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === ticket.id ? null : ticket.id); }}
                                                className={`p-1 rounded-md transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-500' : 'hover:bg-slate-100 text-slate-500'}`}
                                            >
                                                <MoreVertical size={14} />
                                            </button>
                                            {menuOpenId === ticket.id && (
                                                <div className={`absolute right-0 top-full mt-1 w-32 rounded-lg shadow-xl z-20 border py-1 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
                                                    {(hasPermission(PERMISSIONS_MASTER.TICKETS_EDIT) || canOperateTicketFlow || (ticket.ownerId && String(ticket.ownerId) === String(currentUserId))) && (
                                                        <button
                                                            onClick={(e) => startEdit(e, ticket)}
                                                            className={`w-full px-3 py-2 text-xs font-semibold text-left ${darkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-50 text-slate-700'}`}
                                                        >
                                                            Editar
                                                        </button>
                                                    )}
                                                    {(hasPermission(PERMISSIONS_MASTER.TICKETS_DELETE) || canDeleteByRole) && (
                                                        <button
                                                            onClick={(e) => deleteTicket(e, ticket.id)}
                                                            className={`w-full px-3 py-2 text-xs font-semibold text-left text-red-500 ${darkMode ? 'hover:bg-slate-700' : 'hover:bg-red-50'}`}
                                                        >
                                                            Eliminar
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); setMenuOpenId(null); openTicketHistory(ticket.id); }}
                                                        className={`w-full px-3 py-2 text-xs font-semibold text-left ${darkMode ? 'hover:bg-slate-700 text-slate-300' : 'hover:bg-slate-50 text-slate-700'}`}
                                                    >
                                                        Historial
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <h3 className={`font-semibold text-sm mb-1 leading-tight ${darkMode ? 'text-white' : 'text-slate-900'}`}>{ticket.title}</h3>
                                    <p className={`text-xs mb-3 line-clamp-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>{ticket.description}</p>

                                    <div className={`flex flex-wrap gap-2 pt-3 border-t ${darkMode ? 'border-slate-800/30' : 'border-slate-200'}`}>
                                        <div className={`flex items-center gap-1.5 text-[9px] font-bold font-mono uppercase tracking-tighter w-full overflow-hidden ${theme.muted}`}>
                                            <UsersRound size={11} className={`${theme.icon} shrink-0`} />
                                            <span className="truncate">SOPORTE TÉCNICO</span>
                                        </div>
                                        <div className="flex items-center gap-3 w-full">
                                            <div className={`flex items-center gap-1.5 text-[10px] font-medium ${theme.muted}`}>
                                                <Clock size={12} className={theme.icon} />
                                                {ticket.createdAt}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[10px] text-red-500/70 font-bold uppercase tracking-wider">
                                                <div className="w-1 h-1 rounded-full bg-red-500" />
                                                {ticket.owner ? ticket.owner.split(' ')[0] : 'S/I'}
                                            </div>
                                        </div>

                                        {ticket.takenBy && (
                                            <div className={`w-full mt-1 p-2 rounded border ${darkMode ? 'bg-blue-500/5 border-blue-500/20' : 'bg-blue-50 border-blue-200'}`}>
                                                <p className="text-[10px] text-blue-400/90 font-bold uppercase tracking-wider">
                                                    Técnico asignado: {ticket.takenBy}
                                                </p>
                                                {ticket.takenAt && (
                                                    <p className={`text-[10px] ${theme.muted}`}>Tomado: {ticket.takenAt}</p>
                                                )}
                                            </div>
                                        )}

                                        {ticket.observations && (
                                            <div className={`w-full mt-1 p-2 rounded border ${darkMode ? 'bg-amber-500/5 border-amber-500/10' : 'bg-amber-50 border-amber-200'}`}>
                                                <p className={`text-[10px] italic leading-tight line-clamp-2 ${darkMode ? 'text-amber-500/80' : 'text-amber-700'}`}>
                                                    Obs: {ticket.observations}
                                                </p>
                                            </div>
                                        )}

                                        {ticket.resolvedAt && (
                                            <div className="flex items-center gap-1.5 text-[10px] text-emerald-500 font-bold w-full mt-1 uppercase tracking-widest">
                                                <CheckCircle size={12} />
                                                Resuelto: {ticket.resolvedAt}
                                            </div>
                                        )}
                                    </div>

                                    {ticket.status !== 'RESUELTO' && (
                                        <div className={`mt-4 pt-3 border-t flex gap-2 ${darkMode ? 'border-slate-800/30' : 'border-slate-200'}`}>
                                            {ticket.status === 'ABIERTO' && (hasPermission(PERMISSIONS_MASTER.TICKETS_EDIT) || canOperateTicketFlow) && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, 'EN-PROCESO'); }}
                                                    className="flex-1 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase tracking-wider"
                                                >
                                                    ATENDER
                                                </button>
                                            )}
                                            {ticket.status === 'EN-PROCESO' && (hasPermission(PERMISSIONS_MASTER.TICKETS_RESOLVE) || canOperateTicketFlow) && (
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); updateStatus(ticket.id, 'RESUELTO'); }}
                                                    className="flex-1 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase tracking-wider"
                                                >
                                                    RESOLVER
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {filteredTickets.filter(t => t.status === status).length === 0 && (
                                <div className={`h-32 flex flex-col items-center justify-center border-2 border-dashed rounded-xl ${theme.empty}`}>
                                    <p className={`text-[10px] font-bold uppercase tracking-widest ${theme.muted}`}>Sin Tickets</p>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {showModal && (
                <div className={`fixed inset-0 z-50 flex items-center justify-center ${theme.modalOverlay} p-2 md:p-5 overflow-hidden`}>
                    <div className={`glass-reflect w-[min(1400px,98vw)] h-[95vh] rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${theme.panel}`}>
                        <div className={`p-6 border-b flex justify-between items-center ${editingTicket ? 'bg-blue-600' : 'bg-red-600'}`}>
                            <h2 className="text-white font-bold flex items-center gap-2 uppercase tracking-tight">
                                {editingTicket ? <FileText size={20} /> : <Plus size={20} />}
                                {editingTicket ? 'EDITAR SOLICITUD' : 'NUEVA SOLICITUD'}
                            </h2>
                            <button onClick={() => setShowModal(false)} className="text-white/80 hover:text-white text-2xl">&times;</button>
                        </div>
                        <form onSubmit={handleSaveTicket} className="p-5 md:p-6 overflow-y-auto no-scrollbar">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="md:col-span-2">
                                <label className={`block text-xs font-bold uppercase mb-1.5 tracking-wider ${theme.muted}`}>Título de la Solicitud</label>
                                <input
                                    required
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    className={`w-full px-4 py-3 rounded-lg border outline-none ${theme.input}`}
                                />
                                </div>
                                <div className="md:col-span-2">
                                <label className={`block text-xs font-bold uppercase mb-1.5 tracking-wider ${theme.muted}`}>Descripción Detallada</label>
                                <textarea
                                    required
                                    rows={5}
                                    value={newDesc}
                                    onChange={(e) => setNewDesc(e.target.value)}
                                    className={`w-full px-4 py-3 rounded-lg border outline-none ${theme.input}`}
                                />
                                </div>
                                <div>
                                    <label className={`block text-xs font-bold uppercase mb-1.5 tracking-wider ${theme.muted}`}>Area Destino</label>
                                    <select
                                        disabled
                                        value={newArea}
                                        onChange={(e) => setNewArea(e.target.value)}
                                        className={`w-full px-4 py-3 rounded-lg border outline-none cursor-not-allowed opacity-70 grayscale-[0.5] ${theme.input}`}
                                    >
                                        <option value={TECH_DEPT}>{TECH_DEPT}</option>
                                    </select>
                                    <p className={`text-[9px] mt-1 uppercase font-bold ${theme.muted}`}>
                                        Todos los tickets se enrutan a Soporte Técnico
                                    </p>
                                </div>
                                <div>
                                    <label className={`block text-xs font-bold uppercase mb-1.5 tracking-wider ${theme.muted}`}>Prioridad</label>
                                    <select
                                        disabled={!hasPermission(PERMISSIONS_MASTER.TICKETS_EDIT) && !editingTicket}
                                        value={newPriority}
                                        onChange={(e) => setNewPriority(e.target.value as TicketPriority)}
                                        className={`w-full px-4 py-3 rounded-lg border outline-none ${theme.input}`}
                                    >
                                        <option value="ALTA">Alta</option>
                                        <option value="MEDIA">Media</option>
                                        <option value="BAJA">Baja</option>
                                    </select>
                                </div>
                                {isTechUser && (
                                <div className="md:col-span-2">
                                    <label className={`block text-xs font-bold uppercase mb-1.5 tracking-wider ${theme.muted}`}>Observaciones (Soporte Técnico)</label>
                                    <textarea
                                        rows={4}
                                        value={newObservations}
                                        onChange={(e) => setNewObservations(e.target.value)}
                                        className={`w-full px-4 py-3 rounded-lg border outline-none ${theme.input}`}
                                    />
                                </div>
                                )}
                            </div>
                            <div className="flex gap-3 pt-6 sticky bottom-0 bg-inherit">
                                <button type="button" onClick={() => setShowModal(false)} className={`flex-1 py-3 rounded-lg font-bold text-xs tracking-widest border ${theme.secondaryButton}`}>
                                    CANCELAR
                                </button>
                                <button type="submit" className={`flex-1 py-3 rounded-lg font-bold text-xs tracking-widest text-white ${editingTicket ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`}>
                                    {editingTicket ? 'GUARDAR CAMBIOS' : 'CREAR TICKET'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showHistoryModal && (
                <div className={`fixed inset-0 z-[70] flex items-start md:items-center justify-center ${theme.modalOverlay} p-3 md:p-4 overflow-hidden`}>
                    <div className={`glass-reflect w-full max-w-3xl max-h-[92vh] rounded-2xl border shadow-2xl overflow-hidden flex flex-col ${theme.panel}`}>
                        <div className={`p-4 border-b flex items-center justify-between ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                            <div className={`flex items-center gap-2 font-bold ${theme.text}`}>
                                <History size={18} />
                                HISTORIAL DE TICKETS
                            </div>
                            <button onClick={() => setShowHistoryModal(false)} className={`p-1 rounded ${theme.modalClose}`}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className={`p-4 border-b flex gap-2 ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                            <input
                                value={historyQuery}
                                onChange={(e) => setHistoryQuery(e.target.value)}
                                placeholder="Buscar por ID o título..."
                                className={`flex-1 px-3 py-2 rounded-lg border text-sm outline-none ${darkMode ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-900'}`}
                            />
                            <button
                                onClick={() => openTicketHistory(undefined)}
                                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                            >
                                BUSCAR
                            </button>
                        </div>
                        <div className="max-h-[60vh] overflow-y-auto no-scrollbar">
                            {historyLoading ? (
                                <div className={`p-6 text-sm ${theme.muted}`}>Cargando historial...</div>
                            ) : historyRows.length === 0 ? (
                                <div className={`p-6 text-sm ${theme.muted}`}>Sin registros para mostrar.</div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className={`${darkMode ? 'bg-slate-950/60' : 'bg-slate-50'}`}>
                                        <tr>
                                            <th className={`px-3 py-2 text-left ${theme.muted}`}>Ticket</th>
                                            <th className={`px-3 py-2 text-left ${theme.muted}`}>Acción</th>
                                            <th className={`px-3 py-2 text-left ${theme.muted}`}>Actor</th>
                                            <th className={`px-3 py-2 text-left ${theme.muted}`}>Detalle</th>
                                            <th className={`px-3 py-2 text-left ${theme.muted}`}>Fecha</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historyRows.map((row) => (
                                            <tr key={row.id} className={`border-t ${darkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                                                <td className={`px-3 py-2 ${theme.text}`}>#{row.ticket_id}</td>
                                                <td className={`px-3 py-2 ${theme.text}`}>{translateHistoryAction(row.action || row.estado)}</td>
                                                <td className={`px-3 py-2 ${theme.text}`}>{row.actor_username || 'sistema'}</td>
                                                <td className={`px-3 py-2 ${theme.text}`}>{row.details || row.observaciones || '-'}</td>
                                                <td className={`px-3 py-2 ${theme.text}`}>{new Date(row.created_at).toLocaleString('es-ES')}</td>
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
}

