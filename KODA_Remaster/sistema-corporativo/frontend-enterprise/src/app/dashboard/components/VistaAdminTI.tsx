"use client";
import React, { useState, useEffect, useMemo } from "react";
import { Users, FileText, Tag, Bell, Mail, Sparkles, LogOut, Activity, Database, Server, Cpu } from "lucide-react";
import { User } from "../../../context/AuthContext";
import { ApiUser, ApiDocument, AnnouncementData } from "../../../lib/api";
import { Ticket } from "../../../components/TicketSystem";

interface VistaAdminTIProps {
  user: User;
  users: ApiUser[];
  documents: ApiDocument[];
  tickets: Ticket[];
  unreadInboxCount: number;
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

interface StatCardProps {
  title: string;
  value: string;
  subtext: string;
  icon: React.ElementType;
  darkMode: boolean;
  trend?: string;
  trendPositive?: boolean;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtext,
  icon: Icon,
  darkMode,
  trend,
  trendPositive,
}) => (
  <div
    className={`
      remaster-card remaster-lift p-5 rounded-lg border flex flex-col justify-between h-full
      ${
        darkMode
          ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70 hover:border-[#0bbf8c]/50 hover:shadow-[0_4px_20px_rgba(11,191,140,0.12)] shadow-lg shadow-black/20"
          : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
      }
    `}
  >
    <div className="flex justify-between items-start mb-2">
      <span
        className={`text-xs font-semibold uppercase tracking-wider ${
          darkMode ? "text-[#94A3B8]" : "text-slate-500"
        }`}
      >
        {title}
      </span>
      <Icon size={18} className={darkMode ? "text-[#94A3B8]" : "text-slate-400"} />
    </div>
    <div className="flex items-baseline gap-2 mb-1">
      <span
        className={`text-2xl font-bold ${
          darkMode
            ? value === "0"
              ? "text-[#00C294]"
              : "text-[#E0E6E6]"
            : "text-slate-900"
        }`}
      >
        {value}
      </span>
      {trend && (
        <span
          className={`text-xs font-bold px-1.5 py-0.5 rounded ${
            trend === "Sin pendientes" || trend === "Al día" || trendPositive
              ? darkMode
                ? "bg-[#00C294]/15 text-[#00C294]"
                : "bg-emerald-50 text-emerald-700"
              : trend === "Activos" || trend === "Total" || trend === "Verificado"
              ? darkMode
                ? "bg-slate-800 text-[#94A3B8]"
                : "bg-slate-100 text-slate-600"
              : darkMode
              ? "bg-red-900/30 text-red-400"
              : "bg-red-50 text-red-700"
          }`}
        >
          {trend}
        </span>
      )}
    </div>
    <p className={`text-xs ${darkMode ? "text-[#94A3B8]" : "text-slate-500"}`}>{subtext}</p>
  </div>
);

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

export function VistaAdminTI({
  user,
  users,
  documents,
  tickets,
  unreadInboxCount,
  darkMode,
  logout,
  announcement,
  announcementColors,
}: VistaAdminTIProps) {
  // Mock Realtime Metrics State
  const [cpuUsage, setCpuUsage] = useState(24);
  const [ramUsage, setRamUsage] = useState(4.8);
  const [dbConnections, setDbConnections] = useState(4);
  const [dbLatency, setDbLatency] = useState(12);
  const [systemLogs, setSystemLogs] = useState<string[]>([
    "System Init successful on port 8000",
    "Database connection pool initialized",
    "PgBouncer statement cache disabled (size=0)",
  ]);

  // Simular métricas en tiempo real
  useEffect(() => {
    const interval = setInterval(() => {
      setCpuUsage((prev) => {
        const delta = Math.floor(Math.random() * 9) - 4;
        const next = prev + delta;
        return Math.max(10, Math.min(85, next));
      });
      setDbLatency((prev) => {
        const delta = Math.floor(Math.random() * 5) - 2;
        const next = prev + delta;
        return Math.max(5, Math.min(25, next));
      });
      setDbConnections((prev) => {
        const delta = Math.floor(Math.random() * 3) - 1;
        const next = prev + delta;
        return Math.max(2, Math.min(12, next));
      });
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // Simular logs de auditoría en tiempo real
  useEffect(() => {
    const logTemplates = [
      "User authentication successful",
      "API request GET /usuarios - 200 OK",
      "Document signature verified: UUID ",
      "Rate limiter checker: 0 triggers triggered",
      "Ledger verification task executed",
      "Auth session refreshed",
      "API request PUT /org-structure - 200 OK",
      "Audit log record inserted to database",
    ];

    const interval = setInterval(() => {
      const randomTemplate = logTemplates[Math.floor(Math.random() * logTemplates.length)];
      const timestamp = new Date().toLocaleTimeString();
      const newLog = `[${timestamp}] ${randomTemplate}${
        randomTemplate.includes("UUID") ? Math.random().toString(36).substring(2, 10).toUpperCase() : ""
      }`;
      setSystemLogs((prev) => [newLog, ...prev.slice(0, 15)]);
    }, 4500);

    return () => clearInterval(interval);
  }, []);

  const activeUsers = useMemo(() => {
    return users.filter((u: any) => u?.estado !== false && u?.is_active !== false).length;
  }, [users]);

  const totalDocs = useMemo(() => {
    return documents.length;
  }, [documents]);

  const pendingDocs = useMemo(() => {
    return documents.filter(
      (d) => d.status === "en-proceso" || d.status === "pendiente" || d.signatureStatus === "en-proceso" || d.signatureStatus === "pendiente"
    ).length;
  }, [documents]);

  const totalTicketsOpen = useMemo(() => {
    return tickets.filter((t) => t.status === "ABIERTO").length;
  }, [tickets]);

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
      {/* HEADER: VISTA ADMIN TI */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1
            className={`text-3xl font-bold tracking-tight ${
              darkMode ? "text-white" : "text-slate-700"
            }`}
          >
            Dashboard de Administración de TI
          </h1>
          <p className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
            {formattedDate} — Bienvenido, {user.nombre || "Administrador"}. Control operativo de infraestructura y cuentas.
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
            Panel de Administración
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

      {/* METRICAS TÉCNICAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Usuarios Activos"
          value={String(activeUsers)}
          subtext="Con cuenta habilitada"
          icon={Users}
          darkMode={darkMode}
          trend="Total"
          trendPositive={true}
        />
        <StatCard
          title="Documentos"
          value={String(totalDocs)}
          subtext={`${pendingDocs} en proceso`}
          icon={FileText}
          darkMode={darkMode}
          trend="Total"
          trendPositive={true}
        />
        <StatCard
          title="Tickets Abiertos"
          value={String(totalTicketsOpen)}
          subtext={`De ${tickets.length} totales`}
          icon={Tag}
          darkMode={darkMode}
          trend={totalTicketsOpen === 0 ? "Sin pendientes" : "Pendientes"}
          trendPositive={totalTicketsOpen === 0}
        />
        <StatCard
          title="No Leídos"
          value={String(unreadInboxCount)}
          subtext="En bandeja de entrada"
          icon={Bell}
          darkMode={darkMode}
          trend={unreadInboxCount > 0 ? "Pendientes" : "Al día"}
          trendPositive={unreadInboxCount === 0}
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
