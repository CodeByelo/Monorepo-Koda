"use client";
import React, { useState, useEffect, useMemo } from "react";
import { CheckCircle2, Clock, Mail, Sparkles, LogOut } from "lucide-react";
import { getHojasDeRuta, ApiHojaDeRuta, ApiUser, AnnouncementData } from "../../../lib/api";
import { User } from "../../../context/AuthContext";
import { HojaDeRuta } from "./HojaDeRuta";

interface VistaGerenteProps {
  user: User;
  users: ApiUser[];
  userRole: string;
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

export function VistaGerente({
  user,
  users,
  userRole,
  darkMode,
  logout,
  announcement,
  announcementColors,
}: VistaGerenteProps) {
  const [tasks, setTasks] = useState<ApiHojaDeRuta[]>([]);
  const [loading, setLoading] = useState(true);

  // Determinar la gerencia del gerente logueado
  const gerenciaDelGerente = useMemo(() => {
    return user.gerencia_depto || "";
  }, [user.gerencia_depto]);

  // Obtener colaboradores de la misma gerencia para filtrar sus tareas
  const teamUserIds = useMemo(() => {
    if (!gerenciaDelGerente) return new Set<string>();
    const lowerGerencia = gerenciaDelGerente.toLowerCase().trim();
    const team = users.filter((u) => {
      const dept = (u.gerencia_depto || u.gerencia_nombre || "").toLowerCase().trim();
      return dept === lowerGerencia;
    });
    return new Set(team.map((u) => String(u.id)));
  }, [users, gerenciaDelGerente]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const data = await getHojasDeRuta();
      // Filtrar las tareas del área (donde el destinatario o el remitente sea parte del área)
      const deptTasks = data.filter((task) => {
        const destId = task.destinatario_id ? String(task.destinatario_id) : "";
        const remId = task.remitente_id ? String(task.remitente_id) : "";
        return teamUserIds.has(destId) || teamUserIds.has(remId);
      });
      setTasks(deptTasks);
    } catch (error) {
      console.error("Error al obtener tareas de gerencia:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (teamUserIds.size > 0) {
      fetchTasks();
    }
  }, [teamUserIds]);

  // KPIs
  const pendingCount = useMemo(() => {
    return tasks.filter((t) => t.estado !== "completada" && t.estado !== "revisada").length;
  }, [tasks]);

  const completedCount = useMemo(() => {
    return tasks.filter((t) => t.estado === "completada" || t.estado === "revisada").length;
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
      {/* HEADER: VISTA GERENTE */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1
            className={`text-3xl font-bold tracking-tight ${
              darkMode ? "text-white" : "text-slate-700"
            }`}
          >
            Gestión de Área: {gerenciaDelGerente || "Mi Gerencia"}
          </h1>
          <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
            {formattedDate} — Bienvenido, {user.nombre || "Gerente"}. Gestión del equipo y trazabilidad operativa.
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
              darkMode ? "bg-cyan-400" : "bg-cyan-500"
            } animate-pulse`}
          />
          <span className={`text-xs font-medium ${darkMode ? "text-[#E0E6E6]" : "text-slate-700"}`}>
            Panel de Gerente
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

      {/* KPIS DE GERENCIA (2 TARJETAS ORIGINALES) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* KPI Pendientes */}
        <div
          className={`p-5 rounded-xl border ${
            darkMode
              ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70 shadow-lg shadow-black/20"
              : "bg-white border-slate-200 shadow-sm"
          } flex items-center justify-between`}
        >
          <div className="space-y-1">
            <p className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
              Tareas Pendientes
            </p>
            <p className={`text-2xl font-extrabold ${darkMode ? "text-white" : "text-slate-900"}`}>
              {loading ? "..." : pendingCount}
            </p>
            <p className="text-[11px] text-slate-500">Asignadas al departamento</p>
          </div>
          <div className={`p-3 rounded-lg ${darkMode ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-600"}`}>
            <Clock size={20} />
          </div>
        </div>

        {/* KPI Completadas */}
        <div
          className={`p-5 rounded-xl border ${
            darkMode
              ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70 shadow-lg shadow-black/20"
              : "bg-white border-slate-200 shadow-sm"
          } flex items-center justify-between`}
        >
          <div className="space-y-1">
            <p className={`text-[10px] font-bold uppercase tracking-wider ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
              Tareas Resueltas
            </p>
            <p className={`text-2xl font-extrabold ${darkMode ? "text-[#00C294]" : "text-emerald-600"}`}>
              {loading ? "..." : completedCount}
            </p>
            <p className="text-[11px] text-slate-500">Total acumulado de área</p>
          </div>
          <div className={`p-3 rounded-lg ${darkMode ? "bg-[#00C294]/10 text-[#00C294]" : "bg-emerald-50 text-emerald-600"}`}>
            <CheckCircle2 size={20} />
          </div>
        </div>
      </div>

      {/* RUTA OPERATIVA (FULL WIDTH) */}
      <div
        className={`w-full flex flex-col gap-4 overflow-hidden rounded-2xl border ${
          darkMode
            ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70 shadow-lg shadow-black/20"
            : "bg-white border-slate-200"
        } p-6`}
      >
        <div className="border-b border-zinc-800 pb-3">
          <h2 className={`text-lg font-bold ${darkMode ? "text-white" : "text-slate-800"}`}>
            Hoja de Ruta de Departamento
          </h2>
          <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
            Seguimiento y delegación de tareas oficiales de {gerenciaDelGerente}
          </p>
        </div>
        
        <HojaDeRuta
          darkMode={darkMode}
          users={users}
          userRole={userRole}
          currentUserId={String(user.id)}
        />
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
