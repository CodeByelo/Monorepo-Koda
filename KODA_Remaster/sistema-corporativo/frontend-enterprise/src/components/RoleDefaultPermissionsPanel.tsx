"use client";

import React, { useState, useEffect } from 'react';
import { Shield, Save, CheckCircle, Info, Users } from 'lucide-react';
import { PERMISSIONS_MASTER, PERMISSION_LABELS } from '../permissions/constants';
import { getRoles, updateRolePermissions } from '../lib/api';
import { uiAlert } from '../lib/ui-dialog';

export default function RoleDefaultPermissionsPanel({ darkMode }: { darkMode: boolean }) {
    const [roles, setRoles] = useState<{ id: number; nombre_rol: string; default_permissions: string[] }[]>([]);
    const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
    const [currentPermissions, setCurrentPermissions] = useState<string[]>([]);
    const [saved, setSaved] = useState(false);
    const [saving, setSaving] = useState(false);
    
    const allPermissions = Object.values(PERMISSIONS_MASTER);

    useEffect(() => {
        const loadInitialData = async () => {
            try {
                const rolesData = await getRoles();
                const filteredRoles = rolesData.filter(
                    r => r.nombre_rol.toLowerCase() !== 'desarrollador' && 
                         r.nombre_rol.toLowerCase() !== 'developer' && 
                         r.nombre_rol.toLowerCase() !== 'dev'
                );
                setRoles(filteredRoles);
                if (filteredRoles.length > 0) {
                    setSelectedRoleId(filteredRoles[0].id);
                    setCurrentPermissions(filteredRoles[0].default_permissions || []);
                }
            } catch (error) {
                console.error("Error al cargar roles", error);
            }
        };

        void loadInitialData();
    }, []);

    const handleRoleChange = (roleId: number) => {
        setSelectedRoleId(roleId);
        const role = roles.find(r => r.id === roleId);
        setCurrentPermissions(role?.default_permissions || []);
        setSaved(false);
    };

    const togglePermission = (perm: string) => {
        setCurrentPermissions(prev =>
            prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
        );
        setSaved(false);
    };

    const enableAllPermissions = () => {
        setCurrentPermissions([...allPermissions]);
        setSaved(false);
    };

    const clearAllPermissions = () => {
        setCurrentPermissions([]);
        setSaved(false);
    };

    const saveRolePermissions = async () => {
        if (!selectedRoleId) return;
        try {
            setSaving(true);
            await updateRolePermissions(selectedRoleId, currentPermissions);
            
            // Actualizar estado local
            setRoles(prev => prev.map(r => r.id === selectedRoleId ? { ...r, default_permissions: currentPermissions } : r));
            
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
            void uiAlert(`Permisos por defecto guardados correctamente.`, "Roles");
        } catch (e) {
            console.error("Error guardando permisos de rol", e);
            void uiAlert("No se pudieron guardar los permisos por defecto.", "Error");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className={`p-6 rounded-2xl border ${darkMode ? 'bg-zinc-900/50 border-[#0da67b]/20' : 'bg-white border-[#0da67b]/15 shadow-xl'}`}>
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-[linear-gradient(135deg,#042f36_0%,#075159_58%,#0bbf8c_100%)] rounded-xl text-white shadow-lg shadow-[#075159]/25">
                            <Users size={24} />
                        </div>
                        <div>
                            <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Roles y Permisos Base</h2>
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mt-1">Configuración por defecto de Roles</p>
                        </div>
                    </div>
                    <button
                        onClick={saveRolePermissions}
                        disabled={saving}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all transform active:scale-95 ${saved ? 'bg-[#0bbf8c] text-white' : 'bg-[linear-gradient(120deg,#042f36_0%,#075159_58%,#0bbf8c_100%)] hover:brightness-110 text-white shadow-lg shadow-[#075159]/25'}`}
                    >
                        {saved ? <CheckCircle size={18} /> : <Save size={18} />}
                        {saving ? 'GUARDANDO...' : saved ? 'GUARDADO' : 'GUARDAR CONFIGURACIÓN'}
                    </button>
                </div>

                <div className={`p-4 rounded-xl mb-6 flex items-center gap-3 ${darkMode ? 'bg-[#0da67b]/10 border border-[#0da67b]/20' : 'bg-[#e7f9f3] border border-[#0da67b]/20'}`}>
                    <Info size={18} className="text-[#0da67b] shrink-0" />
                    <p className="text-xs text-[#075159] leading-relaxed font-medium">
                        Configura los permisos por defecto para cada rol. Al crear o reasignar un rol a un usuario, el sistema le asignará estos permisos de forma autónoma.
                    </p>
                </div>

                <div className="mb-6 flex gap-4 overflow-x-auto pb-2">
                    {roles.map(role => (
                        <button
                            key={role.id}
                            onClick={() => handleRoleChange(role.id)}
                            className={`px-5 py-3 rounded-xl text-sm font-bold transition-all whitespace-nowrap ${
                                selectedRoleId === role.id 
                                ? 'bg-[#0da67b] text-white shadow-md' 
                                : darkMode 
                                    ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' 
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            {role.nombre_rol}
                        </button>
                    ))}
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
                            {currentPermissions.length} / {allPermissions.length} activos
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <PermissionGroup
                        title="1. Navegacion y Visibilidad"
                        permissions={allPermissions.filter(k => k.startsWith('VIEW_'))}
                        selected={currentPermissions}
                        onToggle={togglePermission}
                        darkMode={darkMode}
                    />
                    <PermissionGroup
                        title="2. Acciones Operativas"
                        permissions={allPermissions.filter(k => !k.startsWith('VIEW_') && !k.startsWith('ORG_') && !k.startsWith('SYS_'))}
                        selected={currentPermissions}
                        onToggle={togglePermission}
                        darkMode={darkMode}
                    />
                    <PermissionGroup
                        title="3. Datos y Estructura"
                        permissions={allPermissions.filter(k => k.startsWith('ORG_'))}
                        selected={currentPermissions}
                        onToggle={togglePermission}
                        darkMode={darkMode}
                    />
                    <PermissionGroup
                        title="4. Funciones Criticas"
                        permissions={allPermissions.filter(k => k.startsWith('SYS_'))}
                        selected={currentPermissions}
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
