"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Activity, ArrowLeft, FileText, Paperclip, Send } from "lucide-react";
import { RoleGuard } from "../../../../components/RoleGuard";
import { useAuth } from "../../../../hooks/useAuth";
import {
  ApiDocumentoEvento,
  ApiDocumentoRespuesta,
  createSecurityLog,
  getDocumentoEventos,
  getDocumentoRespuestas,
  getDocumentos,
  respondDocumento,
  updateDocumentStatus,
} from "../../../../lib/api";
import { uiAlert, uiPrompt } from "../../../../lib/ui-dialog";

type TrackingDocument = {
  id: string | number;
  title: string;
  correlativo: string;
  sentBy: string;
  receivedBy: string;
  fechaEnvio: string;
  fechaMaximaEntrega: string;
  deadlineRaw?: string;
  rawStatus?: string;
  status?: string;
  contenido?: string;
  fileUrl?: string;
  archivos?: string[];
  remitente_id?: string;
  receptor_id?: string;
  receptor_gerencia_id?: number;
  respuesta_contenido?: string;
  respuesta_usuario_nombre?: string;
  respuesta_fecha?: string;
  respuesta_url_archivo?: string;
  respuesta_archivos?: string[];
};

const DASHBOARD_THEME_STORAGE_KEY = "dashboard_theme_2026";
const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "/api";

function resolveFileUrl(file?: string) {
  if (!file) return "";
  return file.startsWith("http") ? file : `${BACKEND_BASE_URL}${file}`;
}

function extractBackendPath(value: string): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http")) {
    try {
      const u = new URL(raw);
      return String(u.pathname || "").replace(/^\//, "");
    } catch {
      return "";
    }
  }
  return raw.startsWith("/") ? raw.slice(1) : raw;
}

function isDirectlyOpenableUrl(value: string): boolean {
  const raw = String(value || "").trim();
  if (!raw.startsWith("http")) return false;
  if (raw.includes("/storage/v1/object/")) return true;
  return false;
}

