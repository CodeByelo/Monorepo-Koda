'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Paperclip, Send, X, Check, CheckCheck, MessageSquare, FileText } from 'lucide-react';
import { RoleGuard } from '../../../../components/RoleGuard';
import { useAuth } from '../../../../hooks/useAuth';
import { getDocumentos, markAsRead, uploadDocumento, createSecurityLog } from '../../../../lib/api';
import { uiAlert } from '../../../../lib/ui-dialog';

type Document = {
  id: number;
  idDoc?: string;
  name?: string;
  category?: string;
  uploadedBy?: string;
  receivedBy?: string;
  receptor_id?: string;
  receptor_gerencia_id?: number;
  receptor_gerencia_nombre?: string;
  remitente_id?: string;
  receptor_gerencia_id_usuario?: number;
  receptor_gerencia_nombre_usuario?: string;
  remitente_gerencia_id?: number;
  remitente_gerencia_nombre?: string;
  uploadDate?: string;
  uploadTime?: string;
  signatureStatus?: string;
  targetDepartment?: string;
  fileUrl?: string;
  archivos?: string[];
  contenido?: string;
  leido?: boolean;
};

const API_FALLBACK = '/api';
const BACKEND_BASE_URL = process.env.NEXT_PUBLIC_API_URL || API_FALLBACK;
const DASHBOARD_THEME_STORAGE_KEY = 'dashboard_theme_2026';

function extractBackendPath(value: string): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http')) {
    try {
      const u = new URL(raw);
      return String(u.pathname || '').replace(/^\//, '');
    } catch {
      return '';
    }
  }
  return raw.startsWith('/') ? raw.slice(1) : raw;
}

function isDirectlyOpenableUrl(value: string): boolean {
  const raw = String(value || '').trim();
  if (!raw.startsWith('http')) return false;
  if (raw.includes('/storage/v1/object/')) return true;
  return false;
}

