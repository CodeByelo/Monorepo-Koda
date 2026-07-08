"use client";

import React, { useState, useEffect } from 'react';
import { getTenants, getPlans, createTenant, updateTenant } from '../lib/api';
import { uiAlert, uiConfirm, uiPrompt } from '../lib/ui-dialog';
import { Briefcase, Save, Plus, Edit2, Server } from 'lucide-react';

export default function TenantManager({ darkMode }: { darkMode: boolean }) {
    const [tenants, setTenants] = useState<any[]>([]);
    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        nombre: '',
        plan_id: '',
        is_active: true
    });

    const loadData = async () => {
        try {
            setLoading(true);
            const [tenantsRes, plansRes] = await Promise.all([
                getTenants(),
                getPlans()
            ]);
            setTenants(tenantsRes || []);
            setPlans(plansRes || []);
        } catch (error) {
            console.error("Error loading tenants and plans:", error);
            void uiAlert("Error al cargar la lista de empresas y planes", "Gestor de Empresas");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
    }, []);

    const handleOpenForm = (tenant?: any) => {
        if (tenant) {
            setEditingId(tenant.id);
            setFormData({
                nombre: tenant.nombre,
                plan_id: tenant.plan_id ? String(tenant.plan_id) : '',
                is_active: tenant.is_active !== undefined ? tenant.is_active : true
            });
        } else {
            setEditingId(null);
            setFormData({
                nombre: '',
                plan_id: plans.length > 0 ? String(plans[0].id) : '',
                is_active: true
            });
        }
        setIsFormOpen(true);
    };

    const handleSave = async () => {
        if (!formData.nombre) {
            void uiAlert("El nombre es requerido", "Validación");
            return;
        }

        try {
            const payload = {
                nombre: formData.nombre,
                plan_id: formData.plan_id ? parseInt(formData.plan_id) : null,
                is_active: formData.is_active
            };

            if (editingId) {
                await updateTenant(editingId, payload);
                void uiAlert("Empresa actualizada exitosamente", "Gestor de Empresas");
            } else {
                await createTenant(payload);
                void uiAlert("Empresa creada exitosamente", "Gestor de Empresas");
            }
            setIsFormOpen(false);
            await loadData();
        } catch (error: any) {
            console.error("Error saving tenant", error);
            void uiAlert(error?.message || "No se pudo guardar la empresa", "Gestor de Empresas");
        }
    };

    const getPlanName = (planId: number | null) => {
        if (!planId) return 'Personalizado (Legacy)';
        const p = plans.find(p => p.id === planId);
        return p ? p.name : 'Desconocido';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="w-8 h-8 border-4 border-[#0da67b] border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className={`p-6 rounded-2xl border ${darkMode ? 'bg-zinc-900/50 border-[#0da67b]/20' : 'bg-white border-[#0da67b]/15 shadow-xl'}`}>
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-[linear-gradient(135deg,#042f36_0%,#075159_58%,#0bbf8c_100%)] rounded-xl text-white shadow-lg shadow-[#075159]/25">
                            <Server size={24} />
                        </div>
                        <div>
                            <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>Gestor de Empresas (Tenants)</h2>
                            <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mt-1">Suscripciones y Clientes Multi-tenant</p>
                        </div>
                    </div>
                    <button
                        onClick={() => handleOpenForm()}
                        className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-bold text-sm transition-all transform active:scale-95 bg-[linear-gradient(120deg,#042f36_0%,#075159_58%,#0bbf8c_100%)] hover:brightness-110 text-white shadow-lg shadow-[#075159]/25`}
                    >
                        <Plus size={18} />
                        NUEVA EMPRESA
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className={`text-xs uppercase font-bold ${darkMode ? 'bg-zinc-800/50 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
                            <tr>
                                <th className="px-6 py-4">ID</th>
                                <th className="px-6 py-4">Empresa</th>
                                <th className="px-6 py-4">Plan</th>
                                <th className="px-6 py-4">Estado</th>
                                <th className="px-6 py-4 text-center">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className={`divide-y ${darkMode ? 'divide-zinc-800' : 'divide-slate-100'}`}>
                            {tenants.map(t => (
                                <tr key={t.id} className={`transition-colors ${darkMode ? 'hover:bg-zinc-800/30' : 'hover:bg-[#e7f9f3]/40'}`}>
                                    <td className="px-6 py-4 font-mono text-xs opacity-70">{t.id.substring(0, 8)}...</td>
                                    <td className="px-6 py-4 font-bold flex items-center gap-2">
                                        <Briefcase size={16} className="text-[#0da67b]" />
                                        {t.nombre}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${t.plan_id ? 'bg-[#042f36] text-[#0bbf8c]' : 'bg-slate-200 text-slate-600'}`}>
                                            {getPlanName(t.plan_id)}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        {t.is_active ? (
                                            <span className="text-xs font-bold text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded">Activo</span>
                                        ) : (
                                            <span className="text-xs font-bold text-red-500 bg-red-500/10 px-2 py-1 rounded">Inactivo</span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-center">
                                        <button
                                            onClick={() => handleOpenForm(t)}
                                            className="p-2 hover:bg-[#0da67b]/20 hover:text-[#0da67b] rounded-lg transition-colors inline-flex"
                                            title="Editar"
                                        >
                                            <Edit2 size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {tenants.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center text-slate-500 italic">No hay empresas registradas</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isFormOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
                    <div className={`w-full max-w-md rounded-2xl shadow-2xl border ${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-slate-200'}`}>
                        <div className={`p-6 border-b ${darkMode ? 'border-zinc-800' : 'border-slate-100'} flex justify-between items-center`}>
                            <h3 className={`font-bold text-lg ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                {editingId ? 'Editar Empresa' : 'Nueva Empresa'}
                            </h3>
                            <button onClick={() => setIsFormOpen(false)} className="p-2 hover:bg-slate-800 rounded-full transition-colors">X</button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className={`block text-xs font-bold uppercase mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Nombre de la Empresa</label>
                                <input
                                    type="text"
                                    value={formData.nombre}
                                    onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                                    className={`w-full px-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-[#0da67b]/30 outline-none transition-all ${darkMode ? 'bg-zinc-950 border-zinc-800 text-white focus:border-[#0da67b]' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-[#0da67b]'}`}
                                />
                            </div>
                            <div>
                                <label className={`block text-xs font-bold uppercase mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Plan de Suscripción</label>
                                <select
                                    value={formData.plan_id}
                                    onChange={(e) => setFormData({...formData, plan_id: e.target.value})}
                                    className={`w-full px-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-[#0da67b]/30 outline-none transition-all ${darkMode ? 'bg-zinc-950 border-zinc-800 text-white focus:border-[#0da67b]' : 'bg-slate-50 border-slate-200 text-slate-900 focus:border-[#0da67b]'}`}
                                >
                                    <option value="">Personalizado / Legacy</option>
                                    {plans.map((p) => (
                                        <option key={p.id} value={p.id}>{p.name} - Max {p.max_users} Usuarios</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex items-center gap-3 pt-2">
                                <input
                                    type="checkbox"
                                    id="is_active"
                                    checked={formData.is_active}
                                    onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                                    className="w-5 h-5 rounded text-[#0da67b] focus:ring-[#0da67b]"
                                />
                                <label htmlFor="is_active" className={`text-sm font-medium ${darkMode ? 'text-zinc-300' : 'text-slate-700'}`}>Empresa Activa</label>
                            </div>
                        </div>
                        <div className={`p-6 border-t flex justify-end gap-3 ${darkMode ? 'border-zinc-800' : 'border-slate-100'}`}>
                            <button
                                onClick={() => setIsFormOpen(false)}
                                className={`px-5 py-2.5 rounded-xl font-bold text-sm ${darkMode ? 'bg-zinc-800 text-white hover:bg-zinc-700' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}`}
                            >
                                CANCELAR
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-5 py-2.5 rounded-xl font-bold text-sm bg-[linear-gradient(120deg,#042f36_0%,#075159_55%,#0bbf8c_100%)] text-white hover:brightness-110 transition-all flex items-center gap-2 shadow-lg shadow-[#075159]/20"
                            >
                                <Save size={16} /> GUARDAR
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
