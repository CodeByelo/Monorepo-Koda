"use client";
import React, { useState, useEffect, useMemo } from "react";
import { CheckCircle2, Mail, Sparkles, LogOut, Check } from "lucide-react";
import { getHojasDeRuta, updateHojaDeRutaEstado, ApiHojaDeRuta, AnnouncementData } from "../../../lib/api";
import { User } from "../../../context/AuthContext";

interface VistaUsuarioComunProps {
  user: User;
  darkMode: boolean;
  logout: () => void;
  announcement: AnnouncementData;
  announcementColors: {
    base: string;
    start: string;
    end: string;
    badge: string;
    isGradient: boolean;
  };
}

function isColorLight(hexColor?: string): boolean {
  if (!hexColor) return false;
  if (hexColor.includes("gradient")) return false;
  const hex = hexColor.replace("#", "").trim();
  if (hex.length !== 6 && hex.length !== 3) return false;
  const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.substring(0, 2), 16);
  const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.substring(2, 4), 16);
  const b = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.substring(4, 6), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 128;
}

export function VistaUsuarioComun({
  user,
  darkMode,
  logout,
  announcement,
  announcementColors,
}: VistaUsuarioComunProps) {
  const [tasks, setTasks] = useState<ApiHojaDeRuta[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const data = await getHojasDeRuta();
      // Filtrar solo las tareas asignadas al usuario logueado
      const activeTasks = data.filter((task) => task.destinatario_id === String(user.id));
      setTasks(activeTasks);
    } catch (error) {
      console.error("Error al obtener tareas activas:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [user.id]);

  const handleCompleteTask = async (id: string) => {
    try {
      await updateHojaDeRutaEstado(id, { estado: "completada", observaciones_resolucion: "Completado desde Mi Día" });
      fetchTasks();
    } catch (error) {
      console.error("Error al completar la tarea:", error);
    }
  };

  // Tareas pendientes
  const pendingTasks = useMemo(() => {
    return tasks.filter((t) => t.estado !== "completada" && t.estado !== "revisada");
  }, [tasks]);

  const capitalizeDateParts = (str: string) => {
    return str.replace(/(^|\s)\S/g, (l) => l.toUpperCase());
  };

  const formattedDate = capitalizeDateParts(
    new Date().toLocaleDateString("es-ES", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  );

  // Colores de anuncio
  const { base, start, end, badge: badgeColor, isGradient } = announcementColors;
  const isBgLight = isColorLight(isGradient ? undefined : announcement?.color || base);
  
  const bannerTextColor = isBgLight ? "text-slate-900" : "text-white";
  const bannerSubColor = isBgLight ? "text-slate-700" : "text-white/90";
  const bannerLabelColor = isBgLight ? "text-slate-500" : "text-white/80";
  const bannerBorder = isBgLight 
    ? (darkMode ? "1px solid rgba(255,255,255,0.15)" : "1px solid rgba(148, 163, 184, 0.15)")
    : (darkMode ? "1px solid rgba(29, 53, 56, 0.7)" : "none");
  const bannerBadgeBg = isBgLight ? "rgba(0, 0, 0, 0.08)" : badgeColor;
  const bannerBadgeText = isBgLight ? "text-slate-950 font-bold" : "text-white";
  const bannerBoxBorder = isBgLight ? "border-slate-200 bg-slate-900/5" : "border-white/20 bg-white/10";
  const bannerBoxDivider = isBgLight ? "border-slate-200" : "border-white/20";

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* HEADER: MI DÍA */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1
            className={`text-3xl font-bold tracking-tight ${
              darkMode ? "text-white" : "text-slate-700"
            }`}
          >
            Mi Día
          </h1>
          <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
            {formattedDate} — Hola, {user.nombre || "Colaborador"}. Tienes {pendingTasks.length} tareas pendientes asignadas.
          </p>
        </div>
        <div
          className={`px-4 py-2 rounded-lg border ${
            darkMode
              ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70"
              : "bg-white border-slate-200"
          } flex items-center gap-3`}
        >
          <div
            className={`w-2 h-2 rounded-full ${
              darkMode ? "bg-[#00C294]" : "bg-emerald-500"
            } animate-pulse`}
          />
          <span className={`text-xs font-medium ${darkMode ? "text-[#E0E6E6]" : "text-slate-700"}`}>
            Dashboard Personal
          </span>
        </div>
      </div>

      {/* BANNER DE ANUNCIOS INSTITUCIONALES */}
      {announcement && (
        <div
          className="remaster-hero remaster-card relative overflow-hidden rounded-2xl p-8 shadow-xl"
          style={{
            background: isGradient
              ? announcement?.color
              : `linear-gradient(90deg, ${start}, ${base}, ${end})`,
            border: bannerBorder,
          }}
        >
          <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="space-y-2">
              <span
                className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm ${bannerBadgeText}`}
                style={{ backgroundColor: bannerBadgeBg }}
              >
                {announcement.badge}
              </span>
              <h2 className={`text-2xl font-bold ${bannerTextColor}`}>
                {announcement.title}
              </h2>
              <p className={`max-w-xl text-sm leading-relaxed ${bannerSubColor}`}>
                {announcement.description}
              </p>
            </div>
            <div className={`p-4 rounded-xl border flex items-center gap-4 shrink-0 backdrop-blur-md ${bannerBoxBorder}`}>
              <div className={`text-center px-4 border-r ${bannerBoxDivider}`}>
                <p className={`text-[10px] uppercase font-bold ${bannerLabelColor}`}>
                  Estado
                </p>
                <p className={`text-xl font-bold uppercase ${bannerTextColor}`}>
                  {announcement.status}
                </p>
              </div>
              <div className="text-center px-4">
                <p className={`text-[10px] uppercase font-bold ${bannerLabelColor}`}>
                  Urgencia
                </p>
                <p className={`text-xl font-bold uppercase ${bannerTextColor}`}>
                  {announcement.urgency}
                </p>
              </div>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-32 h-32 bg-black/10 rounded-full translate-y-1/2 -translate-x-1/2 blur-2xl pointer-events-none" />
        </div>
      )}

      {/* TABLA DE TAREAS ACTIVAS */}
      <div
        className={`p-6 rounded-2xl border ${
          darkMode
            ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70 shadow-lg shadow-black/20"
            : "bg-white border-slate-200 shadow-sm"
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className={`text-lg font-semibold ${darkMode ? "text-slate-100" : "text-slate-800"}`}
          >
            Mis Tareas Activas (Hoja de Ruta)
          </h2>
          <span
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
              darkMode
                ? "bg-[#00C294]/10 text-[#00C294] border border-[#00C294]/20"
                : "bg-emerald-50 text-emerald-700 border border-emerald-200"
            }`}
          >
            {pendingTasks.length} Pendientes
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-sm text-slate-500">Cargando tareas activas...</div>
        ) : pendingTasks.length > 0 ? (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr
                  className={`border-b text-xs font-semibold uppercase tracking-wider ${
                    darkMode
                      ? "bg-[#0b1718] border-[#1d3538]/50 text-[#00C294]"
                      : "bg-slate-50 border-slate-100 text-slate-600"
                  }`}
                >
                  <th className="py-3 px-4">Asunto / Tarea</th>
                  <th className="py-3 px-4">Remitente</th>
                  <th className="py-3 px-4">Fecha Límite</th>
                  <th className="py-3 px-4 text-right">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-solid">
                {pendingTasks.map((task) => {
                  const limitDate = task.fecha_limite
                    ? new Date(task.fecha_limite).toLocaleDateString("es-ES")
                    : "Sin fecha";
                  const isOverdue =
                    task.fecha_limite && new Date(task.fecha_limite).getTime() < new Date().getTime();

                  return (
                    <tr
                      key={task.id}
                      className={`text-sm transition-colors ${
                        darkMode
                          ? "border-[#1d3538]/20 hover:bg-[#122224]/50 text-slate-300"
                          : "border-slate-100 hover:bg-slate-50 text-slate-700"
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-100">{task.asunto}</div>
                        {task.acciones && task.acciones.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {task.acciones.map((acc, idx) => (
                              <span key={idx} className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px] text-[#00C294] font-bold">
                                {acc}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-slate-400 text-xs">{task.remitente_nombre}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                            isOverdue
                              ? "bg-red-500/10 text-red-400 border border-red-500/20"
                              : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                          }`}
                        >
                          {limitDate}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleCompleteTask(task.id)}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            darkMode
                              ? "bg-[#00C294]/10 text-[#00C294] border border-[#00C294]/20 hover:bg-[#00C294]/20"
                              : "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                          }`}
                        >
                          <Check size={12} />
                          Completar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-slate-500 flex flex-col items-center gap-2">
            <CheckCircle2 size={36} className="text-[#00C294] opacity-50" />
            <p>¡Buen trabajo! No tienes tareas activas asignadas.</p>
          </div>
        )}
      </div>

      {/* QUICK ACTIONS & EXTERNAL LINKS */}
      <div className="pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
        <a
          href="https://workspace.google.com/intl/es-419/gmail/"
          target="_blank"
          rel="noopener noreferrer"
          className={`glass-hover p-4 rounded-xl border flex items-center gap-4 transition-all group ${
            darkMode
              ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70 hover:border-red-500/30 hover:from-[#152e31] hover:to-[#0d1e20]"
              : "bg-white border-slate-200 hover:border-red-200 hover:shadow-lg hover:shadow-red-500/5"
          }`}
        >
          <div
            className={`p-3 rounded-lg ${
              darkMode ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-600"
            } group-hover:scale-110 transition-transform`}
          >
            <Mail size={24} />
          </div>
          <div>
            <p
              className={`font-bold text-sm ${darkMode ? "text-[#E0E6E6]" : "text-slate-900"}`}
            >
              Correo Corporativo
            </p>
            <p className={`text-xs ${darkMode ? "text-[#94A3B8]" : "text-slate-500"}`}>
              Acceder a Gmail Workspace
            </p>
          </div>
        </a>

        <a
          href="https://quillbot.com/es/corrector-ortografico"
          target="_blank"
          rel="noopener noreferrer"
          className={`glass-hover p-4 rounded-xl border flex items-center gap-4 transition-all group ${
            darkMode
              ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70 hover:border-blue-500/30 hover:from-[#152e31] hover:to-[#0d1e20]"
              : "bg-white border-slate-200 hover:border-blue-200 hover:shadow-lg hover:shadow-blue-500/5"
          }`}
        >
          <div
            className={`p-3 rounded-lg ${
              darkMode ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-600"
            } group-hover:scale-110 transition-transform`}
          >
            <Sparkles size={24} />
          </div>
          <div>
            <p
              className={`font-bold text-sm ${darkMode ? "text-[#E0E6E6]" : "text-slate-900"}`}
            >
              Corrector Ortográfico
            </p>
            <p className={`text-xs ${darkMode ? "text-[#94A3B8]" : "text-slate-500"}`}>
              Refinar redacción de oficios
            </p>
          </div>
        </a>

        <button
          onClick={logout}
          className={`glass-hover p-4 rounded-xl border flex items-center gap-4 transition-all group text-left ${
            darkMode
              ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70 hover:border-[#0bbf8c]/40 hover:from-[#152e31] hover:to-[#0d1e20]"
              : "bg-white border-slate-200 hover:border-slate-300 hover:shadow-lg hover:shadow-slate-500/5"
          }`}
        >
          <div
            className={`p-3 rounded-lg ${
              darkMode ? "bg-[#00C294]/10 text-[#00C294]" : "bg-slate-100 text-slate-500"
            } group-hover:scale-110 transition-transform`}
          >
            <LogOut size={24} />
          </div>
          <div>
            <p
              className={`font-bold text-sm ${darkMode ? "text-[#E0E6E6]" : "text-slate-900"}`}
            >
              Cerrar Sesión
            </p>
            <p className={`text-xs ${darkMode ? "text-[#94A3B8]" : "text-slate-500"}`}>
              Finalizar jornada laboral
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
