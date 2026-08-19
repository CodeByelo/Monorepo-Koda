'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Activity, Users, Lock, ChevronRight, ChevronLeft, Search, Download, Filter, FileText, Edit2, Trash2, Plus, Briefcase, Zap, Factory, Save, X, CheckCircle } from 'lucide-react';
import {
    getAllUsers,
    getAnnouncement,
    getSecurityLogs,
    purgeSecurityLogs,
    saveAnnouncement,
    saveOrgStructure,
    unlockUser,
    updateUserPermissions,
    updateUserRole,
    deleteDocumento,
} from '../../../lib/api';
import { PERMISSIONS_MASTER, DEFAULT_SCOPES, PERMISSION_LABELS } from '../../../permissions/constants';
import { useAuth } from '../../../hooks/useAuth';
import MasterPermissionPanel from '../../../components/MasterPermissionPanel';
import RoleDefaultPermissionsPanel from '../../../components/RoleDefaultPermissionsPanel';
import { UserRole } from '../../../context/AuthContext';
import { uiAlert, uiConfirm, uiPrompt } from '../../../lib/ui-dialog';

// Mapping icons for serialization support
const ORG_ICONS: Record<string, React.ElementType> = {
    Shield,
    Briefcase,
    Zap,
    Users,
    Factory
};

interface SecurityModuleProps {
    darkMode: boolean;
    announcement: any;
    setAnnouncement: (data: any) => void;
    documents: any[];
    setDocuments: (docs: any[] | ((prev: any[]) => any[])) => void;
    userRole: string;
    orgStructure: any[];
    setOrgStructure: (data: any[]) => void;
}