function parseFlexibleDateGlobal(value?: string) {
  if (!value || value === "N/A") return null;
  const normalized = String(value).trim();
  const latinMatch = normalized.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (latinMatch) {
    const [, ddRaw, mmRaw, yyyy, hh = "00", min = "00", sec = "00"] = latinMatch;
    const dd = ddRaw.padStart(2, "0");
    const mm = mmRaw.padStart(2, "0");
    const d = new Date(`${yyyy}-${mm}-${dd}T${hh.padStart(2, "0")}:${min}:${sec}`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getStatusColor(status: string, darkMode: boolean) {
  const normalized = String(status || "").toLowerCase();
  switch (normalized) {
    case "vencido":
      return darkMode ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-700";
    case "en-aclaracion":
      return darkMode ? "bg-purple-500/10 text-purple-400" : "bg-purple-50 text-purple-700";
    case "respondido":
      return darkMode ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-700";
    case "finalizado":
      return darkMode ? "bg-green-500/10 text-green-400" : "bg-green-50 text-green-700";
    case "en-proceso":
    case "en proceso":
      return darkMode ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700";
    default:
      return darkMode ? "bg-slate-800 text-slate-400" : "bg-slate-100 text-slate-600";
  }
}

function getTrackingStatus(item: { rawStatus?: string; deadlineRaw?: string; fechaMaximaEntrega?: string }) {
  const raw = String(item.rawStatus || "").toLowerCase().trim();
  const deadline =
    parseFlexibleDateGlobal(item.deadlineRaw || "") ||
    parseFlexibleDateGlobal(item.fechaMaximaEntrega || "");

  if (raw === "finalizado") return "finalizado";
  if (raw === "respondido") return "respondido";
  if (raw === "en-aclaracion") return "en-aclaracion";

  if (deadline) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dDate = new Date(deadline);
    dDate.setHours(0, 0, 0, 0);
    if (today.getTime() > dDate.getTime()) return "vencido";
  }
  return "en-proceso";
}

function formatTrackingEvent(ev: { action?: string; details?: string }) {
  const actionRaw = String(ev.action || "").trim();
  const detailsRaw = String(ev.details || "").trim();
  const normalizedAction = actionRaw
    .toLowerCase()
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim();

  let label = actionRaw || "EVENTO";
  let detail = detailsRaw || "";

  if (
    normalizedAction === "status changed" ||
    normalizedAction === "status change" ||
    normalizedAction === "status changed" ||
    normalizedAction.includes("status")
  ) {
    label = "CAMBIO DE ESTADO";
  }

  const lowerDetails = detailsRaw.toLowerCase();
  if (lowerDetails.includes("en-aclaracion") || lowerDetails.includes("en aclaracion")) {
    label = "ACLARACION SOLICITADA";
  }

  const commentMatch =
    detailsRaw.match(/comentario[:=]\s*'?(.*?)'?(?:\s*\||$)/i) ||
    detailsRaw.match(/comment[:=]\s*'?(.*?)'?(?:\s*\||$)/i);
  if (commentMatch && commentMatch[1]) {
    detail = `Aclaración: ${commentMatch[1].replace(/^['"]|['"]$/g, "")}`;
  } else {
    const statusMatch = detailsRaw.match(/estado[:=]\s*'?(.*?)'?(?:\s*\||$)/i);
    if (statusMatch && statusMatch[1]) {
      detail = `Estado: ${statusMatch[1].replace(/^['"]|['"]$/g, "")}`;
    }
  }

  return { label, detail };
}

function mapDocumentToTracking(doc: any): TrackingDocument {
  let uploadDate = "N/A";
  if (doc.fecha_creacion || doc.uploadDate) {
    try {
      if (doc.uploadDate) {
        uploadDate = doc.uploadDate;
      } else {
        const date = new Date(doc.fecha_creacion);
        if (!Number.isNaN(date.getTime())) {
          uploadDate = date.toLocaleDateString("es-ES");
        }
      }
    } catch {
      // ignore
    }
  }

  const signatureStatusValue =
    doc.estado ?? doc.signatureStatus ?? doc.signaturestatus ?? doc.status ?? "en-proceso";
  const normalizedSignatureStatus = String(signatureStatusValue)
    .toLowerCase()
    .trim()
    .replaceAll("_", "-")
    .replaceAll(" ", "-");

  const rawCorrelativo =
    doc.correlativo ?? doc.idDoc ?? doc.iddoc ?? doc.numero_documento ?? doc.numeroDocumento;
  const correlativoValue =
    rawCorrelativo !== null && rawCorrelativo !== undefined && String(rawCorrelativo).trim() !== ""
      ? String(rawCorrelativo).trim()
      : `DOC-${doc.id}`;

  const fechaMaximaEntrega = doc.fecha_caducidad
    ? (() => {
        const d = new Date(doc.fecha_caducidad);
        return Number.isNaN(d.getTime()) ? String(doc.fecha_caducidad) : d.toLocaleDateString("es-ES");
      })()
    : "N/A";

  return {
    id: doc.id,
    title: doc.titulo || doc.title || doc.name || "Sin titulo",
    correlativo: correlativoValue,
    sentBy: doc.uploadedBy || doc.remitente_nombre || "Desconocido",
    receivedBy: doc.receptor_nombre || doc.receivedBy || doc.targetDepartment || "Sin asignar",
    fechaEnvio: uploadDate,
    fechaMaximaEntrega,
    deadlineRaw: doc.fecha_caducidad || "",
    rawStatus: normalizedSignatureStatus,
    status: normalizedSignatureStatus,
    contenido: doc.contenido || "",
    fileUrl: doc.url_archivo || doc.fileUrl || undefined,
    archivos: doc.archivos || [],
    remitente_id: doc.remitente_id ? String(doc.remitente_id) : undefined,
    receptor_id: doc.receptor_id ? String(doc.receptor_id) : undefined,
    receptor_gerencia_id: doc.receptor_gerencia_id ? Number(doc.receptor_gerencia_id) : undefined,
    respuesta_contenido: doc.respuesta_contenido || "",
    respuesta_usuario_nombre: doc.respuesta_usuario_nombre || "",
    respuesta_fecha: doc.respuesta_fecha || "",
    respuesta_url_archivo: doc.respuesta_url_archivo || "",
    respuesta_archivos: doc.respuesta_archivos || [],
  };
}

function SeguimientoDetailClient() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();

  const docIdRaw = params?.id;
  const docId = Array.isArray(docIdRaw) ? String(docIdRaw[0]) : String(docIdRaw || "");

  const [darkMode, setDarkMode] = useState(true);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [doc, setDoc] = useState<TrackingDocument | null>(null);
  const [trackingResponses, setTrackingResponses] = useState<ApiDocumentoRespuesta[]>([]);
  const [trackingEvents, setTrackingEvents] = useState<ApiDocumentoEvento[]>([]);
  const [trackingResponseDraft, setTrackingResponseDraft] = useState("");
  const [trackingResponseFiles, setTrackingResponseFiles] = useState<File[]>([]);
  const [updatingTrackingStatus, setUpdatingTrackingStatus] = useState(false);

  const openDocumento = useCallback(async (fileUrl: string) => {
    const raw = String(fileUrl || "").trim();
    if (!raw) return;
    if (typeof window === "undefined") return;

    const resolved = resolveFileUrl(raw);
    if (isDirectlyOpenableUrl(resolved)) {
      window.open(resolved, "_blank", "noopener,noreferrer");
      return;
    }

    const token = localStorage.getItem("sgd_token");
    if (!token) {
      void uiAlert("Sesión no válida. Inicia sesión de nuevo.", "Adjuntos");
      return;
    }

    const backendPath = extractBackendPath(resolved);
    if (!backendPath) {
      void uiAlert("No se pudo interpretar la ruta del adjunto.", "Adjuntos");
      return;
    }

    try {
      const base = BACKEND_BASE_URL.endsWith("/") ? BACKEND_BASE_URL.slice(0, -1) : BACKEND_BASE_URL;
      const res = await fetch(
        `${base}/documentos/archivo?path=${encodeURIComponent(backendPath)}&format=json`,
        {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        },
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Error ${res.status}`);
      }
      const data = (await res.json()) as { url?: string };
      if (!data?.url) throw new Error("Respuesta inválida del servidor");
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      console.error("No se pudo abrir el documento:", error);
      void uiAlert("No se pudo abrir el documento. Intenta de nuevo.", "Adjuntos");
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY);
    if (stored) setDarkMode(stored === "dark");
    const handleStorage = (event: StorageEvent) => {
      if (event.key === DASHBOARD_THEME_STORAGE_KEY) {
        setDarkMode(event.newValue === "dark");
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const refreshDoc = useCallback(async () => {
    if (!docId || docId === "undefined" || docId === "null") {
      setErrorMsg("Documento invalido.");
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await getDocumentos();
      const mapped = data.map(mapDocumentToTracking);
      const found = mapped.find((item) => String(item.id) === docId) || null;
      setDoc(found);
      setErrorMsg(found ? null : "Documento no encontrado.");
    } catch (error) {
      console.error("Error loading document:", error);
      setErrorMsg("No se pudo cargar el documento.");
    } finally {
      setLoading(false);
    }
  }, [docId]);

  useEffect(() => {
    void refreshDoc();
  }, [refreshDoc]);

  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      try {
        const rows = await getDocumentoRespuestas(doc.id);
        if (!cancelled) setTrackingResponses(rows || []);
      } catch (error) {
        console.error("Error loading responses:", error);
        if (!cancelled) setTrackingResponses([]);
      }
      try {
        const rows = await getDocumentoEventos(doc.id);
        if (!cancelled) setTrackingEvents(rows || []);
      } catch (error) {
        console.error("Error loading events:", error);
        if (!cancelled) setTrackingEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);

  useEffect(() => {
    if (!doc) return;
    void createSecurityLog({
      evento: "SEGUIMIENTO_ABIERTO",
      detalles: JSON.stringify({
        action: "OPEN_TRACKING",
        documento_id: doc.id,
        correlativo: doc.correlativo,
      }),
      estado: "info",
      page: "/dashboard/seguimiento/[id]",
    });
  }, [doc]);

  const computedStatus = useMemo(() => (doc ? getTrackingStatus(doc) : "en-proceso"), [doc]);
  const statusLabel =
    computedStatus === "en-proceso"
      ? "EN PROCESO"
      : computedStatus === "vencido"
        ? "VENCIDO"
        : computedStatus === "respondido"
          ? "RESPONDIDO"
          : computedStatus === "en-aclaracion"
            ? "EN ACLARACION"
            : "FINALIZADO";

  const canReply = useMemo(() => {
    if (!doc || !user?.id) return false;
    const currentUserId = String(user.id);
    const isDirectRecipient =
      !!doc.receptor_id && currentUserId && String(doc.receptor_id) === currentUserId;
    const isDeptRecipient =
      !!doc.receptor_gerencia_id &&
      !!user.gerencia_id &&
      String(doc.receptor_gerencia_id) === String(user.gerencia_id);
    const isSender =
      !!doc.remitente_id && currentUserId && String(doc.remitente_id) === currentUserId;
    return isDirectRecipient || isDeptRecipient || isSender;
  }, [doc, user?.gerencia_id, user?.id]);

  const canFinalizeTracking = useMemo(() => {
    if (!doc || !user?.id) return false;
    return !!doc.remitente_id && String(doc.remitente_id) === String(user.id);
  }, [doc, user?.id]);

  const handleMarkFinalized = useCallback(
    async (docIdValue: string | number) => {
      try {
        setUpdatingTrackingStatus(true);
        await updateDocumentStatus(docIdValue, "finalizado");
        setDoc((prev) =>
          prev && prev.id === docIdValue
            ? { ...prev, rawStatus: "finalizado", status: "finalizado" }
            : prev,
        );
        await refreshDoc();
        void uiAlert("Documento marcado como FINALIZADO.", "Estado actualizado");
      } catch (error) {
        console.error("Error updating status:", error);
        void uiAlert("No se pudo actualizar el estado a FINALIZADO.", "Error");
      } finally {
        setUpdatingTrackingStatus(false);
      }
    },
    [refreshDoc],
  );

  const handleRequestClarification = useCallback(
    async (docIdValue: string | number) => {
      const note = await uiPrompt(
        "Describe que falta o que debe aclararse.",
        "",
        "Solicitar aclaracion",
        "Escribe un comentario...",
      );
      if (note === null) return;
      try {
        setUpdatingTrackingStatus(true);
        await updateDocumentStatus(docIdValue, "en-aclaracion", note.trim());
        setDoc((prev) =>
          prev && prev.id === docIdValue
            ? { ...prev, rawStatus: "en-aclaracion", status: "en-aclaracion" }
            : prev,
        );
        await refreshDoc();
        void uiAlert("Aclaracion solicitada.", "Control de seguimiento");
      } catch (error) {
        console.error("Error requesting clarification:", error);
        void uiAlert("No se pudo solicitar aclaracion.", "Error");
      } finally {
        setUpdatingTrackingStatus(false);
      }
    },
    [refreshDoc],
  );

  const handleSendTrackingResponse = useCallback(
    async (docIdValue: string | number) => {
      const content = trackingResponseDraft.trim();
      if (!content && trackingResponseFiles.length === 0) {
        void uiAlert("Escribe una respuesta antes de enviar.", "Control de seguimiento");
        return;
      }
      try {
        await respondDocumento(docIdValue, content, trackingResponseFiles);
        setDoc((prev) =>
          prev && prev.id === docIdValue
            ? {
                ...prev,
                rawStatus: "respondido",
                status: "respondido",
                respuesta_contenido: content,
                respuesta_usuario_nombre: user?.nombre
                  ? `${user?.nombre} ${user?.apellido || ""}`.trim()
                  : "Respuesta",
                respuesta_fecha: new Date().toISOString(),
              }
            : prev,
        );
        setTrackingResponseDraft("");
        setTrackingResponseFiles([]);
        try {
          const rows = await getDocumentoRespuestas(docIdValue);
          setTrackingResponses(rows || []);
        } catch {
          setTrackingResponses([]);
        }
        await refreshDoc();
        void uiAlert("Respuesta registrada.", "Control de seguimiento");
      } catch (error) {
        console.error("Error responding:", error);
        void uiAlert("No se pudo registrar la respuesta.", "Error");
      }
    },
    [refreshDoc, trackingResponseDraft, trackingResponseFiles, user?.apellido, user?.nombre],
  );

  if (loading) {
    return (
      <div className={`min-h-screen ${darkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"}`}>
        <div className="max-w-5xl mx-auto px-4 py-10">Cargando...</div>
      </div>
    );
  }

  if (errorMsg || !doc) {
    return (
      <div className={`min-h-screen ${darkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"}`}>
        <div className="max-w-5xl mx-auto px-4 py-10 space-y-4">
          <button
            onClick={() => router.push("/dashboard?tab=seguimiento")}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-bold uppercase tracking-wider ${
              darkMode
                ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            <ArrowLeft size={14} />
            Volver
          </button>
          <div className="text-sm text-red-400">{errorMsg || "Documento no disponible."}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${darkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-900"}`}>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard?tab=seguimiento")}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-bold uppercase tracking-wider ${
                darkMode
                  ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              <ArrowLeft size={14} />
              Volver
            </button>
            <div className="min-w-0">
              <h1 className="text-xl font-bold">Seguimiento</h1>
              <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                Correlativo: {doc.correlativo}
              </p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${getStatusColor(computedStatus, darkMode)}`}>
            {statusLabel}
          </span>
        </div>

        <div className={`rounded-2xl border p-5 ${darkMode ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-white"}`}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">{doc.title}</h2>
              <p className={`text-xs mt-1 ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                Enviado por {doc.sentBy} a {doc.receivedBy}
              </p>
            </div>
            <div className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
              <div>Fecha envio: {doc.fechaEnvio}</div>
              <div>Fecha maxima: {doc.fechaMaximaEntrega}</div>
            </div>
          </div>

          {doc.contenido ? (
            <div className={`mt-4 rounded-lg border p-4 text-sm whitespace-pre-wrap ${
              darkMode ? "border-slate-800 bg-slate-950 text-slate-200" : "border-slate-200 bg-slate-50 text-slate-700"
            }`}>
              {doc.contenido}
            </div>
          ) : (
            <div className={`mt-4 text-sm italic ${darkMode ? "text-slate-500" : "text-slate-600"}`}>
              Sin contenido de mensaje en texto.
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? "text-slate-500" : "text-slate-700"}`}>
            RESPUESTAS
          </div>
          {trackingResponses.length > 0 ? (
            <div className="space-y-3">
              {trackingResponses.map((resp) => {
                const currentUserLabel = user?.nombre
                  ? `${user?.nombre} ${user?.apellido || ""}`.trim()
                  : "";
                const isMine =
                  currentUserLabel &&
                  String(resp.usuario_nombre || "").toLowerCase().trim() === currentUserLabel.toLowerCase().trim();
                return (
                  <div key={resp.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                        isMine
                          ? darkMode
                            ? "bg-emerald-600 text-white rounded-br-none"
                            : "bg-emerald-500 text-white rounded-br-none"
                          : darkMode
                            ? "bg-slate-800 text-slate-100 rounded-bl-none"
                            : "bg-white text-slate-700 border border-slate-200 rounded-bl-none"
                      }`}
                    >
                      <div
                        className={`text-[11px] mb-2 ${
                          isMine
                            ? darkMode
                              ? "text-emerald-100/80"
                              : "text-emerald-50/90"
                            : darkMode
                              ? "text-slate-400"
                              : "text-slate-500"
                        }`}
                      >
                        {resp.usuario_nombre || "Receptor"}{" "}
                        {resp.created_at ? `• ${new Date(resp.created_at).toLocaleString("es-ES")}` : ""}
                      </div>
                      {resp.contenido}
                      {(resp.archivos || []).length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {resp.archivos?.map((file: string, idx: number) => {
                            const url = resolveFileUrl(file);
                            return (
                              <a
                                key={`${file}-${idx}`}
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                                  isMine
                                    ? "border-white/30 text-white hover:bg-white/10"
                                    : darkMode
                                      ? "border-slate-600 text-slate-200 hover:bg-slate-700/50"
                                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                                }`}
                              >
                                PDF {idx + 1}
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-slate-500 italic">Aun sin respuesta.</div>
          )}

          {canReply && computedStatus !== "finalizado" && (
            <div className={`rounded-2xl border p-4 space-y-3 ${darkMode ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-white"}`}>
              <textarea
                rows={3}
                value={trackingResponseDraft}
                onChange={(e) => setTrackingResponseDraft(e.target.value)}
                placeholder="Escribe la respuesta..."
                className={`w-full rounded-xl border px-4 py-2 text-sm outline-none resize-none ${
                  darkMode ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-white border-slate-300 text-slate-800"
                }`}
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className={`inline-flex items-center gap-2 text-xs font-semibold cursor-pointer ${
                  darkMode ? "text-slate-300" : "text-slate-700"
                }`}>
                  <Paperclip size={14} />
                  Adjuntar PDF
                  <input
                    type="file"
                    accept=".pdf"
                    multiple
                    onChange={(e) => setTrackingResponseFiles(Array.from(e.target.files || []))}
                    className="hidden"
                  />
                </label>
                {trackingResponseFiles.length > 0 && (
                  <div className={`text-[11px] ${darkMode ? "text-slate-500" : "text-slate-600"}`}>
                    {trackingResponseFiles.length} PDF(s) seleccionados
                  </div>
                )}
                <button
                  onClick={() => void handleSendTrackingResponse(doc.id)}
                  className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                >
                  <Send size={14} />
                  Enviar respuesta
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${darkMode ? "text-slate-500" : "text-slate-700"}`}>
            <Activity size={12} />
            HISTORIAL
          </div>
          {trackingEvents.length > 0 ? (
            <div className={`rounded-lg border p-3 text-xs space-y-2 ${
              darkMode ? "border-slate-800 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"
            }`}>
              {trackingEvents.map((ev) => {
                const formatted = formatTrackingEvent(ev);
                return (
                  <div key={ev.id} className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{formatted.label}</div>
                      {formatted.detail ? <div className="text-[11px] opacity-80">{formatted.detail}</div> : null}
                    </div>
                    <div className="text-[10px] opacity-70 text-right">
                      <div>{ev.actor_username || "sistema"}</div>
                      <div>{new Date(ev.created_at).toLocaleString("es-ES")}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-slate-500 italic">Sin historial.</div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {computedStatus === "respondido" && canFinalizeTracking && (
            <button
              onClick={() => void handleRequestClarification(doc.id)}
              disabled={updatingTrackingStatus}
              className={`px-3 py-2 rounded-md text-sm font-semibold border transition-colors ${
                darkMode
                  ? "border-purple-700 text-purple-300 hover:bg-purple-900/20 disabled:opacity-50"
                  : "border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50"
              }`}
            >
              Solicitar aclaracion
            </button>
          )}
          {computedStatus !== "finalizado" && canFinalizeTracking && (
            <button
              onClick={async () => {
                if (!doc.respuesta_contenido) {
                  void uiAlert("No puedes finalizar sin una respuesta del receptor.", "Control de seguimiento");
                  return;
                }
                await handleMarkFinalized(doc.id);
              }}
              disabled={updatingTrackingStatus}
              className={`px-3 py-2 rounded-md text-sm font-semibold border transition-colors ${
                darkMode
                  ? "border-green-700 text-green-300 hover:bg-green-900/20 disabled:opacity-50"
                  : "border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50"
              }`}
            >
              {updatingTrackingStatus ? "Guardando..." : "FINALIZADO"}
            </button>
          )}
          {doc.fileUrl && !(doc.archivos || []).includes(doc.fileUrl) && (
            <button
              type="button"
              onClick={() => {
                void createSecurityLog({
                  evento: "DOCUMENTO_DESCARGA",
                  detalles: JSON.stringify({
                    action: "DOWNLOAD_PRIMARY",
                    documento_id: doc.id,
                    correlativo: doc.correlativo,
                  }),
                  estado: "info",
                  page: "/dashboard/seguimiento/[id]",
                });
                void openDocumento(doc.fileUrl || "");
              }}
              className={`px-3 py-2 rounded-md text-sm font-semibold border ${
                darkMode ? "border-blue-700 text-blue-300 hover:bg-blue-900/20" : "border-blue-300 text-blue-700 hover:bg-blue-50"
              }`}
            >
              Ver archivo principal
            </button>
          )}
          {(doc.archivos || []).map((file: string, idx: number) => (
            <button
              type="button"
              key={`${file}-${idx}`}
              onClick={() => {
                void createSecurityLog({
                  evento: "DOCUMENTO_DESCARGA",
                  detalles: JSON.stringify({
                    action: "DOWNLOAD_ATTACHMENT",
                    documento_id: doc.id,
                    correlativo: doc.correlativo,
                    index: idx + 1,
                  }),
                  estado: "info",
                  page: "/dashboard/seguimiento/[id]",
                });
                void openDocumento(file);
              }}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-semibold border ${
                darkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"
              }`}
            >
              <FileText size={14} />
              Adjunto {idx + 1}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SeguimientoDetailPage() {
  return (
    <RoleGuard
      allowedRoles={["CEO", "Administrador", "Usuario", "Desarrollador", "Gerente"]}
      redirectTo="/login"
    >
      <SeguimientoDetailClient />
    </RoleGuard>
  );
}
