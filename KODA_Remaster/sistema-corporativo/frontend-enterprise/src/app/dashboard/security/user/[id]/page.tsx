'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, User, Shield, Clock, Activity, FileText, Lock, Calendar, Pencil, Key, UserCheck, Settings, Tag, AlertTriangle, Search, Filter, Database, RefreshCw } from 'lucide-react';
import { changeUserRole, deleteUser, editUserProfileAction, getUserDetails, getUserLogs, resetUserPasswordAction, setUserStatus } from '../../actions';

export default function UserHistoryPage() {
    const router = useRouter();
    const params = useParams<{ id: string }>();
    const [user, setUser] = useState<any>(null);
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [notice, setNotice] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterCategory, setFilterCategory] = useState("all");
    const [statusText, setStatusText] = useState("Cargando perfil del empleado...");

    useEffect(() => {
        if (!loading) return;
        const textSequence = [
            "Conectando al canal de auditoría...",
            "Cargando perfil del empleado...",
            "Recuperando logs de actividad...",
            "Verificando firmas y accesos..."
        ];
        let idx = 0;
        const interval = setInterval(() => {
            idx = (idx + 1) % textSequence.length;
            setStatusText(textSequence[idx]);
        }, 1200);
        return () => clearInterval(interval);
    }, [loading]);
    const [dialog, setDialog] = useState<{
        open: boolean;
        type: "confirm" | "prompt";
        title: string;
        message: string;
        inputType?: "text" | "password";
        inputValue?: string;
        confirmText?: string;
        cancelText?: string;
    }>({
        open: false,
        type: "confirm",
        title: "",
        message: "",
        inputType: "text",
        inputValue: "",
        confirmText: "Aceptar",
        cancelText: "Cancelar",
    });
    const dialogResolverRef = useRef<((value: boolean | string | null) => void) | null>(null);

    const [mounted, setMounted] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [editForm, setEditForm] = useState({
        usuario_corp: "",
        nombre: "",
        apellido: "",
        email: "",
    });
    const userId = params?.id;
    const safeLogs = Array.isArray(logs) ? logs : [];

    const filteredLogs = safeLogs.filter((log) => {
        const matchesSearch = 
            String(log.evento || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(log.detalles || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
            String(log.ip_address || "").toLowerCase().includes(searchTerm.toLowerCase());
            
        if (filterCategory === "all") return matchesSearch;
        
        const eventName = String(log.evento || "").toLowerCase();
        if (filterCategory === "logins") {
            return matchesSearch && (eventName.includes("login") || eventName.includes("acceso") || eventName.includes("sesion") || eventName.includes("sesión"));
        }
        if (filterCategory === "profile") {
            return matchesSearch && (eventName.includes("perfil") || eventName.includes("update") || eventName.includes("role") || eventName.includes("estado") || eventName.includes("usuario") || eventName.includes("clave"));
        }
        if (filterCategory === "documents") {
            return matchesSearch && (eventName.includes("doc") || eventName.includes("archivo") || eventName.includes("firma"));
        }
        if (filterCategory === "tickets") {
            return matchesSearch && (eventName.includes("ticket") || eventName.includes("soporte"));
        }
        if (filterCategory === "danger") {
            return matchesSearch && (log.estado === "danger" || eventName.includes("fallido") || eventName.includes("error") || eventName.includes("bloqueado"));
        }
        
        return matchesSearch;
    });

    const goBackToDashboard = () => {
        router.replace('/dashboard');
    };

    const showNotice = (type: "success" | "error" | "info", message: string) => {
        setNotice({ type, message });
        window.setTimeout(() => setNotice(null), 3200);
    };

    const askConfirm = (
        title: string,
        message: string,
        confirmText: string = "Aceptar",
        cancelText: string = "Cancelar",
    ) =>
        new Promise<boolean>((resolve) => {
            dialogResolverRef.current = (value) => resolve(Boolean(value));
            setDialog({
                open: true,
                type: "confirm",
                title,
                message,
                inputType: "text",
                inputValue: "",
                confirmText,
                cancelText,
            });
        });

    const askPrompt = (
        title: string,
        message: string,
        inputType: "text" | "password" = "text",
        confirmText: string = "Confirmar",
        cancelText: string = "Cancelar",
    ) =>
        new Promise<string | null>((resolve) => {
            dialogResolverRef.current = (value) => resolve(typeof value === "string" ? value : null);
            setDialog({
                open: true,
                type: "prompt",
                title,
                message,
                inputType,
                inputValue: "",
                confirmText,
                cancelText,
            });
        });

    const closeDialog = (result: boolean | string | null) => {
        const resolver = dialogResolverRef.current;
        dialogResolverRef.current = null;
        setDialog((prev) => ({ ...prev, open: false }));
        if (resolver) resolver(result);
    };

    const roleLabelFromBackend = (role: string | undefined) => {
        const r = String(role || "").toLowerCase();
        if (r.includes("ceo")) return "CEO";
        if (r.includes("desarrollador") || r.includes("developer") || r.includes("dev")) return "Desarrollador";
        if (r.includes("gerente") || r.includes("manager")) return "Gerente";
        if (r.includes("coordinador") || r.includes("coordinator")) return "Coordinador";
        if (r.includes("admin")) return "Administrador";
        return "Usuario";
    };

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        async function fetchData() {
            if (!userId) return;
            setLoading(true);
            try {
                const [userData, logsData] = await Promise.all([
                    getUserDetails(userId),
                    getUserLogs(userId)
                ]);
                setUser(userData);
                setLogs(Array.isArray(logsData) ? logsData : []);
            } catch (error) {
                console.error("Error cargando auditoría de usuario:", error);
                setLogs([]);
                setUser(null);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [userId]);

    const refreshUserFromServer = async () => {
        if (!userId) return;
        try {
            const nextUser = await getUserDetails(String(userId));
            if (nextUser) setUser(nextUser);
        } catch (error) {
            console.error("Error refrescando usuario:", error);
        }
    };

    const handleDelete = async () => {
        const confirmed = await askConfirm(
            "Eliminar cuenta",
            "¿Está seguro de que desea eliminar permanentemente esta cuenta? Esta acción no se puede deshacer.",
            "Eliminar",
            "Cancelar",
        );
        if (!confirmed) {
            return;
        }

        try {
            const res = await deleteUser(userId);
            if (res.success) {
                showNotice("success", "Usuario eliminado correctamente.");
                router.replace('/dashboard');
            } else {
                showNotice("error", "Error al eliminar usuario: " + res.error);
            }
        } catch (error) {
            showNotice("error", "Error crítico al eliminar usuario.");
        }
    };

    const handleRoleChange = async (value: string) => {
        const res = await changeUserRole(String(userId), value);
        if (!res.success) {
            showNotice("error", "No se pudo cambiar el rol: " + res.error);
            return;
        }
        if (res.user) {
            setUser((prev: any) => ({ ...prev, ...res.user }));
        } else {
            setUser((prev: any) => ({ ...prev, role: value }));
        }
        showNotice("success", "Rol actualizado correctamente.");
    };

    const handleSetStatus = async (status: "ACTIVO" | "INACTIVO" | "BLOQUEADO") => {
        const labels: Record<string, string> = {
            ACTIVO: "activar",
            INACTIVO: "inactivar",
            BLOQUEADO: "bloquear",
        };
        const confirmed = await askConfirm(
            "Confirmar estado",
            `¿Confirma ${labels[status]} este usuario?`,
            "Confirmar",
            "Cancelar",
        );
        if (!confirmed) {
            return;
        }

        const res = await setUserStatus(String(userId), status);
        if (!res.success) {
            showNotice("error", "No se pudo cambiar el estado: " + res.error);
            return;
        }
        await refreshUserFromServer();
        showNotice("success", `Estado actualizado: ${status}`);
    };

    const handleResetPassword = async () => {
        const newPassword = await askPrompt(
            "Restablecer clave",
            "Ingrese nueva clave (mínimo 8 caracteres):",
            "password",
            "Actualizar",
            "Cancelar",
        );
        if (!newPassword) return;
        const res = await resetUserPasswordAction(String(userId), newPassword);
        if (!res.success) {
            showNotice("error", "No se pudo resetear la clave: " + res.error);
            return;
        }
        showNotice("success", "Clave actualizada correctamente.");
    };

    const openEditModal = () => {
        setEditForm({
            usuario_corp: String(user?.usuario_corp || "").trim(),
            nombre: String(user?.nombre || "").trim(),
            apellido: String(user?.apellido || "").trim(),
            email: String(user?.email || "").trim(),
        });
        setEditOpen(true);
    };

    const handleSaveEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!userId) return;
        const payload = {
            usuario_corp: editForm.usuario_corp.trim(),
            nombre: editForm.nombre.trim(),
            apellido: editForm.apellido.trim(),
            email: editForm.email.trim(),
        };
        if (!payload.usuario_corp || !payload.nombre || !payload.apellido || !payload.email) {
            showNotice("error", "Completa todos los campos obligatorios.");
            return;
        }
        setSavingEdit(true);
        const res = await editUserProfileAction(String(userId), payload);
        setSavingEdit(false);
        if (!res.success) {
            showNotice("error", "No se pudo editar el usuario: " + res.error);
            return;
        }
        if (res.user) {
            setUser((prev: any) => ({ ...prev, ...res.user }));
        }
        setEditOpen(false);
        showNotice("success", "Usuario actualizado correctamente.");
    };

    if (!mounted || loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 px-4 text-zinc-100 font-sans">
                <div className="relative w-28 h-28 flex items-center justify-center">
                    {/* Outer glowing pulsing aura */}
                    <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-[#0bbf8c] via-cyan-900 to-[#042f36] opacity-35 blur-xl animate-pulse" />
                    
                    {/* Spinning outer cyber ring */}
                    <div className="absolute inset-0 rounded-full border-4 border-dashed border-[#0da67b]/20 border-t-[#0bbf8c] border-b-cyan-500 animate-spin" style={{ animationDuration: '3s' }} />
                    
                    {/* Fast spinning inner ring */}
                    <div className="absolute inset-2 rounded-full border-2 border-dotted border-cyan-400/35 border-l-[#0bbf8c] border-r-transparent animate-spin" style={{ animationDuration: '1s' }} />
                    
                    {/* Pulsing center target node */}
                    <div className="w-12 h-12 rounded-full bg-zinc-900/90 border-2 border-[#0da67b] flex items-center justify-center shadow-lg shadow-[#0da67b]/20">
                        <div className="w-3.5 h-3.5 rounded-full bg-[#0bbf8c] animate-ping" />
                    </div>
                </div>
                
                {/* Status text */}
                <div className="relative mt-8 text-center space-y-2">
                    <h3 className="text-sm font-semibold tracking-widest text-[#0bbf8c] uppercase animate-pulse font-mono">
                        Auditoría del Sistema
                    </h3>
                    <p className="text-xs text-zinc-500 font-mono tracking-wider max-w-xs mx-auto min-h-[1rem]">
                        {statusText}
                    </p>
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="p-8 text-center text-zinc-400 bg-zinc-950 min-h-screen">
                Usuario no encontrado.
                <button onClick={goBackToDashboard} className="block mx-auto mt-4 text-[#0da67b] underline">Volver</button>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6 bg-zinc-950 min-h-screen font-sans text-zinc-200">
            {dialog.open && (
                <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/65 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg rounded-2xl border border-[#0da67b]/20 bg-zinc-900 shadow-2xl overflow-hidden">
                        <div className="px-5 py-4 border-b border-[#0da67b]/15 bg-gradient-to-r from-[#042f36] via-[#075159] to-[#0da67b]/80">
                            <h3 className="text-lg font-bold text-zinc-100">{dialog.title}</h3>
                            <p className="text-sm text-zinc-300 mt-1">{dialog.message}</p>
                        </div>
                        <div className="px-5 py-4">
                            {dialog.type === "prompt" && (
                                <input
                                    autoFocus
                                    type={dialog.inputType || "text"}
                                    value={dialog.inputValue || ""}
                                    onChange={(e) =>
                                        setDialog((prev) => ({ ...prev, inputValue: e.target.value }))
                                    }
                                    className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-[#0da67b] focus:ring-2 focus:ring-[#0da67b]/30"
                                    placeholder="Escriba aqui..."
                                />
                            )}
                        </div>
                        <div className="px-5 pb-5 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => closeDialog(null)}
                                className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
                            >
                                {dialog.cancelText || "Cancelar"}
                            </button>
                            <button
                                type="button"
                                onClick={() =>
                                    closeDialog(dialog.type === "prompt" ? (dialog.inputValue || "").trim() : true)
                                }
                                className="px-4 py-2 rounded-lg bg-[linear-gradient(120deg,#042f36_0%,#075159_55%,#0bbf8c_100%)] text-white hover:brightness-110 transition-colors font-semibold"
                            >
                                {dialog.confirmText || "Aceptar"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {notice && (
                <div className="fixed top-5 right-5 z-[120] max-w-md">
                    <div
                        className={`rounded-xl border px-4 py-3 shadow-xl backdrop-blur-sm ${
                            notice.type === "success"
                                ? "bg-emerald-900/85 border-emerald-500/50 text-emerald-100"
                                : notice.type === "error"
                                    ? "bg-[#042f36]/95 border-[#0da67b]/40 text-white"
                                    : "bg-zinc-900/90 border-zinc-600 text-zinc-100"
                        }`}
                    >
                        <p className="text-sm font-semibold tracking-wide">{notice.message}</p>
                    </div>
                </div>
            )}
            {editOpen && (
                <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
                    <div className="w-full max-w-3xl rounded-2xl border border-[#0da67b]/20 bg-zinc-900 shadow-2xl overflow-hidden">
                        <div className="px-6 py-4 border-b border-[#0da67b]/15 bg-gradient-to-r from-[#042f36] via-[#075159] to-[#0da67b]/80 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-zinc-100">Editar Usuario</h3>
                                <p className="text-sm text-zinc-400">Actualiza perfil sin cambiar gerencia ni contraseña.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditOpen(false)}
                                className="text-zinc-400 hover:text-zinc-100 text-2xl"
                            >
                                &times;
                            </button>
                        </div>
                        <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1 tracking-wider">Nombre</label>
                                    <input
                                        required
                                        value={editForm.nombre}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, nombre: e.target.value }))}
                                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-[#0da67b] focus:ring-2 focus:ring-[#0da67b]/30"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1 tracking-wider">Apellido</label>
                                    <input
                                        required
                                        value={editForm.apellido}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, apellido: e.target.value }))}
                                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-[#0da67b] focus:ring-2 focus:ring-[#0da67b]/30"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1 tracking-wider">Usuario corporativo</label>
                                    <input
                                        required
                                        value={editForm.usuario_corp}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, usuario_corp: e.target.value }))}
                                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-[#0da67b] focus:ring-2 focus:ring-[#0da67b]/30"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1 tracking-wider">Email</label>
                                    <input
                                        required
                                        type="email"
                                        value={editForm.email}
                                        onChange={(e) => setEditForm((prev) => ({ ...prev, email: e.target.value }))}
                                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-100 outline-none focus:border-[#0da67b] focus:ring-2 focus:ring-[#0da67b]/30"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-zinc-400 uppercase mb-1 tracking-wider">Gerencia (solo lectura)</label>
                                    <input
                                        value={String(user?.gerencia_depto || "Sin Asignar")}
                                        disabled
                                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-zinc-500 cursor-not-allowed"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setEditOpen(false)}
                                    className="px-4 py-2 rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingEdit}
                                    className="px-4 py-2 rounded-lg bg-[linear-gradient(120deg,#042f36_0%,#075159_55%,#0bbf8c_100%)] text-white hover:brightness-110 transition-colors font-semibold disabled:opacity-60"
                                >
                                    {savingEdit ? "Guardando..." : "Guardar cambios"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
            {/* Header / Back */}
            <div className="flex items-center gap-4 mb-6">
                <button
                    onClick={goBackToDashboard}
                    className="p-2 rounded-full hover:bg-zinc-800 transition-colors text-zinc-400"
                >
                    <ArrowLeft size={24} />
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-zinc-100">Historial de Usuario</h1>
                    <p className="text-zinc-400 text-sm">Detalles y auditoría de actividad</p>
                </div>
            </div>

            {/* User Profile Card */}
            <div className="relative overflow-hidden bg-zinc-900/40 backdrop-blur-md p-6 rounded-2xl border border-[#0da67b]/20 shadow-2xl flex flex-col lg:flex-row gap-6 items-start lg:items-center">
                {/* Decorative background glow */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-[#0bbf8c]/10 to-transparent rounded-full blur-3xl pointer-events-none" />
                
                {/* Hexagonal/neon glowing avatar badge */}
                <div className="relative shrink-0 group">
                    <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-[#0bbf8c] via-[#075159] to-cyan-500 opacity-60 blur group-hover:opacity-100 transition duration-700 animate-pulse" />
                    <div className="relative w-24 h-24 rounded-full bg-zinc-950 text-[#0bbf8c] flex items-center justify-center font-bold text-3xl shadow-2xl border-2 border-[#0da67b]/30">
                        {user.usuario_corp ? user.usuario_corp.substring(0, 2).toUpperCase() : <User size={36} />}
                    </div>
                </div>

                <div className="flex-1 space-y-3 relative z-10 w-full">
                    <div>
                        <h2 className="text-2xl font-bold text-white tracking-wide">{user.nombre} {user.apellido}</h2>
                        <span className="inline-flex items-center gap-1.5 text-xs text-[#0da67b] font-mono mt-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#0bbf8c] animate-ping" />
                            Sesión del Administrador Activa
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2">
                        <div className="bg-zinc-950/40 border border-zinc-800/80 px-3.5 py-2 rounded-xl flex items-center gap-2.5">
                            <User size={16} className="text-[#0da67b]" />
                            <div className="truncate">
                                <span className="block text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Usuario</span>
                                <span className="text-sm font-semibold text-zinc-200">{user.usuario_corp}</span>
                            </div>
                        </div>

                        <div className="bg-zinc-950/40 border border-zinc-800/80 px-3.5 py-2 rounded-xl flex items-center gap-2.5">
                            <Activity size={16} className="text-[#0da67b]" />
                            <div className="truncate">
                                <span className="block text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Gerencia</span>
                                <span className="text-sm font-semibold text-zinc-200">{user.gerencia_depto || "Sin Asignar"}</span>
                            </div>
                        </div>

                        <div className="bg-zinc-950/40 border border-zinc-800/80 px-3.5 py-2 rounded-xl flex items-center gap-2.5">
                            <Shield size={16} className="text-[#0da67b]" />
                            <div className="w-full">
                                <span className="block text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Nivel de Acceso</span>
                                <select
                                    value={roleLabelFromBackend(user.role)}
                                    onChange={(e) => handleRoleChange(e.target.value)}
                                    className="w-full mt-0.5 bg-transparent border-0 text-sm font-semibold text-[#d9fff2] outline-none cursor-pointer focus:ring-0 p-0"
                                >
                                    <option className="bg-zinc-950 text-[#d9fff2]">Usuario</option>
                                    <option className="bg-zinc-950 text-[#d9fff2]">Administrador</option>
                                    <option className="bg-zinc-950 text-[#d9fff2]">CEO</option>
                                    <option className="bg-zinc-950 text-[#d9fff2]">Gerente</option>
                                    <option className="bg-zinc-950 text-[#d9fff2]">Coordinador</option>
                                </select>
                            </div>
                        </div>

                        <div className="bg-zinc-950/40 border border-zinc-800/80 px-3.5 py-2 rounded-xl flex items-center gap-2.5">
                            <Lock size={16} className="text-[#0da67b]" />
                            <div className="truncate">
                                <span className="block text-[10px] text-zinc-500 uppercase font-bold tracking-wider">Identificador</span>
                                <span className="text-xs font-mono text-zinc-400 block truncate" title={user.id}>{user.id}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions Section */}
                <div className="flex flex-wrap lg:flex-col gap-2.5 shrink-0 w-full lg:w-auto pt-4 lg:pt-0 border-t lg:border-t-0 lg:border-l border-zinc-800/80 lg:pl-6">
                    <button
                        onClick={openEditModal}
                        className="flex-1 lg:flex-initial px-4 py-2.5 bg-gradient-to-r from-[#075159] to-[#0bbf8c] text-white rounded-xl hover:brightness-110 font-bold text-xs tracking-wider uppercase shadow-md hover:shadow-[#0bbf8c]/15 transition-all active:scale-[0.98] inline-flex items-center justify-center gap-2"
                    >
                        <Pencil size={14} />
                        Editar Usuario
                    </button>
                    
                    <div className="flex gap-2 w-full">
                        {!(user?.estado === true && !user?.is_locked) && (
                            <button
                                onClick={() => handleSetStatus("ACTIVO")}
                                className="flex-1 px-3 py-2 bg-emerald-600/10 border border-emerald-500/30 text-emerald-400 rounded-xl hover:bg-emerald-600/20 font-bold text-xs transition-all active:scale-[0.98]"
                            >
                                Activar
                            </button>
                        )}
                        {user?.estado !== false || user?.is_locked ? (
                            <button
                                onClick={() => handleSetStatus("INACTIVO")}
                                className="flex-1 px-3 py-2 bg-zinc-805 border border-zinc-700 text-zinc-300 rounded-xl hover:bg-zinc-700 font-bold text-xs transition-all active:scale-[0.98]"
                            >
                                Inactivar
                            </button>
                        ) : null}
                        {!user?.is_locked && (
                            <button
                                onClick={() => handleSetStatus("BLOQUEADO")}
                                className="flex-1 px-3 py-2 bg-amber-600/10 border border-amber-500/30 text-amber-400 rounded-xl hover:bg-amber-600/20 font-bold text-xs transition-all active:scale-[0.98]"
                            >
                                Bloquear
                            </button>
                        )}
                    </div>

                    <div className="flex gap-2 w-full">
                        <button
                            onClick={handleResetPassword}
                            className="flex-1 px-3 py-2 bg-zinc-950/80 border border-zinc-800 text-zinc-300 rounded-xl hover:bg-zinc-800 hover:text-white font-bold text-xs transition-colors"
                        >
                            Reset Clave
                        </button>

                        <button
                            onClick={handleDelete}
                            className="flex-1 px-3 py-2 bg-red-600/15 border border-red-500/30 text-red-400 rounded-xl hover:bg-red-600/25 font-bold text-xs transition-all active:scale-[0.98]"
                        >
                            Eliminar
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="relative overflow-hidden bg-zinc-900/30 backdrop-blur-md p-5 rounded-2xl border border-zinc-800/80 shadow-lg flex items-center justify-between group hover:border-[#0da67b]/25 transition-all">
                    <div>
                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Total Eventos</p>
                        <p className="text-3xl font-extrabold text-white mt-1.5 tracking-tight">{safeLogs.length}</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-cyan-900/20 text-cyan-400 border border-cyan-500/25 group-hover:scale-110 transition-transform">
                        <Activity size={20} className="animate-pulse" />
                    </div>
                </div>

                <div className="relative overflow-hidden bg-zinc-900/30 backdrop-blur-md p-5 rounded-2xl border border-zinc-800/80 shadow-lg flex items-center justify-between group hover:border-[#0da67b]/25 transition-all">
                    <div>
                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Última Actividad</p>
                        <p className="text-sm font-semibold text-zinc-200 mt-3 truncate max-w-[150px]">
                            {safeLogs.length > 0 ? new Date(safeLogs[0].fecha_hora).toLocaleDateString() : 'N/A'}
                        </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-emerald-900/20 text-[#0bbf8c] border border-[#0da67b]/20 group-hover:scale-110 transition-transform">
                        <Clock size={20} />
                    </div>
                </div>

                <div className="relative overflow-hidden bg-zinc-900/30 backdrop-blur-md p-5 rounded-2xl border border-zinc-800/80 shadow-lg flex items-center justify-between group hover:border-[#0da67b]/25 transition-all">
                    <div>
                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Logins Fallidos</p>
                        <p className="text-3xl font-extrabold text-red-400 mt-1.5 tracking-tight">
                            {typeof user?.failed_count === "number"
                                ? user.failed_count
                                : safeLogs.filter((l) => String(l?.evento || '').toLowerCase().includes('fallido') || l?.estado === 'danger').length}
                        </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-red-950/20 text-red-400 border border-red-500/25 group-hover:scale-110 transition-transform">
                        <Lock size={20} />
                    </div>
                </div>

                <div className="relative overflow-hidden bg-zinc-900/30 backdrop-blur-md p-5 rounded-2xl border border-zinc-800/80 shadow-lg flex items-center justify-between group hover:border-[#0da67b]/25 transition-all">
                    <div>
                        <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-widest">Estado de Cuenta</p>
                        <div className="mt-2.5">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold rounded-full border ${
                                user?.is_locked 
                                    ? "bg-red-950/45 border-red-500/35 text-red-300" 
                                    : user?.estado 
                                        ? "bg-emerald-950/45 border-[#0da67b]/35 text-[#0bbf8c]" 
                                        : "bg-zinc-800 border-zinc-700 text-zinc-400"
                            }`}>
                                <span className={`w-2 h-2 rounded-full ${user?.is_locked ? "bg-red-400 animate-pulse" : user?.estado ? "bg-[#0bbf8c] animate-pulse" : "bg-zinc-500"}`} />
                                {user?.is_locked ? "BLOQUEADO" : user?.estado ? "ACTIVO" : "INACTIVO"}
                            </span>
                        </div>
                    </div>
                    <div className="p-3.5 rounded-xl bg-zinc-950/50 border border-zinc-800 text-zinc-400">
                        <Shield size={20} />
                    </div>
                </div>
            </div>

            {/* Timeline / Logs */}
            <div className="relative overflow-hidden bg-zinc-900/30 backdrop-blur-md rounded-2xl border border-zinc-800/80 shadow-2xl p-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
                    <div className="flex items-center gap-2">
                        <Clock size={20} className="text-[#0da67b]" />
                        <div>
                            <h3 className="font-bold text-white text-lg">Historial de Auditoría</h3>
                            <p className="text-zinc-500 text-xs font-medium">Línea de tiempo de eventos y operaciones de seguridad</p>
                        </div>
                    </div>

                    {/* Filter controls */}
                    <div className="flex flex-wrap items-center gap-2.5">
                        {/* Search Input */}
                        <div className="relative">
                            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                            <input
                                type="text"
                                placeholder="Buscar eventos, detalles, IP..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-9 pr-4 py-2 text-xs rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-[#0da67b] focus:ring-1 focus:ring-[#0da67b]/30 w-full md:w-56 transition-all"
                            />
                        </div>

                        {/* Category Dropdown */}
                        <div className="relative flex items-center">
                            <Filter size={12} className="absolute left-3 text-zinc-500 pointer-events-none" />
                            <select
                                value={filterCategory}
                                onChange={(e) => setFilterCategory(e.target.value)}
                                className="pl-8 pr-7 py-2 text-xs rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 focus:outline-none focus:border-[#0da67b] transition-all cursor-pointer appearance-none font-medium"
                            >
                                <option value="all">Todos los Eventos</option>
                                <option value="logins">Accesos y Sesiones</option>
                                <option value="profile">Gestión de Perfil</option>
                                <option value="documents">Documentos / Firmas</option>
                                <option value="tickets">Tickets de Soporte</option>
                                <option value="danger">Alertas / Fallas</option>
                            </select>
                            <div className="absolute right-3 pointer-events-none border-l border-zinc-800 pl-1.5">
                                <svg className="w-3 h-3 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Timeline vertical diagram */}
                <div className="relative pl-4 sm:pl-8 py-2">
                    {/* Vertical connector line */}
                    {filteredLogs.length > 0 && (
                        <div className="absolute left-7 sm:left-11 top-4 bottom-4 w-[2px] bg-zinc-800" />
                    )}

                    <div className="space-y-6">
                        {filteredLogs.map((log) => {
                            // Determine semantic icon & color for the checkpoint
                            const eventName = String(log.evento || "").toLowerCase();
                            let IconComponent = Activity;
                            let colorClasses = "bg-zinc-800 text-zinc-400 border-zinc-700";
                            let glowShadow = "";

                            if (log.estado === "success") {
                                colorClasses = "bg-emerald-950/80 text-[#0bbf8c] border-[#0da67b]/30";
                                glowShadow = "shadow-lg shadow-[#0bbf8c]/10";
                            } else if (log.estado === "warning") {
                                colorClasses = "bg-amber-950/80 text-amber-400 border-amber-500/30";
                                glowShadow = "shadow-lg shadow-amber-500/10";
                            } else if (log.estado === "danger" || eventName.includes("fallido") || eventName.includes("error")) {
                                colorClasses = "bg-red-950/80 text-red-400 border-red-500/30";
                                glowShadow = "shadow-lg shadow-red-500/10";
                            }

                            if (eventName.includes("login") || eventName.includes("acceso") || eventName.includes("sesion") || eventName.includes("sesión")) {
                                IconComponent = Key;
                            } else if (eventName.includes("perfil") || eventName.includes("update") || eventName.includes("role") || eventName.includes("estado") || eventName.includes("usuario") || eventName.includes("clave")) {
                                IconComponent = UserCheck;
                            } else if (eventName.includes("ticket") || eventName.includes("soporte")) {
                                IconComponent = Tag;
                            } else if (eventName.includes("doc") || eventName.includes("archivo") || eventName.includes("firma")) {
                                IconComponent = FileText;
                            } else if (eventName.includes("eliminar") || eventName.includes("purge")) {
                                IconComponent = AlertTriangle;
                            }

                            return (
                                <div key={log.id} className="relative flex gap-6 sm:gap-8 items-start group">
                                    {/* Timeline dot */}
                                    <div className={`relative z-10 w-8 h-8 rounded-full border flex items-center justify-center shrink-0 transition-all group-hover:scale-110 ${colorClasses} ${glowShadow}`}>
                                        <IconComponent size={14} />
                                    </div>

                                    {/* Event Card */}
                                    <div className="flex-1 bg-zinc-950/30 backdrop-blur-sm border border-zinc-800 hover:border-[#0da67b]/25 rounded-2xl p-4.5 space-y-2.5 transition-all shadow-md">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-zinc-100 text-sm tracking-wide">{log.evento}</h4>
                                                <span className={`inline-flex px-2 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider ${
                                                    log.estado === 'success' ? 'bg-emerald-950/50 text-[#0bbf8c] border border-emerald-500/20' :
                                                    log.estado === 'warning' ? 'bg-amber-950/50 text-amber-400 border border-amber-500/20' :
                                                    log.estado === 'danger' ? 'bg-red-950/50 text-red-400 border border-red-500/20' :
                                                    'bg-zinc-800 text-zinc-400 border border-zinc-700'
                                                }`}>
                                                    {log.estado}
                                                </span>
                                            </div>

                                            {/* Date and Time badge */}
                                            <div className="flex items-center gap-1 text-[11px] text-zinc-500 font-mono">
                                                <Calendar size={11} />
                                                <span>{new Date(log.fecha_hora).toLocaleDateString()}</span>
                                                <span className="text-zinc-700 mx-0.5">•</span>
                                                <span>{new Date(log.fecha_hora).toLocaleTimeString()}</span>
                                            </div>
                                        </div>

                                        <p className="text-zinc-300 text-xs font-medium leading-relaxed">{log.detalles}</p>

                                        {/* IP credentials block */}
                                        {log.ip_address && (
                                            <div className="flex items-center gap-1.5 pt-1 text-[10px] font-mono text-zinc-500">
                                                <Database size={11} className="text-[#0da67b]" />
                                                <span>IP ORIGEN:</span>
                                                <span className="text-[#0bbf8c] font-semibold tracking-wider bg-[#042f36]/25 border border-[#0da67b]/15 px-1.5 py-0.5 rounded-md">{log.ip_address}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}

                        {filteredLogs.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-16 text-center space-y-3.5">
                                <div className="p-4 rounded-full bg-zinc-900 border border-zinc-800 text-zinc-600">
                                    <Shield size={32} />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold text-zinc-400">No se encontraron registros</p>
                                    <p className="text-xs text-zinc-600 max-w-xs mx-auto">
                                        No hay operaciones registradas que coincidan con la búsqueda o el filtro seleccionado.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

