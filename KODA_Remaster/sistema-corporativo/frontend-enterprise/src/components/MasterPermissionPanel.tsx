"use client";

import React, { useState, useEffect } from 'react';
import { Shield, Save, CheckCircle, Info } from 'lucide-react';
import { PERMISSIONS_MASTER, DEFAULT_SCOPES, PERMISSION_LABELS } from '../permissions/constants';
import { useAuth } from '../hooks/useAuth';
import { getAllUsers, updateUserPermissions } from '../lib/api';
import { uiAlert } from '../lib/ui-dialog';

export default function MasterPermissionPanel({ darkMode }: { darkMode: boolean }) {
    const { user } = useAuth();
    const [adminPermissions, setAdminPermissions] = useState<string[]>([]);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    const allPermissions = Object.values(PERMISSIONS_MASTER);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                // 2. Cargar permisos reales del rol Administrador en la DB
                const usersListResponse = await getAllUsers(100, 0);
                const rawUsersList = usersListResponse?.data;
                const usersList = Array.isArray(rawUsersList) ? rawUsersList : [];
                const admins = usersList.filter((u: any) => {
                    const roleName = String(u?.role || '').toLowerCase();
                    return roleName === 'administrativo' || roleName === 'admin' || roleName === 'administrador';
                });

                const dbPerms = admins.length > 0 ? (admins[0].permissions || admins[0].permisos) : null;
                if (Array.isArray(dbPerms) && dbPerms.length > 0) {
                    setAdminPermissions(dbPerms);
                } else {
                    // Si la DB está vacía o no hay admins configurados, usar DEFAULT_SCOPES (que contiene todo por defecto)
                    setAdminPermissions(DEFAULT_SCOPES['Administrador'] || []);
                }
            } catch (error) {
                console.error("Error al cargar configuración maestra desde la base de datos", error);
                setAdminPermissions(DEFAULT_SCOPES['Administrador'] || []);
            }
        };

        void loadInitialData();
    }, []);

    const togglePermission = (perm: string) => {
        setAdminPermissions(prev =>
            prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
        );
        setSaved(false);
    };

    const enableAllPermissions = () => {
        setAdminPermissions([...allPermissions]);
        setSaved(false);
    };

    const clearAllPermissions = () => {
        setAdminPermissions([]);
        setSaved(false);
    };

    const saveAdminScope = async () => {
        try {
            setSaving(true);
            localStorage.setItem('admin_scope_2026', JSON.stringify(adminPermissions));

            const usersResponse = await getAllUsers(100, 0);
            const rawUsers = usersResponse?.data;
            const users = Array.isArray(rawUsers) ? rawUsers : [];
            const admins = users.filter((u: any) => {
                const role = String(u?.role || '').toLowerCase();
                return role === 'administrativo' || role === 'admin' || role === 'administrador';
            });

            await Promise.all(
                admins.map((a: any) => updateUserPermissions(String(a.id), adminPermissions))
            );



            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
            void uiAlert(`AdminScope aplicado. Administradores actualizados: ${admins.length}.`, "AdminScope");
        } catch (e) {
            console.error("Error guardando AdminScope", e);
            void uiAlert("No se pudo aplicar AdminScope global. Revisa backend/permisos.", "AdminScope");
        } finally {
            setSaving(false);
        }
    };

    if (user?.role !== 'Desarrollador' && user?.role !== 'Administrador') {
        return (
            <div className="flex flex-col items-center justify-center p-20 text-[#075159] font-bold">
                <Shield size={48} className="mb-4" />
                ACCESO DENEGADO - NIVEL RAIZ REQUERIDO (DEV/ADMIN)
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className={`p-6 rounded-2xl border ${darkMode ? 'bg-zinc-900/50 border-[#0da67b]/20' : 'bg-white border-[#0da67b]/15 shadow-xl'}`}>
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-[linear-gradient(135deg,#042f36_0%,#075159_58%,#0bbf8c_100%)] rounded-xl text-white shadow-lg shadow-[#075159]/25">
                            <Shield size={24} />
                        </div>
                        <div>
                            <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Panel de Configuración Maestra (Nivel de Sistema)</h2>
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mt-1">Definición de Permisos Globales</p>
                        </div>
                    </div>
                    <button
                        onClick={saveAdminScope}
                        disabled={saving}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all transform active:scale-95 ${saved ? 'bg-[#0bbf8c] text-white' : 'bg-[linear-gradient(120deg,#042f36_0%,#075159_58%,#0bbf8c_100%)] hover:brightness-110 text-white shadow-lg shadow-[#075159]/25'}`}
                    >
                        {saved ? <CheckCircle size={18} /> : <Save size={18} />}
                        {saving ? 'APLICANDO...' : saved ? 'GUARDADO' : 'GUARDAR CONFIGURACIÓN'}
                    </button>
                </div>

                <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 ${darkMode ? 'bg-[#0da67b]/10 border border-[#0da67b]/20' : 'bg-[#e7f9f3] border border-[#0da67b]/20'}`}>
                    <Info size={18} className="text-[#0da67b] shrink-0" />
                    <p className="text-xs text-[#075159] leading-relaxed font-medium">
                        Configura los permisos globales del sistema. El rol Administrador posee acceso completo a todas las funciones del sistema por defecto.
                    </p>
                </div>

                <div className={`p-4 rounded-xl mb-6 border ${darkMode ? 'bg-zinc-950/60 border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>
                    <p className={`text-[11px] font-bold uppercase tracking-widest mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Control Rapido de Permisos
                    </p>
                    <div className="flex flex-wrap gap-2">
                        <button
                            onClick={enableAllPermissions}
                            className="px-4 py-2 rounded-lg text-xs font-black bg-[#0da67b] text-white hover:bg-[#075159] transition-colors"
                        >
                            ACTIVAR TODOS LOS PERMISOS
                        </button>
                        <button
                            onClick={clearAllPermissions}
                            className={`px-4 py-2 rounded-lg text-xs font-black transition-colors ${darkMode ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700' : 'bg-slate-200 text-slate-800 hover:bg-slate-300'}`}
                        >
                            QUITAR TODOS
                        </button>
                        <span className={`text-xs font-bold self-center ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            {adminPermissions.length} / {allPermissions.length} activos
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <PermissionGroup
                        title="1. Navegacion y Visibilidad"
                        permissions={allPermissions.filter(k => k.startsWith('VIEW_'))}
                        selected={adminPermissions}
                        onToggle={togglePermission}
                        darkMode={darkMode}
                    />
                    <PermissionGroup
                        title="2. Acciones Operativas"
                        permissions={allPermissions.filter(k => !k.startsWith('VIEW_') && !k.startsWith('ORG_') && !k.startsWith('SYS_'))}
                        selected={adminPermissions}
                        onToggle={togglePermission}
                        darkMode={darkMode}
                    />
                    <PermissionGroup
                        title="3. Datos y Estructura"
                        permissions={allPermissions.filter(k => k.startsWith('ORG_'))}
                        selected={adminPermissions}
                        onToggle={togglePermission}
                        darkMode={darkMode}
                    />
                    <PermissionGroup
                        title="4. Funciones Criticas"
                        permissions={allPermissions.filter(k => k.startsWith('SYS_'))}
                        selected={adminPermissions}
                        onToggle={togglePermission}
                        darkMode={darkMode}
                        isCritical
                    />
                </div>
            </div>
        </div>
    );
}

function PermissionGroup({ title, permissions, selected, onToggle, darkMode, isCritical }: any) {
    return (
        <div className={`p-5 rounded-xl border ${darkMode ? 'bg-zinc-950/50 border-zinc-800' : 'bg-slate-50 border-slate-200'}`}>
            <h3 className={`text-xs font-black uppercase tracking-tighter mb-4 flex items-center gap-2 ${darkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isCritical ? 'bg-[#042f36]' : 'bg-[#0da67b]'}`} />
                {title}
            </h3>
            <div className="space-y-3">
                {permissions.map((perm: string) => (
                    <label key={perm} className="flex items-center gap-3 cursor-pointer group">
                        <div className="relative flex items-center">
                            <input
                                type="checkbox"
                                checked={selected.includes(perm)}
                                onChange={() => onToggle(perm)}
                                className="sr-only"
                            />
                            <div className={`w-10 h-6 rounded-full transition-colors ${selected.includes(perm) ? (isCritical ? 'bg-[#042f36]' : 'bg-[#0da67b]') : (darkMode ? 'bg-zinc-800' : 'bg-slate-300')}`} />
                            <div className={`absolute w-4 h-4 rounded-full bg-white transition-all shadow-sm ${selected.includes(perm) ? 'translate-x-5' : 'translate-x-1'}`} />
                        </div>
                        <span className={`text-[11px] font-bold transition-colors ${selected.includes(perm) ? (darkMode ? 'text-white' : 'text-slate-900') : 'text-slate-500 group-hover:text-slate-400'}`}>
                            {PERMISSION_LABELS[perm] || perm}
                        </span>
                    </label>
                ))}
            </div>
        </div>
    );
}
