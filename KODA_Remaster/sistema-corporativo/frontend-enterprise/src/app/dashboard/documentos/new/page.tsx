'use client';

import React, { useEffect, useMemo, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Mail, Save, Search, X, Check, FileText, Paperclip, Users, Building, Shield, AlertCircle } from 'lucide-react';
import { getAllUsers, getGerencias, uploadDocumento } from '../../../../lib/api';
import { RoleGuard } from '../../../../components/RoleGuard';
import { uiAlert } from '../../../../lib/ui-dialog';

type SendMode = 'user' | 'dept';

export default function NewDocumentoPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [darkMode, setDarkMode] = useState(true);
  const [loading, setLoading] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [gerencias, setGerencias] = useState<any[]>([]);
  const [sendMode, setSendMode] = useState<SendMode>('user');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [docName, setDocName] = useState('');
  const [docCategory, setDocCategory] = useState('Informe');
  const [correlativo, setCorrelativo] = useState('');
  const [messageContent, setMessageContent] = useState('');
  const [priorityEnabled, setPriorityEnabled] = useState(false);
  const [priorityDays, setPriorityDays] = useState(3);
  const [targetUserIds, setTargetUserIds] = useState<string[]>([]);
  const [targetDeptIds, setTargetDeptIds] = useState<string[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');

  useEffect(() => {
    getAllUsers(50, 0)
      .then((response) => setUsers(Array.isArray(response?.data) ? response.data : []))
      .catch((err) => {
        console.error('Error cargando usuarios:', err);
        setUsers([]);
      });

    getGerencias(50, 0)
      .then((response) => setGerencias(Array.isArray(response?.data) ? response.data : []))
      .catch((err) => {
        console.error('Error cargando gerencias:', err);
        setGerencias([]);
      });
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const storedTheme = localStorage.getItem('dashboard_theme_2026');
      setDarkMode(storedTheme !== 'light');
    } catch (error) {
      console.error('No se pudo leer el tema del dashboard:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const userOptions = useMemo(
    () =>
      users
        .map((u) => ({
          id: String(u?.id || ''),
          label: `${u?.nombre || ''} ${u?.apellido || ''} (${u?.usuario_corp || u?.username || 'usuario'})`.trim(),
        }))
        .filter((x) => x.id),
    [users],
  );

  const deptOptions = useMemo(
    () =>
      (() => {
        const normalize = (value: string) =>
          value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .trim();
        const map = new Map<string, { id: string; nombre: string }>();
        gerencias.forEach((g) => {
          const id = String(g?.id || '');
          const nombre = String(g?.nombre || '').trim();
          if (!id || !nombre) return;
          const key = normalize(nombre);
          if (!map.has(key)) map.set(key, { id, nombre });
        });
        return Array.from(map.values());
      })(),
    [gerencias],
  );

  const filteredUserOptions = useMemo(() => {
    const query = recipientSearch.trim().toLowerCase();
    if (!query) return userOptions;
    return userOptions.filter((item) => item.label.toLowerCase().includes(query));
  }, [recipientSearch, userOptions]);

  const filteredDeptOptions = useMemo(() => {
    const query = recipientSearch.trim().toLowerCase();
    if (!query) return deptOptions;
    return deptOptions.filter((item) => item.nombre.toLowerCase().includes(query));
  }, [recipientSearch, deptOptions]);

  const toggleUser = (id: string) => {
    setTargetUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleDept = (id: string) => {
    setTargetDeptIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      void uiAlert('Solo se permiten archivos PDF.', 'Adjuntos');
      return;
    }
    setSelectedFiles((prev) => [...prev, file]);
    if (!docName) setDocName(file.name.replace(/\.[^/.]+$/, ""));
    e.target.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const recipients = sendMode === 'dept' ? targetDeptIds : targetUserIds;
    if (recipients.length === 0) {
      void uiAlert('Selecciona al menos un destinatario.', 'Mensajería');
      return;
    }

    setLoading(true);
    try {
      const priorityValue = priorityEnabled ? 'control' : 'media';
      const manualId = correlativo.trim();
      const uploads = recipients.map((recipient) => {
        const formData = new FormData();
        formData.append('titulo', docName || 'Mensaje sin asunto');
        formData.append('tipo_documento', docCategory);
        formData.append('prioridad', priorityValue);
        formData.append('contenido', messageContent);

        if (manualId) formData.append('correlativo', manualId);
        if (priorityEnabled && priorityDays > 0) {
          formData.append('tiempo_maximo_dias', String(priorityDays));
        }

        if (sendMode === 'dept') {
          formData.append('receptor_gerencia_id', recipient);
        } else {
          formData.append('receptor_id', recipient);
        }

        selectedFiles.forEach((f) => formData.append('archivos', f));
        return uploadDocumento(formData);
      });

      await Promise.all(uploads);
      void uiAlert('Mensaje enviado correctamente.', 'Mensajería');
      router.push('/dashboard?tab=documentos');
    } catch (error) {
      console.error('Error enviando documento:', error);
      void uiAlert('No se pudo enviar el mensaje.', 'Mensajería');
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    const cleanName = name.split('(')[0].trim();
    const parts = cleanName.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return (parts[0]?.[0] || 'U').toUpperCase();
  };

  const getUserRoleLabel = (label: string) => {
    const match = label.match(/\(([^)]+)\)/);
    if (match) {
      const username = match[1].toLowerCase();
      if (username.includes('admin')) return 'Administrador';
      if (username.includes('ceo')) return 'Dirección Ejecutiva';
      if (username.includes('gerente') || username.includes('gerencia')) return 'Gerente';
      if (username.includes('sis') || username.includes('sistemas')) return 'Tecnología';
      return 'Funcionario';
    }
    return 'Funcionario';
  };

  return (
    <RoleGuard allowedRoles={['CEO', 'Administrador', 'Usuario', 'Desarrollador', 'Gerente']} redirectTo="/login">
      <div className={`relative min-h-screen p-6 md:p-10 transition-colors duration-300 ${darkMode ? 'bg-zinc-950 text-zinc-100' : 'bg-slate-50 text-slate-900'}`}>
        {/* Glow Effects behind form */}
        {darkMode && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            <div className="absolute top-[10%] left-[20%] w-[50vw] h-[50vh] bg-emerald-500/5 rounded-full blur-[120px] pointer-events-none" />
            <div className="absolute bottom-[20%] right-[10%] w-[45vw] h-[45vh] bg-teal-500/5 rounded-full blur-[100px] pointer-events-none" />
          </div>
        )}

        <div className="max-w-4xl mx-auto space-y-6 relative z-10">
          {/* Header */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => router.push('/dashboard?tab=documentos')}
              className={`group inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                darkMode
                  ? 'border-zinc-800 bg-zinc-900/40 hover:bg-zinc-800/80 text-zinc-300 hover:text-white'
                  : 'border-slate-200 bg-white hover:bg-slate-100 text-slate-700'
              }`}
            >
              <ArrowLeft size={16} className="group-hover:-translate-x-1 transition-transform duration-300" />
              Volver
            </button>
            <div className="text-right">
              <h1 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-2 justify-end">
                <Mail size={22} className="text-emerald-400" />
                Nuevo Documento Interno
              </h1>
              <p className={`text-xs ${darkMode ? 'text-zinc-500' : 'text-slate-500'}`}>
                Crea y distribuye comunicados en la red corporativa
              </p>
            </div>
          </div>

          {/* Form wrapper with glassmorphism */}
          <form
            onSubmit={handleSubmit}
            className={`rounded-3xl border p-6 md:p-8 space-y-6 shadow-2xl transition-all duration-300 ${
              darkMode
                ? 'border-zinc-800/80 bg-zinc-900/40 backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.35)]'
                : 'border-slate-200 bg-white shadow-xl'
            }`}
          >
            {/* Send Mode Selectors */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-emerald-400/90">
                Canal de Envío
              </label>
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 p-1.5 rounded-2xl transition-all duration-300 ${darkMode ? 'bg-zinc-950/60 border border-zinc-800/60' : 'bg-slate-100 border border-slate-200'}`}>
                <button
                  type="button"
                  onClick={() => {
                    setSendMode('user');
                    setRecipientSearch('');
                  }}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                    sendMode === 'user'
                      ? darkMode
                        ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                        : 'bg-emerald-50 border border-emerald-300 text-emerald-600 shadow-[0_4px_12px_rgba(16,185,129,0.05)]'
                      : darkMode
                        ? 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
                        : 'border border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                  }`}
                >
                  <Users size={16} />
                  A Usuario Directo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSendMode('dept');
                    setRecipientSearch('');
                  }}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
                    sendMode === 'dept'
                      ? darkMode
                        ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                        : 'bg-emerald-50 border border-emerald-300 text-emerald-600 shadow-[0_4px_12px_rgba(16,185,129,0.05)]'
                      : darkMode
                        ? 'border border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
                        : 'border border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
                  }`}
                >
                  <Building size={16} />
                  A Gerencia / Departamento
                </button>
              </div>
            </div>

            {/* Fields Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">Asunto</label>
                <div className="relative group">
                  <div className="absolute -inset-0.5 rounded-xl bg-emerald-500/10 opacity-0 group-focus-within:opacity-100 transition duration-300 blur-sm pointer-events-none" />
                  <input
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    required
                    placeholder="ej: Solicitud de Mantenimiento de Servidores"
                    className={`relative w-full px-4 py-3 rounded-xl border text-sm transition-all duration-300 outline-none placeholder:text-slate-400 dark:placeholder:text-zinc-650 ${
                      darkMode
                        ? 'bg-zinc-950/70 border-zinc-800 text-zinc-100 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
                        : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20'
                    }`}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">Formato de documento</label>
                <div className="relative group">
                  <div className="absolute -inset-0.5 rounded-xl bg-emerald-500/10 opacity-0 group-focus-within:opacity-100 transition duration-300 blur-sm pointer-events-none" />
                  <select
                    value={docCategory}
                    onChange={(e) => setDocCategory(e.target.value)}
                    className={`relative w-full px-4 py-3 rounded-xl border text-sm transition-all duration-300 outline-none appearance-none ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
                        : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20'
                    }`}
                  >
                    <option>Informe</option>
                    <option>Memorando</option>
                    <option>Circular</option>
                    <option>Solicitud</option>
                    <option>Otros</option>
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">Correlativo (manual)</label>
                <div className="relative group">
                  <div className="absolute -inset-0.5 rounded-xl bg-emerald-500/10 opacity-0 group-focus-within:opacity-100 transition duration-300 blur-sm pointer-events-none" />
                  <input
                    value={correlativo}
                    onChange={(e) => setCorrelativo(e.target.value)}
                    placeholder="ej: KODA-2026-0041 (Opcional)"
                    className={`relative w-full px-4 py-3 rounded-xl border text-sm transition-all duration-300 outline-none placeholder:text-slate-400 dark:placeholder:text-zinc-650 ${
                      darkMode
                        ? 'bg-zinc-950/70 border-zinc-800 text-zinc-100 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
                        : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20'
                    }`}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">Adjunto PDF</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`group w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed transition-all duration-300 text-sm font-semibold ${
                    darkMode
                      ? 'border-zinc-700 bg-zinc-950/40 text-zinc-300 hover:bg-zinc-800/40 hover:border-emerald-500/50 hover:text-emerald-400'
                      : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 hover:border-emerald-500/50 hover:text-emerald-600'
                  }`}
                >
                  <Paperclip size={16} className="group-hover:rotate-12 transition-transform duration-300" />
                  Adjuntar Archivo de Soporte (PDF)
                </button>
              </div>
            </div>

            {/* Selected Files Grid */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">Archivos Adjuntos</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {selectedFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-300 ${
                        darkMode
                          ? 'bg-zinc-950/80 border-zinc-800/80 hover:border-zinc-700'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2.5 rounded-xl shrink-0 ${darkMode ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>
                          <FileText size={18} />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate pr-2" title={file.name}>{file.name}</div>
                          <div className={`text-[10px] ${darkMode ? 'text-zinc-500' : 'text-slate-500'}`}>{(file.size / 1024 / 1024).toFixed(2)} MB</div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className={`p-1.5 rounded-lg shrink-0 transition-colors ${darkMode ? 'text-zinc-500 hover:text-red-400 hover:bg-zinc-900' : 'text-slate-400 hover:text-red-500 hover:bg-slate-100'}`}
                        title="Quitar adjunto"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tracking Settings */}
            <div className={`rounded-2xl border p-4 transition-all duration-500 ${
              priorityEnabled
                ? darkMode
                  ? 'border-emerald-500/30 bg-emerald-950/5 shadow-[0_0_15px_rgba(16,185,129,0.02)]'
                  : 'border-emerald-300 bg-emerald-50/25 shadow-[0_0_15px_rgba(16,185,129,0.02)]'
                : darkMode
                  ? 'border-zinc-800 bg-zinc-950/20'
                  : 'border-slate-150 bg-slate-50/50'
            }`}>
              <label className="inline-flex items-center gap-3 text-sm font-semibold cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={priorityEnabled}
                  onChange={(e) => setPriorityEnabled(e.target.checked)}
                  className={`w-5 h-5 rounded border transition-all ${
                    darkMode
                      ? 'bg-zinc-950 border-zinc-700 text-emerald-500 focus:ring-offset-zinc-900 focus:ring-emerald-500'
                      : 'border-slate-300 text-emerald-600 focus:ring-emerald-500'
                  }`}
                />
                <span className="flex items-center gap-1.5 text-slate-700 dark:text-zinc-200">
                  <Shield size={16} className={priorityEnabled ? 'text-emerald-400 animate-pulse' : 'text-zinc-400'} />
                  Control de seguimiento (Alta prioridad)
                </span>
              </label>

              {priorityEnabled && (
                <div className="mt-4 animate-fadeIn">
                  <label className="block mb-1 text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">Tiempo límite de respuesta (días)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={1}
                      value={priorityDays}
                      onChange={(e) => setPriorityDays(Math.max(1, Number(e.target.value || 1)))}
                      className={`w-32 px-3 py-2 rounded-xl border text-sm outline-none transition-all ${
                        darkMode ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-emerald-500' : 'bg-white border-slate-300 text-slate-900 focus:border-emerald-500'
                      }`}
                    />
                    <span className="text-xs text-slate-500 dark:text-zinc-450">Se enviará una alerta automática si el trámite excede este plazo.</span>
                  </div>
                </div>
              )}
            </div>

            {/* Recipient Selection Section */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">
                  {sendMode === 'user' ? 'Destinatarios (usuarios)' : 'Destinatarios (gerencias)'}
                </label>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-450 dark:text-emerald-400 uppercase tracking-widest">
                  {(sendMode === 'user' ? targetUserIds : targetDeptIds).length} Seleccionado(s)
                </span>
              </div>

              {/* Selected tags */}
              {((sendMode === 'user' ? targetUserIds : targetDeptIds).length > 0) && (
                <div className="flex flex-wrap gap-1.5 p-2 rounded-xl bg-zinc-950/40 border border-zinc-800/40 min-h-[42px] max-h-36 overflow-y-auto">
                  {(sendMode === 'user' ? targetUserIds : targetDeptIds).map((id) => {
                    if (sendMode === 'user') {
                      const option = userOptions.find(x => x.id === id);
                      if (!option) return null;
                      return (
                        <div
                          key={id}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                            darkMode
                              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          }`}
                        >
                          <span>{option.label.split('(')[0].trim()}</span>
                          <button
                            type="button"
                            onClick={() => toggleUser(id)}
                            className="opacity-70 hover:opacity-100 hover:text-red-400 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    } else {
                      const option = deptOptions.find(x => x.id === id);
                      if (!option) return null;
                      return (
                        <div
                          key={id}
                          className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                            darkMode
                              ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-400'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          }`}
                        >
                          <span>{option.nombre}</span>
                          <button
                            type="button"
                            onClick={() => toggleDept(id)}
                            className="opacity-70 hover:opacity-100 hover:text-red-400 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    }
                  })}
                </div>
              )}

              {/* Search input */}
              <div className="relative group">
                <div className="absolute -inset-0.5 rounded-xl bg-emerald-500/10 opacity-0 group-focus-within:opacity-100 transition duration-300 blur-sm pointer-events-none" />
                <Search size={16} className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300 ${
                  darkMode ? 'text-zinc-500 group-focus-within:text-emerald-400' : 'text-slate-400 group-focus-within:text-emerald-600'
                }`} />
                <input
                  value={recipientSearch}
                  onChange={(e) => setRecipientSearch(e.target.value)}
                  placeholder={sendMode === 'user' ? 'Buscar usuario por nombre o apellido...' : 'Buscar gerencia por nombre...'}
                  className={`relative w-full pl-11 pr-4 py-3 rounded-xl border text-sm outline-none transition-all placeholder:text-slate-400 dark:placeholder:text-zinc-650 ${
                    darkMode
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20'
                  }`}
                />
              </div>

              {/* List container */}
              <div className={`max-h-60 overflow-y-auto rounded-2xl border p-3.5 space-y-2 no-scrollbar ${
                darkMode ? 'border-zinc-800/85 bg-zinc-950/60' : 'border-slate-200 bg-slate-50'
              }`}>
                {(sendMode === 'user' ? filteredUserOptions : filteredDeptOptions).map((item: any) => {
                  const isSelected = sendMode === 'user' ? targetUserIds.includes(item.id) : targetDeptIds.includes(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => (sendMode === 'user' ? toggleUser(item.id) : toggleDept(item.id))}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer select-none transition-all duration-300 ${
                        isSelected
                          ? darkMode
                            ? 'bg-emerald-950/20 border-emerald-500/40 shadow-[0_0_15px_rgba(16,185,129,0.06)]'
                            : 'bg-emerald-50 border-emerald-500 text-emerald-900'
                          : darkMode
                            ? 'bg-zinc-900/30 border-zinc-800/60 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900/60'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 shadow-inner ${
                          isSelected
                            ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_4px_12px_rgba(16,185,129,0.25)]'
                            : darkMode
                              ? 'bg-zinc-800 text-zinc-400'
                              : 'bg-slate-250 text-slate-500'
                        }`}>
                          {getInitials(item.label || item.nombre)}
                        </div>
                        <div>
                          <div className={`font-semibold text-sm transition-colors ${
                            isSelected 
                              ? (darkMode ? 'text-white' : 'text-emerald-950') 
                              : (darkMode ? 'text-zinc-200' : 'text-slate-700')
                          }`}>
                            {sendMode === 'user' ? item.label.split('(')[0].trim() : item.nombre}
                          </div>
                          {sendMode === 'user' && (
                            <div className={`text-[9px] uppercase font-bold tracking-widest ${
                              isSelected 
                                ? (darkMode ? 'text-emerald-400' : 'text-emerald-600') 
                                : (darkMode ? 'text-zinc-500' : 'text-slate-400')
                            }`}>
                              {getUserRoleLabel(item.label)}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${
                        isSelected
                          ? 'bg-emerald-500 border-emerald-500 text-white shadow-[0_0_8px_rgba(16,185,129,0.4)]'
                          : darkMode
                            ? 'border-zinc-700 bg-zinc-950'
                            : 'border-slate-300 bg-slate-50'
                      }`}>
                        {isSelected && <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                    </div>
                  );
                })}

                {(sendMode === 'user' ? filteredUserOptions : filteredDeptOptions).length === 0 && (
                  <div className={`py-6 text-center text-sm italic flex flex-col items-center justify-center gap-1.5 ${darkMode ? 'text-zinc-500' : 'text-slate-500'}`}>
                    <AlertCircle size={20} className="opacity-60" />
                    <span>No se encontraron destinatarios que coincidan.</span>
                  </div>
                )}
              </div>
            </div>

            {/* Content Textarea */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-zinc-400">Mensaje / Contenido</label>
              <div className="relative group">
                <div className="absolute -inset-0.5 rounded-2xl bg-emerald-500/10 opacity-0 group-focus-within:opacity-100 transition duration-300 blur-sm pointer-events-none" />
                <textarea
                  rows={6}
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="Escribe el cuerpo del comunicado, informe o mensaje a transmitir..."
                  className={`relative w-full px-4 py-3 rounded-2xl border text-sm transition-all duration-300 outline-none resize-none placeholder:text-slate-400 dark:placeholder:text-zinc-650 ${
                    darkMode
                      ? 'bg-zinc-950/70 border-zinc-800 text-zinc-100 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/20'
                  }`}
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-3 border-t border-zinc-800/40">
              <button
                type="button"
                onClick={() => router.push('/dashboard?tab=documentos')}
                className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all duration-300 ${
                  darkMode
                    ? 'bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    : 'bg-white border border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="group inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 border border-emerald-400/20 text-white font-bold text-sm shadow-[0_0_20px_rgba(11,191,140,0.18)] hover:shadow-[0_0_25px_rgba(11,191,140,0.35)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 hover:scale-[1.01]"
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" />
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                    <span className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                    <span>Enviando...</span>
                  </span>
                ) : (
                  <>
                    <Save size={16} className="group-hover:scale-110 transition-transform duration-300" />
                    Guardar y Enviar
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </RoleGuard>
  );
}