function parseFlexibleDateGlobal(value?: string) {
  if (!value) return null;
  const raw = String(value).trim();
  const latin = raw.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (latin) {
    const [, dRaw, mRaw, y, hh = '00', mm = '00', ss = '00'] = latin;
    const d = dRaw.padStart(2, '0');
    const m = mRaw.padStart(2, '0');
    const date = new Date(`${y}-${m}-${d}T${hh.padStart(2, '0')}:${mm}:${ss}`);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getInitials(name: string): string {
  const clean = String(name || '').trim();
  if (!clean) return 'U';
  const parts = clean.split(' ').filter(Boolean);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

function MensajeriaChatClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [replyDraft, setReplyDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastMessageIdRef = useRef<number | null>(null);
  const initialLoadRef = useRef(true);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const conversationKey = searchParams.get('key') || '';
  const conversationLabel = searchParams.get('label') || 'Conversación';
  const docView = searchParams.get('view') || 'inbox';

  const currentUserId = user?.id ? String(user.id) : '';

  const openDocumento = useCallback(async (fileUrl: string) => {
    const raw = String(fileUrl || '').trim();
    if (!raw) return;
    if (typeof window === 'undefined') return;

    if (isDirectlyOpenableUrl(raw)) {
      window.open(raw, '_blank', 'noopener,noreferrer');
      return;
    }

    const token = localStorage.getItem('sgd_token');
    if (!token) {
      void uiAlert('Sesión no válida. Inicia sesión de nuevo.', 'Adjuntos');
      return;
    }

    const backendPath = extractBackendPath(raw);
    if (!backendPath) {
      void uiAlert('No se pudo interpretar la ruta del adjunto.', 'Adjuntos');
      return;
    }

    try {
      const base = BACKEND_BASE_URL.endsWith('/') ? BACKEND_BASE_URL.slice(0, -1) : BACKEND_BASE_URL;
      const res = await fetch(
        `${base}/documentos/archivo?path=${encodeURIComponent(backendPath)}&format=json`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: 'no-store',
        },
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `Error ${res.status}`);
      }
      const data = (await res.json()) as { url?: string };
      if (!data?.url) throw new Error('Respuesta inválida del servidor');
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      console.error('No se pudo abrir el documento:', error);
      void uiAlert('No se pudo abrir el documento. Intenta de nuevo.', 'Adjuntos');
    }
  }, []);

  const getDocTimestamp = useCallback((doc: Document) => {
    const combined = [doc.uploadDate, doc.uploadTime].filter(Boolean).join(' ');
    const parsed =
      parseFlexibleDateGlobal(combined) ||
      parseFlexibleDateGlobal(doc.uploadDate) ||
      null;
    return parsed ? parsed.getTime() : 0;
  }, []);

  const getConversationKey = useCallback(
    (doc: Document) => {
      const senderId = doc.remitente_id ? String(doc.remitente_id) : '';
      const receiverId = doc.receptor_id ? String(doc.receptor_id) : '';
      if (senderId && receiverId) {
        const otherId =
          senderId === currentUserId
            ? receiverId
            : receiverId === currentUserId
              ? senderId
              : receiverId;
        if (otherId) return `user:${otherId}`;
      }
      if (doc.receptor_gerencia_id) return `dept:${doc.receptor_gerencia_id}`;
      const deptName = String(doc.targetDepartment || '')
        .toLowerCase()
        .trim();
      return deptName ? `dept-name:${deptName}` : `misc:${doc.id}`;
    },
    [currentUserId],
  );

  const canMarkDocAsRead = useCallback(
    (doc: Document) => {
      const isDirectRecipient =
        !!doc.receptor_id && !!currentUserId && String(doc.receptor_id) === currentUserId;
      if (isDirectRecipient) return true;
      const isDeptRecipient =
        !!doc.receptor_gerencia_id &&
        !!user?.gerencia_id &&
        String(doc.receptor_gerencia_id) === String(user.gerencia_id);
      if (isDeptRecipient) return true;
      const docDept = String(doc.targetDepartment || '').toLowerCase().trim();
      const userDeptLower = String(user?.gerencia_depto || '').toLowerCase().trim();
      return !!docDept && !!userDeptLower && docDept === userDeptLower;
    },
    [currentUserId, user?.gerencia_depto, user?.gerencia_id],
  );

  const conversationDocs = useMemo(() => {
    if (!conversationKey) return [];
    return documents
      .filter((doc) => getConversationKey(doc) === conversationKey)
      .sort((a, b) => getDocTimestamp(a) - getDocTimestamp(b));
  }, [conversationKey, documents, getConversationKey, getDocTimestamp]);

  const getDeliveryInfo = useCallback((doc: Document) => {
    if (doc.receptor_id) {
      return { key: 'direct', label: 'Directo' };
    }
    if (doc.receptor_gerencia_id || doc.receptor_gerencia_nombre || doc.targetDepartment) {
      return { key: 'dept', label: 'Gerencia' };
    }
    return { key: 'unknown', label: 'Sin destino' };
  }, []);

  const getRecipientDisplay = useCallback((doc: Document) => {
    if (doc.receptor_id) {
      return doc.receivedBy !== 'Pendiente' ? doc.receivedBy : 'Usuario';
    }
    return (
      doc.receptor_gerencia_nombre ||
      doc.receptor_gerencia_nombre_usuario ||
      doc.targetDepartment ||
      'Gerencia'
    );
  }, []);

  const lastConversationDoc = conversationDocs.length > 0 ? conversationDocs[conversationDocs.length - 1] : null;

  const refreshDocuments = useCallback(async () => {
    try {
      const data = await getDocumentos();
      const mapped = data.map((d: any) => {
        let uploadDate = 'N/A';
        let uploadTime = 'N/A';
        if (d.fecha_creacion || d.uploadDate) {
          try {
            if (d.uploadDate) {
              uploadDate = d.uploadDate;
              uploadTime = d.uploadTime || 'N/A';
            } else {
              const date = new Date(d.fecha_creacion);
              if (!Number.isNaN(date.getTime())) {
                uploadDate = date.toLocaleDateString('es-ES');
                uploadTime = date.toLocaleTimeString('es-ES', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
              }
            }
          } catch {
            // ignore
          }
        }
        const signatureStatusValue =
          d.estado ?? d.signatureStatus ?? d.signaturestatus ?? d.status ?? 'en-proceso';
        const normalizedSignatureStatus = String(signatureStatusValue)
          .toLowerCase()
          .trim()
          .replaceAll('_', '-')
          .replaceAll(' ', '-');

        const baseUrl = BACKEND_BASE_URL;
        const normalizeUrl = (url?: string) => {
          if (!url) return undefined;
          if (url.startsWith('http')) return url;
          const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
          const path = url.startsWith('/') ? url : `/${url}`;
          return `${base}${path}`;
        };

        const rawCorrelativo =
          d.correlativo ??
          d.idDoc ??
          d.iddoc ??
          d.numero_documento ??
          d.numeroDocumento;
        const correlativoValue =
          rawCorrelativo !== null && rawCorrelativo !== undefined && String(rawCorrelativo).trim() !== ''
            ? String(rawCorrelativo).trim()
            : 'N/A';

        return {
          id: d.id,
          idDoc: correlativoValue,
          name: d.titulo || d.title || d.name || 'Sin Título',
          category: d.tipo_documento || d.category || 'Otros',
          uploadedBy: d.uploadedBy || d.remitente_nombre || 'Desconocido',
          receivedBy: d.receptor_nombre || d.receivedBy || 'Pendiente',
          receptor_id: d.receptor_id ? String(d.receptor_id) : undefined,
          receptor_gerencia_id: d.receptor_gerencia_id ? Number(d.receptor_gerencia_id) : undefined,
          remitente_id: d.remitente_id ? String(d.remitente_id) : undefined,
          receptor_gerencia_id_usuario: d.receptor_gerencia_id_usuario
            ? Number(d.receptor_gerencia_id_usuario)
            : undefined,
          receptor_gerencia_nombre_usuario: d.receptor_gerencia_nombre_usuario,
          remitente_gerencia_id: d.remitente_gerencia_id ? Number(d.remitente_gerencia_id) : undefined,
          remitente_gerencia_nombre: d.remitente_gerencia_nombre,
          uploadDate,
          uploadTime,
          signatureStatus: normalizedSignatureStatus,
          targetDepartment:
            d.targetDepartment ||
            d.receptor_gerencia_nombre ||
            d.receptor_gerencia_nombre_usuario ||
            'Sin Asignar',
          fileUrl: normalizeUrl(d.fileUrl) || (d.archivos && d.archivos.length > 0 ? normalizeUrl(d.archivos[0]) : undefined),
          archivos: (d.archivos || []).map((url: string) => normalizeUrl(url)).filter(Boolean) as string[],
          contenido: d.contenido,
          leido: d.leido,
        } satisfies Document;
      });
      setDocuments(mapped);
    } catch (error) {
      console.error('Error fetching documents', error);
    }
  }, []);

  useEffect(() => {
    void refreshDocuments();
  }, [refreshDocuments]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY);
    setDarkMode(stored ? stored === 'dark' : true);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleStorage = (event: StorageEvent) => {
      if (event.key === DASHBOARD_THEME_STORAGE_KEY) {
        setDarkMode(event.newValue ? event.newValue === 'dark' : true);
      }
    };
    const handleVisibility = () => {
      const stored = localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY);
      setDarkMode(stored ? stored === 'dark' : true);
    };
    window.addEventListener('storage', handleStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('storage', handleStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      void refreshDocuments();
    }, 15000);
    return () => clearInterval(interval);
  }, [refreshDocuments]);

  useEffect(() => {
    const unreadIds = conversationDocs
      .filter((doc) => !doc.leido && canMarkDocAsRead(doc))
      .map((doc) => doc.id);
    if (unreadIds.length === 0) return;
    setDocuments((prev) =>
      prev.map((d) =>
        unreadIds.includes(d.id)
          ? { ...d, leido: true, signatureStatus: d.signatureStatus === 'en-proceso' ? 'recibido' : d.signatureStatus }
          : d,
      ),
    );
    void Promise.allSettled(unreadIds.map((id) => markAsRead(id)));
  }, [canMarkDocAsRead, conversationDocs]);

  useEffect(() => {
    if (conversationDocs.length === 0) return;
    const last = conversationDocs[conversationDocs.length - 1];
    if (initialLoadRef.current) {
      lastMessageIdRef.current = last.id;
      initialLoadRef.current = false;
      return;
    }
    if (lastMessageIdRef.current !== last.id) {
      lastMessageIdRef.current = last.id;
      const isMine = currentUserId && last.remitente_id && String(last.remitente_id) === currentUserId;
    }
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationDocs, currentUserId]);

  const sendReply = async () => {
    const content = replyDraft.trim();
    if (!content && selectedFiles.length === 0) {
      void uiAlert('Escribe un mensaje antes de enviar.', 'Mensajería');
      return;
    }
    let recipientType: 'user' | 'dept' | 'dept-name' | null = null;
    let recipientValue = '';
    if (conversationKey.startsWith('user:')) {
      recipientType = 'user';
      recipientValue = conversationKey.slice(5);
    } else if (conversationKey.startsWith('dept:')) {
      recipientType = 'dept';
      recipientValue = conversationKey.slice(5);
    } else if (conversationKey.startsWith('dept-name:')) {
      recipientType = 'dept-name';
      recipientValue = conversationKey.slice(10);
    }
    if (!recipientType || !recipientValue) {
      void uiAlert('No se pudo determinar el destinatario de esta conversación.', 'Mensajería');
      return;
    }
    try {
      setSending(true);
      const formData = new FormData();
      formData.append('titulo', `Respuesta - ${conversationLabel}`.trim());
      formData.append('tipo_documento', 'Mensaje');
      formData.append('prioridad', 'media');
      if (content) formData.append('contenido', content);
      if (selectedFiles.length > 0) {
        selectedFiles.forEach((file) => formData.append('archivos', file));
      }
      if (recipientType === 'user') {
        formData.append('receptor_id', recipientValue);
      } else if (recipientType === 'dept') {
        formData.append('receptor_gerencia_id', recipientValue);
      } else {
        formData.append('receptor_gerencia_nombre', recipientValue);
      }
      await uploadDocumento(formData);
      await refreshDocuments();
      setReplyDraft('');
      setSelectedFiles([]);
    } catch (error) {
      console.error('Error sending reply:', error);
      void uiAlert('No se pudo enviar el mensaje.', 'Mensajería');
    } finally {
      setSending(false);
    }
  };

  return (
    <RoleGuard
      allowedRoles={['CEO', 'Administrador', 'Usuario', 'Desarrollador', 'Gerente']}
      redirectTo="/login"
    >
      <div className={`min-h-screen relative overflow-hidden ${darkMode ? 'bg-zinc-950 text-zinc-100' : 'bg-slate-50 text-slate-900'}`}>
        {/* Glow Spheres */}
        {darkMode && (
          <>
            <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-emerald-500/5 blur-[120px] pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-teal-500/5 blur-[120px] pointer-events-none" />
          </>
        )}

        <div className="max-w-5xl w-full mx-auto px-4 py-6 space-y-6 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <button
                onClick={() => router.push('/dashboard?tab=documentos')}
                className={`group flex items-center justify-center w-10 h-10 rounded-xl border transition-all duration-300 ${
                  darkMode
                    ? 'border-zinc-800 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 hover:text-white shadow-md'
                    : 'border-slate-250 bg-white text-slate-700 hover:bg-slate-100'
                }`}
                title="Volver"
              >
                <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
              </button>
              <div>
                <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-zinc-100 to-zinc-400 bg-clip-text text-transparent">Mensajería Interna</h1>
                <p className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-slate-600'}`}>
                  Comunicación corporativa • {docView === 'sent' ? 'Enviados' : 'Bandeja de Entrada'}
                </p>
              </div>
            </div>
          </div>

          <div
            className={`rounded-2xl border overflow-hidden flex flex-col w-full min-h-[620px] h-[calc(100vh-200px)] transition-all duration-300 ${
              darkMode ? 'border-zinc-800 bg-zinc-900/30 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.35)]' : 'border-slate-200 bg-white'
            }`}
          >
            {/* Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between transition-all duration-300 ${
              darkMode ? 'border-zinc-800 bg-zinc-950/40 backdrop-blur-md' : 'border-slate-200 bg-slate-50'
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-[0_4px_12px_rgba(16,185,129,0.25)]">
                  {getInitials(conversationLabel)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className={`text-base font-bold tracking-tight ${darkMode ? 'text-zinc-100' : 'text-slate-900'}`}>
                      {conversationLabel}
                    </h2>
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  </div>
                  <p className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-slate-600'}`}>
                    {conversationDocs.length} comunicado(s) en este canal
                  </p>
                </div>
              </div>

              {lastConversationDoc && (
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                    getDeliveryInfo(lastConversationDoc).key === 'direct'
                      ? darkMode
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.05)]'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : darkMode
                        ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20 shadow-[0_0_15px_rgba(34,211,238,0.05)]'
                        : 'bg-cyan-50 text-cyan-700 border-cyan-200'
                  }`}>
                    {getDeliveryInfo(lastConversationDoc).label}
                  </span>
                </div>
              )}
            </div>

            {/* List */}
            <div className={`flex-1 p-6 space-y-5 overflow-y-auto no-scrollbar transition-all duration-300 ${darkMode ? 'bg-zinc-950/10' : 'bg-slate-50/50'}`}>
              {conversationDocs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
                  <div className={`p-4 rounded-full ${darkMode ? 'bg-zinc-900/60' : 'bg-slate-100'}`}>
                    <MessageSquare size={32} className="text-emerald-500" />
                  </div>
                  <div className={`text-sm italic ${darkMode ? 'text-zinc-500' : 'text-slate-400'}`}>
                    No hay mensajes en esta conversación.
                  </div>
                </div>
              )}
              {conversationDocs.map((msg) => {
                const isMine = currentUserId && msg.remitente_id && String(msg.remitente_id) === currentUserId;
                const senderName = msg.uploadedBy || 'Desconocido';
                return (
                  <div key={msg.id} className={`flex items-start gap-3.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 shadow-sm transition-transform ${
                      isMine
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : darkMode
                          ? 'bg-zinc-800 text-zinc-400 border border-zinc-700/60'
                          : 'bg-slate-200 text-slate-600'
                    }`}>
                      {getInitials(senderName)}
                    </div>

                    {/* Bubble Container */}
                    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[75%]`}>
                      {/* Name & Time */}
                      <span className={`text-[10px] font-medium mb-1 px-1 ${darkMode ? 'text-zinc-500' : 'text-slate-500'}`}>
                        {senderName} • {msg.uploadDate} {msg.uploadTime}
                      </span>

                      {/* Bubble */}
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm transition-all duration-300 ${
                          isMine
                            ? darkMode
                              ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-tr-none shadow-[0_4px_15px_rgba(16,185,129,0.15)]'
                              : 'bg-emerald-500 text-white rounded-tr-none'
                            : darkMode
                              ? 'bg-zinc-900/60 border border-zinc-800/80 text-zinc-100 rounded-tl-none backdrop-blur-sm shadow-[0_4px_12px_rgba(0,0,0,0.1)]'
                              : 'bg-white text-slate-700 border border-slate-200 rounded-tl-none'
                        }`}
                      >
                        {msg.contenido ? (
                          <div className="font-normal">{msg.contenido}</div>
                        ) : (
                          <div className="italic opacity-75">Mensaje sin contenido de texto.</div>
                        )}

                        {/* Attachments */}
                        {(msg.fileUrl || (msg.archivos || []).length > 0) && (
                          <div className={`flex flex-wrap gap-2 mt-3 pt-2.5 border-t ${isMine ? 'border-white/10' : 'border-zinc-800/60'}`}>
                            {msg.fileUrl && !((msg.archivos || []).includes(msg.fileUrl)) && (
                              <button
                                type="button"
                                onClick={() => {
                                  void createSecurityLog({
                                    evento: 'DOCUMENTO_DESCARGA',
                                    detalles: JSON.stringify({
                                      action: 'DOWNLOAD_PRIMARY',
                                      documento_id: msg.id,
                                    }),
                                    estado: 'info',
                                    page: '/dashboard/documentos/chat',
                                  });
                                  void openDocumento(msg.fileUrl || '');
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 border ${
                                  isMine
                                    ? 'border-white/30 text-white hover:bg-white/10'
                                    : darkMode
                                      ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-800/50'
                                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <FileText size={12} />
                                Documento principal
                              </button>
                            )}
                            {(msg.archivos || []).map((file: string, idx: number) => (
                              <button
                                type="button"
                                key={`${file}-${idx}`}
                                onClick={() => {
                                  void createSecurityLog({
                                    evento: 'DOCUMENTO_DESCARGA',
                                    detalles: JSON.stringify({
                                      action: 'DOWNLOAD_ATTACHMENT',
                                      documento_id: msg.id,
                                      index: idx + 1,
                                    }),
                                    estado: 'info',
                                    page: '/dashboard/documentos/chat',
                                  });
                                  void openDocumento(file);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 border ${
                                  isMine
                                    ? 'border-white/30 text-white hover:bg-white/10'
                                    : darkMode
                                      ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-800/50'
                                      : 'border-slate-300 text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <FileText size={12} />
                                Adjunto {idx + 1}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={listEndRef} />
            </div>

            {/* Input Footer */}
            <div
              className={`px-6 py-4 border-t transition-all duration-300 ${
                darkMode ? 'border-zinc-800 bg-zinc-950/40 backdrop-blur-md' : 'border-slate-200 bg-white'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept=".pdf"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length === 0) return;
                  setSelectedFiles((prev) => [...prev, ...files]);
                  e.currentTarget.value = '';
                }}
              />
              
              {selectedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {selectedFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs border font-medium transition-all duration-300 shadow-sm ${
                        darkMode ? 'border-zinc-750 bg-zinc-900 text-zinc-200' : 'border-slate-300 bg-slate-100 text-slate-700'
                      }`}
                    >
                      <span className="max-w-[220px] truncate">{file.name}</span>
                      <button
                        onClick={() => setSelectedFiles((prev) => prev.filter((_, i) => i !== idx))}
                        className="opacity-70 hover:opacity-100 text-zinc-500 hover:text-zinc-300"
                        title="Quitar archivo"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3 relative group">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-11 h-11 rounded-xl border flex items-center justify-center transition-all duration-300 shadow-sm ${
                    darkMode
                      ? 'border-zinc-850 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white'
                      : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                  title="Adjuntar PDF"
                >
                  <Paperclip size={18} />
                </button>
                <div className="flex-1 relative">
                  <div className="absolute -inset-0.5 rounded-2xl bg-emerald-500/10 opacity-0 group-focus-within:opacity-100 transition duration-300 blur-sm pointer-events-none" />
                  <textarea
                    rows={1}
                    value={replyDraft}
                    onChange={(e) => setReplyDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        void sendReply();
                      }
                    }}
                    placeholder="Escribe tu respuesta..."
                    className={`relative w-full rounded-2xl px-4 h-11 leading-6 py-2.5 text-sm outline-none resize-none transition-all duration-300 ${
                      darkMode 
                        ? 'bg-zinc-950 border border-zinc-800 text-zinc-100 focus:border-emerald-500' 
                        : 'bg-white border border-slate-300 text-slate-800 focus:border-emerald-500'
                    }`}
                  />
                </div>
                <button
                  onClick={() => void sendReply()}
                  disabled={sending || (!replyDraft.trim() && selectedFiles.length === 0)}
                  className={`w-11 h-11 rounded-xl flex items-center justify-center text-white transition-all duration-300 shadow-md ${
                    sending 
                      ? 'bg-emerald-400' 
                      : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 shadow-[0_4px_12px_rgba(16,185,129,0.2)]'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title="Enviar"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </RoleGuard>
  );
}

export default function MensajeriaChatPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <MensajeriaChatClient />
    </Suspense>
  );
}