export default function SecurityModule({ darkMode, announcement, setAnnouncement, documents, setDocuments, userRole, orgStructure, setOrgStructure }: SecurityModuleProps) {
    const brand = {
        primary: '#075159',
        accent: '#0BBF8C',
        accentSoft: '#0DA67B',
        deep: '#051D10',
        dark: '#042F36',
    };
    const [activeTab, setActiveTab] = useState('docLogs');
    const [logs, setLogs] = useState<any[]>([]);
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [securityDataError, setSecurityDataError] = useState<string | null>(null);
    const [isUploadPanelOpen, setIsUploadPanelOpen] = useState(false);
    const [selectedUserForPerms, setSelectedUserForPerms] = useState<any | null>(null);
    const { hasPermission, user: currentUserObj } = useAuth();
    const [isClient, setIsClient] = useState(false); // Nuevo estado para hidratacion

    // Search states
    const [logSearch, setLogSearch] = useState('');
    const [docSearch, setDocSearch] = useState('');
    const [userSearch, setUserSearch] = useState('');
    const [userDeptFilter, setUserDeptFilter] = useState('all');

    const normalizeText = (value: string) =>
        String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();

    const filteredLogs = logs.filter(log =>
        log.username.toLowerCase().includes(logSearch.toLowerCase()) ||
        log.evento.toLowerCase().includes(logSearch.toLowerCase()) ||
        log.detalles.toLowerCase().includes(logSearch.toLowerCase()) ||
        log.estado.toLowerCase().includes(logSearch.toLowerCase())
    );

    const filteredDocs = documents.filter(doc =>
        doc.name.toLowerCase().includes(docSearch.toLowerCase()) ||
        doc.category.toLowerCase().includes(docSearch.toLowerCase()) ||
        doc.idDoc.toLowerCase().includes(docSearch.toLowerCase()) ||
        doc.uploadedBy.toLowerCase().includes(docSearch.toLowerCase())
    );

    const userDeptOptions = Array.from(
        new Set(
            users
                .map((u) => String(u.gerencia_depto || '').trim())
                .filter(Boolean)
        )
    ).sort((a, b) => a.localeCompare(b));

    const filteredUsers = users.filter((u) => {
        const dept = String(u.gerencia_depto || '').trim();
        const deptMatches = userDeptFilter === 'all' || dept === userDeptFilter;

        const haystack = [
            u.usuario_corp,
            u.nombre,
            u.apellido,
            `${u.nombre || ''} ${u.apellido || ''}`.trim(),
            u.gerencia_depto,
            u.role,
        ]
            .map((v) => normalizeText(String(v || '')))
            .join(' ');

        const searchMatches = !userSearch.trim() || haystack.includes(normalizeText(userSearch));
        return deptMatches && searchMatches;
    });
    const activeUsersCount = users.filter((u) => u?.estado !== false).length;

    const scrollRef = React.useRef<HTMLDivElement>(null);

    const scrollTabs = (direction: 'left' | 'right') => {
        if (scrollRef.current) {
            const { scrollLeft } = scrollRef.current;
            const scrollAmount = 250;
            scrollRef.current.scrollTo({
                left: direction === 'left' ? scrollLeft - scrollAmount : scrollLeft + scrollAmount,
                behavior: 'smooth'
            });
        }
    };

    // Hook para marcar que estamos en el cliente
    useEffect(() => {
        setIsClient(true);
    }, []);

    const fetchSecurityData = useCallback(async (withLoading: boolean = false) => {
        if (withLoading) setLoading(true);
        try {
            setSecurityDataError(null);
            const [logsResult, usersResult] = await Promise.allSettled([
                getSecurityLogs(),
                getAllUsers(50, 0),
            ]);

            if (logsResult.status === 'fulfilled') {
                setLogs(Array.isArray(logsResult.value) ? logsResult.value as any[] : []);
            } else {
                console.error("Error fetching security logs:", logsResult.reason);
                setLogs([]);
            }

            if (usersResult.status === 'fulfilled') {
                const fetchedUsers = usersResult.value?.data;
                setUsers(Array.isArray(fetchedUsers) ? fetchedUsers : []);
            } else {
                console.error("Error fetching users list:", usersResult.reason);
                setUsers([]);
            }

            if (usersResult.status === 'rejected') {
                setSecurityDataError('No se pudo cargar la gestión de usuarios.');
            } else if (logsResult.status === 'rejected') {
                setSecurityDataError('El historial de accesos no está disponible en este momento.');
            }
        } catch (error) {
            console.error("Error fetching security data:", error);
            setSecurityDataError("No se pudo cargar el módulo de seguridad.");
        } finally {
            if (withLoading) setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSecurityData(true);
    }, [activeTab, fetchSecurityData]);

    useEffect(() => {
        const shouldPollSecurity = activeTab === 'logs' || activeTab === 'users';
        if (!shouldPollSecurity) return;

        const intervalId = window.setInterval(() => {
            fetchSecurityData(false);
        }, 15000);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [activeTab, fetchSecurityData]);

    const theme = {
        bg: darkMode ? 'bg-zinc-900' : 'bg-white',
        text: darkMode ? 'text-white' : 'text-slate-900',
        subtext: darkMode ? 'text-slate-400' : 'text-slate-500',
        card: darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200',
        header: darkMode ? 'bg-zinc-950/50' : 'bg-slate-50/50',
        rowHover: darkMode ? 'hover:bg-slate-800' : 'hover:bg-slate-50',
        input: darkMode ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900',
        th: darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-50 text-slate-500',
        td: darkMode ? 'text-slate-300' : 'text-slate-700'
    };

    // Funcion auxiliar para contar eventos de hoy (solo en cliente)
    const getEventsToday = () => {
        if (!isClient) return 0;
        const today = new Date().toLocaleDateString();
        return logs.filter(l => new Date(l.fecha_hora).toLocaleDateString() === today).length;
    };

    // Funcion auxiliar para contar alertas (solo en cliente)
    const getSecurityAlerts = () => {
        if (!isClient) return 0;
        return logs.filter(l => l.estado === 'danger').length;
    };

    const handleExport = () => {
        if (activeTab === 'docLogs') {
            const headers = ['Tipo', 'ID', 'Título', 'Fecha', 'Hora', 'Enviado Por', 'Recibido Por'];
            const csvRows = [
                headers.join(','),
                ...documents.map(l => [l.category, l.idDoc, l.name, l.uploadDate, l.uploadTime, l.uploadedBy, l.receivedBy].join(','))
            ];
            const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `logs_documentos_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    const deleteDocument = async (id: string | number, name: string) => {
        const ok = await uiConfirm(`¿Estás seguro de eliminar el documento "${name}"? Esta acción no se puede deshacer.`, "Eliminar documento");
        if (ok) {
            try {
                await deleteDocumento(id);
                setDocuments((prev: any[]) => prev.filter((d: any) => String(d.id) !== String(id)));
                void uiAlert("Documento eliminado correctamente.", "Documentos");
            } catch (error: any) {
                console.error("No se pudo eliminar el documento", error);
                void uiAlert(error?.message || "No se pudo eliminar el documento en servidor.", "Documentos");
            }
        }
    };

    const [editingDept, setEditingDept] = useState<{ groupIdx: number, itemIdx: number } | null>(null);
    const [newDeptName, setNewDeptName] = useState('');
    const [newGroupIdx, setNewGroupIdx] = useState(0);
    const [newModuleName, setNewModuleName] = useState('');
    const [announcementDraft, setAnnouncementDraft] = useState<any>(announcement);
    const [isAnnouncementDirty, setIsAnnouncementDirty] = useState(false);
    const safeAnnouncementColor = /^#([0-9a-fA-F]{6})$/.test(String(announcementDraft?.color || ''))
        ? announcementDraft.color
        : brand.primary;

    // --- Advanced Banner Background States ---
    type BgType = 'solid' | 'gradient-2' | 'gradient-3';
    type BannerDirection = 'to right' | 'to left' | 'to bottom' | 'to top' | 'to bottom right' | 'to top left';
    const [bgType, setBgType] = useState<BgType>('solid');
    const [color1, setColor1] = useState<string>(safeAnnouncementColor);
    const [color2, setColor2] = useState<string>('#0BBF8C');
    const [color3, setColor3] = useState<string>('#042F36');
    const [bannerDirection, setBannerDirection] = useState<BannerDirection>('to right');

    const getBackgroundStyle = (): React.CSSProperties => {
        if (bgType === 'gradient-2') {
            return { background: `linear-gradient(${bannerDirection}, ${color1}, ${color2})` };
        }
        if (bgType === 'gradient-3') {
            return { background: `linear-gradient(${bannerDirection}, ${color1}, ${color2}, ${color3})` };
        }
        return { background: color1 };
    };

    const getBannerPayloadColor = (): string => {
        if (bgType === 'gradient-2') return `linear-gradient(${bannerDirection}, ${color1}, ${color2})`;
        if (bgType === 'gradient-3') return `linear-gradient(${bannerDirection}, ${color1}, ${color2}, ${color3})`;
        return color1;
    };

    useEffect(() => {
        if (!isAnnouncementDirty) {
            setAnnouncementDraft(announcement);
        }
    }, [announcement, isAnnouncementDirty]);

    // Parse persisted color string to restore gradient editor states
    useEffect(() => {
        const raw = announcement?.color || '';
        if (raw.includes('linear-gradient')) {
            const hexMatches = raw.match(/#[0-9a-fA-F]{3,8}/g) || [];
            if (hexMatches.length >= 3) {
                setBgType('gradient-3');
                setColor1(hexMatches[0]);
                setColor2(hexMatches[1]);
                setColor3(hexMatches[2]);
            } else if (hexMatches.length === 2) {
                setBgType('gradient-2');
                setColor1(hexMatches[0]);
                setColor2(hexMatches[1]);
            }
            const dirMatch = raw.match(/linear-gradient\(([^,]+),/);
            if (dirMatch) {
                const dir = dirMatch[1].trim();
                const validDirs = ['to right', 'to left', 'to bottom', 'to top', 'to bottom right', 'to top left'];
                if (validDirs.includes(dir)) {
                    setBannerDirection(dir as BannerDirection);
                }
            }
        } else if (/^#([0-9a-fA-F]{3,8})$/.test(raw)) {
            setBgType('solid');
            setColor1(raw);
        }
    }, [announcement?.color]);

    useEffect(() => {
        return () => {
            localStorage.removeItem("announcement_editing");
        };
    }, []);

    const persistOrgStructure = async (nextOrg: any[]) => {
        setOrgStructure(nextOrg);
        try {
            await saveOrgStructure(nextOrg);
        } catch (error) {
            console.error("No se pudo guardar la estructura organizativa", error);
            const msg = error instanceof Error ? error.message : "Error desconocido";
            void uiAlert(`No se pudo guardar en servidor. Se mantuvo solo en esta sesión/navegador.\n\n${msg}`, "Estructura organizativa");
        }
    };

    const handleAddDept = async () => {
        if (!newDeptName.trim()) return;
        const newOrg = [...orgStructure];
        newOrg[newGroupIdx].items.push(newDeptName.trim());
        await persistOrgStructure(newOrg);
        setNewDeptName('');
    };

    const handleAddModule = async () => {
        if (!newModuleName.trim()) return;
        const newOrg = [...orgStructure, { category: newModuleName.trim(), icon: 'Briefcase', items: [] }];
        await persistOrgStructure(newOrg);
        setNewModuleName('');
    };

    const handleEditModule = async (groupIdx: number) => {
        const newName = await uiPrompt("Nuevo nombre para el módulo:", orgStructure[groupIdx].category, "Editar módulo");
        if (!newName?.trim()) return;
        const newOrg = [...orgStructure];
        newOrg[groupIdx].category = newName.trim();
        await persistOrgStructure(newOrg);
    };

    const handleDeleteModule = async (groupIdx: number) => {
        const ok = await uiConfirm("¿Estás seguro de eliminar este módulo y todas sus gerencias?", "Eliminar módulo");
        if (!ok) return;
        const newOrg = orgStructure.filter((_, idx) => idx !== groupIdx);
        await persistOrgStructure(newOrg);
    };

    const handleDeleteDept = async (groupIdx: number, itemIdx: number) => {
        const ok = await uiConfirm("¿Estás seguro de eliminar esta gerencia?", "Eliminar gerencia");
        if (ok) {
            const newOrg = [...orgStructure];
            newOrg[groupIdx].items.splice(itemIdx, 1);
            await persistOrgStructure(newOrg);
        }
    };

    const handleEditDept = async (groupIdx: number, itemIdx: number) => {
        const newName = await uiPrompt("Nuevo nombre para la gerencia:", orgStructure[groupIdx].items[itemIdx], "Editar gerencia");
        if (newName?.trim()) {
            const newOrg = [...orgStructure];
            newOrg[groupIdx].items[itemIdx] = newName.trim();
            await persistOrgStructure(newOrg);
        }
    };

    const goToUserAudit = (userId: string | number) => {
        const target = `/dashboard/security/user/${encodeURIComponent(String(userId))}`;
        window.location.href = target;
    };

    const handlePurgeLogs = async () => {
        const ok = await uiConfirm(
            "¿Seguro que deseas limpiar TODOS los logs de seguridad? Esta acción no se puede deshacer.",
            "Limpiar logs",
        );
        if (!ok) return;
        try {
            await purgeSecurityLogs();
            setLogs([]);
            void uiAlert("Logs limpiados correctamente.", "Seguridad");
        } catch (error: any) {
            console.error("Error limpiando logs", error);
            void uiAlert(error?.message || "No se pudieron limpiar los logs.", "Seguridad");
        }
    };

    return (
        <div className={`space-y-6 font-sans pt-2 ${darkMode ? 'text-zinc-200' : 'text-slate-800'}`}>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className={`p-5 rounded-xl border shadow-sm flex items-center justify-between ${theme.card}`}>
                    <div>
                        <p className={`text-sm font-medium uppercase tracking-wider ${theme.subtext}`}>Docs Tramitados</p>
                        <h3 className={`text-3xl font-bold mt-1 ${theme.text}`}>{documents.length}</h3>
                    </div>
                    <div className={`p-3 rounded-lg ${darkMode ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-50 text-purple-600'}`}>
                        <FileText size={24} />
                    </div>
                </div>
                <div className={`p-5 rounded-xl border shadow-sm flex items-center justify-between ${theme.card}`}>
                    <div>
                        <p className={`text-sm font-medium uppercase tracking-wider ${theme.subtext}`}>Cuentas Activas</p>
                        <h3 className={`text-3xl font-bold mt-1 ${theme.text}`}>{activeUsersCount}</h3>
                        <p className={`text-xs mt-1 ${theme.subtext}`}>Usuarios con cuenta habilitada</p>
                    </div>
                    <div className={`p-3 rounded-lg ${darkMode ? 'bg-emerald-900/30 text-emerald-300' : 'bg-[#e7f9f3] text-[#075159]'}`}>
                        <Users size={24} />
                    </div>
                </div>
                <div className={`p-5 rounded-xl border shadow-sm flex items-center justify-between ${theme.card}`}>
                    <div>
                        <p className="text-sm font-medium uppercase tracking-wider text-slate-500">Eventos Hoy</p>
                        <h3 className={`text-3xl font-bold mt-1 ${theme.text}`}>{getEventsToday()}</h3>
                    </div>
                    <div className={`p-3 rounded-lg ${darkMode ? 'bg-cyan-900/30 text-cyan-300' : 'bg-[#e4f5f7] text-[#042f36]'}`}>
                        <Activity size={24} />
                    </div>
                </div>
                <div className={`p-5 rounded-xl border shadow-sm flex items-center justify-between ${theme.card}`}>
                    <div>
                        <p className="text-sm font-medium uppercase tracking-wider text-slate-500">Alertas Seguridad</p>
                        <h3 className={`text-3xl font-bold mt-1 ${theme.text}`}>{getSecurityAlerts()}</h3>
                    </div>
                    <div className={`p-3 rounded-lg ${darkMode ? 'bg-teal-900/30 text-teal-300' : 'bg-[#e7f9f3] text-[#0da67b]'}`}>
                        <Lock size={24} />
                    </div>
                </div>
            </div>

            {/* Navigation Tabs with Arrows */}
            <div className="relative group/tabs mb-1">
                <button
                    onClick={() => scrollTabs('left')}
                    className={`absolute left-0 top-0 bottom-0 z-10 px-1 flex items-center bg-gradient-to-r ${darkMode ? 'from-zinc-900 via-zinc-900/80 to-transparent' : 'from-white via-white/80 to-transparent'} opacity-40 hover:opacity-100 transition-opacity`}
                >
                    <ChevronLeft size={20} className="text-[#0da67b]" />
                </button>

                <div
                    ref={scrollRef}
                    className={`flex border-b overflow-x-auto no-scrollbar scroll-smooth ${darkMode ? 'border-zinc-800' : 'border-slate-200'}`}
                >
                    {hasPermission(PERMISSIONS_MASTER.SECURITY_VIEW_LOGS) && (
                        <button
                            onClick={() => setActiveTab('docLogs')}
                            className={`px-6 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === 'docLogs' ? 'border-[#0da67b] text-[#075159]' : darkMode ? 'border-transparent text-slate-500 hover:text-slate-300' : 'border-transparent text-slate-600 hover:text-[#075159]'}`}
                        >
                            LOGS DE DOCUMENTOS
                        </button>
                    )}
                    {hasPermission(PERMISSIONS_MASTER.SECURITY_ANNOUNCEMENTS) && (
                        <button
                            onClick={() => setActiveTab('anuncios')}
                            className={`px-6 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === 'anuncios' ? 'border-[#0da67b] text-[#075159]' : darkMode ? 'border-transparent text-slate-500 hover:text-slate-300' : 'border-transparent text-slate-600 hover:text-[#075159]'}`}
                        >
                            GESTION DE ANUNCIOS
                        </button>
                    )}
                    {hasPermission(PERMISSIONS_MASTER.SECURITY_VIEW_LOGS) && (
                        <button
                            onClick={() => setActiveTab('logs')}
                            className={`px-6 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === 'logs' ? 'border-[#0da67b] text-[#075159]' : darkMode ? 'border-transparent text-slate-500 hover:text-slate-300' : 'border-transparent text-slate-600 hover:text-[#075159]'}`}
                        >
                            HISTORIAL DE ACCESOS
                        </button>
                    )}
                    {hasPermission(PERMISSIONS_MASTER.SECURITY_MANAGE_USERS) && (
                        <button
                            onClick={() => setActiveTab('users')}
                            className={`px-6 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === 'users' ? 'border-[#0da67b] text-[#075159]' : darkMode ? 'border-transparent text-slate-500 hover:text-slate-300' : 'border-transparent text-slate-600 hover:text-[#075159]'}`}
                        >
                            GESTION DE USUARIOS
                        </button>
                    )}
                    {hasPermission(PERMISSIONS_MASTER.SECURITY_MANAGE_USERS) && (
                        <button
                            onClick={() => setActiveTab('roles')}
                            className={`px-6 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === 'roles' ? 'border-[#0da67b] text-[#075159]' : darkMode ? 'border-transparent text-slate-500 hover:text-slate-300' : 'border-transparent text-slate-600 hover:text-[#075159]'}`}
                        >
                            ROLES Y PERMISOS BASE
                        </button>
                    )}
                    {hasPermission(PERMISSIONS_MASTER.SYS_DEV_TOOLS) && (
                        <button
                            onClick={() => setActiveTab('orgMgmt')}
                            className={`px-6 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === 'orgMgmt' ? 'border-[#0da67b] text-[#075159]' : darkMode ? 'border-transparent text-slate-500 hover:text-slate-300' : 'border-transparent text-slate-600 hover:text-[#075159]'}`}
                        >
                            ESTRUCTURA ORGANIZATIVA
                        </button>
                    )}
                    {hasPermission(PERMISSIONS_MASTER.SYS_DEV_TOOLS) && (
                        <button
                            onClick={() => setActiveTab('devConfig')}
                            className={`px-6 py-3 font-bold text-sm transition-all border-b-2 whitespace-nowrap ${activeTab === 'devConfig' ? 'border-[#0da67b] text-[#075159]' : darkMode ? 'border-transparent text-slate-500 hover:text-slate-300' : 'border-transparent text-slate-600 hover:text-[#075159]'}`}
                        >
                            CONFIGURACIÓN MAESTRA
                        </button>
                    )}
                </div>

                <button
                    onClick={() => scrollTabs('right')}
                    className={`absolute right-0 top-0 bottom-0 z-10 px-1 flex items-center bg-gradient-to-l ${darkMode ? 'from-zinc-900 via-zinc-900/80 to-transparent' : 'from-white via-white/80 to-transparent'} opacity-40 hover:opacity-100 transition-opacity`}
                >
                    <ChevronRight size={20} className="text-[#0da67b]" />
                </button>
            </div>

            {/* Content Area */}
            <div className={`rounded-xl shadow-sm border overflow-hidden min-h-[500px] ${theme.card}`}>
                {loading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="w-8 h-8 border-4 border-[#0da67b] border-t-transparent rounded-full animate-spin"></div>
                    </div>
                ) : (
                    <>
                        {securityDataError && (activeTab === 'logs' || activeTab === 'users') && (
                            <div className={`mx-4 mt-4 rounded-lg border px-4 py-3 text-sm ${darkMode ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>
                                {securityDataError}
                            </div>
                        )}
                        {/* TAB: GESTION DE ANUNCIOS */}
                        {activeTab === 'anuncios' && (
                            <div className="animate-in fade-in duration-500">
                                <div className={`p-4 border-b flex justify-between items-center ${darkMode ? 'border-zinc-800' : 'border-slate-100'}`}>
                                    <div className="flex items-center gap-3">
                                        <Activity className="text-[#0da67b]" size={20} />
                                        <div>
                                            <h3 className={`font-bold ${theme.text}`}>Editor de Comunicado Principal</h3>
                                            <p className={`text-[10px] ${theme.subtext}`}>Modifica el banner que visualizan todos los usuarios en el Dashboard General</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-8">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                        <div className="space-y-6">
                                            <div>
                                                <label className={`block text-xs font-bold uppercase mb-2 ${theme.subtext}`}>Etiqueta (Badge)</label>
                                                <input
                                                    type="text"
                                                    value={announcementDraft.badge}
                                                    onChange={(e) => {
                                                        setIsAnnouncementDirty(true);
                                                        localStorage.setItem("announcement_editing", "1");
                                                        setAnnouncementDraft({ ...announcementDraft, badge: e.target.value });
                                                    }}
                                                    className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[#0da67b]/25 focus:border-[#0da67b] outline-none ${theme.input}`}
                                                    placeholder="Ej: Comunicado del Dia"
                                                />
                                            </div>
                                            <div>
                                                <label className={`block text-xs font-bold uppercase mb-2 ${theme.subtext}`}>Título del Anuncio</label>
                                                <input
                                                    type="text"
                                                    value={announcementDraft.title}
                                                    onChange={(e) => {
                                                        setIsAnnouncementDirty(true);
                                                        localStorage.setItem("announcement_editing", "1");
                                                        setAnnouncementDraft({ ...announcementDraft, title: e.target.value });
                                                    }}
                                                    className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[#0da67b]/25 focus:border-[#0da67b] outline-none ${theme.input}`}
                                                />
                                            </div>
                                            <div>
                                                <label className={`block text-xs font-bold uppercase mb-2 ${theme.subtext}`}>Contenido / Descripción</label>
                                                <textarea
                                                    rows={4}
                                                    value={announcementDraft.description}
                                                    onChange={(e) => {
                                                        setIsAnnouncementDirty(true);
                                                        localStorage.setItem("announcement_editing", "1");
                                                        setAnnouncementDraft({ ...announcementDraft, description: e.target.value });
                                                    }}
                                                    className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[#0da67b]/25 focus:border-[#0da67b] outline-none ${theme.input}`}
                                                />
                                            </div>
                                        </div>

                                        <div className="space-y-6">
                                            <div>
                                                <label className={`block text-xs font-bold uppercase mb-2 ${theme.subtext}`}>Urgencia</label>
                                                <select
                                                    value={announcementDraft.urgency}
                                                    onChange={(e) => {
                                                        setIsAnnouncementDirty(true);
                                                        localStorage.setItem("announcement_editing", "1");
                                                        setAnnouncementDraft({ ...announcementDraft, urgency: e.target.value });
                                                    }}
                                                    className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[#0da67b]/25 focus:border-[#0da67b] outline-none ${theme.input}`}
                                                >
                                                    <option value="Alta">Alta</option>
                                                    <option value="Media">Media</option>
                                                    <option value="Baja">Baja</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className={`block text-xs font-bold uppercase mb-2 ${theme.subtext}`}>Estado del Sistema</label>
                                                <select
                                                    value={announcementDraft.status}
                                                    onChange={(e) => {
                                                        setIsAnnouncementDirty(true);
                                                        localStorage.setItem("announcement_editing", "1");
                                                        setAnnouncementDraft({ ...announcementDraft, status: e.target.value });
                                                    }}
                                                    className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[#0da67b]/25 focus:border-[#0da67b] outline-none ${theme.input}`}
                                                >
                                                    <option value="Activo">Activo</option>
                                                    <option value="Mantenimiento">Mantenimiento</option>
                                                    <option value="Alerta">Alerta</option>
                                                </select>
                                            </div>
                                            <div className="space-y-4">
                                                <label className={`block text-xs font-bold uppercase mb-2 ${theme.subtext}`}>Fondo del Banner</label>

                                                {/* Selector de Tipo */}
                                                <div className={`flex rounded-lg border overflow-hidden text-xs font-bold ${darkMode ? 'border-zinc-700' : 'border-slate-300'}`}>
                                                    {(['solid', 'gradient-2', 'gradient-3'] as const).map((type) => (
                                                        <button
                                                            key={type}
                                                            type="button"
                                                            onClick={() => { setBgType(type); setIsAnnouncementDirty(true); localStorage.setItem("announcement_editing", "1"); }}
                                                            className={`flex-1 py-2 px-1 transition-colors ${
                                                                bgType === type
                                                                    ? 'bg-[#075159] text-white'
                                                                    : darkMode ? 'bg-zinc-800 text-slate-400 hover:bg-zinc-700' : 'bg-white text-slate-500 hover:bg-slate-50'
                                                            }`}
                                                        >
                                                            {type === 'solid' ? 'Sólido' : type === 'gradient-2' ? 'Degradado 2' : 'Degradado 3'}
                                                        </button>
                                                    ))}
                                                </div>

                                                {/* Selector de Dirección (solo para gradientes) */}
                                                {bgType !== 'solid' && (
                                                    <div>
                                                        <label className={`block text-[10px] font-semibold uppercase mb-1.5 ${theme.subtext}`}>Dirección</label>
                                                        <select
                                                            value={bannerDirection}
                                                            onChange={(e) => { setBannerDirection(e.target.value as any); setIsAnnouncementDirty(true); localStorage.setItem("announcement_editing", "1"); }}
                                                            className={`w-full px-3 py-2 text-xs rounded-lg border focus:ring-2 focus:ring-[#0da67b]/25 focus:border-[#0da67b] outline-none ${theme.input}`}
                                                        >
                                                            <option value="to right">→ Izquierda a Derecha</option>
                                                            <option value="to left">← Derecha a Izquierda</option>
                                                            <option value="to bottom">↓ Arriba a Abajo</option>
                                                            <option value="to top">↑ Abajo a Arriba</option>
                                                            <option value="to bottom right">↘ Diagonal (↘)</option>
                                                            <option value="to top left">↖ Diagonal (↖)</option>
                                                        </select>
                                                    </div>
                                                )}

                                                {/* Inputs de Color Dinámicos */}
                                                <div className="space-y-3">
                                                    {/* Color 1 — siempre visible */}
                                                    <div>
                                                        <label className={`block text-[10px] font-semibold uppercase mb-1.5 ${theme.subtext}`}>
                                                            {bgType === 'solid' ? 'Color del Banner' : 'Color 1'}
                                                        </label>
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="color"
                                                                value={color1}
                                                                onChange={(e) => { setColor1(e.target.value); setIsAnnouncementDirty(true); localStorage.setItem("announcement_editing", "1"); }}
                                                                className="h-9 w-12 cursor-pointer rounded border border-slate-600 bg-transparent p-0.5 shrink-0"
                                                                aria-label="Color principal del banner"
                                                            />
                                                            <input
                                                                type="text"
                                                                value={color1}
                                                                onChange={(e) => { setColor1(e.target.value); setIsAnnouncementDirty(true); localStorage.setItem("announcement_editing", "1"); }}
                                                                className={`w-full px-3 py-2 text-xs rounded-lg border focus:ring-2 focus:ring-[#0da67b]/25 focus:border-[#0da67b] outline-none font-mono ${theme.input}`}
                                                                placeholder="#075159"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Color 2 — para gradient-2 y gradient-3 */}
                                                    {(bgType === 'gradient-2' || bgType === 'gradient-3') && (
                                                        <div>
                                                            <label className={`block text-[10px] font-semibold uppercase mb-1.5 ${theme.subtext}`}>Color 2</label>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="color"
                                                                    value={color2}
                                                                    onChange={(e) => { setColor2(e.target.value); setIsAnnouncementDirty(true); localStorage.setItem("announcement_editing", "1"); }}
                                                                    className="h-9 w-12 cursor-pointer rounded border border-slate-600 bg-transparent p-0.5 shrink-0"
                                                                    aria-label="Segundo color del degradado"
                                                                />
                                                                <input
                                                                    type="text"
                                                                    value={color2}
                                                                    onChange={(e) => { setColor2(e.target.value); setIsAnnouncementDirty(true); localStorage.setItem("announcement_editing", "1"); }}
                                                                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:ring-2 focus:ring-[#0da67b]/25 focus:border-[#0da67b] outline-none font-mono ${theme.input}`}
                                                                    placeholder="#0BBF8C"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Color 3 — solo para gradient-3 */}
                                                    {bgType === 'gradient-3' && (
                                                        <div>
                                                            <label className={`block text-[10px] font-semibold uppercase mb-1.5 ${theme.subtext}`}>Color 3</label>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="color"
                                                                    value={color3}
                                                                    onChange={(e) => { setColor3(e.target.value); setIsAnnouncementDirty(true); localStorage.setItem("announcement_editing", "1"); }}
                                                                    className="h-9 w-12 cursor-pointer rounded border border-slate-600 bg-transparent p-0.5 shrink-0"
                                                                    aria-label="Tercer color del degradado"
                                                                />
                                                                <input
                                                                    type="text"
                                                                    value={color3}
                                                                    onChange={(e) => { setColor3(e.target.value); setIsAnnouncementDirty(true); localStorage.setItem("announcement_editing", "1"); }}
                                                                    className={`w-full px-3 py-2 text-xs rounded-lg border focus:ring-2 focus:ring-[#0da67b]/25 focus:border-[#0da67b] outline-none font-mono ${theme.input}`}
                                                                    placeholder="#042F36"
                                                                />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                <p className={`text-[10px] ${theme.subtext}`}>
                                                    Este fondo se aplica al banner del Dashboard para todas las cuentas.
                                                </p>
                                            </div>

                                            <div className={`p-6 rounded-xl border-2 border-dashed ${darkMode ? 'border-zinc-800 bg-zinc-950/30' : 'border-slate-200 bg-slate-50'}`}>
                                                <p className={`text-xs font-bold uppercase mb-4 text-center ${theme.subtext}`}>Vista Previa en Vivo</p>
                                                <div className="space-y-2 opacity-90 scale-90 origin-top rounded-lg p-3 text-white transition-all duration-300" style={getBackgroundStyle()}>
                                                    <span className="inline-block px-2 py-0.5 rounded-full text-white text-[8px] font-bold uppercase" style={{ backgroundColor: 'rgba(0,0,0,0.25)' }}>{announcementDraft.badge}</span>
                                                    <h4 className="font-bold text-sm tracking-tight text-white">{announcementDraft.title}</h4>
                                                    <p className="text-[10px] line-clamp-2 leading-relaxed text-white/90">{announcementDraft.description}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-6 flex justify-end">
                                        <button
                                            onClick={async () => {
                                                try {
                                                    // Compile the final CSS background string
                                                    const finalColor = getBannerPayloadColor();
                                                    await saveAnnouncement({
                                                        badge: announcementDraft.badge,
                                                        title: announcementDraft.title,
                                                        description: announcementDraft.description,
                                                        status: announcementDraft.status,
                                                        urgency: announcementDraft.urgency,
                                                        color: finalColor,
                                                    });
                                                    const latest = await getAnnouncement();
                                                    setAnnouncement(latest);
                                                    setAnnouncementDraft(latest);
                                                    // Restore gradient states from latest data
                                                    const savedColor = latest?.color || '';
                                                    if (savedColor.includes('linear-gradient')) {
                                                        const matches = savedColor.match(/#[0-9a-fA-F]{3,8}/g) || [];
                                                        if (matches.length >= 3) {
                                                            setBgType('gradient-3');
                                                            setColor1(matches[0] || ''); setColor2(matches[1] || ''); setColor3(matches[2] || '');
                                                        } else if (matches.length === 2) {
                                                            setBgType('gradient-2');
                                                            setColor1(matches[0] || ''); setColor2(matches[1] || '');
                                                        }
                                                        const dirMatch = savedColor.match(/linear-gradient\(([^,]+),/);
                                                        if (dirMatch) setBannerDirection(dirMatch[1].trim() as any);
                                                    } else {
                                                        setBgType('solid');
                                                        setColor1(savedColor || brand.primary);
                                                    }
                                                    setIsAnnouncementDirty(false);
                                                    localStorage.removeItem("announcement_editing");
                                                    localStorage.setItem("announcement_updated_at", String(Date.now()));
                                                    window.dispatchEvent(new Event("announcement-updated"));
                                                    void uiAlert('Anuncio guardado correctamente para todas las cuentas.', 'Anuncios');
                                                } catch (e) {
                                                    console.error("Error saving announcement", e);
                                                    void uiAlert('No se pudo guardar el anuncio. Intenta de nuevo.', 'Anuncios');
                                                }
                                            }}
                                            className="px-6 py-2 rounded-lg bg-[linear-gradient(120deg,#042f36_0%,#075159_55%,#0bbf8c_100%)] hover:brightness-110 text-white font-bold shadow-lg shadow-[#075159]/20"
                                        >
                                            GUARDAR ANUNCIO
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB: DOC LOGS */}
                        {activeTab === 'docLogs' && (
                            <div>
                                <div className={`p-4 border-b flex justify-between items-center ${darkMode ? 'border-zinc-800' : 'border-slate-100'}`}>
                                    <h3 className={`font-bold ${theme.text}`}>Trazabilidad Documental</h3>
                                    <div className="flex gap-2">
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                            <input
                                                type="text"
                                                value={docSearch}
                                                onChange={(e) => setDocSearch(e.target.value)}
                                                placeholder="Buscar documento..."
                                                className={`pl-9 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0da67b]/20 focus:border-[#0da67b] ${theme.input}`}
                                            />
                                        </div>
                                        <button
                                            onClick={handleExport}
                                            className={`px-4 py-2 border rounded-lg font-medium flex items-center gap-2 ${darkMode ? 'bg-zinc-800 border-zinc-700 text-slate-300 hover:bg-zinc-700' : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'}`}
                                        >
                                            <Download size={16} />
                                            Exportar
                                        </button>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className={`uppercase ${theme.th}`}>
                                            <tr>
                                                <th className="px-6 py-3 font-semibold">Categoria / ID</th>
                                                <th className="px-6 py-3 font-semibold">Nombre Documento</th>
                                                <th className="px-6 py-3 font-semibold">Fecha</th>
                                                <th className="px-6 py-3 font-semibold">Hora</th>
                                                <th className="px-6 py-3 font-semibold">Enviado Por</th>
                                                <th className="px-6 py-3 font-semibold">Receptor Actual</th>
                                                <th className="px-6 py-3 font-semibold text-center">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className={`divide-y ${darkMode ? 'divide-zinc-800' : 'divide-slate-100'}`}>
                                            {filteredDocs.map((log) => (
                                                <tr key={log.id} className={`${theme.rowHover} transition-colors`}>
                                                    <td className={`px-6 py-4 flex flex-col ${theme.text}`}>
                                                        <span className="font-bold text-xs text-[#0da67b]">{log.category}</span>
                                                        <span className="font-mono text-[10px] opacity-70">{log.idDoc}</span>
                                                    </td>
                                                    <td className={`px-6 py-4 font-medium ${theme.text}`}>{log.name}</td>
                                                    <td className={`px-6 py-4 ${theme.subtext}`}>{log.uploadDate}</td>
                                                    <td className={`px-6 py-4 ${theme.subtext}`}>{log.uploadTime}</td>
                                                    <td className={`px-6 py-4 ${theme.text}`}>{log.uploadedBy}</td>
                                                    <td className={`px-6 py-4 ${theme.text}`}>{log.receivedBy}</td>
                                                    <td className={`px-6 py-4 text-center`}>
                                                        <div className="inline-flex items-center justify-center gap-2">
                                                            <a
                                                                href={`/dashboard/seguimiento/${log.id}`}
                                                                className={`p-2 rounded-full transition-colors ${darkMode ? 'text-slate-300 hover:bg-slate-700/40' : 'text-slate-700 hover:bg-slate-200/60'}`}
                                                                title="Ver documento"
                                                            >
                                                                <FileText size={16} />
                                                            </a>
                                                            {hasPermission(PERMISSIONS_MASTER.SYS_DEV_TOOLS) && (
                                                                <button
                                                                    onClick={() => deleteDocument(log.id, log.name)}
                                                                    className="p-2 text-[#075159] hover:bg-[#0da67b]/10 rounded-full transition-colors"
                                                                    title="Eliminar Documento"
                                                                >
                                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {/* TAB: LOGS */}
                        {activeTab === 'logs' && (
                            <div>
                                <div className={`p-4 border-b flex justify-between items-center ${darkMode ? 'border-zinc-800' : 'border-slate-100'}`}>
                                    <h3 className={`font-bold ${theme.text}`}>Registro de Actividad Reciente</h3>
                                    <div className="flex items-center gap-3">
                                        {hasPermission(PERMISSIONS_MASTER.SYS_DEV_TOOLS) && (
                                            <button
                                                onClick={handlePurgeLogs}
                                                className="px-3 py-2 text-xs font-bold uppercase rounded-lg bg-[#075159] text-white hover:bg-[#042f36] transition-colors"
                                            >
                                                Limpiar Logs
                                            </button>
                                        )}
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                            <input
                                                type="text"
                                                value={logSearch}
                                                onChange={(e) => setLogSearch(e.target.value)}
                                                placeholder="Buscar evento..."
                                                className={`pl-9 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0da67b]/20 focus:border-[#0da67b] ${theme.input}`}
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="overflow-x-auto max-w-full">
                                    <div className="max-h-[62vh] overflow-y-auto">
                                        <table className="w-full min-w-[980px] text-sm text-left table-fixed">
                                        <thead className={`uppercase ${theme.th}`}>
                                            <tr>
                                                <th className="w-[14%] px-6 py-3 font-semibold">Usuario</th>
                                                <th className="w-[18%] px-6 py-3 font-semibold">Evento</th>
                                                <th className="w-[30%] px-6 py-3 font-semibold">Detalles</th>
                                                <th className="w-[14%] px-6 py-3 font-semibold">IP Address</th>
                                                <th className="w-[16%] px-6 py-3 font-semibold">Fecha / Hora</th>
                                                <th className="w-[8%] px-6 py-3 font-semibold">Estado</th>
                                            </tr>
                                        </thead>
                                        <tbody className={`divide-y ${darkMode ? 'divide-zinc-800' : 'divide-slate-100'}`}>
                                            {filteredLogs.map((log) => (
                                                <tr key={log.id} className={`${theme.rowHover} transition-colors`}>
                                                    <td className={`px-6 py-4 font-medium border-l-4 border-transparent hover:border-[#0da67b] whitespace-nowrap ${theme.text}`}>
                                                        {log.username}
                                                    </td>
                                                    <td className={`px-6 py-4 whitespace-normal break-all leading-relaxed ${theme.text}`}>{log.evento}</td>
                                                    <td className={`px-6 py-4 whitespace-normal break-words leading-relaxed ${theme.subtext}`}>{log.detalles}</td>
                                                    <td className="px-6 py-4 font-mono text-xs opacity-70 whitespace-nowrap">{log.ip_address}</td>
                                                    <td className={`px-6 py-4 whitespace-nowrap ${theme.subtext}`}>
                                                        {isClient ? (
                                                            <>
                                                                {new Date(log.fecha_hora).toLocaleDateString()} <span className="text-xs opacity-70">{new Date(log.fecha_hora).toLocaleTimeString()}</span>
                                                            </>
                                                        ) : (
                                                            <span>--</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${log.estado === 'success' ? (darkMode ? 'bg-green-500/10 text-green-400' : 'bg-green-100 text-green-700') :
                                                            log.estado === 'warning' ? (darkMode ? 'bg-amber-500/10 text-amber-400' : 'bg-amber-100 text-amber-700') :
                                                                log.estado === 'danger' ? (darkMode ? 'bg-red-500/10 text-red-400' : 'bg-red-100 text-red-700') :
                                                                    (darkMode ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-600')
                                                            }`}>
                                                            {log.estado}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                            {filteredLogs.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                                                        No hay registros de actividad disponibles.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* TAB: USERS */}
                        {activeTab === 'users' && (
                            <div className="animate-in fade-in duration-500">
                                <div className={`p-4 border-b flex justify-between items-center ${darkMode ? 'border-zinc-800' : 'border-slate-100'}`}>
                                    <h3 className={`font-bold ${theme.text}`}>Directorio de Usuarios</h3>
                                    {hasPermission(PERMISSIONS_MASTER.SECURITY_MANAGE_USERS) && (
                                        <a href="/registro" className="text-sm text-white bg-[linear-gradient(120deg,#042f36_0%,#075159_55%,#0bbf8c_100%)] px-3 py-1.5 rounded-lg font-medium hover:brightness-110 flex items-center gap-1 transition-colors shadow-lg shadow-[#075159]/15">
                                            <span>+</span> Crear Usuario
                                        </a>
                                    )}
                                </div>
                                <div className={`p-4 border-b grid grid-cols-1 md:grid-cols-2 gap-3 ${darkMode ? 'border-zinc-800 bg-zinc-950/30' : 'border-slate-100 bg-slate-50/70'}`}>
                                    <div className="relative">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                        <input
                                            type="text"
                                            value={userSearch}
                                            onChange={(e) => setUserSearch(e.target.value)}
                                            placeholder="Buscar usuario, nombre, apellido o rol..."
                                            className={`w-full pl-9 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0da67b]/20 focus:border-[#0da67b] ${theme.input}`}
                                        />
                                    </div>
                                    <div>
                                        <select
                                            value={userDeptFilter}
                                            onChange={(e) => setUserDeptFilter(e.target.value)}
                                            className={`w-full px-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-[#0da67b]/20 focus:border-[#0da67b] ${theme.input}`}
                                        >
                                            <option value="all">Todas las gerencias</option>
                                            {userDeptOptions.map((dept) => (
                                                <option key={dept} value={dept}>
                                                    {dept}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className={`uppercase ${theme.th}`}>
                                            <tr>
                                                <th className="px-6 py-3 font-semibold">Usuario</th>
                                                <th className="px-6 py-3 font-semibold">Nombre Completo</th>
                                                <th className="px-6 py-3 font-semibold">Gerencia</th>
                                                <th className="px-6 py-3 font-semibold">Nivel Permiso</th>
                                                <th className="px-6 py-3 font-semibold text-center">Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody className={`divide-y ${darkMode ? 'divide-zinc-800' : 'divide-slate-100'}`}>
                                            {filteredUsers.map((u) => {
                                                const isCurrentDev = currentUserObj?.role === 'Desarrollador';
                                                const canManageThisUser = u.id !== currentUserObj?.id && (isCurrentDev || u.role !== 'Desarrollador');
                                                return (
                                                    <tr key={u.id} className={`${theme.rowHover} transition-colors`}>
                                                        <td className={`px-6 py-4 font-bold flex items-center gap-2 ${theme.text}`}>
                                                            <div className="w-8 h-8 rounded-full bg-[#e7f9f3] text-[#075159] flex items-center justify-center font-bold text-xs uppercase">
                                                                {u.usuario_corp ? u.usuario_corp.substring(0, 2) : '??'}
                                                            </div>
                                                            {u.usuario_corp}
                                                        </td>
                                                        <td className={`px-6 py-4 ${theme.text}`}>{u.nombre} {u.apellido}</td>
                                                        <td className={`px-6 py-4 ${theme.subtext}`}>{u.gerencia_depto}</td>
                                                        <td className="px-6 py-4">
                                                            <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${u.role === 'Desarrollador' ? 'bg-[#042f36] text-white' : (u.role === 'Administrador' ? 'bg-[#0da67b] text-white' : 'bg-slate-700 text-slate-200')}`}>
                                                                {u.role || 'Usuario'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-4 text-center">
                                                            <div className="flex items-center justify-center gap-3">
                                                                {canManageThisUser && hasPermission(PERMISSIONS_MASTER.SECURITY_MANAGE_USERS) ? (
                                                                    <>
                                                                        <button
                                                                            onClick={() => setSelectedUserForPerms(u)}
                                                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0da67b]/10 text-[#075159] hover:bg-[#0da67b]/20 rounded-lg text-xs font-bold border border-[#0da67b]/25 transition-all"
                                                                        >
                                                                            <Lock size={12} /> GESTIONAR PERMISOS
                                                                        </button>
                                                                        {(u.is_locked || u.estado === false) && (
                                                                            <button
                                                                                onClick={async () => {
                                                                                    try {
                                                                                        await unlockUser(String(u.id));
                                                                                        setUsers((prev: any[]) => prev.map((usr) => String(usr.id) === String(u.id) ? { ...usr, is_locked: false, estado: true, failed_count: 0 } : usr));
                                                                                        void uiAlert("Cuenta desbloqueada.", "Usuarios");
                                                                                    } catch (error: any) {
                                                                                        void uiAlert(error?.message || "No se pudo desbloquear la cuenta", "Usuarios");
                                                                                    }
                                                                                }}
                                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/10 text-green-400 hover:bg-green-600/20 rounded-lg text-xs font-bold border border-green-500/20 transition-all"
                                                                            >
                                                                                <CheckCircle size={12} /> DESBLOQUEAR
                                                                            </button>
                                                                        )}
                                                                    </>
                                                                ) : (
                                                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest italic">Solo Lectura (DEV/PROPIO)</span>
                                                                )}
                                                                <button type="button" onClick={() => goToUserAudit(u.id)}
                                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                                                        darkMode
                                                                            ? 'text-zinc-200 border-zinc-600 hover:bg-zinc-700/40 hover:border-zinc-500'
                                                                            : 'text-slate-700 border-slate-300 hover:bg-slate-100'
                                                                    }`}
                                                                    title="Ver Auditoria"
                                                                >
                                                                    <Activity size={12} /> VER AUDITORIA
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            {filteredUsers.length === 0 && (
                                                <tr>
                                                    <td colSpan={5} className="px-6 py-10 text-center text-slate-400">
                                                        No hay usuarios que coincidan con los filtros seleccionados.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                {selectedUserForPerms && (
                                    <UserPermissionsModal
                                        user={selectedUserForPerms}
                                        onClose={() => setSelectedUserForPerms(null)}
                                        darkMode={darkMode}
                                        currentUserPerms={Array.isArray(currentUserObj?.permissions) ? currentUserObj!.permissions : []}
                                    />
                                )}
                            </div>
                        )}

                        {/* TAB: ESTRUCTURA ORGANIZATIVA */}
                        {activeTab === 'orgMgmt' && (
                            <div className="space-y-6 animate-in fade-in duration-500 p-6">
                                <div className={`p-6 rounded-xl border ${theme.card}`}>
                                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                        <Briefcase size={20} className="text-[#0da67b]" /> ANADIR NUEVO MODULO
                                    </h3>
                                    <div className="flex flex-wrap gap-4 items-end">
                                        <div className="flex-1 min-w-[300px]">
                                            <label className="block text-xs font-bold text-slate-500 mb-1">Nombre del Modulo</label>
                                            <input
                                                value={newModuleName}
                                                onChange={(e) => setNewModuleName(e.target.value)}
                                                className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[#0da67b]/25 focus:border-[#0da67b] ${theme.input} outline-none`}
                                                placeholder="Ej: VII. Gestion Comercial"
                                            />
                                        </div>
                                        <button
                                            onClick={handleAddModule}
                                            className="px-6 py-2 bg-[linear-gradient(120deg,#042f36_0%,#075159_55%,#0bbf8c_100%)] text-white font-bold rounded-lg hover:brightness-110 transition-colors shadow-lg shadow-[#075159]/20 active:scale-95 transition-transform"
                                        >
                                            CREAR MODULO
                                        </button>
                                    </div>
                                </div>
                                <div className={`p-6 rounded-xl border ${theme.card}`}>
                                    <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                                        <Plus size={20} className="text-[#0da67b]" /> ANADIR NUEVA GERENCIA
                                    </h3>
                                    <div className="flex flex-wrap gap-4 items-end">
                                        <div className="flex-1 min-w-[300px]">
                                            <label className="block text-xs font-bold text-slate-500 mb-1">Nombre de la Gerencia</label>
                                            <input
                                                value={newDeptName}
                                                onChange={(e) => setNewDeptName(e.target.value)}
                                                className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[#0da67b]/25 focus:border-[#0da67b] ${theme.input} outline-none`}
                                                placeholder="Ej: Gerencia Nacional de Logistica"
                                            />
                                        </div>
                                        <div className="w-64">
                                            <label className="block text-xs font-bold text-slate-500 mb-1">Categoria Jerarquica</label>
                                            <select
                                                value={newGroupIdx}
                                                onChange={(e) => setNewGroupIdx(parseInt(e.target.value))}
                                                className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[#0da67b]/25 focus:border-[#0da67b] ${theme.input} outline-none`}
                                            >
                                                {orgStructure.map((g: any, i: number) => (
                                                    <option key={i} value={i}>{g.category}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <button
                                            onClick={handleAddDept}
                                            className="px-6 py-2 bg-[linear-gradient(120deg,#042f36_0%,#075159_55%,#0bbf8c_100%)] text-white font-bold rounded-lg hover:brightness-110 transition-colors shadow-lg shadow-[#075159]/20 active:scale-95 transition-transform"
                                        >
                                            GUARDAR
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {orgStructure.map((group: any, groupIdx: number) => (
                                        <div key={groupIdx} className={`p-5 rounded-xl border shadow-sm ${theme.card}`}>
                                            <div className="flex items-center gap-2 mb-4 border-b pb-3 border-zinc-800/50">
                                                {(() => {
                                                    const IconComp = ORG_ICONS[group.icon] || Shield;
                                                    return <IconComp size={20} className="text-[#0da67b]" />;
                                                })()}
                                                <h4 className="font-bold text-sm tracking-tight flex-1">{group.category}</h4>
                                                <button
                                                    onClick={() => handleEditModule(groupIdx)}
                                                    className={`p-1.5 rounded-md hover:bg-[#0da67b]/15 hover:text-[#075159] transition-colors ${theme.subtext}`}
                                                    title="Editar módulo"
                                                >
                                                    <Edit2 size={12} />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteModule(groupIdx)}
                                                    className={`p-1.5 rounded-md hover:bg-[#042f36]/12 hover:text-[#042f36] transition-colors ${theme.subtext}`}
                                                    title="Eliminar módulo"
                                                >
                                                    <Trash2 size={12} />
                                                </button>
                                            </div>
                                            <div className="space-y-2">
                                                {group.items.map((item: string, itemIdx: number) => (
                                                    <div key={itemIdx} className={`group flex justify-between items-center p-3 rounded-lg border transition-all ${darkMode ? 'bg-zinc-800/30 border-zinc-700/50 hover:bg-zinc-700/40' : 'bg-slate-50 border-slate-100 hover:bg-white hover:shadow-sm'}`}>
                                                        <span className={`text-sm font-medium ${theme.text}`}>{item}</span>
                                                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button
                                                                onClick={() => handleEditDept(groupIdx, itemIdx)}
                                                                className={`p-1.5 rounded-md hover:bg-[#0da67b]/15 hover:text-[#075159] transition-colors ${theme.subtext}`}
                                                            >
                                                                <Edit2 size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteDept(groupIdx, itemIdx)}
                                                                className={`p-1.5 rounded-md hover:bg-[#042f36]/12 hover:text-[#042f36] transition-colors ${theme.subtext}`}
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                                {group.items.length === 0 && (
                                                    <p className="text-xs text-center py-4 text-slate-500 italic">No hay gerencias en esta categoria</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* TAB: ROLES Y PERMISOS BASE */}
                        {activeTab === 'roles' && hasPermission(PERMISSIONS_MASTER.SECURITY_MANAGE_USERS) && (
                            <div className="p-6">
                                <RoleDefaultPermissionsPanel darkMode={darkMode} />
                            </div>
                        )}

                        {/* TAB: CONFIGURACIÓN MAESTRA */}
                        {activeTab === 'devConfig' && hasPermission(PERMISSIONS_MASTER.SYS_DEV_TOOLS) && (
                            <div className="p-6">
                                <MasterPermissionPanel darkMode={darkMode} />
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Upload Document Slide-over Panel */}
            {isUploadPanelOpen && (
                <div className="fixed inset-0 z-[100] flex justify-end bg-black/50 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className={`w-full max-w-md h-full shadow-2xl animate-in slide-in-from-right duration-500 ${theme.card}`}>
                        <div className={`p-6 border-b flex justify-between items-center ${darkMode ? 'border-zinc-800' : 'border-slate-100'}`}>
                            <h3 className={`text-xl font-bold ${theme.text}`}>Subir Documento</h3>
                            <button
                                onClick={() => setIsUploadPanelOpen(false)}
                                className={`p-2 rounded-full hover:bg-slate-800 transition-colors ${theme.subtext}`}
                            >
                                <span className="font-bold">X</span>
                            </button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className={`p-10 border-2 border-dashed rounded-xl text-center transition-colors ${darkMode ? 'border-zinc-800 bg-zinc-950/30 hover:border-[#0da67b]/50' : 'border-slate-200 bg-slate-50 hover:border-[#0da67b]/50'}`}>
                                <div className="mx-auto mb-4 w-12 h-12 rounded-full bg-[#e7f9f3] flex items-center justify-center text-[#075159]">
                                    <Download size={24} />
                                </div>
                                <p className={`text-sm font-medium ${theme.text}`}>Haz clic para subir o arrastra un archivo</p>
                                <p className={`text-xs mt-1 ${theme.subtext}`}>PDF, Word, Excel (Max 10MB)</p>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label className={`block text-xs font-bold uppercase mb-2 ${theme.subtext}`}>Tipo de Documento</label>
                                    <select className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[#0da67b]/25 focus:border-[#0da67b] outline-none ${theme.input}`}>
                                        <option>Circular</option>
                                        <option>Oficio</option>
                                        <option>Informe</option>
                                        <option>Memorando</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={`block text-xs font-bold uppercase mb-2 ${theme.subtext}`}>Gerencia Destino</label>
                                    <input type="text" className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[#0da67b]/25 focus:border-[#0da67b] outline-none ${theme.input}`} placeholder="Escriba la gerencia..." />
                                </div>
                                <div>
                                    <label className={`block text-xs font-bold uppercase mb-2 ${theme.subtext}`}>Observaciones</label>
                                    <textarea rows={3} className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-[#0da67b]/25 focus:border-[#0da67b] outline-none ${theme.input}`} placeholder="Opcional..."></textarea>
                                </div>
                            </div>
                            <button
                                onClick={() => setIsUploadPanelOpen(false)}
                                className="w-full py-3 bg-[linear-gradient(120deg,#042f36_0%,#075159_55%,#0bbf8c_100%)] text-white rounded-xl font-bold hover:brightness-110 transition-all shadow-lg shadow-[#075159]/20 active:scale-[0.98]"
                            >
                                Procesar Documento
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function UserPermissionsModal({ user, onClose, darkMode, currentUserPerms }: { user: any, onClose: () => void, darkMode: boolean, currentUserPerms: string[] }) {
    const safeCurrentUserPerms = Array.isArray(currentUserPerms) ? currentUserPerms : [];
    const normalizePerms = (perms: any) => {
        const arr = Array.isArray(perms) ? perms : [];
        return arr.filter((perm: string, index: number, self: string[]) => self.indexOf(perm) === index);
    };
    const availablePermissions = Object.values(PERMISSIONS_MASTER).filter(p => safeCurrentUserPerms.includes(p));
    const buildVisiblePerms = (rawPerms: any) =>
        normalizePerms(rawPerms).filter((perm: string) => availablePermissions.includes(perm));

    const rawUserPerms = user.permissions || user.permisos || [];
    const [userPerms, setUserPerms] = useState<string[]>(buildVisiblePerms(rawUserPerms));
    const [saved, setSaved] = useState(false);
    const [devRoleMasterPassword, setDevRoleMasterPassword] = useState<string | null>(null);
    const activeVisiblePermissionsCount = availablePermissions.filter((perm) => userPerms.includes(perm)).length;

    const togglePermission = (perm: string) => {
        setUserPerms(prev =>
            prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
        );
        setSaved(false);
    };

    const enableAllForUser = () => {
        setUserPerms([...availablePermissions]);
        setSaved(false);
    };

    const clearAllForUser = () => {
        setUserPerms([]);
        setSaved(false);
    };

    const [selectedRole, setSelectedRole] = useState(user.role || 'Usuario'); // Roles: 'Usuario', 'Administrador', 'CEO', 'Gerente'
    const roles = ['Usuario', 'Administrador', 'CEO', 'Gerente'];

    useEffect(() => {
        const rawPerms = user.permissions || user.permisos || [];
        setUserPerms(buildVisiblePerms(rawPerms));
        setSelectedRole(user.role || 'Usuario');
        setDevRoleMasterPassword(null);
        setSaved(false);
    }, [user]);



    const handleSave = async () => {
        try {
            // Actualizar Rol
            let rolId = 3; // Usuario
            if (selectedRole === 'Administrador') rolId = 2;
            if (selectedRole === 'CEO') rolId = 1;
            if (selectedRole === 'Gerente') rolId = 5;

            let effectivePerms = [...userPerms];
            if (selectedRole === 'Administrador') {
                try {
                    const scoped = localStorage.getItem('admin_scope_2026');
                    if (scoped) {
                        const parsed = JSON.parse(scoped);
                        if (Array.isArray(parsed)) {
                            effectivePerms = buildVisiblePerms(parsed);
                        }
                    }
                } catch (error) {
                    console.error("No se pudo leer AdminScope local", error);
                }
            }

            await Promise.all([
                updateUserRole(user.id, rolId),
                updateUserPermissions(String(user.id), effectivePerms),
            ]);
            setUserPerms(effectivePerms);
            setSaved(true);
            setTimeout(() => {
                setSaved(false);
                onClose();
            }, 1500);
            void uiAlert(`Permisos y Rol actualizados para ${user.nombre}.`, "Permisos");
        } catch (error) {
            void uiAlert("Error al actualizar: " + error, "Permisos");
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className={`w-full max-w-2xl rounded-2xl border shadow-2xl overflow-hidden ${darkMode ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-slate-200 text-slate-900'}`}>
                <div className="p-6 border-b border-zinc-800/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-[linear-gradient(135deg,#042f36_0%,#075159_60%,#0bbf8c_100%)] rounded-xl text-white shadow-lg shadow-[#075159]/20">
                            <Lock size={18} />
                        </div>
                        <div>
                    <h3 className="font-bold">Gestion de Permisos Granulares</h3>
                            <p className="text-[10px] text-slate-500 uppercase tracking-widest font-black">{user.nombre} {user.apellido} ({user.rol || 'Usuario'})</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-full transition-colors"><X size={20} /></button>
                </div>

                <div className="p-6 max-h-[60vh] overflow-y-auto no-scrollbar space-y-6">
                    {/* SECCION DE ROL */}
                    <div className={`p-4 rounded-xl border ${darkMode ? 'bg-zinc-950/50 border-zinc-800' : 'bg-slate-50 border-slate-100'}`}>
                        <h4 className={`text-xs font-bold uppercase mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Rol del Usuario</h4>
                        <div className="flex flex-wrap gap-2">
                            {roles.map(role => (
                                <button
                                    key={role}
                                    onClick={() => {
                                        setSelectedRole(role);
                                        if (role !== 'Desarrollador') {
                                            setDevRoleMasterPassword(null);
                                        }
                                        setSaved(false);
                                    }}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${selectedRole === role
                                        ? 'bg-[linear-gradient(135deg,#042f36_0%,#075159_58%,#0bbf8c_100%)] text-white shadow-lg shadow-[#075159]/25'
                                        : (darkMode ? 'bg-zinc-800 text-slate-400 hover:bg-zinc-700' : 'bg-white text-slate-600 border border-slate-200 hover:bg-[#eefaf6] hover:border-[#0da67b]/30')
                                        }`}
                                >
                                    {role}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2 flex flex-wrap items-center gap-2">
                            <button
                                onClick={enableAllForUser}
                                className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-[#0da67b] text-white hover:bg-[#075159] transition-colors"
                            >
                                ACTIVAR TODOS
                            </button>
                            <button
                                onClick={clearAllForUser}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-black transition-colors ${darkMode ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
                            >
                                QUITAR TODOS
                            </button>
                            <span className="text-[11px] font-bold text-slate-500">
                                {activeVisiblePermissionsCount} / {availablePermissions.length} activos
                            </span>
                        </div>
                        {availablePermissions.length > 0 ? (
                            availablePermissions.map(perm => (
                                <label key={perm} className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer group transition-all ${userPerms.includes(perm) ? (darkMode ? 'bg-[#0da67b]/12 border-[#0bbf8c]/45' : 'bg-[#e7f9f3] border-[#0da67b]/30') : (darkMode ? 'bg-zinc-950/50 border-zinc-800' : 'bg-slate-50 border-slate-100')}`}>
                                    <div>
                                        <p className={`text-[11px] font-bold ${userPerms.includes(perm) ? (darkMode ? 'text-[#0bbf8c]' : 'text-[#075159]') : 'text-slate-500'}`}>
                                            {PERMISSION_LABELS[perm] || perm}
                                        </p>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type="checkbox"
                                            checked={userPerms.includes(perm)}
                                            onChange={() => togglePermission(perm)}
                                            className="sr-only"
                                        />
                                        <div className={`w-10 h-6 rounded-full transition-colors ${userPerms.includes(perm) ? 'bg-[#0da67b]' : (darkMode ? 'bg-zinc-800' : 'bg-slate-300')}`} />
                                        <div className={`absolute w-4 h-4 rounded-full bg-white transition-all shadow-sm ${userPerms.includes(perm) ? 'translate-x-5' : 'translate-x-1'} top-1`} />
                                    </div>
                                </label>
                            ))
                        ) : (
                            <div className="col-span-2 py-10 text-center italic text-slate-500 text-sm">
                                Tu AdminScope no permite asignar permisos adicionales.
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-zinc-800/50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-2 rounded-xl text-sm font-bold hover:bg-slate-800 transition-colors">CANCELAR</button>
                    <button
                        onClick={handleSave}
                        className={`px-8 py-2 rounded-xl text-sm font-bold transition-all transform active:scale-95 flex items-center gap-2 ${saved ? 'bg-[#0bbf8c] text-white' : 'bg-[linear-gradient(120deg,#042f36_0%,#075159_58%,#0bbf8c_100%)] hover:brightness-110 text-white shadow-lg shadow-[#075159]/25'}`}
                    >
                        {saved ? <CheckCircle size={16} /> : <Save size={16} />}
                        {saved ? 'GUARDADO' : 'APLICAR CAMBIOS'}
                    </button>
                </div>
            </div>
        </div>
    );
}


