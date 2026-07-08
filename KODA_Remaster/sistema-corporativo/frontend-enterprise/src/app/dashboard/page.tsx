"use client";
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Home,
  BarChart2,
  Users,
  Settings,
  Bell,
  Search,
  ChevronRight,
  Activity,
  Server,
  Shield,
  Zap,
  LogOut,
  AlertTriangle,
  Filter,
  Sun,
  Moon,
  Building2,
  Briefcase,
  Factory,
  ChevronDown,
  ChevronUp,
  Download,
  Info,
  Clock,
  TrendingUp,
  UsersRound,
  Flag,
  Tag,
  FileText,
  Printer,
  CheckCircle,
  AlertCircle,
  File,
  FileCheck,
  Check,
  X,
  AlertOctagon,
  Eye,
  Trash2,
  Mail,
  Globe,
  Sparkles,
  Inbox,
  Send,
  Map as MapIcon,
  FileSpreadsheet,
  Code,
} from "lucide-react";

import TicketSystem, { Ticket } from "../../components/TicketSystem";

import { logDocumentActivity } from "./security/actions";
import { useAuth } from "../../hooks/useAuth";
import { UserRole, User } from "../../context/AuthContext";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import { useIdleTimer } from "../../hooks/useIdleTimer";
import { DepartmentGrid } from "./components/DepartmentGrid";
import { DepartmentDetailView } from "./components/DepartmentDetailView";
import { HojaDeRuta } from "./components/HojaDeRuta";
import BillingModule from "./components/BillingModule";
import { OrgCategory, Document } from "./types";
import { DirectorioPersonas } from "./components/DirectorioPersonas";
import { VistaUsuarioComun } from "./components/VistaUsuarioComun";
import { VistaGerente } from "./components/VistaGerente";
import { VistaDirectivo } from "./components/VistaDirectivo";
import { VistaAdminTI } from "./components/VistaAdminTI";
import { RoleGuard } from "../../components/RoleGuard";
import { PERMISSIONS_MASTER } from "../../permissions/constants";
import {
  getDocumentos,
  uploadDocumento,
  updateDocumentStatus as apiUpdateStatus,
  respondDocumento as apiRespondDocumento,
  getDocumentoRespuestas as apiGetDocumentoRespuestas,
  getDocumentoEventos as apiGetDocumentoEventos,
  getAllUsers,
  getGerencias,
  getTickets,
  markAsRead,
  deleteDocumento,
  purgeControlSeguimiento,
  getAnnouncement,
  getOrgStructure,
  getOrgManagementDetails,
  saveOrgStructure,
  saveOrgManagementDetails,
  createSecurityLog,
} from "../../lib/api";
import { ApiDocument, ApiUser } from "../../lib/api";
import { uiAlert, uiConfirm, uiPrompt } from "../../lib/ui-dialog";
const ResponsiveContainerCompat =
  ResponsiveContainer as unknown as React.ComponentType<any>;
const PieChartCompat = PieChart as unknown as React.ComponentType<any>;
const PieCompat = Pie as unknown as React.ComponentType<any>;
const CellCompat = Cell as unknown as React.ComponentType<any>;
const TooltipCompat = Tooltip as unknown as React.ComponentType<any>;
const LegendCompat = Legend as unknown as React.ComponentType<any>;
const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "/api";

// ==========================================
// TIPOS Y INTERFACES
// ==========================================

interface SidebarItemProps {
  icon: React.ElementType;
  label: string;
  active: boolean;
  collapsed: boolean;
  darkMode: boolean;
  badgeCount?: number;
  onClick?: () => void;
  href?: string;
}
interface SidebarGroupItem {
  id: string;
  label: string;
  icon: React.ElementType;
  canAccess: boolean;
  badgeCount?: number;
  href?: string;
}

interface SidebarGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  /** Roles que pueden ver este grupo. null = todos los roles */
  allowedRoles: UserRole[] | null;
  items: SidebarGroupItem[];
}

interface DeptCardProps {
  group: OrgCategory;
  darkMode: boolean;
  onToggle?: () => void;
  onItemClick?: (item: string) => void;
}
interface AuditAlert {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  date: string;
}
interface PriorityItem {
  id: number;
  title: string;
  description: string;
  priority: "alta" | "media" | "baja";
  responsible: string;
  deadline: string;
  status: "pendiente" | "en-progreso" | "completado";
}

interface AnnouncementData {
  badge: string;
  title: string;
  description: string;
  status: string;
  urgency: string;
  color?: string;
}

const HEX_COLOR_RE = /^#([0-9a-fA-F]{6})$/;

function normalizeHexColor(value?: string, fallback = "#075159"): string {
  const candidate = String(value || "").trim();
  return HEX_COLOR_RE.test(candidate) ? candidate : fallback;
}

function shiftHexColor(hex: string, amount: number): string {
  const clean = normalizeHexColor(hex).slice(1);
  const num = Number.parseInt(clean, 16);
  const r = (num >> 16) & 0xff;
  const g = (num >> 8) & 0xff;
  const b = num & 0xff;
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const nextR = clamp(r + amount);
  const nextG = clamp(g + amount);
  const nextB = clamp(b + amount);
  return `#${nextR.toString(16).padStart(2, "0")}${nextG.toString(16).padStart(2, "0")}${nextB.toString(16).padStart(2, "0")}`;
}

function ensureArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeOrgStructurePayload(value: unknown): OrgCategory[] {
  return ensureArray<any>(value)
    .map((group) => {
      if (!group || typeof group !== "object") return null;

      const category = String(group.category || "").trim();
      if (!category) return null;

      return {
        category,
        icon: String(group.icon || "Shield").trim() || "Shield",
        items: (() => {
          if (Array.isArray(group.items)) {
            return ensureArray<unknown>(group.items)
              .map((item) => String(item || "").trim())
              .filter(Boolean);
          }

          if (typeof group.items === "string") {
            const raw = group.items.trim();
            if (!raw) return [];

            try {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed)) {
                return parsed
                  .map((item) => String(item || "").trim())
                  .filter(Boolean);
              }
            } catch {
              // Ignore invalid legacy payloads and fall back to text splitting.
            }

            return raw
              .split(/\r?\n|,/)
              .map((item: string) => item.trim())
              .filter(Boolean);
          }

          return [];
        })(),
      } as OrgCategory;
    })
    .filter((group): group is OrgCategory => !!group);
}

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

function capitalizeDateParts(value: string): string {
  return String(value || "").replace(/(^|[\s,])(\p{L})/gu, (_match, prefix, letter: string) => {
    return `${prefix}${letter.toUpperCase()}`;
  });
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

// ==========================================
// DATA MOCKS
// ==========================================
// Mapping icons for serialization support
const ORG_ICONS: Record<string, React.ElementType> = {
  Shield,
  Briefcase,
  Zap,
  Users,
  Factory,
};

const DEFAULT_ORG_STRUCTURE: OrgCategory[] = [
  {
    category: "I. Alta Dirección y Control",
    icon: "Shield",
    items: [
      "Gerencia General",
      "Auditoría Interna",
      "Consultoría Jurídica",
      "Gerencia Nacional de Planificación y Presupuesto",
    ],
  },
  {
    category: "II. Gestión Administrativa",
    icon: "Briefcase",
    items: [
      "Gerencia Nacional de Administración",
      "Gerencia Nacional de Gestión Humana",
      "Gerencia Nacional de Tecnologías de la Información y la Comunicación",
      "Gerencia Nacional de Tecnologías de Proyectos",
    ],
  },
  {
    category: "III. Gestión Operativa y ASHO",
    icon: "Zap",
    items: [
      "Gerencia Nacional de Adecuaciones y Mejoras",
      "Gerencia Nacional de Asho",
      "Gerencia Nacional de Atención al Ciudadano",
      "Gerencia de Comercialización",
    ],
  },
  {
    category: "IV. Energía y Comunidad",
    icon: "Users",
    items: [
      "Gerencia Nacional de Energía Alternativa y Eficiencia Energética",
      "Gerencia Nacional de Gestión Comunal",
    ],
  },
  {
    category: "V. Filiales y Unidades",
    icon: "Factory",
    items: ["Unerven", "Vietven"],
  },
];

const MANAGEMENT_DETAILS: Record<string, string[]> = {
  "Gerencia General": [
    "Definición de políticas institucionales.",
    "Supervisión de Gerencias operativas y administrativas.",
    "Representación legal de la institución.",
    "Aprobación de presupuesto anual.",
    "Coordinación de relaciones interinstitucionales.",
  ],
  "Auditoría Interna": [
    "Evaluación de controles internos.",
    "Auditoría de procesos financieros y administrativos.",
    "Verificación del cumplimiento normativo.",
    "Investigación de irregularidades.",
    "Elaboración de informes de gestión de riesgos.",
  ],
  "Consultoría Jurídica": [
    "Asesoría legal a la presidencia y Gerencias.",
    "Revisión y redacción de contratos y convenios.",
    "Defensa judicial y extrajudicial de la institución.",
    "Emitir dictámenes jurídicos vinculantes.",
  ],
  "Gerencia Nacional de Planificación y Presupuesto": [
    "Formulación del Plan Operativo Anual (POA).",
    "Control y seguimiento de la ejecución presupuestaria.",
    "Evaluación de indicadores de gestión.",
    "Proyección de escenarios financieros a mediano plazo.",
  ],
  "Gerencia Nacional de Administración": [
    "Gestión de recursos financieros y tesorería.",
    "Administración de servicios generales.",
    "Procesamiento de pagos a proveedores.",
    "Contabilización de operaciones financieras.",
  ],
  "Gerencia Nacional de Gestión Humana": [
    "Reclutamiento y selección de personal.",
    "Gestión de nómina y beneficios laborales.",
    "Planificación de capacitación y desarrollo.",
    "Evaluación del desempeño del personal.",
  ],
  "Gerencia Nacional de Tecnologías de la Información y la Comunicación": [
    "Mantenimiento de infraestructura tecnológica.",
    "Desarrollo y soporte de sistemas de información.",
    "Garantizar la seguridad de la información.",
    "Soporte técnico a usuarios finales.",
  ],
  "Gestión Directa": [
    "Acceso a la terminal de comandos del servidor.",
    "Monitoreo de procesos en tiempo real.",
    "Ajuste de variables de entorno críticas.",
    "Gestión de certificados SSL y seguridad perimetral.",
  ],
  "Logs de Auditoría": [
    "Consulta de trazas de base de datos a bajo nivel.",
    "Historial completo de intentos de intrusión.",
    "Seguimiento de cambios en esquemas de permisos.",
    "Exportación de logs en formato raw JSON/CSV.",
  ],
};

const getDefaultFunctions = (name: string) => [
  `Gestión operativa de ${name}.`,
  "Coordinación de personal asignado.",
  "Reporte de indicadores de gestión.",
  "Cumplimiento de metas trimestrales asignadas.",
  "Seguimiento de planes de mejora continua.",
];

const PLANT_METRICS = [
  {
    name: "Planta Luis Zambrano",
    availability: 95,
    trend: "+2%",
    status: "optimal",
  },
  {
    name: "Planta Metrocontadores",
    availability: 88,
    trend: "-1%",
    status: "warning",
  },
  { name: "Planta Tanques", availability: 92, trend: "+5%", status: "optimal" },
  { name: "Centro Textil", availability: 85, trend: "-3%", status: "warning" },
  { name: "UNERVEN", availability: 90, trend: "+1%", status: "optimal" },
  { name: "VIETVEN", availability: 87, trend: "+4%", status: "optimal" },
];

const AUDIT_ALERTS: AuditAlert[] = [
  {
    title: "Revisión Jurídica Pendiente",
    description: "Gerencia General requiere firma de documentos legales",
    priority: "high",
    date: "Hoy",
  },
  {
    title: "Mantenimiento Preventivo",
    description: "Planta Tanques entra en ciclo de revisión programada",
    priority: "medium",
    date: "Mañana",
  },
  {
    title: "Actualización de Protocolos",
    description: "Departamento TIC necesita aprobación de nuevos estándares",
    priority: "low",
    date: "En 3 días",
  },
];

// NUEVOS DATOS PARA M?"DULOS
const PRIORITY_MATRIX: PriorityItem[] = [];

// Tickets data moved to TicketSystem component

const INITIAL_DOCUMENTS: Document[] = [];

// NUEVOS DATOS PARA M?"DULO DE SEGURIDAD
const ACCOUNT_REQUESTS = [
  {
    id: 1,
    name: "Pedro Alcantara",
    email: "p.alcantara@koda.local",
    department: "Sistemas",
    date: "04/02/2026",
    status: "pendiente",
  },
  {
    id: 2,
    name: "Maria Gonzalez",
    email: "m.gonzalez@koda.local",
    department: "Admin",
    date: "03/02/2026",
    status: "pendiente",
  },
];

const USER_PERMISSIONS = [
  {
    id: 101,
    user: "JPEREZ (Admin)",
    role: "Administrador Global",
    access: ["Todo"],
    lastActive: "Ahora",
  },
  {
    id: 102,
    user: "MARODRIGUEZ (Gerente)",
    role: "Gerente Planta",
    access: ["Reportes", "Personal"],
    lastActive: "Hace 10 min",
  },
  {
    id: 103,
    user: "CSANCHEZ (Soporte)",
    role: "Técnico Nivel 2",
    access: ["Tickets", "Sistemas"],
    lastActive: "Hace 1h",
  },
];

const SECURITY_LOGS = [
  {
    id: 1,
    event: "Inicio de Sesión Exitoso",
    user: "JPEREZ",
    ip: "192.168.1.10",
    time: "10:23 AM",
  },
  {
    id: 2,
    event: "Cambio de Permisos",
    user: "SYSTEM",
    ip: "LOCALHOST",
    time: "09:45 AM",
  },
  {
    id: 3,
    event: "Intento Fallido de Acceso",
    user: "UNKNOWN",
    ip: "192.168.1.45",
    time: "08:12 AM",
  },
];

const MANAGEMENT_DETAILS_STORAGE_KEY = "management_details_custom_2026";
const DASHBOARD_THEME_STORAGE_KEY = "dashboard_theme_2026";

// ==========================================
// COMPONENTES REUTILIZABLES (CORPORATE STYLE)
// ==========================================
const ThemeToggle: React.FC<{ darkMode: boolean; onToggle: () => void }> = ({
  darkMode,
  onToggle,
}) => (
  <button
    onClick={onToggle}
    aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
    className={`
      p-2 rounded-md transition-colors border
      ${darkMode
        ? "bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700"
        : "bg-[#e7f1f4] border-[#b7d0dd] text-[#315878] hover:text-[#0d47a1] hover:bg-[#dbeaf0]"
      }
    `}
  >
    {darkMode ? <Sun size={16} /> : <Moon size={16} />}
  </button>
);

const SidebarItem: React.FC<SidebarItemProps> = ({
  icon: Icon,
  label,
  active,
  collapsed,
  darkMode,
  badgeCount = 0,
  onClick,
  href,
}) => {
  const className = `
    group glass-hover flex items-center ${collapsed ? "justify-center" : "justify-between"} gap-3 px-3 py-2.5 rounded-md cursor-pointer transition-all duration-200 min-w-0 relative
    ${active
      ? darkMode
        ? "bg-[#00C294]/10 text-[#00C294] shadow-sm border border-[#00C294]/50"
        : "bg-[#00C294] text-white shadow-sm border border-[#00A37C]/20"
      : darkMode
        ? "text-[#94A3B8] hover:bg-[#263636] hover:text-[#E0E6E6]"
        : "text-slate-600 hover:bg-slate-100 hover:text-[#00C294]"
    }
  `;

  const content = (
    <>
      <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3 min-w-0 flex-1"}`}>
        <div className="relative shrink-0">
          <Icon size={18} className={`${active ? (darkMode ? "text-[#00C294]" : "text-white") : ""}`} />
          {collapsed && badgeCount > 0 && (
            <span
              className={`
                absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold
                flex items-center justify-center shadow-sm ring-2
                ${darkMode
                  ? "bg-amber-400 text-slate-950 ring-slate-900"
                  : "bg-[#1976D2] text-white ring-[#d1e4e9]"}
              `}
            >
              {badgeCount > 99 ? "99+" : badgeCount}
            </span>
          )}
        </div>
        {!collapsed && (
          <span className="font-medium text-sm tracking-tight truncate">{label}</span>
        )}
      </div>
      {!collapsed && badgeCount > 0 && (
        <span
          className={`
            ml-2 shrink-0 min-w-[26px] h-6 px-2 rounded-full text-xs font-bold
            flex items-center justify-center shadow-sm
            ${darkMode
              ? "bg-amber-300/95 text-slate-950"
              : "bg-[#1976D2] text-white"}
          `}
        >
          {badgeCount > 99 ? "99+" : badgeCount}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onClick}
        className={className}
        style={{ textDecoration: 'none' }}
      >
        {content}
      </a>
    );
  }

  return (
    <div
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={label}
      className={className}
    >
      {content}
    </div>
  );
};

// ==========================================
// SIDEBAR ACCORDION — Grupo expandible con RBAC
// ==========================================
const SidebarAccordion: React.FC<{
  group: SidebarGroup;
  isOpen: boolean;
  onToggle: () => void;
  collapsed: boolean;
  darkMode: boolean;
  activeTab: string;
  activeSection: string;
  onNavigate: (tabId: string) => void;
}> = ({ group, isOpen, onToggle, collapsed, darkMode, activeTab, activeSection, onNavigate }) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number>(0);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [group.items, isOpen]);

  const visibleItems = group.items.filter((item) => item.canAccess);
  if (visibleItems.length === 0) return null;

  const hasActiveItem = visibleItems.some(
    (item) => activeSection === "dashboard" && activeTab === item.id
  );

  // Cuando el sidebar está colapsado, mostramos solo los íconos de los ítems directamente
  if (collapsed) {
    return (
      <div className="space-y-1">
        {visibleItems.map((item) => (
          <SidebarItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeSection === "dashboard" && activeTab === item.id}
            collapsed={collapsed}
            darkMode={darkMode}
            badgeCount={item.badgeCount}
            href={item.href}
            onClick={item.href ? undefined : () => onNavigate(item.id)}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {/* Accordion Header */}
      <button
        onClick={onToggle}
        className={`
          w-full flex items-center justify-between px-3 py-2 rounded-md text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-200
          ${hasActiveItem
            ? darkMode
              ? "text-[#00C294]"
              : "text-[#00A37C]"
            : darkMode
              ? "text-[#5E7577] hover:text-[#94A3B8]"
              : "text-slate-400 hover:text-slate-600"
          }
        `}
      >
        <div className="flex items-center gap-2">
          <group.icon size={12} className={hasActiveItem ? (darkMode ? "text-[#00C294]" : "text-[#00A37C]") : ""} />
          <span>{group.label}</span>
        </div>
        <ChevronDown
          size={12}
          className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {/* Accordion Content — animated height */}
      <div
        style={{
          maxHeight: isOpen ? `${contentHeight}px` : "0px",
          opacity: isOpen ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease",
        }}
      >
        <div ref={contentRef} className="space-y-0.5 pb-1">
          {visibleItems.map((item) => (
            <SidebarItem
              key={item.id}
              icon={item.icon}
              label={item.label}
              active={activeSection === "dashboard" && activeTab === item.id}
              collapsed={collapsed}
              darkMode={darkMode}
              badgeCount={item.badgeCount}
              href={item.href}
              onClick={item.href ? undefined : () => onNavigate(item.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// MI NEGOCIO WIDGETS — Placeholder para roles no-Administrative
// ==========================================
const MiNegocioWidgets: React.FC<{ darkMode: boolean }> = ({ darkMode }) => (
  <div
    className={`rounded-2xl border p-8 text-center ${
      darkMode
        ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70 shadow-lg shadow-black/20"
        : "bg-white border-slate-200 shadow-sm"
    }`}
  >
    <div
      className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-4 ${
        darkMode
          ? "bg-[#00C294]/10 text-[#00C294]"
          : "bg-emerald-50 text-emerald-600"
      }`}
    >
      <Briefcase size={28} />
    </div>
    <h3
      className={`text-lg font-bold mb-2 ${
        darkMode ? "text-[#E0E6E6]" : "text-slate-800"
      }`}
    >
      Panel Mi Negocio
    </h3>
    <p
      className={`text-sm max-w-md mx-auto ${
        darkMode ? "text-[#94A3B8]" : "text-slate-500"
      }`}
    >
      Pronto podrás visualizar métricas clave de tu negocio, indicadores financieros y resúmenes ejecutivos personalizados para tu rol.
    </p>
    <div
      className={`mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider ${
        darkMode
          ? "bg-[#00C294]/10 text-[#00C294] border border-[#00C294]/30"
          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
      }`}
    >
      <Zap size={12} />
      Próximamente
    </div>
  </div>
);

const DeptCard: React.FC<DeptCardProps> = ({
  group,
  darkMode,
  onToggle,
  onItemClick,
}) => {
  const [expanded, setExpanded] = useState(true);
  const toggleExpand = () => {
    setExpanded(!expanded);
    onToggle?.();
  };

  return (
    <div
      className={`
      remaster-card remaster-lift rounded-lg border transition-all duration-200
      ${darkMode
          ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70 hover:border-[#0bbf8c]/50 hover:shadow-[0_4px_20px_rgba(11,191,140,0.12)] shadow-lg shadow-black/20"
          : "bg-[#edf5f7] border-[#bfd6e0] hover:border-[#8fb4c9]"
        }
    `}
    >
      <div
        onClick={toggleExpand}
        className={`
          p-3 border-b cursor-pointer flex items-center justify-between transition-colors
          ${darkMode ? "border-[#1d3538]/50 hover:bg-[#122224]/50" : "border-[#d5e6ec] hover:bg-[#e4f0f4]"}
        `}
      >
        <div className="flex items-center gap-2">
          {(() => {
            const IconComp = ORG_ICONS[group.icon] || Shield;
            return (
              <IconComp
                size={16}
                className={darkMode ? "text-[#94A3B8]" : "text-slate-500"}
              />
            );
          })()}
          <h3
            className={`font-semibold text-xs uppercase tracking-wide ${darkMode ? "text-[#E0E6E6]" : "text-slate-700"}`}
          >
            {group.category}
          </h3>
        </div>
        {expanded ? (
          <ChevronUp size={14} className="text-slate-500" />
        ) : (
          <ChevronDown size={14} className="text-slate-500" />
        )}
      </div>
      {expanded && (
        <div className="p-2 space-y-1">
          {group.items.map((item, idx) => (
            <div
              key={idx}
              onClick={() => onItemClick?.(item)}
              className={`
                flex items-center gap-2 px-2 py-1.5 rounded transition-colors text-xs cursor-pointer
                ${darkMode
                  ? "text-[#94A3B8] hover:bg-[#263636] hover:text-[#E0E6E6]"
                  : "text-[#406786] hover:bg-[#dbeaf0] hover:text-[#0d47a1]"
                }
              `}
            >
              <div
                className={`w-1 h-1 rounded-full ${darkMode ? "bg-red-800" : "bg-red-600"}`}
              />
              {item}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

interface ManagementDetail {
  lider?: string;
  contacto?: string;
  objetivos?: string[];
  funciones?: string[];
}

const DetailModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  detail: ManagementDetail;
  darkMode: boolean;
  canEdit: boolean;
  onSave: (title: string, nextDetail: ManagementDetail) => void;
}> = ({ isOpen, onClose, title, detail, darkMode, canEdit, onSave }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draftLider, setDraftLider] = useState("");
  const [draftContacto, setDraftContacto] = useState("");
  const [draftObjetivos, setDraftObjetivos] = useState("");
  const [draftFunciones, setDraftFunciones] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setIsEditing(false);
    setDraftLider(detail?.lider || "");
    setDraftContacto(detail?.contacto || "");
    setDraftObjetivos((detail?.objetivos || []).join("\n"));
    setDraftFunciones((detail?.funciones || []).join("\n"));
  }, [isOpen, title, detail]);

  if (!isOpen) return null;

  const saveChanges = () => {
    const nextFunc = draftFunciones
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const nextObj = draftObjetivos
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (nextFunc.length === 0) {
      void uiAlert("Debe existir al menos una función para guardar.", "Validacion");
      return;
    }
    onSave(title, {
      lider: draftLider.trim(),
      contacto: draftContacto.trim(),
      objetivos: nextObj,
      funciones: nextFunc,
    });
    setIsEditing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        className={`
          remaster-card w-full max-w-lg rounded-xl shadow-2xl transform transition-all scale-100 flex flex-col max-h-[85vh]
          ${darkMode ? "bg-zinc-900 border border-zinc-700 text-slate-100" : "bg-white text-slate-800"}
        `}
      >
        <div
          className={`flex items-center justify-between p-4 border-b ${darkMode ? "border-zinc-800" : "border-slate-100"}`}
        >
          <h3
            className={`font-bold text-lg ${darkMode ? "text-white" : "text-slate-900"}`}
          >
            {title}
          </h3>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-md transition-colors ${darkMode ? "hover:bg-zinc-800 text-zinc-400" : "hover:bg-slate-100 text-slate-500"}`}
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {isEditing ? (
            <div className="space-y-4">
              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                  Líder de la Gerencia
                </label>
                <input
                  type="text"
                  value={draftLider}
                  onChange={(e) => setDraftLider(e.target.value)}
                  placeholder="Ej: Ing. Juan Pérez"
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${darkMode ? "bg-zinc-950 border-zinc-700 text-slate-200 focus:border-emerald-500" : "bg-white border-slate-300 text-slate-800 focus:border-blue-500"}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                  Contacto / Correo Electrónico
                </label>
                <input
                  type="email"
                  value={draftContacto}
                  onChange={(e) => setDraftContacto(e.target.value)}
                  placeholder="Ej: jperez@empresa.com"
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${darkMode ? "bg-zinc-950 border-zinc-700 text-slate-200 focus:border-emerald-500" : "bg-white border-slate-300 text-slate-800 focus:border-blue-500"}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                  Objetivos (Uno por línea)
                </label>
                <textarea
                  value={draftObjetivos}
                  onChange={(e) => setDraftObjetivos(e.target.value)}
                  rows={4}
                  placeholder="Ej: Incrementar la disponibilidad de sistemas al 99%."
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${darkMode ? "bg-zinc-950 border-zinc-700 text-slate-200 focus:border-emerald-500" : "bg-white border-slate-300 text-slate-800 focus:border-blue-500"}`}
                />
              </div>

              <div>
                <label className={`block text-xs font-bold uppercase tracking-wider mb-1 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                  Funciones Operativas (Una por línea)
                </label>
                <textarea
                  value={draftFunciones}
                  onChange={(e) => setDraftFunciones(e.target.value)}
                  rows={6}
                  placeholder="Ej: Formular el plan de contingencia tecnológica."
                  className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${darkMode ? "bg-zinc-950 border-zinc-700 text-slate-200 focus:border-emerald-500" : "bg-white border-slate-300 text-slate-800 focus:border-blue-500"}`}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Leader & Contact grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className={`p-4 rounded-xl border flex items-center gap-3 ${darkMode ? "bg-zinc-950/40 border-zinc-800" : "bg-slate-50 border-slate-100"}`}>
                  <div className={`p-2 rounded-lg ${darkMode ? "bg-emerald-950/30 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
                    <Users size={18} />
                  </div>
                  <div>
                    <h5 className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Líder</h5>
                    <p className="text-sm font-semibold">{detail.lider || "No asignado"}</p>
                  </div>
                </div>

                <div className={`p-4 rounded-xl border flex items-center gap-3 ${darkMode ? "bg-zinc-950/40 border-zinc-800" : "bg-slate-50 border-slate-100"}`}>
                  <div className={`p-2 rounded-lg ${darkMode ? "bg-blue-950/30 text-blue-400" : "bg-blue-50 text-blue-600"}`}>
                    <Mail size={18} />
                  </div>
                  <div>
                    <h5 className={`text-[10px] font-bold uppercase tracking-wide ${darkMode ? "text-slate-500" : "text-slate-400"}`}>Contacto</h5>
                    {detail.contacto ? (
                      <a href={`mailto:${detail.contacto}`} className="text-sm font-semibold hover:underline text-blue-500 break-all">{detail.contacto}</a>
                    ) : (
                      <p className="text-sm font-semibold">No asignado</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Objetivos */}
              <div>
                <h4 className={`text-xs font-bold uppercase tracking-wider mb-3 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                  Objetivos Estratégicos
                </h4>
                {detail.objetivos && detail.objetivos.length > 0 ? (
                  <ul className="space-y-2.5">
                    {detail.objetivos.map((obj, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <div className={`mt-0.5 p-0.5 rounded-full shrink-0 ${darkMode ? "bg-emerald-950/40 text-emerald-400" : "bg-emerald-50 text-emerald-600"}`}>
                          <Check size={12} />
                        </div>
                        <span className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{obj}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={`text-sm italic ${darkMode ? "text-slate-500" : "text-slate-400"}`}>No se han definido objetivos estratégicos.</p>
                )}
              </div>

              {/* Funciones */}
              <div>
                <h4 className={`text-xs font-bold uppercase tracking-wider mb-3 ${darkMode ? "text-slate-400" : "text-slate-500"}`}>
                  Funciones Operativas
                </h4>
                <ul className="space-y-2.5">
                  {detail.funciones && detail.funciones.length > 0 ? (
                    detail.funciones.map((func, idx) => (
                      <li key={idx} className="flex items-start gap-2.5">
                        <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${darkMode ? "bg-red-500" : "bg-red-600"}`} />
                        <span className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>{func}</span>
                      </li>
                    ))
                  ) : (
                    <li className={`text-sm italic ${darkMode ? "text-slate-500" : "text-slate-400"}`}>No hay funciones operativas configuradas.</li>
                  )}
                </ul>
              </div>
            </div>
          )}
        </div>

        <div
          className={`p-4 border-t flex justify-end gap-2 bg-slate-950/5 ${darkMode ? "border-zinc-800 bg-zinc-950/20" : "border-slate-100 bg-slate-50/50"}`}
        >
          {canEdit && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${darkMode
                ? "bg-blue-700/70 text-white hover:bg-blue-600"
                : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
            >
              Editar
            </button>
          )}
          {canEdit && isEditing && (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${darkMode
                  ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  : "border-slate-300 text-slate-700 hover:bg-slate-100"
                  }`}
              >
                Cancelar
              </button>
              <button
                onClick={saveChanges}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${darkMode
                  ? "bg-emerald-700/80 text-white hover:bg-emerald-600"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
                  }`}
              >
                Guardar
              </button>
            </>
          )}
          {!isEditing && (
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${darkMode
                ? "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                : "border-slate-300 text-slate-700 hover:bg-slate-100"
                }`}
            >
              Cerrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  title: string;
  value: string;
  subtext: string;
  icon: React.ElementType;
  darkMode: boolean;
  trend?: string;
  trendPositive?: boolean;
}> = ({
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
    ${darkMode
          ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70 hover:border-[#0bbf8c]/50 hover:shadow-[0_4px_20px_rgba(11,191,140,0.12)] shadow-lg shadow-black/20"
          : "bg-white border-slate-200 hover:border-slate-300"
        }
  `}
    >
      <div className="flex justify-between items-start mb-2">
        <span
          className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? "text-[#94A3B8]" : "text-slate-500"}`}
        >
          {title}
        </span>
        <Icon
          size={18}
          className={darkMode ? "text-[#94A3B8]" : "text-slate-400"}
        />
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
      <p className={`text-xs ${darkMode ? "text-[#94A3B8]" : "text-slate-500"}`}>
        {subtext}
      </p>
    </div>
  );

const AlertCard: React.FC<{
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  date: string;
  darkMode: boolean;
}> = ({ title, description, priority, date, darkMode }) => {
  const getStyles = () => {
    switch (priority) {
      case "high":
        return { borderL: "border-l-red-600", text: "text-red-600", bg: "" };
      case "medium":
        return {
          borderL: "border-l-amber-500",
          text: "text-amber-600",
          bg: "",
        };
      default:
        return { borderL: "border-l-blue-500", text: "text-blue-600", bg: "" };
    }
  };

  const s = getStyles();

  return (
    <div
      className={`
      pl-3 py-2 border-l-4 rounded-r-md transition-colors
      ${s.borderL}
      ${darkMode ? "bg-slate-800/30 hover:bg-slate-800/50" : "bg-slate-50 hover:bg-slate-100"}
    `}
    >
      <div className="flex justify-between items-start">
        <div>
          <span
            className={`text-xs font-bold uppercase ${s.text} block mb-0.5`}
          >
            {title}
          </span>
          <p
            className={`text-sm leading-tight ${darkMode ? "text-slate-300" : "text-slate-700"}`}
          >
            {description}
          </p>
        </div>
        <span
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${darkMode ? "bg-slate-800 text-slate-500" : "bg-white text-slate-500 border border-slate-200"}`}
        >
          {date}
        </span>
      </div>
    </div>
  );
};

// ==========================================
// NUEVOS COMPONENTES MODULARES
// ==========================================
const PriorityMatrix: React.FC<{
  darkMode: boolean;
  userRole: UserRole;
  user: User | null;
  isReadOnly?: boolean;
  documents: Document[];
  hasPermission: (permission: string) => boolean;
  refreshDocs: () => void | Promise<void>;
}> = ({ darkMode, userRole, user, isReadOnly, documents, hasPermission, refreshDocs }) => {
  const [trackingSearch, setTrackingSearch] = useState("");
  const [trackingStatus, setTrackingStatus] = useState<string>("all");
  const [trackingSender, setTrackingSender] = useState<string>("all");
  const [trackingResponseDraft, setTrackingResponseDraft] = useState("");
  const [trackingResponseFiles, setTrackingResponseFiles] = useState<File[]>([]);
  const [trackingResponses, setTrackingResponses] = useState<Array<{
    id: string;
    contenido: string;
    created_at: string;
    usuario_nombre?: string;
    archivos?: string[];
  }>>([]);
  const [trackingEvents, setTrackingEvents] = useState<Array<{
    id: number;
    action: string;
    details?: string;
    actor_username?: string;
    created_at: string;
  }>>([]);
  const [selectedTrackingDoc, setSelectedTrackingDoc] = useState<any | null>(null);
  const [trackingContentOpen, setTrackingContentOpen] = useState(false);
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
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
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

  const getStatusColor = (status: string) => {
    const normalized = String(status || "").toLowerCase();
    switch (normalized) {
      case "vencido":
        return darkMode
          ? "bg-red-500/10 text-red-400"
          : "bg-red-50 text-red-700";
      case "en-aclaracion":
        return darkMode
          ? "bg-purple-500/10 text-purple-400"
          : "bg-purple-50 text-purple-700";
      case "respondido":
        return darkMode
          ? "bg-blue-500/10 text-blue-400"
          : "bg-blue-50 text-blue-700";
      case "finalizado":
        return darkMode
          ? "bg-green-500/10 text-green-400"
          : "bg-green-50 text-green-700";
      case "en-proceso":
      case "en proceso":
        return darkMode
          ? "bg-amber-500/10 text-amber-400"
          : "bg-amber-50 text-amber-700";
      default:
        return darkMode
          ? "bg-slate-800 text-slate-400"
          : "bg-slate-100 text-slate-600";
    }
  };

  const parseDate = (value: string) => {
    if (!value) return 0;
    const normalized = value.trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
      const [dd, mm, yyyy] = normalized.split("/");
      return new Date(`${yyyy}-${mm}-${dd}T00:00:00`).getTime();
    }
    const parsed = parseFlexibleDateGlobal(normalized);
    return parsed ? parsed.getTime() : 0;
  };

  const getTrackingStatus = useCallback(
    (item: { rawStatus?: string; deadlineRaw?: string; fechaMaximaEntrega?: string }) => {
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
    },
    [],
  );

  const formatTrackingEvent = useCallback((ev: { action?: string; details?: string }) => {
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
  }, []);

  const handleMarkFinalized = useCallback(
    async (docId: number) => {
      try {
        setUpdatingTrackingStatus(true);
        await apiUpdateStatus(docId, "finalizado");
        setSelectedTrackingDoc((prev: any) =>
          prev && prev.id === docId
            ? { ...prev, rawStatus: "finalizado", status: "finalizado" }
            : prev,
        );
        await refreshDocs();
        void uiAlert("Documento marcado como FINALIZADO.", "Estado actualizado");
      } catch (error) {
        console.error("Error al marcar documento como finalizado:", error);
        void uiAlert("No se pudo actualizar el estado a FINALIZADO.", "Error");
      } finally {
        setUpdatingTrackingStatus(false);
      }
    },
    [refreshDocs],
  );

  const handleRequestClarification = useCallback(
    async (docId: number) => {
      const note = await uiPrompt(
        "Describe que falta o que debe aclararse.",
        "",
        "Solicitar aclaracion",
        "Escribe un comentario...",
      );
      if (note === null) return;
      try {
        setUpdatingTrackingStatus(true);
        await apiUpdateStatus(docId, "en-aclaracion", note.trim());
        setSelectedTrackingDoc((prev: any) =>
          prev && prev.id === docId
            ? { ...prev, rawStatus: "en-aclaracion", status: "en-aclaracion" }
            : prev,
        );
        await refreshDocs();
        void uiAlert("Aclaracion solicitada.", "Control de seguimiento");
      } catch (error) {
        console.error("Error solicitando aclaracion:", error);
        void uiAlert("No se pudo solicitar aclaracion.", "Error");
      } finally {
        setUpdatingTrackingStatus(false);
      }
    },
    [refreshDocs],
  );

  const handleSendTrackingResponse = useCallback(
    async (docId: number) => {
      const content = trackingResponseDraft.trim();
      if (!content && trackingResponseFiles.length === 0) {
        void uiAlert("Escribe una respuesta antes de enviar.", "Control de seguimiento");
        return;
      }
      try {
        await apiRespondDocumento(docId, content, trackingResponseFiles);
        setSelectedTrackingDoc((prev: any) =>
          prev && prev.id === docId
            ? {
              ...prev,
              rawStatus: "respondido",
              status: "respondido",
              respuesta_contenido: content,
              respuesta_usuario_nombre: user?.nombre ? `${user?.nombre} ${user?.apellido || ""}`.trim() : "Respuesta",
              respuesta_fecha: new Date().toISOString(),
            }
            : prev,
        );
        setTrackingResponseDraft("");
        setTrackingResponseFiles([]);
        try {
          const rows = await apiGetDocumentoRespuestas(docId);
          setTrackingResponses(rows || []);
        } catch {
          setTrackingResponses([]);
        }
        await refreshDocs();
        void uiAlert("Respuesta registrada.", "Control de seguimiento");
      } catch (error) {
        console.error("Error al responder documento:", error);
        void uiAlert("No se pudo registrar la respuesta.", "Error");
      }
    },
    [refreshDocs, trackingResponseDraft, trackingResponseFiles, user?.apellido, user?.nombre],
  );

  const DeadlineClock = ({
    sentDate,
    deadlineDate,
    status,
  }: {
    sentDate: string;
    deadlineDate: string;
    status: "en-proceso" | "vencido" | "finalizado" | "respondido" | "en-aclaracion";
  }) => {
    const sent = parseFlexibleDateGlobal(sentDate);
    const deadline = parseFlexibleDateGlobal(deadlineDate);
    const now = Date.now();
    const deadlineMs = deadline?.getTime() ?? null;

    const full = sent && deadline ? deadline.getTime() - sent.getTime() : 0;
    const elapsed = sent ? Math.max(0, now - sent.getTime()) : 0;
    const progress =
      full > 0 ? Math.min(1, Math.max(0, elapsed / full)) : 0;
    const radius = 15;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - progress);

    const remainingMs = deadlineMs !== null ? deadlineMs - now : null;
    const isFinalized = status === "finalizado";
    const isOverdue = status === "vencido" || (remainingMs !== null && remainingMs <= 0);
    const isCritical =
      status === "en-proceso" &&
      remainingMs !== null &&
      remainingMs > 0 &&
      remainingMs <= 6 * 60 * 60 * 1000;
    const isNearDue =
      status === "en-proceso" &&
      deadlineMs !== null &&
      !isOverdue &&
      !isCritical &&
      remainingMs !== null &&
      remainingMs <= 24 * 60 * 60 * 1000;

    const remainingDays =
      deadlineMs !== null && !isOverdue
        ? Math.max(
          0,
          Math.ceil((deadlineMs - now) / (24 * 60 * 60 * 1000)),
        )
        : 0;
    const remainingHours =
      remainingMs !== null && remainingMs > 0
        ? Math.max(1, Math.ceil(remainingMs / (60 * 60 * 1000)))
        : 0;

    const ringColor = isFinalized
      ? "#22c55e"
      : status === "respondido"
      ? "#3b82f6"
      : status === "en-aclaracion"
      ? "#a855f7"
      : isOverdue || isCritical
      ? "#ef4444"
      : isNearDue
        ? "#3b82f6"
        : "#22c55e";
    const daysOrHours =
      status === "en-proceso"
        ? isCritical
          ? `${remainingHours}h`
          : `${remainingDays}d`
        : "";
    const textClass = darkMode ? "text-slate-200" : "text-slate-700";

    return (
      <div className="flex items-center gap-2">
        <svg viewBox="0 0 40 40" className="w-8 h-8 shrink-0" aria-hidden="true">
          <circle
            cx="20"
            cy="20"
            r={radius}
            stroke={darkMode ? "#334155" : "#cbd5e1"}
            strokeWidth="3"
            fill="none"
          />
          <circle
            cx="20"
            cy="20"
            r={radius}
            stroke={ringColor}
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 20 20)"
          />
          <circle cx="20" cy="20" r="1.8" fill={ringColor} />
          <g>
            <line x1="20" y1="20" x2="20" y2="9" stroke={ringColor} strokeWidth="1.8" strokeLinecap="round" />
            {status === "en-proceso" && (
              <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 20 20"
                to="360 20 20"
                dur="8s"
                repeatCount="indefinite"
              />
            )}
          </g>
          <line x1="20" y1="20" x2="27" y2="20" stroke={ringColor} strokeWidth="1.5" strokeLinecap="round" opacity="0.8" />
        </svg>
        {daysOrHours ? (
          <span className={`text-[11px] font-semibold ${textClass}`}>{daysOrHours}</span>
        ) : null}
      </div>
    );
  };

    const mappedTracking = useMemo(() => {
      const controlDocs = documents.filter(
        (doc) => String(doc.prioridad || "").toLowerCase() === "control",
      );
      return controlDocs.map((doc) => ({
        id: doc.id,
        title: doc.name,
        correlativo: doc.correlativo || doc.idDoc || `DOC-${doc.id}`,
        sentBy: doc.uploadedBy || "Desconocido",
        receivedBy: doc.receivedBy || doc.targetDepartment || "Sin Asignar",
        fechaEnvio: doc.uploadDate || "N/A",
        fechaMaximaEntrega: doc.fecha_caducidad
        ? (() => {
          const d = new Date(doc.fecha_caducidad);
          return Number.isNaN(d.getTime()) ? String(doc.fecha_caducidad) : d.toLocaleDateString("es-ES");
        })()
        : "N/A",
      deadlineRaw: doc.fecha_caducidad || "",
        rawStatus: String(doc.signatureStatus || "en-proceso").toLowerCase(),
        status: String(doc.signatureStatus || "en-proceso").toLowerCase(),
        contenido: doc.contenido || "",
        fileUrl: doc.fileUrl,
        archivos: doc.archivos || [],
        remitente_id: doc.remitente_id,
        receptor_id: doc.receptor_id,
        receptor_gerencia_id: doc.receptor_gerencia_id,
        respuesta_contenido: doc.respuesta_contenido || "",
        respuesta_usuario_nombre: doc.respuesta_usuario_nombre || "",
        respuesta_fecha: doc.respuesta_fecha || "",
        respuesta_url_archivo: doc.respuesta_url_archivo || "",
        respuesta_archivos: doc.respuesta_archivos || [],
      }));
    }, [documents]);

  const senderOptions = useMemo(
    () =>
      Array.from(new Set(mappedTracking.map((item) => item.sentBy)))
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b)),
    [mappedTracking],
  );

  useEffect(() => {
    if (selectedTrackingDoc) {
      setTrackingResponseDraft("");
      setTrackingResponseFiles([]);
      setTrackingContentOpen(false);
    }
  }, [selectedTrackingDoc]);

  useEffect(() => {
    if (!selectedTrackingDoc) {
      setTrackingResponses([]);
      setTrackingEvents([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rows = await apiGetDocumentoRespuestas(selectedTrackingDoc.id);
        if (!cancelled) setTrackingResponses(rows || []);
      } catch (error) {
        console.error("Error cargando respuestas:", error);
        if (!cancelled) setTrackingResponses([]);
      }
      try {
        const rows = await apiGetDocumentoEventos(selectedTrackingDoc.id);
        if (!cancelled) setTrackingEvents(rows || []);
      } catch (error) {
        console.error("Error cargando eventos:", error);
        if (!cancelled) setTrackingEvents([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedTrackingDoc]);

  const canFinalizeTracking = useMemo(() => {
    if (!selectedTrackingDoc || !user?.id) return false;
    return (
      !!selectedTrackingDoc.remitente_id &&
      String(selectedTrackingDoc.remitente_id) === String(user.id)
    );
  }, [selectedTrackingDoc, user?.id]);

  const canPurgeTracking = useMemo(() => {
    const role = String(userRole || "").toLowerCase();
    return role === "desarrollador" || role === "developer" || role === "dev";
  }, [userRole]);

  const handlePurgeTracking = useCallback(async () => {
    const ok = await uiConfirm(
      "Esto eliminará TODOS los documentos con prioridad de control de seguimiento. Esta acción no se puede deshacer. ¿Deseas continuar?",
      "Limpiar Control de Seguimiento",
    );
    if (!ok) return;
    try {
      const res = await purgeControlSeguimiento();
      await refreshDocs();
      void uiAlert(
        `Se eliminaron ${res?.deleted ?? 0} documentos de seguimiento.`,
        "Control de seguimiento",
      );
    } catch (error) {
      console.error("Error limpiando seguimiento:", error);
      void uiAlert("No se pudo limpiar el control de seguimiento.", "Error");
    }
  }, [refreshDocs]);

  const filteredTracking = useMemo(() => {
    const normalizedSearch = trackingSearch.trim().toLowerCase();
    return mappedTracking
      .filter((item) => {
        const computedStatus = getTrackingStatus(item);
        const matchesStatus = trackingStatus === "all" || computedStatus === trackingStatus;
        const matchesSender = trackingSender === "all" || item.sentBy === trackingSender;
        const haystack = `${item.title} ${item.correlativo} ${item.sentBy} ${item.receivedBy}`.toLowerCase();
        const matchesSearch = !normalizedSearch || haystack.includes(normalizedSearch);
        return matchesStatus && matchesSender && matchesSearch;
      })
      .sort((a, b) => parseDate(b.fechaEnvio) - parseDate(a.fechaEnvio));
  }, [mappedTracking, trackingSearch, trackingStatus, trackingSender, getTrackingStatus]);

  return (
    <div className="space-y-4 pt-2">
      <div
        className={`p-4 rounded-lg border flex flex-wrap gap-3 items-end ${darkMode ? "bg-slate-900/50 border-slate-800" : "bg-slate-50 border-slate-200"}`}
      >
        <div className="min-w-[220px] flex-1">
          <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
            Buscar
          </label>
          <div
            className={`flex items-center px-3 py-2 rounded-md border ${darkMode ? "bg-slate-950 border-slate-700" : "bg-white border-slate-300"}`}
          >
            <Search size={14} className="text-slate-500 mr-2" />
            <input
              value={trackingSearch}
              onChange={(e) => setTrackingSearch(e.target.value)}
              placeholder="Correlativo, documento, remitente..."
              className="bg-transparent border-none outline-none text-sm w-full"
            />
          </div>
        </div>
        <div className="w-56">
          <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
            Estado
          </label>
          <select
            value={trackingStatus}
            onChange={(e) => setTrackingStatus(e.target.value)}
            className={`w-full px-3 py-2 rounded-md border text-sm outline-none ${darkMode ? "bg-slate-950 border-slate-700 text-slate-300" : "bg-white border-slate-300 text-slate-700"}`}
          >
            <option value="all">Todos</option>
            <option value="vencido">Vencido</option>
            <option value="en-proceso">En Proceso</option>
            <option value="respondido">Respondido</option>
            <option value="en-aclaracion">En aclaracion</option>
            <option value="finalizado">Finalizado</option>
          </select>
        </div>
        <div className="w-64">
          <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1">
            Enviado por
          </label>
          <select
            value={trackingSender}
            onChange={(e) => setTrackingSender(e.target.value)}
            className={`w-full px-3 py-2 rounded-md border text-sm outline-none ${darkMode ? "bg-slate-950 border-slate-700 text-slate-300" : "bg-white border-slate-300 text-slate-700"}`}
          >
            <option value="all">Todos</option>
            {senderOptions.map((sender) => (
              <option key={sender} value={sender}>
                {sender}
              </option>
            ))}
          </select>
        </div>
      </div>
      {(canPurgeTracking || hasPermission(PERMISSIONS_MASTER.PRIORITIES_EXPORT)) && (
        <div className="flex justify-end mb-2 gap-2">
          {canPurgeTracking && (
            <button
              onClick={() => void handlePurgeTracking()}
              className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${darkMode
                ? "border-red-700 text-red-300 hover:bg-red-900/30"
                : "border-red-300 text-red-700 hover:bg-red-50"
                }`}
            >
              Limpiar Seguimiento
            </button>
          )}
          {hasPermission(PERMISSIONS_MASTER.PRIORITIES_EXPORT) && (
            <button
              className={`px-4 py-2 rounded-md text-sm font-medium border transition-colors ${darkMode
                ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
            >
              <Download size={16} className="inline mr-2" />
              Exportar
            </button>
          )}
        </div>
      )}
      <div className="overflow-x-auto">
        <table
          className={`w-full rounded-lg overflow-hidden ${darkMode
            ? "bg-slate-900 border border-slate-800"
            : "bg-white border border-slate-200"
            }`}
        >
          <thead className={`${darkMode ? "bg-slate-800" : "bg-slate-50"}`}>
            <tr>
              <th
                className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${darkMode ? "text-slate-400" : "text-slate-500"
                  }`}
              >
                Nombre de Documento
              </th>
              <th
                className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${darkMode ? "text-slate-400" : "text-slate-500"
                  }`}
              >
                Correlativo
              </th>
              <th
                className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${darkMode ? "text-slate-400" : "text-slate-500"
                  }`}
              >
                Enviado por
              </th>
              <th
                className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${darkMode ? "text-slate-400" : "text-slate-500"
                  }`}
              >
                Recibido por
              </th>
              <th
                className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${darkMode ? "text-slate-400" : "text-slate-500"
                  }`}
              >
                Fecha de envio
              </th>
              <th
                className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${darkMode ? "text-slate-400" : "text-slate-500"
                  }`}
              >
                Fecha maxima de entrega
              </th>
              <th
                className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${darkMode ? "text-slate-400" : "text-slate-500"
                  }`}
              >
                Tiempo limite
              </th>
              <th
                className={`px-4 py-3 text-left text-xs font-bold uppercase tracking-wider ${darkMode ? "text-slate-400" : "text-slate-500"
                  }`}
              >
                Estado
              </th>
              <th
                className={`px-4 py-3 text-center text-xs font-bold uppercase tracking-wider ${darkMode ? "text-slate-400" : "text-slate-500"
                  }`}
              >
                Vista
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredTracking.map((item) => {
              const computedStatus = getTrackingStatus(item);
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
              return (
              <tr
                key={item.id}
                className={`border-t transition-colors ${darkMode
                  ? "border-slate-800 hover:bg-slate-800/50"
                  : "border-slate-200 hover:bg-slate-50"
                  }`}
              >
                <td
                  className={`px-4 py-3 ${darkMode ? "text-slate-300" : "text-slate-700"}`}
                >
                  <div className="font-medium">{item.title}</div>
                </td>
                <td
                  className={`px-4 py-3 ${darkMode ? "text-slate-300" : "text-slate-700"}`}
                >
                  <span className="font-mono text-xs">{item.correlativo}</span>
                </td>
                <td
                  className={`px-4 py-3 ${darkMode ? "text-slate-300" : "text-slate-700"}`}
                >
                  {item.sentBy}
                </td>
                <td
                  className={`px-4 py-3 ${darkMode ? "text-slate-300" : "text-slate-700"}`}
                >
                  {item.receivedBy}
                </td>
                <td
                  className={`px-4 py-3 ${darkMode ? "text-slate-300" : "text-slate-700"}`}
                >
                  {item.fechaEnvio}
                </td>
                <td
                  className={`px-4 py-3 ${darkMode ? "text-slate-300" : "text-slate-700"}`}
                >
                  {item.fechaMaximaEntrega}
                </td>
                <td className={`px-4 py-3 ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                  <DeadlineClock
                    sentDate={item.fechaEnvio}
                    deadlineDate={item.fechaMaximaEntrega}
                    status={computedStatus as "en-proceso" | "vencido" | "finalizado"}
                  />
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold uppercase whitespace-nowrap min-w-[120px] text-center ${getStatusColor(
                      computedStatus,
                    )}`}
                  >
                    {statusLabel}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <a
                    href={`/dashboard/seguimiento/${item.id}`}
                    onClick={() => {
                      void createSecurityLog({
                        evento: "SEGUIMIENTO_ABIERTO",
                        detalles: JSON.stringify({
                          action: "OPEN_TRACKING",
                          documento_id: item.id,
                          correlativo: item.correlativo,
                        }),
                        estado: "info",
                        page: "/dashboard?tab=seguimiento",
                      });
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold border ${darkMode
                      ? "border-slate-700 text-slate-300 hover:bg-slate-800"
                      : "border-slate-300 text-slate-700 hover:bg-slate-50"
                      }`}
                  >
                    <Eye size={13} />
                    Ver
                  </a>
                </td>
              </tr>
            );
            })}
            {filteredTracking.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500 italic">
                  No hay documentos para los filtros seleccionados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {selectedTrackingDoc && (
        (() => {
          const modalComputedStatus = getTrackingStatus(selectedTrackingDoc);
          const modalStatusLabel =
            modalComputedStatus === "en-proceso"
              ? "EN PROCESO"
              : modalComputedStatus === "vencido"
                ? "VENCIDO"
                : modalComputedStatus === "respondido"
                  ? "RESPONDIDO"
                  : modalComputedStatus === "en-aclaracion"
                    ? "EN ACLARACION"
                : "FINALIZADO";
          return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className={`w-full max-w-2xl rounded-xl border shadow-2xl ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
            <div className={`p-4 border-b flex items-center justify-between ${darkMode ? "border-slate-800" : "border-slate-100"}`}>
              <div>
                <h3 className={`font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>{selectedTrackingDoc.title}</h3>
                <p className="text-xs text-slate-500 mt-1">Correlativo: {selectedTrackingDoc.correlativo}</p>
              </div>
              <button
                onClick={() => setSelectedTrackingDoc(null)}
                className={`p-2 rounded-md ${darkMode ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-600"}`}
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className={darkMode ? "text-slate-300" : "text-slate-700"}>
                  <span className="font-semibold">Enviado por:</span> {selectedTrackingDoc.sentBy}
                </div>
                <div className={darkMode ? "text-slate-300" : "text-slate-700"}>
                  <span className="font-semibold">Recibido por:</span> {selectedTrackingDoc.receivedBy}
                </div>
                <div className={darkMode ? "text-slate-300" : "text-slate-700"}>
                  <span className="font-semibold">Fecha de envio:</span> {selectedTrackingDoc.fechaEnvio}
                </div>
                <div className={darkMode ? "text-slate-300" : "text-slate-700"}>
                  <span className="font-semibold">Fecha maxima de entrega:</span> {selectedTrackingDoc.fechaMaximaEntrega}
                </div>
                <div className={darkMode ? "text-slate-300" : "text-slate-700"}>
                  <span className="font-semibold">Estado:</span>{" "}
                  <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${getStatusColor(modalComputedStatus)}`}>
                    {modalStatusLabel}
                  </span>
                </div>
              </div>

              {selectedTrackingDoc.contenido ? (
                <div className={`rounded-lg border p-4 flex items-center justify-between ${darkMode ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50"}`}>
                  <div className={`text-sm ${darkMode ? "text-slate-300" : "text-slate-700"}`}>
                    Contenido del mensaje
                  </div>
                  <button
                    onClick={() => {
                      setTrackingContentOpen(true);
                      void createSecurityLog({
                        evento: "DOCUMENTO_CONTENIDO_ABIERTO",
                        detalles: JSON.stringify({
                          action: "OPEN_CONTENT",
                          documento_id: selectedTrackingDoc.id,
                          correlativo: selectedTrackingDoc.correlativo,
                        }),
                        estado: "info",
                        page: "/dashboard?tab=seguimiento",
                      });
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${darkMode
                      ? "border-slate-700 text-slate-200 hover:bg-slate-800"
                      : "border-slate-300 text-slate-700 hover:bg-white"}`}
                  >
                    Ver contenido
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">Sin contenido de mensaje en texto.</p>
              )}

              <div className="space-y-3">
                <div className={`text-[10px] font-bold uppercase tracking-widest ${darkMode ? "text-slate-500" : "text-slate-700"}`}>
                  RESPUESTA DEL RECEPTOR
                </div>
                {trackingResponses.length > 0 ? (
                  <div className="space-y-3">
                    {trackingResponses.map((resp) => {
                      const currentUserLabel = user?.nombre
                        ? `${user?.nombre} ${user?.apellido || ""}`.trim()
                        : "";
                      const isMine =
                        currentUserLabel &&
                        String(resp.usuario_nombre || "").toLowerCase().trim() ===
                          currentUserLabel.toLowerCase().trim();
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
                                  const url = file.startsWith("http")
                                    ? file
                                    : `${BACKEND_BASE_URL}${file}`;
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
                {(() => {
                  const currentUserId = user?.id ? String(user.id) : "";
                  const isDirectRecipient =
                    !!selectedTrackingDoc.receptor_id &&
                    !!currentUserId &&
                    String(selectedTrackingDoc.receptor_id) === currentUserId;
                  const isDeptRecipient =
                    !!selectedTrackingDoc.receptor_gerencia_id &&
                    !!user?.gerencia_id &&
                    String(selectedTrackingDoc.receptor_gerencia_id) === String(user.gerencia_id);
                  const isSender =
                    !!selectedTrackingDoc.remitente_id &&
                    !!currentUserId &&
                    String(selectedTrackingDoc.remitente_id) === currentUserId;
                  const canReply = isDirectRecipient || isDeptRecipient || isSender;
                  const canSendReply = canReply && modalComputedStatus !== "finalizado";
                  if (!canSendReply) return null;
                  return (
                    <div className="space-y-2">
                      <textarea
                        rows={3}
                        value={trackingResponseDraft}
                        onChange={(e) => setTrackingResponseDraft(e.target.value)}
                        placeholder="Escribe la respuesta..."
                        className={`w-full rounded-full border px-4 py-2 text-sm outline-none resize-none text-center ${darkMode ? "bg-slate-950 border-slate-800 text-slate-200" : "bg-white border-slate-300 text-slate-800"}`}
                      />
                      <div className="space-y-1">
                        <input
                          type="file"
                          accept=".pdf"
                          multiple
                          onChange={(e) => setTrackingResponseFiles(Array.from(e.target.files || []))}
                          className={`block w-full text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}
                        />
                        {trackingResponseFiles.length > 0 && (
                          <div className={`text-[11px] ${darkMode ? "text-slate-500" : "text-slate-600"}`}>
                            {trackingResponseFiles.length} PDF(s) seleccionados
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => void handleSendTrackingResponse(selectedTrackingDoc.id)}
                        className="w-full sm:w-auto px-4 py-2 rounded-full text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
                      >
                        Enviar respuesta
                      </button>
                    </div>
                  );
                })()}
              </div>

              <div className="space-y-2">
                <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest ${darkMode ? "text-slate-500" : "text-slate-700"}`}>
                  <Activity size={12} />
                  HISTORIAL
                </div>
                {trackingEvents.length > 0 ? (
                  <div className={`rounded-lg border p-3 text-xs space-y-2 ${darkMode ? "border-slate-800 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
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
                {modalComputedStatus === "respondido" && canFinalizeTracking && (
                  <button
                    onClick={() => void handleRequestClarification(selectedTrackingDoc.id)}
                    disabled={updatingTrackingStatus}
                    className={`px-3 py-2 rounded-md text-sm font-semibold border transition-colors ${darkMode
                      ? "border-purple-700 text-purple-300 hover:bg-purple-900/20 disabled:opacity-50"
                      : "border-purple-300 text-purple-700 hover:bg-purple-50 disabled:opacity-50"}`}
                  >
                    Solicitar aclaracion
                  </button>
                )}
                {modalComputedStatus !== "finalizado" && canFinalizeTracking && (
                  <button
                    onClick={async () => {
                      if (!selectedTrackingDoc.respuesta_contenido) {
                        void uiAlert("No puedes finalizar sin una respuesta del receptor.", "Control de seguimiento");
                        return;
                      }
                      await handleMarkFinalized(selectedTrackingDoc.id);
                    }}
                    disabled={updatingTrackingStatus}
                    className={`px-3 py-2 rounded-md text-sm font-semibold border transition-colors ${darkMode
                      ? "border-green-700 text-green-300 hover:bg-green-900/20 disabled:opacity-50"
                      : "border-green-300 text-green-700 hover:bg-green-50 disabled:opacity-50"}`}
                  >
                    {updatingTrackingStatus ? "Guardando..." : "FINALIZADO"}
                  </button>
                )}
                {selectedTrackingDoc.fileUrl &&
                  !((selectedTrackingDoc.archivos || []).includes(selectedTrackingDoc.fileUrl)) && (
                  <button
                    type="button"
                    onClick={() => {
                      void createSecurityLog({
                        evento: "DOCUMENTO_DESCARGA",
                        detalles: JSON.stringify({
                          action: "DOWNLOAD_PRIMARY",
                          documento_id: selectedTrackingDoc.id,
                          correlativo: selectedTrackingDoc.correlativo,
                        }),
                        estado: "info",
                        page: "/dashboard?tab=seguimiento",
                      });
                      void openDocumento(selectedTrackingDoc.fileUrl || "");
                    }}
                    className={`px-3 py-2 rounded-md text-sm font-semibold border ${darkMode ? "border-blue-700 text-blue-300 hover:bg-blue-900/20" : "border-blue-300 text-blue-700 hover:bg-blue-50"}`}
                  >
                    Ver archivo principal
                  </button>
                )}
                {(selectedTrackingDoc.archivos || []).map((file: string, idx: number) => (
                  <button
                    type="button"
                    key={`${file}-${idx}`}
                    onClick={() => {
                      void createSecurityLog({
                        evento: "DOCUMENTO_DESCARGA",
                        detalles: JSON.stringify({
                          action: "DOWNLOAD_ATTACHMENT",
                          documento_id: selectedTrackingDoc.id,
                          correlativo: selectedTrackingDoc.correlativo,
                          index: idx + 1,
                        }),
                        estado: "info",
                        page: "/dashboard?tab=seguimiento",
                      });
                      void openDocumento(file);
                    }}
                    className={`px-3 py-2 rounded-md text-sm font-semibold border ${darkMode ? "border-slate-700 text-slate-300 hover:bg-slate-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"}`}
                  >
                    Adjunto {idx + 1}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
        })()
      )}

      {trackingContentOpen && selectedTrackingDoc && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className={`w-full max-w-2xl rounded-xl border shadow-2xl ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}>
            <div className={`p-4 border-b flex items-center justify-between ${darkMode ? "border-slate-800" : "border-slate-100"}`}>
              <div>
                <h3 className={`font-bold ${darkMode ? "text-white" : "text-slate-900"}`}>
                  Contenido del mensaje
                </h3>
                <p className="text-xs text-slate-500 mt-1">{selectedTrackingDoc.title}</p>
              </div>
              <button
                onClick={() => setTrackingContentOpen(false)}
                className={`p-2 rounded-md ${darkMode ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-600"}`}
              >
                <X size={18} />
              </button>
            </div>
            <div className={`p-5 text-sm leading-relaxed whitespace-pre-wrap ${darkMode ? "text-slate-200" : "text-slate-700"}`}>
              {selectedTrackingDoc.contenido}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Kanban Ticket System logic integrated from ../../components/TicketSystem

const DocumentManager: React.FC<{
  darkMode: boolean;
  userRole: UserRole;
  userDept: string;
  documents: Document[];
  setDocuments: React.Dispatch<React.SetStateAction<Document[]>>;
  orgStructure: OrgCategory[];
  isReadOnly?: boolean;
  hasPermission: (permission: string) => boolean;
  user: User | null;
  users: any[];
  gerencias: any[];
  refreshDocs: () => void;
}> = ({
  darkMode,
  userRole,
  userDept,
  documents,
  setDocuments,
  orgStructure,
  isReadOnly,
  hasPermission,
  user,
  users,
  gerencias,
  refreshDocs,
}) => {
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [filterDept, setFilterDept] = useState<string>("all");
    const [searchTerm, setSearchTerm] = useState("");
    const [docView, setDocView] = useState<"inbox" | "sent" | "audit">("inbox");
    const fileInputRef = React.useRef<HTMLInputElement>(null);

    // Modal State
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
    const [docName, setDocName] = useState("");
    const [docCategory, setDocCategory] = useState("Informe");
    const [correlativo, setCorrelativo] = useState("");
    const [priorityEnabled, setPriorityEnabled] = useState(false);
    const [priorityDays, setPriorityDays] = useState<number>(3);
    const now = useMemo(() => new Date(), []);
    const fechaEnvioPreview = useMemo(() => {
      return now.toLocaleDateString("es-ES");
    }, [now]);
    const fechaMaximaEntregaPreview = useMemo(() => {
      if (!priorityEnabled || priorityDays <= 0) return "No aplica";
      const due = new Date(now);
      due.setDate(due.getDate() + priorityDays);
      return due.toLocaleDateString("es-ES");
    }, [now, priorityEnabled, priorityDays]);

    // Messaging Specific States
    const [targetUserIds, setTargetUserIds] = useState<string[]>([]);
    const [targetDeptIds, setTargetDeptIds] = useState<string[]>([]);
    const [sendMode, setSendMode] = useState<"user" | "dept">("user");
    const [messageContent, setMessageContent] = useState("");
    const [selectedConversation, setSelectedConversation] = useState<{
      key: string;
      label: string;
      docs: Document[];
    } | null>(null);
    const [replyDraft, setReplyDraft] = useState("");
    const [replySending, setReplySending] = useState(false);
    const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
    const deptLogReadyRef = useRef(false);
    const canAccessSecurityModule =
      hasPermission(PERMISSIONS_MASTER.VIEW_SECURITY) ||
      userRole === "Administrador" ||
      userRole === "Desarrollador";
    const isManager = userRole === "Gerente";
    const isPrivilegedAuditRole =
      userRole === "Desarrollador" ||
      userRole === "Administrador" ||
      userRole === "CEO";
    const canUseAuditView = isManager || isPrivilegedAuditRole;
    const canBulkDeleteMessages = userRole === "Desarrollador";

    // Extract unique departments for filter
    const departments = useMemo(() => {
      return orgStructure.flatMap((group) => group.items);
    }, [orgStructure]);

    const messagingDeptOptions = useMemo(() => {
      const byId = new Map<string, { id: string; nombre: string }>();
      gerencias.forEach((g) => {
        const name = String(g?.nombre || "").trim();
        const id = g?.id !== undefined && g?.id !== null ? String(g.id) : "";
        if (!name || !id) return;
        byId.set(id, { id, nombre: name });
      });
      return Array.from(byId.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
    }, [gerencias]);

    const messagingUserOptions = useMemo(() => {
      const byId = new Map<string, { id: string; label: string }>();
      users.forEach((u) => {
        const id = u?.id !== undefined && u?.id !== null ? String(u.id) : "";
        const label = `${u?.nombre || ""} ${u?.apellido || ""}`.trim();
        if (!id || !label) return;
        if (!byId.has(id)) {
          byId.set(id, { id, label });
        }
      });
      return Array.from(byId.values()).sort((a, b) => a.label.localeCompare(b.label));
    }, [users]);

    const correlativoPreview = useMemo(() => {
      const raw = (user?.gerencia_depto || userDept || "").trim();
      const siglas = raw
        ? raw
          .split(/\s+/)
          .map((w) => w[0])
          .join("")
          .toUpperCase()
          .slice(0, 6)
        : "GER";
      const year = new Date().getFullYear();
      const manual = correlativo.trim() || "___";
      return `${siglas}-${manual}-${year}`;
    }, [correlativo, user?.gerencia_depto, userDept]);

    useEffect(() => {
      if (docView === "sent" && (filterStatus === "leido" || filterStatus === "nuevo")) {
        setFilterStatus("all");
      }
      if (docView !== "sent" && filterStatus === "recibido") {
        setFilterStatus("all");
      }
    }, [docView, filterStatus]);

    useEffect(() => {
      if (!deptLogReadyRef.current) {
        deptLogReadyRef.current = true;
        return;
      }
      if (!filterDept || filterDept === "all") return;
      void createSecurityLog({
        evento: "GERENCIA_SELECCIONADA",
        detalles: JSON.stringify({
          action: "SELECT_DEPT_FILTER",
          gerencia: filterDept,
          user_id: user?.id || null,
          view: docView,
        }),
        estado: "info",
        page: "/dashboard?tab=documentos",
      });
    }, [filterDept, docView, user?.id]);

    useEffect(() => {
      setSelectedDocIds([]);
    }, [docView, filterDept, filterStatus, searchTerm]);

    useEffect(() => {
      setTargetUserIds([]);
      setTargetDeptIds([]);
    }, [sendMode]);

    const normalizeMessagingStatus = useCallback((doc: Document, view: "inbox" | "sent" | "audit"): string => {
      const raw = String(doc.signatureStatus || "").toLowerCase().trim();
      const isOwnMessage =
        !!doc.remitente_id && !!user?.id && String(doc.remitente_id) === String(user.id);

      if (view === "inbox") {
        if (!doc.leido && !isOwnMessage) return "nuevo";
        if (doc.leido) return "leido";
      }
      if (view === "sent") {
        if (doc.leido) return "recibido";
        return "enviado";
      }

      if (raw === "en-proceso" || raw === "en proceso" || raw === "en_proceso") return "en-proceso";
      if (raw === "recibido") return "recibido";
      if (raw === "leido" || raw === "leído") return "leido";
      if (raw === "pendiente" || raw === "aprobado" || raw === "rechazado" || raw === "omitido") return "en-proceso";

      return "en-proceso";
    }, [user?.id]);

    const docViewLabel =
      docView === "inbox"
        ? "Bandeja de Entrada"
        : docView === "sent"
          ? "Enviados"
          : "Auditar Mensajes";

    const MY_DEPT =
      "Gerencia Nacional de Tecnologías de la Información y la Comunicación";

    const currentUserId = user?.id ? String(user.id) : "";

    const getDocTimestamp = (doc: Document) => {
      const combined = [doc.uploadDate, doc.uploadTime].filter(Boolean).join(" ");
      const parsed =
        parseFlexibleDateGlobal(combined) ||
        parseFlexibleDateGlobal(doc.uploadDate) ||
        null;
      return parsed ? parsed.getTime() : 0;
    };

    const getConversationKey = (doc: Document) => {
      const senderId = doc.remitente_id ? String(doc.remitente_id) : "";
      const receiverId = doc.receptor_id ? String(doc.receptor_id) : "";
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
      const deptName = String(
        doc.targetDepartment ||
          doc.receptor_gerencia_nombre ||
          doc.receptor_gerencia_nombre_usuario ||
          "",
      )
        .toLowerCase()
        .trim();
      return deptName ? `dept-name:${deptName}` : `misc:${doc.id}`;
    };

    const getConversationLabel = (doc: Document) => {
      const senderId = doc.remitente_id ? String(doc.remitente_id) : "";
      const receiverId = doc.receptor_id ? String(doc.receptor_id) : "";
      if (senderId && receiverId && currentUserId) {
        if (senderId === currentUserId) {
          return doc.receivedBy !== "Pendiente"
            ? doc.receivedBy
            : doc.targetDepartment || "Destino";
        }
        return doc.uploadedBy || "Remitente";
      }
      return (
        doc.receptor_gerencia_nombre ||
        doc.receptor_gerencia_nombre_usuario ||
        doc.targetDepartment ||
        doc.receivedBy ||
        doc.uploadedBy ||
        "Conversacion"
      );
    };

    const getDeliveryInfo = (doc: Document) => {
      if (doc.receptor_id) {
        return { key: "direct", label: "Directo" };
      }
      if (doc.receptor_gerencia_id || doc.receptor_gerencia_nombre || doc.targetDepartment) {
        return { key: "dept", label: "Gerencia" };
      }
      return { key: "unknown", label: "Sin destino" };
    };

    const getRecipientDisplay = (doc: Document) => {
      if (doc.receptor_id) {
        return doc.receivedBy !== "Pendiente" ? doc.receivedBy : "Usuario";
      }
      return (
        doc.receptor_gerencia_nombre ||
        doc.receptor_gerencia_nombre_usuario ||
        doc.targetDepartment ||
        "Gerencia"
      );
    };

    const filteredDocs = documents.filter((doc) => {
      const canViewAll = hasPermission(PERMISSIONS_MASTER.DOCS_VIEW_ALL);
      const canViewDept = hasPermission(PERMISSIONS_MASTER.DOCS_VIEW_DEPT);
      const statusValue = normalizeMessagingStatus(doc, docView);
      const deptValue = String(doc.targetDepartment || "").toLowerCase().trim();
      const searchValue = `${doc.name || ""} ${doc.correlativo || ""}`.toLowerCase();

      const matchesStatus = filterStatus === "all" || statusValue === filterStatus;
      const matchesDept =
        docView === "audit" && isManager && !isPrivilegedAuditRole
          ? true
          : filterDept === "all" || deptValue === String(filterDept).toLowerCase().trim();
      const matchesSearch = !searchTerm.trim() || searchValue.includes(searchTerm.toLowerCase().trim());

      if (!matchesStatus || !matchesDept || !matchesSearch) {
        return false;
      }

      // Debug logs (remove or keep as needed)
      // console.log(`[FILTER] Doc: ${doc.name} | Receptor: ${doc.receptor_id} | Gerencia: ${doc.receptor_gerencia_id}`);
      // console.log(`[FILTER] User: ${user?.id} | Dept: ${userDept}`);
      const isOwnMessage =
        !!doc.remitente_id && !!user?.id && String(doc.remitente_id) === String(user.id);

      if (docView === "audit") {
        if (!canUseAuditView) return false;
        if (isPrivilegedAuditRole) return true;

        const myGerId = user?.gerencia_id?.toString() || "";
        if (!myGerId) return false;

        const senderGerId = doc.remitente_gerencia_id?.toString() || "";
        const receiverGerId = doc.receptor_gerencia_id?.toString() || "";
        const receiverUserGerId = doc.receptor_gerencia_id_usuario?.toString() || "";
        const isInMyGerencia =
          myGerId === senderGerId ||
          myGerId === receiverGerId ||
          myGerId === receiverUserGerId;

        if (!isInMyGerencia) return false;

        const isOwn =
          (doc.remitente_id && user?.id && String(doc.remitente_id) === String(user.id)) ||
          (doc.receptor_id && user?.id && String(doc.receptor_id) === String(user.id));

        return !isOwn;
      }

      if (docView === "inbox") {
        // BANDEJA DE ENTRADA
        if (isOwnMessage) return false;
        if (canViewAll) return true;

        // Coincidencia por receptor_id
        if (doc.receptor_id && user?.id) {
          if (String(doc.receptor_id) === String(user.id)) {
            console.log("[MATCH] Por receptor_id directo");
            return true;
          }
        }

        // Coincidencia por receptor_gerencia_id (siempre permitido para su propia gerencia)
        if (doc.receptor_gerencia_id) {
          const myGerId = user?.gerencia_id?.toString();
          const targetGerId = doc.receptor_gerencia_id.toString();

          if (myGerId && myGerId === targetGerId) {
            console.log(`[MATCH] Gerencia ID Match: ${myGerId}`);
            return true;
          }
        }

        // Fallback por nombre de departamento
        const docDept = (doc.targetDepartment || "").toLowerCase().trim();
        const userDeptLower = (userDept || "").toLowerCase().trim();
        if (docDept && userDeptLower && docDept === userDeptLower) {
          console.log("[MATCH] Por nombre de departamento");
          return true;
        }

        return false;

      } else {
        // ENVIADOS
        if (canViewAll) return true;

        // Coincidencia por remitente_id
        if (doc.remitente_id && user?.id) {
          if (String(doc.remitente_id) === String(user.id)) {
            console.log("[MATCH] Enviado por mí");
            return true;
          }
        }

        return false;
      }
    });

    const conversationGroups = useMemo(() => {
      const map = new Map<
        string,
        {
          key: string;
          label: string;
          docs: Document[];
          latestDoc: Document;
          latestTs: number;
          unreadCount: number;
        }
      >();
      filteredDocs.forEach((doc) => {
        const key = getConversationKey(doc);
        const label = getConversationLabel(doc);
        const ts = getDocTimestamp(doc);
        const existing = map.get(key);
        const isDirectRecipient =
          !!doc.receptor_id && !!user?.id && String(doc.receptor_id) === String(user.id);
        const isDeptRecipient =
          !!doc.receptor_gerencia_id &&
          !!user?.gerencia_id &&
          String(doc.receptor_gerencia_id) === String(user.gerencia_id);
        const isOwnMessage =
          !!doc.remitente_id && !!user?.id && String(doc.remitente_id) === String(user.id);
        const unread = (isDirectRecipient || isDeptRecipient) && !isOwnMessage && !doc.leido ? 1 : 0;
        if (!existing) {
          map.set(key, {
            key,
            label,
            docs: [doc],
            latestDoc: doc,
            latestTs: ts,
            unreadCount: unread,
          });
          return;
        }
        existing.docs.push(doc);
        existing.unreadCount += unread;
        if (ts >= existing.latestTs) {
          existing.latestTs = ts;
          existing.latestDoc = doc;
        }
      });
      return Array.from(map.values()).sort((a, b) => b.latestTs - a.latestTs);
    }, [filteredDocs, user?.gerencia_id, user?.id]);

    const filteredDocIds = useMemo(
      () => filteredDocs.map((doc) => String(doc.id)),
      [filteredDocs],
    );
    const filteredDocIdSet = useMemo(() => new Set(filteredDocIds), [filteredDocIds]);
    useEffect(() => {
      setSelectedDocIds((prev) => {
        const next = prev.filter((id) => filteredDocIdSet.has(id));
        return next.length === prev.length ? prev : next;
      });
    }, [filteredDocIdSet]);
    const areAllFilteredSelected =
      filteredDocIds.length > 0 &&
      filteredDocIds.every((id) => selectedDocIds.includes(id));

    const toggleDocSelection = (docId: string) => {
      setSelectedDocIds((prev) =>
        prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId],
      );
    };

    const toggleConversationSelection = (docIds: string[]) => {
      setSelectedDocIds((prev) => {
        const allSelected = docIds.every((id) => prev.includes(id));
        if (allSelected) {
          return prev.filter((id) => !docIds.includes(id));
        }
        return Array.from(new Set([...prev, ...docIds]));
      });
    };

    const toggleSelectAllFiltered = () => {
      if (areAllFilteredSelected) {
        setSelectedDocIds((prev) => prev.filter((id) => !filteredDocIdSet.has(id)));
        return;
      }
      setSelectedDocIds((prev) => Array.from(new Set([...prev, ...filteredDocIds])));
    };

    const deleteDocsByIds = async (ids: string[]) => {
      if (!canBulkDeleteMessages || ids.length === 0) return;
      const ok = await uiConfirm(
        `Se eliminarán ${ids.length} mensaje(s) de la vista ${docViewLabel}. Esta acción no se puede deshacer.`,
        "Eliminar mensajes",
      );
      if (!ok) return;

      const results = await Promise.allSettled(ids.map((id) => deleteDocumento(id)));
      const succeeded: string[] = [];
      const failed: { id: string; reason: string }[] = [];

      results.forEach((result, idx) => {
        const id = ids[idx];
        if (result.status === "fulfilled") {
          succeeded.push(id);
          return;
        }
        const reason =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason || "Error desconocido");
        failed.push({ id, reason });
      });

      if (succeeded.length > 0) {
        setDocuments((prev) =>
          prev.filter((doc) => !succeeded.includes(String(doc.id))),
        );
        setSelectedDocIds((prev) => prev.filter((id) => !succeeded.includes(id)));
      }

      if (failed.length === 0) {
        await refreshDocs();
        void uiAlert(`${succeeded.length} mensaje(s) eliminado(s).`, "Mensajeria");
        return;
      }

      const firstError = failed[0]?.reason || "No autorizado o ID invalido.";
      void uiAlert(
        `Eliminados: ${succeeded.length}. Fallidos: ${failed.length}. Detalle: ${firstError}`,
        "Mensajeria",
      );
      await refreshDocs();
    };

    const handleDeleteSelected = async () => {
      const validSelection = selectedDocIds.filter((id) => filteredDocIdSet.has(id));
      await deleteDocsByIds(validSelection);
    };

    const handleDeleteAllFiltered = async () => {
      await deleteDocsByIds(filteredDocIds);
    };

    const updateDocumentStatus = async (
      id: number,
      newStatus: Document["signatureStatus"],
    ) => {
      try {
        await apiUpdateStatus(id, newStatus);
        refreshDocs();
        await logDocumentActivity({
          username: userRole === "CEO" ? "Admin. General" : "Usuario Estándar",
          evento: "FLUJO DOCUMENTAL",
          detalles: `Cambio de estado en documento ID ${id} a ${newStatus.toUpperCase()}`,
          estado:
            newStatus === "aprobado"
              ? "success"
              : newStatus === "rechazado"
                ? "danger"
                : "info",
        });
      } catch (e) {
        console.error("Error updating status", e);
        void uiAlert("Error al actualizar el estado del documento.", "Error");
      }
    };

    const handleUploadClick = () => {
      window.location.href = "/dashboard/documentos/new";
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (file.type !== "application/pdf") {
        void uiAlert("Error: Solo se permiten archivos en formato PDF.", "Archivo inválido");
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }

      setSelectedFiles(prev => [...prev, file]);
      if (!docName) setDocName(file.name);
    };

    const toggleUserRecipient = (id: string) => {
      setTargetUserIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
      );
    };

    const toggleDeptRecipient = (id: string) => {
      setTargetDeptIds((prev) =>
        prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
      );
    };

    const confirmUpload = async (e: React.FormEvent) => {
      e.preventDefault();

      const recipients = sendMode === "dept" ? targetDeptIds : targetUserIds;
      if (!recipients || recipients.length === 0) {
        void uiAlert("Por favor selecciona al menos un destinatario.", "Validacion");
        return;
      }

      const priorityValue = priorityEnabled ? "control" : "media";
      const manualId = correlativo.trim();

      try {
        const uploads = recipients.map((recipient) => {
          const formData = new FormData();
          formData.append("titulo", docName || "Mensaje sin asunto");
          if (manualId) formData.append("correlativo", manualId);
          formData.append("tipo_documento", docCategory);
          formData.append("prioridad", priorityValue);
          formData.append("contenido", messageContent);
          if (priorityEnabled && priorityDays > 0) {
            formData.append("tiempo_maximo_dias", String(priorityDays));
          }

          if (sendMode === "dept") {
            if (recipient.startsWith("name:")) {
              formData.append("receptor_gerencia_nombre", recipient.slice(5));
            } else {
              formData.append("receptor_gerencia_id", recipient);
            }
          } else {
            formData.append("receptor_id", recipient);
          }

          if (selectedFiles.length > 0) {
            selectedFiles.forEach((file) => {
              formData.append("archivos", file);
            });
          }

          return uploadDocumento(formData);
        });
        await Promise.all(uploads);
        refreshDocs();

        await logDocumentActivity({
          username: user?.nombre || "Usuario",
          evento: "MENSAJERÍA INTERNA",
          detalles: `Envío de mensaje: "${docName}" a ${recipients.length} ${sendMode === "user" ? "usuario(s)" : "gerencia(s)"}`,
          estado: "success",
        });

        setShowUploadModal(false);
        setSelectedFiles([]);
        setDocName("");
        setDocCategory("Informe");
        setMessageContent("");
        setCorrelativo("");
        setPriorityEnabled(false);
        setPriorityDays(3);
        setTargetUserIds([]);
        setTargetDeptIds([]);
        if (fileInputRef.current) fileInputRef.current.value = "";
        void uiAlert("Mensaje enviado con éxito.", "Mensajería");
      } catch (e) {
        console.error("Error sending message:", e);
        void uiAlert("Error al enviar el mensaje.", "Error");
      }
    };

    const canMarkDocAsRead = (doc: Document) => {
      const canViewAll = hasPermission(PERMISSIONS_MASTER.DOCS_VIEW_ALL);
      const isDirectRecipient =
        !!doc.receptor_id && !!user?.id && String(doc.receptor_id) === String(user.id);
      const isDeptRecipient =
        !!doc.receptor_gerencia_id &&
        !!user?.gerencia_id &&
        String(doc.receptor_gerencia_id) === String(user.gerencia_id);
      const docDept = String(doc.targetDepartment || "").toLowerCase().trim();
      const userDeptLower = String(userDept || "").toLowerCase().trim();
      const matchesDeptByName = !!docDept && !!userDeptLower && docDept === userDeptLower;
      return (
        docView === "inbox" &&
        (canViewAll || isDirectRecipient || isDeptRecipient || matchesDeptByName)
      );
    };

    const viewConversation = async (key: string, label: string, docs: Document[]) => {
      const orderedDocs = [...docs].sort((a, b) => {
        const aTs = getDocTimestamp(a);
        const bTs = getDocTimestamp(b);
        return aTs - bTs;
      });

      const params = new URLSearchParams({
        key,
        label,
        view: docView,
      });
      window.location.href = `/dashboard/documentos/chat?${params.toString()}`;

      const unreadIds = orderedDocs
        .filter((d) => !d.leido && canMarkDocAsRead(d))
        .map((d) => d.id);
      if (unreadIds.length === 0) return;

      setDocuments((prev) =>
        prev.map((d) =>
          unreadIds.includes(d.id)
            ? {
              ...d,
              leido: true,
              signatureStatus: ["en-proceso", "pendiente"].includes(
                String(d.signatureStatus || "").toLowerCase(),
              )
                ? "recibido"
                : d.signatureStatus,
            }
            : d,
        ),
      );
      try {
        await Promise.allSettled(unreadIds.map((id) => markAsRead(id)));
      } catch (e) {
        console.error("Error marking conversation as read", e);
        refreshDocs();
      }
    };

    const getDocumentTypeIcon = (category?: string, hasFile?: boolean) => {
      const normalized = String(category || "").toLowerCase().trim();
      if (normalized === "informe") {
        return <FileCheck size={18} className="text-emerald-500" />;
      }
      if (normalized === "memorando") {
        return <FileText size={18} className="text-blue-500" />;
      }
      if (normalized === "circular") {
        return <Flag size={18} className="text-amber-500" />;
      }
      if (normalized === "solicitud") {
        return <Tag size={18} className="text-violet-500" />;
      }
      if (hasFile) {
        return <File size={18} className="text-red-500" />;
      }
      return <Mail size={18} className="text-cyan-500" />;
    };

    const sendConversationReply = async () => {
      if (!selectedConversation) return;
      const content = replyDraft.trim();
      if (!content) {
        void uiAlert("Escribe un mensaje antes de enviar.", "Mensajería");
        return;
      }
      const key = selectedConversation.key || "";
      let recipientType: "user" | "dept" | "dept-name" | null = null;
      let recipientValue = "";
      if (key.startsWith("user:")) {
        recipientType = "user";
        recipientValue = key.slice(5);
      } else if (key.startsWith("dept:")) {
        recipientType = "dept";
        recipientValue = key.slice(5);
      } else if (key.startsWith("dept-name:")) {
        recipientType = "dept-name";
        recipientValue = key.slice(10);
      }
      if (!recipientType || !recipientValue) {
        void uiAlert("No se pudo determinar el destinatario de esta conversación.", "Mensajería");
        return;
      }
      try {
        setReplySending(true);
        const formData = new FormData();
        formData.append("titulo", `Respuesta - ${selectedConversation.label}`.trim());
        formData.append("tipo_documento", "Mensaje");
        formData.append("prioridad", "media");
        formData.append("contenido", content);
        if (recipientType === "user") {
          formData.append("receptor_id", recipientValue);
        } else if (recipientType === "dept") {
          formData.append("receptor_gerencia_id", recipientValue);
        } else if (recipientType === "dept-name") {
          formData.append("receptor_gerencia_nombre", recipientValue);
        }
        await uploadDocumento(formData);
        const now = new Date();
        const senderLabel = user?.nombre
          ? `${user?.nombre} ${user?.apellido || ""}`.trim()
          : "Yo";
        setSelectedConversation((prev) =>
          prev
            ? {
                ...prev,
                docs: [
                  ...prev.docs,
                  {
                    id: Date.now(),
                    remitente_id: currentUserId || undefined,
                    uploadedBy: senderLabel,
                    uploadDate: now.toLocaleDateString("es-ES"),
                    uploadTime: now.toLocaleTimeString("es-ES", {
                      hour: "2-digit",
                      minute: "2-digit",
                    }),
                    contenido: content,
                  } as Document,
                ],
              }
            : prev,
        );
        await refreshDocs();
        setReplyDraft("");
        void uiAlert("Mensaje enviado.", "Mensajería");
      } catch (error) {
        console.error("Error sending reply:", error);
        void uiAlert("No se pudo enviar el mensaje.", "Mensajería");
      } finally {
        setReplySending(false);
      }
    };

    const closeConversationView = () => {
      setSelectedConversation(null);
      setReplyDraft("");
    };

    const getSignatureStatus = (status: string | null | undefined) => {
      // Manejo defensivo para status null/undefined
      if (!status || status === "null" || status === "undefined" || status === "") {
        return {
          color: darkMode ? "bg-gray-500/10 text-gray-400" : "bg-gray-50 text-gray-700",
          icon: AlertCircle,
          label: "Sin Estado",
        };
      }

      const statusLower = String(status).toLowerCase().trim();

      switch (statusLower) {
        case "nuevo":
          return {
            color: darkMode ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700",
            icon: AlertCircle,
            label: "Nuevo",
          };
        case "enviado":
          return {
            color: darkMode ? "bg-indigo-500/10 text-indigo-400" : "bg-indigo-50 text-indigo-700",
            icon: Clock,
            label: "Enviado",
          };
        case "pendiente":
          return {
            color: darkMode ? "bg-amber-500/10 text-amber-400" : "bg-amber-50 text-amber-700",
            icon: AlertCircle,
            label: "Pendiente",
          };
        case "aprobado":
          return {
            color: darkMode ? "bg-green-500/10 text-green-400" : "bg-green-50 text-green-700",
            icon: CheckCircle,
            label: "Aprobado",
          };
        case "rechazado":
          return {
            color: darkMode ? "bg-red-500/10 text-red-400" : "bg-red-50 text-red-700",
            icon: X,
            label: "Rechazado",
          };
        case "omitido":
          return {
            color: darkMode ? "bg-gray-500/10 text-gray-400" : "bg-gray-50 text-gray-700",
            icon: LogOut,
            label: "Omitido",
          };
        case "en-proceso":
        case "en proceso":
        case "en_proceso":
          return {
            color: darkMode ? "bg-blue-500/10 text-blue-400" : "bg-blue-50 text-blue-700",
            icon: Clock,
            label: "En Proceso",
          };
        case "recibido":
        case "visto":
          return {
            color: darkMode ? "bg-emerald-500/10 text-emerald-400" : "bg-emerald-50 text-emerald-700",
            icon: Eye,
            label: "Recibido",
          };
        case "leido":
        case "Leído":
          return {
            color: darkMode ? "bg-cyan-500/10 text-cyan-400" : "bg-cyan-50 text-cyan-700",
            icon: Eye,
            label: "Leído",
          };
        default:
          return {
            color: darkMode ? "bg-slate-500/10 text-slate-400" : "bg-slate-50 text-slate-700",
            icon: AlertCircle,
            label: status || "Desconocido",
          };
      }
    };

    return (
      <div className="space-y-4 pt-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".pdf"
        />

        {/* Nuevo Mensaje Modal (ex-Upload) */}
        {showUploadModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-2 md:p-5 animate-in fade-in duration-300 overflow-hidden">
            <div className={`w-[min(1400px,98vw)] h-[95vh] rounded-2xl border shadow-2xl flex flex-col glass-reflect ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white"}`}>
              <div className="p-6 border-b flex justify-between items-center bg-red-700 text-white">
                <h2 className="font-bold flex items-center gap-2 uppercase tracking-tight text-white">
                  <Mail size={20} />
                  ENVIAR MENSAJE INTERNO
                </h2>
                <button onClick={() => setShowUploadModal(false)} className="hover:rotate-90 transition-transform">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={confirmUpload} className="p-5 md:p-6 space-y-4 overflow-y-auto no-scrollbar">
                <div className="flex gap-4 mb-2">
                  <button
                    type="button"
                    onClick={() => setSendMode("user")}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${sendMode === "user" ? "bg-red-700 border-red-700 text-white" : darkMode ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-600"}`}
                  >
                    A USUARIO
                  </button>
                  <button
                    type="button"
                    onClick={() => setSendMode("dept")}
                    className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${sendMode === "dept" ? "bg-red-700 border-red-700 text-white" : darkMode ? "border-slate-700 text-slate-400" : "border-slate-200 text-slate-600"}`}
                  >
                    A GERENCIA
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">
                    Asunto
                  </label>
                  <input
                    required
                    value={docName}
                    onChange={(e) => setDocName(e.target.value)}
                    placeholder="Ej: Solicitud de Vacaciones"
                    className={`w-full px-4 py-2.5 rounded-lg border outline-none text-sm ${darkMode ? "bg-slate-950 border-slate-700 text-white" : "bg-slate-50 border-slate-200"}`}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">
                    Formato de documento
                  </label>
                  <select
                    value={docCategory}
                    onChange={(e) => setDocCategory(e.target.value)}
                    className={`w-full px-4 py-2.5 rounded-lg border outline-none text-sm ${darkMode ? "bg-slate-950 border-slate-700 text-white" : "bg-slate-50 border-slate-200"}`}
                  >
                    <option value="Informe">Informe</option>
                    <option value="Memorando">Memorando</option>
                    <option value="Circular">Circular</option>
                    <option value="Solicitud">Solicitud</option>
                    <option value="Otros">Otros</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">
                    Correlativo (ID Manual)
                  </label>
                  <input
                    value={correlativo}
                    onChange={(e) => setCorrelativo(e.target.value)}
                    placeholder="Ej: 015"
                    className={`w-full px-4 py-2.5 rounded-lg border outline-none text-sm ${darkMode ? "bg-slate-950 border-slate-700 text-white" : "bg-slate-50 border-slate-200"}`}
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    Formato final: {correlativoPreview}
                  </p>
                </div>

                <div className="rounded-lg border p-3 border-dashed border-slate-700/40">
                  <label className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={priorityEnabled}
                      onChange={(e) => setPriorityEnabled(e.target.checked)}
                      className="accent-red-600"
                    />
                    Control de seguimiento (prioridad)
                  </label>
                  {priorityEnabled && (
                    <div className="mt-3">
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">
                        Tiempo máximo de atención (días)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={priorityDays}
                        onChange={(e) => setPriorityDays(Math.max(1, Number(e.target.value || 1)))}
                        className={`w-full px-4 py-2.5 rounded-lg border outline-none text-sm ${darkMode ? "bg-slate-950 border-slate-700 text-white" : "bg-slate-50 border-slate-200"}`}
                      />
                      <div className={`mt-3 rounded-lg border px-3 py-2 text-xs space-y-1 ${darkMode ? "border-slate-700 bg-slate-950 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-700"}`}>
                        <p><span className="font-semibold">Fecha de envio:</span> {fechaEnvioPreview}</p>
                        <p><span className="font-semibold">Fecha maxima de entrega:</span> {fechaMaximaEntregaPreview}</p>
                      </div>
                    </div>
                  )}
                </div>

                {sendMode === "user" ? (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">
                      Destinatarios (Usuarios)
                    </label>
                    <details
                      className={`w-full rounded-lg border px-3 py-2 ${darkMode ? "bg-slate-950 border-slate-700 text-white" : "bg-slate-50 border-slate-200"}`}
                    >
                      <summary className="cursor-pointer text-sm">
                        Seleccionar usuarios ({targetUserIds.length})
                      </summary>
                      <div className="mt-2 max-h-40 overflow-y-auto no-scrollbar space-y-2">
                        {messagingUserOptions.map((u) => (
                          <label key={u.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={targetUserIds.includes(u.id)}
                              onChange={() => toggleUserRecipient(u.id)}
                              className="accent-red-600"
                            />
                            <span>{u.label}</span>
                          </label>
                        ))}
                      </div>
                    </details>
                  </div>
                ) : (
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">
                      Gerencias Destino
                    </label>
                    <details
                      className={`w-full rounded-lg border px-3 py-2 ${darkMode ? "bg-slate-950 border-slate-700 text-white" : "bg-slate-50 border-slate-200"}`}
                    >
                      <summary className="cursor-pointer text-sm">
                        Seleccionar gerencias ({targetDeptIds.length})
                      </summary>
                      <div className="mt-2 max-h-40 overflow-y-auto no-scrollbar space-y-2">
                        {messagingDeptOptions.map((g) => (
                          <label key={g.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={targetDeptIds.includes(g.id)}
                              onChange={() => toggleDeptRecipient(g.id)}
                              className="accent-red-600"
                            />
                            <span>{g.nombre}</span>
                          </label>
                        ))}
                      </div>
                    </details>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">
                    Mensaje / Contenido
                  </label>
                  <textarea
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    rows={4}
                    placeholder="Escribe tu mensaje aquí..."
                    className={`w-full px-4 py-2.5 rounded-lg border outline-none text-sm resize-none ${darkMode ? "bg-slate-950 border-slate-700 text-white" : "bg-slate-50 border-slate-200"}`}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider">
                    Adjuntar PDFs (Puedes subir varios)
                  </label>
                  <div className="space-y-2">
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className={`cursor-pointer border-2 border-dashed rounded-xl p-4 text-center transition-all ${darkMode ? "border-slate-700 hover:border-slate-500 bg-slate-800/50" : "border-slate-300 hover:border-slate-400 bg-slate-50"}`}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <FileText size={24} className="text-slate-400" />
                        <span className="text-xs text-slate-500">Añadir Archivo PDF</span>
                      </div>
                    </div>

                    {selectedFiles.length > 0 && (
                      <div className="grid grid-cols-1 gap-2 mt-2">
                        {selectedFiles.map((file, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center justify-between p-2 rounded-lg border ${darkMode ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"}`}
                          >
                            <div className="flex items-center gap-2 overflow-hidden">
                              <CheckCircle size={16} className="text-green-500 shrink-0" />
                              <span className="text-xs truncate font-medium">{file.name}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setSelectedFiles(prev => prev.filter((_, i) => i !== idx))}
                              className="text-red-500 hover:text-red-600 p-1"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className={`flex-1 py-3 rounded-lg font-bold text-xs tracking-widest border transition-all ${darkMode ? "border-slate-800 text-slate-400 hover:bg-slate-800" : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    CANCELAR
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 rounded-lg font-bold text-xs tracking-widest text-white transition-all transform active:scale-95 shadow-lg bg-red-700 hover:bg-red-800 shadow-red-900/20"
                  >
                    ENVIAR MENSAJE
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {selectedConversation && (
          <div
            className={`rounded-2xl border overflow-hidden flex flex-col min-h-[70vh] ${darkMode ? "bg-slate-900/60 border-slate-800" : "bg-white border-slate-200"}`}
          >
            <div className={`px-6 py-4 border-b flex flex-wrap items-center gap-3 ${darkMode ? "bg-slate-950/60 border-slate-800" : "bg-slate-50 border-slate-200"}`}>
              <button
                onClick={closeConversationView}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${darkMode ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-200 text-slate-800 hover:bg-slate-300"}`}
              >
                Volver a bandeja
              </button>
              <div className="min-w-0">
                <h2 className={`font-bold text-lg leading-tight truncate ${darkMode ? "text-white" : "text-slate-900"}`}>
                  Conversación con {selectedConversation.label}
                </h2>
                <p className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-600"}`}>
                  {selectedConversation.docs.length} mensaje(s) • {docViewLabel}
                </p>
              </div>
            </div>
            <div className={`flex-1 p-6 space-y-4 overflow-y-auto no-scrollbar ${darkMode ? "bg-slate-950/30" : "bg-slate-50"}`}>
              {selectedConversation.docs.map((msg) => {
                const isMine = currentUserId && msg.remitente_id && String(msg.remitente_id) === currentUserId;
                return (
                  <div key={msg.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
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
                        {msg.uploadedBy || "Remitente"} • {msg.uploadDate} {msg.uploadTime}
                      </div>
                      {msg.contenido ? (
                        <div>{msg.contenido}</div>
                      ) : (
                        <div className="italic opacity-80">Sin contenido de mensaje en texto.</div>
                      )}
                      {(msg.fileUrl || (msg.archivos || []).length > 0) && (
                        <div className="flex flex-wrap gap-2 mt-3">
                          {msg.fileUrl && (
                            <a
                              href={msg.fileUrl}
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
                              Ver archivo
                            </a>
                          )}
                          {(msg.archivos || []).map((file: string, idx: number) => (
                            <a
                              key={`${file}-${idx}`}
                              href={file}
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
                              Adjunto {idx + 1}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className={`px-6 py-4 border-t ${darkMode ? "border-slate-800 bg-slate-950/40" : "border-slate-200 bg-white"}`}>
              <div className="flex gap-2 items-end">
                <textarea
                  rows={2}
                  value={replyDraft}
                  onChange={(e) => setReplyDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendConversationReply();
                    }
                  }}
                  placeholder="Escribe tu respuesta..."
                  className={`flex-1 rounded-full px-4 py-2 text-sm outline-none resize-none ${darkMode ? "bg-slate-950 border border-slate-800 text-slate-200" : "bg-white border border-slate-300 text-slate-800"}`}
                />
                <button
                  onClick={() => void sendConversationReply()}
                  disabled={!replyDraft.trim() || replySending}
                  className={`w-10 h-10 rounded-full flex items-center justify-center text-white transition-colors ${
                    replySending
                      ? "bg-emerald-400"
                      : "bg-emerald-600 hover:bg-emerald-700"
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  title="Enviar"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        )}

        <div className={selectedConversation ? "hidden" : "block"}>
          <div className="flex justify-between items-center mb-2">
            <div
              className={`flex p-1 rounded-lg border ${darkMode ? "bg-slate-900 border-slate-800" : "bg-slate-100 border-slate-200"}`}
            >
              <button
                onClick={() => setDocView("inbox")}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${docView === "inbox" ? "bg-red-700 text-white" : darkMode ? "text-slate-400 hover:text-white" : "text-slate-800 hover:text-slate-950 hover:bg-white"}`}
              >
                <Inbox size={14} />
                BANDEJA DE ENTRADA
              </button>
              <button
                onClick={() => setDocView("sent")}
                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${docView === "sent" ? "bg-red-700 text-white" : darkMode ? "text-slate-400 hover:text-white" : "text-slate-800 hover:text-slate-950 hover:bg-white"}`}
              >
                <Send size={14} />
                ENVIADOS
              </button>
              {canUseAuditView && (
                <button
                  onClick={() => setDocView("audit")}
                  className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${docView === "audit" ? "bg-red-700 text-white" : darkMode ? "text-slate-400 hover:text-white" : "text-slate-800 hover:text-slate-950 hover:bg-white"}`}
                >
                  <Shield size={14} />
                  AUDITAR MENSAJES
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {canBulkDeleteMessages && (
                <>
                  <button
                    onClick={handleDeleteSelected}
                    disabled={selectedDocIds.filter((id) => filteredDocIdSet.has(id)).length === 0}
                    className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                      selectedDocIds.filter((id) => filteredDocIdSet.has(id)).length === 0
                        ? "bg-slate-500/30 text-slate-400 cursor-not-allowed"
                        : "bg-red-700 text-white hover:bg-red-800"
                    }`}
                  >
                    Eliminar Seleccionados
                  </button>
                  <button
                    onClick={handleDeleteAllFiltered}
                    disabled={filteredDocs.length === 0}
                    className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${
                      filteredDocs.length === 0
                        ? "bg-slate-500/30 text-slate-400 cursor-not-allowed"
                        : "bg-red-900 text-white hover:bg-red-950"
                    }`}
                  >
                    Eliminar Todo ({filteredDocs.length})
                  </button>
                </>
              )}
              {hasPermission(PERMISSIONS_MASTER.DOCS_UPLOAD) && (
                <button
                  onClick={handleUploadClick}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${darkMode ? "bg-green-600 text-white hover:bg-green-700" : "bg-green-700 text-white hover:bg-green-800"}`}
                >
                  + Nuevo Documento
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div
            className={`glass-reflect p-4 rounded-lg flex flex-wrap gap-4 items-end ${darkMode ? "bg-slate-900/50 border border-slate-800" : "bg-slate-50 border border-slate-200"}`}
          >
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Búsqueda
              </label>
              <div
                className={`flex items-center px-3 py-2 rounded-md border ${darkMode ? "bg-slate-950 border-slate-700" : "bg-white border-slate-300"}`}
              >
                <Search size={14} className="text-slate-500 mr-2" />
                <input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscar por ID o Título..."
                  className="bg-transparent border-none outline-none text-sm w-full"
                />
              </div>
            </div>
            <div className="w-48">
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                Estado
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className={`w-full px-3 py-2 rounded-md border text-sm outline-none cursor-pointer ${darkMode ? "bg-slate-950 border-slate-700 text-slate-300" : "bg-white border-slate-300 text-slate-700"}`}
              >
                <option value="all">Todos los Estados</option>
                {docView !== "sent" ? (
                  <>
                    <option value="nuevo">Nuevo</option>
                    <option value="leido">Leído</option>
                    <option value="en-proceso">En Proceso</option>
                  </>
                ) : (
                  <>
                    <option value="enviado">Enviado</option>
                    <option value="recibido">Recibido</option>
                    <option value="en-proceso">En Proceso</option>
                  </>
                )}
              </select>
            </div>
            {canAccessSecurityModule && (
              <div className="w-48">
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                  Gerencia
                </label>
                <select
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                  className={`w-full px-3 py-2 rounded-md border text-sm outline-none cursor-pointer ${darkMode ? "bg-slate-950 border-slate-700 text-slate-300" : "bg-white border-slate-300 text-slate-700"}`}
                >
                  <option value="all">Todas las Gerencias</option>
                  {departments.map((dept) => (
                    <option key={dept} value={dept}>
                      {dept}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>


          {/* Table */}
          <div className="overflow-x-auto no-scrollbar rounded-lg border border-slate-200/20 glass-reflect">
            <table className={`w-full ${darkMode ? "bg-slate-900" : "bg-white"}`}>
            <thead
              className={`${darkMode ? "bg-slate-950/50" : "bg-slate-50"} border-b ${darkMode ? "border-slate-800" : "border-slate-200"}`}
            >
              <tr>
                {canBulkDeleteMessages && (
                  <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500 w-12">
                    <input
                      type="checkbox"
                      checked={areAllFilteredSelected}
                      onChange={toggleSelectAllFiltered}
                      className="accent-red-600"
                      aria-label="Seleccionar todos"
                    />
                  </th>
                )}
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  Documento
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  Correlativo
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  Fecha / Hora
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  Enviado Por
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  {docView === "sent" ? "Enviado A" : "Recibido Por"}
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                  Estado
                </th>
                <th className="px-4 py-3 text-center text-xs font-bold uppercase tracking-wider text-slate-500">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className={`divide-y ${darkMode ? "divide-slate-800" : "divide-slate-200"}`}>
              {conversationGroups.map((group) => {
                const doc = group.latestDoc;
                const effectiveStatus = normalizeMessagingStatus(doc, docView);
                const statusInfo = getSignatureStatus(effectiveStatus);
                const StatusIcon = statusInfo.icon;
                const isUnread = docView === "inbox" && group.unreadCount > 0;
                const groupDocIds = group.docs.map((d) => String(d.id));
                const isGroupSelected = groupDocIds.every((id) => selectedDocIds.includes(id));
                const deliveryInfo = getDeliveryInfo(doc);
                const deliveryBadgeStyle =
                  deliveryInfo.key === "direct"
                    ? darkMode
                      ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : deliveryInfo.key === "dept"
                      ? darkMode
                        ? "bg-blue-500/15 text-blue-300 border-blue-500/30"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                      : darkMode
                        ? "bg-slate-500/10 text-slate-400 border-slate-600/30"
                        : "bg-slate-50 text-slate-600 border-slate-200";

                return (
                  <tr
                    key={doc.id}
                    className={`transition-colors h-14 ${darkMode ? "hover:bg-slate-800/50" : "hover:bg-slate-50"} ${isUnread ? (darkMode ? "bg-blue-900/10" : "bg-blue-50/50") : ""}`}
                  >
                    {canBulkDeleteMessages && (
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isGroupSelected}
                          onChange={() => toggleConversationSelection(groupDocIds)}
                          className="accent-red-600"
                          aria-label={`Seleccionar conversacion ${group.label}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className={`mt-1 p-2 rounded-lg ${darkMode ? "bg-slate-800" : "bg-slate-100"}`}>
                          {getDocumentTypeIcon(doc.category, !!doc.fileUrl)}
                        </div>
                        <div className="max-w-[200px] overflow-hidden">
                          <div className={`text-sm truncate ${isUnread ? (darkMode ? "font-bold text-white" : "font-bold text-slate-900") : darkMode ? "text-slate-400" : "text-slate-700"}`}>
                            {group.label}
                          </div>
                          <div className={`text-[10px] truncate ${darkMode ? "text-slate-500" : "text-slate-600"}`}>
                            {doc.name} • {group.docs.length} mensaje(s)
                          </div>
                        </div>
                        {isUnread && (
                          <div className="w-2 h-2 rounded-full bg-red-600 mt-2"></div>
                        )}
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-xs font-mono ${darkMode ? "text-slate-500" : "text-slate-700"}`}>
                      {doc.idDoc}
                    </td>
                    <td className="px-4 py-3">
                      <div className={`text-xs ${darkMode ? "text-slate-400" : "text-slate-700"}`}>{doc.uploadDate}</div>
                      <div className={`text-[10px] ${darkMode ? "text-slate-600" : "text-slate-500"}`}>{doc.uploadTime}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Users size={12} className={darkMode ? "text-slate-500" : "text-slate-600"} />
                        <span className={`text-xs truncate max-w-[150px] ${darkMode ? "text-slate-400" : "text-slate-700"}`}>
                          {doc.uploadedBy || "Desconocido"}
                        </span>
                      </div>
                      <div className={`text-[10px] truncate max-w-[160px] ${darkMode ? "text-slate-500" : "text-slate-600"}`}>
                        {doc.remitente_gerencia_nombre || "Sin Gerencia"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 size={12} className={darkMode ? "text-slate-500" : "text-slate-600"} />
                        <span className={`text-xs truncate max-w-[150px] ${darkMode ? "text-slate-400" : "text-slate-700"}`}>
                          {getRecipientDisplay(doc)}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold border ${deliveryBadgeStyle}`}>
                          {deliveryInfo.label}
                        </span>
                      </div>
                      <div className={`text-[10px] truncate max-w-[160px] ${darkMode ? "text-slate-500" : "text-slate-600"}`}>
                        {doc.receptor_gerencia_nombre ||
                          doc.receptor_gerencia_nombre_usuario ||
                          doc.targetDepartment ||
                          "Sin Gerencia"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold ${statusInfo.color}`}>
                        <StatusIcon size={10} />
                        {statusInfo.label.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <a
                          href={`/dashboard/documentos/chat?${new URLSearchParams({
                            key: group.key,
                            label: group.label,
                            view: docView,
                          }).toString()}`}
                          onClick={() => {
                            void createSecurityLog({
                              evento: "CONVERSACION_ABIERTA",
                              detalles: JSON.stringify({
                                action: "OPEN_CONVERSATION",
                                documento_id: doc.id,
                                correlativo: doc.correlativo,
                                key: group.key,
                                view: docView,
                              }),
                              estado: "info",
                              page: "/dashboard?tab=documentos",
                            });
                          }}
                          className={`p-2 rounded-md transition-colors inline-flex ${darkMode ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-600"}`}
                          title="Ver conversacion"
                        >
                          <Eye size={16} />
                        </a>
                        {doc.fileUrl && (
                          <a
                            href={doc.fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                              void createSecurityLog({
                                evento: "DOCUMENTO_DESCARGA",
                                detalles: JSON.stringify({
                                  action: "DOWNLOAD_PRIMARY",
                                  documento_id: doc.id,
                                  correlativo: doc.correlativo,
                                }),
                                estado: "info",
                                page: "/dashboard?tab=documentos",
                              });
                            }}
                            className={`p-2 rounded-md transition-colors ${darkMode ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-600"}`}
                            title="Descargar PDF"
                          >
                            <Download size={16} />
                          </a>
                        )}
                        {canBulkDeleteMessages && (
                          <button
                            onClick={() => deleteDocsByIds(groupDocIds)}
                            className={`p-2 rounded-md transition-colors ${
                              darkMode
                                ? "hover:bg-red-900/40 text-red-400"
                                : "hover:bg-red-50 text-red-700"
                            }`}
                            title="Eliminar conversacion"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {/* Mensaje de vacío FUERA del .map() */}
              {conversationGroups.length === 0 && (
                <tr>
                  <td colSpan={canBulkDeleteMessages ? 8 : 7} className="p-10 text-center text-slate-500 italic">
                    No se encontraron documentos
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {conversationGroups.length === 0 && (
            <div className="p-10 text-center">
              <div className="text-slate-500 italic mb-2">No se encontraron mensajes</div>
              <div className="text-xs text-slate-400 mb-4 space-y-1">
                <div>Total en sistema: {documents.length}</div>
                <div>Filtros activos: {docViewLabel} | {filterDept !== "all" ? filterDept : "Todos"}</div>
              </div>
              <button
                onClick={refreshDocs}
                className="px-4 py-2 bg-red-700 text-white rounded hover:bg-red-800 transition-colors text-sm font-bold"
              >
                Actualizar Bandeja
              </button>
            </div>
          )}
          </div>
        </div>

      </div>
    )
  };

// Módulo importado de forma dinámica para evitar errores de hidratación y mejorar carga de chunks
import dynamic from "next/dynamic";
const SecurityModule = dynamic(() => import("./security/SecurityModule"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-20">
      <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  ),
});

const ChartsModule: React.FC<{
  darkMode: boolean;
  documents: Document[];
  tickets: Ticket[];
  orgStructure: OrgCategory[];
  userRole: string;
  userId?: string;
  userDept?: string;
  hasPermission: (permission: string) => boolean;
}> = ({ darkMode, documents, tickets, orgStructure, userRole, userId, userDept, hasPermission }) => {
  const [view, setView] = useState<"overview" | "drilldown">("overview");
  const [selectedDetailDept, setSelectedDetailDept] = useState<string | null>(
    null,
  );

  const parseFlexibleDate = (value?: string) => {
    if (!value) return null;
    const raw = String(value).trim();
    const latin = raw.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    if (latin) {
      const [, dRaw, mRaw, y, hh = "00", mm = "00", ss = "00"] = latin;
      const d = dRaw.padStart(2, "0");
      const m = mRaw.padStart(2, "0");
      const date = new Date(`${y}-${m}-${d}T${hh.padStart(2, "0")}:${mm}:${ss}`);
      return Number.isNaN(date.getTime()) ? null : date;
    }
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date;
  };

  const normalizeDocStatus = (value?: string) =>
    String(value || "")
      .toLowerCase()
      .trim()
      .replaceAll("_", "-")
      .replaceAll(" ", "-");

  const getCurrentDocStatus = (doc: Document) => {
    const raw = normalizeDocStatus(doc.signatureStatus);
    if (raw === "finalizado") return raw;

    // Si ya viene marcado como vencido del backend, respetarlo
    if (raw === "vencido") return "vencido";

    // Alineado con Control de seguimiento: evalua el vencimiento por fecha visible.
    const deadline = parseFlexibleDateGlobal(doc.fecha_caducidad || undefined);

    // Comparar con hoy (al final del día para ser justos)
    if (deadline) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const deadlineDate = new Date(deadline);
      deadlineDate.setHours(0, 0, 0, 0);

      if (today.getTime() > deadlineDate.getTime()) return "vencido";
    }

    return raw || "en-proceso";
  };

  // Dynamic data for Documents Status (actual/real state)
  const docStatusData = useMemo(() => {
    const counts: Record<string, number> = {
      pendiente: 0,
      "en-proceso": 0,
      finalizado: 0,
      vencido: 0,
      aprobado: 0,
      rechazado: 0,
      recibido: 0,
      omitido: 0,
      otros: 0,
    };
    documents.forEach((doc) => {
      const status = getCurrentDocStatus(doc);
      if (Object.prototype.hasOwnProperty.call(counts, status)) {
        counts[status]++;
      } else {
        counts["otros"]++;
      }
    });
    return [
      { name: "En Proceso", value: counts["en-proceso"], color: "#3b82f6" },
      { name: "Vencidos", value: counts.vencido, color: "#ef4444" },
      { name: "Finalizados", value: counts.finalizado, color: "#10b981" },
      { name: "Pendientes", value: counts.pendiente, color: "#f59e0b" },
      { name: "Recibidos", value: counts.recibido, color: "#14b8a6" },
      { name: "Aprobados", value: counts.aprobado, color: "#22c55e" },
      { name: "Rechazados", value: counts.rechazado, color: "#ef4444" },
      { name: "Omitidos", value: counts.omitido, color: "#64748b" },
      { name: "Otros", value: counts.otros, color: "#9ca3af" },
    ].filter((d) => d.value > 0);
  }, [documents]);

  const visibleTicketsForDashboard = useMemo(() => {
    const normalizeText = (value: string) => String(value || "").toLowerCase().trim();
    const isTechUser = normalizeText(userDept || "").includes("tecnolog");
    const isAdminUser = normalizeText(userRole || "").includes("admin");
    const isDevUser =
      normalizeText(userRole || "").includes("desarrollador") ||
      normalizeText(userRole || "").includes("dev");
    const isCeoUser = normalizeText(userRole || "") === "ceo";
    const canSeeGlobalTickets =
      isTechUser ||
      isAdminUser ||
      isDevUser ||
      isCeoUser ||
      hasPermission(PERMISSIONS_MASTER.TICKETS_VIEW_ALL);

    return tickets.filter((ticket) => {
      if (ticket.status === "ELIMINADO") return false;
      if (canSeeGlobalTickets) return true;
      return !!ticket.ownerId && !!userId && String(ticket.ownerId) === String(userId);
    });
  }, [hasPermission, tickets, userDept, userId, userRole]);

  // Dynamic data for Ticket Priority (Existing chart)
  const ticketPriorityData = useMemo(() => {
    const counts = { ALTA: 0, MEDIA: 0, BAJA: 0 };
    visibleTicketsForDashboard.forEach((t) => {
      if (counts.hasOwnProperty(t.priority)) {
        counts[t.priority]++;
      }
    });
    return [
      { name: "Alta", value: counts.ALTA, color: "#ef4444" },
      { name: "Media", value: counts.MEDIA, color: "#f59e0b" },
      { name: "Baja", value: counts.BAJA, color: "#10b981" },
    ].filter((t) => t.value > 0);
  }, [visibleTicketsForDashboard]);

  // Get all departments list (estructura + actividad real)
  const allDepartments = useMemo(() => {
    const normalize = (value: string) =>
      String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
    const map = new Map<string, string>();
    const collect = (name?: string) => {
      const raw = String(name || "").trim();
      if (!raw) return;
      const key = normalize(raw);
      if (!map.has(key)) map.set(key, raw);
    };

    orgStructure.forEach((group) => (group.items || []).forEach((item) => collect(item)));
    documents.forEach((doc) => {
      collect(doc.department);
      collect(doc.targetDepartment);
      collect(doc.remitente_gerencia_nombre);
      collect(doc.receptor_gerencia_nombre);
      collect(doc.receptor_gerencia_nombre_usuario);
    });
    tickets.forEach((ticket) => {
      collect(ticket.area);
      collect(ticket.creatorDept);
    });
    return Array.from(map.values()).sort((a, b) => a.localeCompare(b, "es"));
  }, [orgStructure, documents, tickets]);

  const handleDeptSelect = (dept: string) => {
    setSelectedDetailDept(dept);
    // Ya estamos en drilldown, pero aseguramos
    setView("drilldown");
  };

  const handleBackToGrid = () => {
    setSelectedDetailDept(null);
  };

  const handleMainViewChange = (newView: "overview" | "drilldown") => {
    setView(newView);
    if (newView === "overview") {
      setSelectedDetailDept(null);
    }
  };

  return (
    <div className="space-y-6">
      {!selectedDetailDept && (
        <div className="flex justify-between items-center pb-4 border-b border-slate-200/10">
          <div>
            {view === "overview" ? (
              <>
                <h1
                  className={`text-2xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}
                >
                  Módulo de Estadísticas y Gráficos
                </h1>
                <p
                  className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}
                >
                  Visualización de datos estratégicos y métricas de desempeño.
                </p>
              </>
            ) : (
              <h1
                className={`text-2xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}
              >
                Desglose por Departamento
              </h1>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleMainViewChange("overview")}
              className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${view === "overview" ? "bg-red-700 text-white" : darkMode ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              Vista General
            </button>
            <button
              onClick={() => handleMainViewChange("drilldown")}
              className={`px-4 py-2 rounded-md font-medium text-sm transition-all ${view === "drilldown" ? "bg-red-700 text-white" : darkMode ? "bg-slate-800 text-slate-300 hover:bg-slate-700" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}
            >
              Seleccionar Gerencia
            </button>
          </div>
        </div>
      )}

      {view === "overview" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-500">
          {/* Chart 1: Document Status */}
          <div
            className={`p-6 rounded-lg border ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
          >
            <h3
              className={`font-bold mb-6 text-center ${darkMode ? "text-slate-200" : "text-slate-800"}`}
            >
              ESTADO DE DOCUMENTOS
            </h3>
            <div className="h-64">
              <ResponsiveContainerCompat width="100%" height="100%">
                <PieChartCompat>
                  <PieCompat
                    data={docStatusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {docStatusData.map((entry, index) => (
                      <CellCompat key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </PieCompat>
                  <TooltipCompat
                    contentStyle={{
                      backgroundColor: darkMode ? "#0f172a" : "#fff",
                      borderColor: darkMode ? "#1e293b" : "#e2e8f0",
                      color: darkMode ? "#f1f5f9" : "#1e293b",
                    }}
                  />
                  <LegendCompat
                    verticalAlign="bottom"
                    align="center"
                    layout="horizontal"
                    iconType="square"
                    iconSize={10}
                    wrapperStyle={{
                      paddingTop: 8,
                      display: "flex",
                      justifyContent: "center",
                      gap: 12,
                    }}
                    formatter={(value: string, _entry: any) => {
                      const count = _entry?.payload?.value ?? 0;
                      return `${value} (${count})`;
                    }}
                  />
                </PieChartCompat>
              </ResponsiveContainerCompat>
            </div>
          </div>

          {/* Chart 2: Ticket Priority */}
          <div
            className={`p-6 rounded-lg border ${darkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
          >
            <h3
              className={`font-bold mb-6 text-center ${darkMode ? "text-slate-200" : "text-slate-800"}`}
            >
              PRIORIDAD DE TICKETS
            </h3>
            <div className="h-64">
              <ResponsiveContainerCompat width="100%" height="100%">
                <PieChartCompat>
                  <PieCompat
                    data={ticketPriorityData}
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={false}
                    dataKey="value"
                  >
                    {ticketPriorityData.map((entry, index) => (
                      <CellCompat key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </PieCompat>
                  <TooltipCompat
                    contentStyle={{
                      backgroundColor: darkMode ? "#0f172a" : "#fff",
                      borderColor: darkMode ? "#1e293b" : "#e2e8f0",
                      color: darkMode ? "#f1f5f9" : "#1e293b",
                    }}
                  />
                  <LegendCompat
                    verticalAlign="bottom"
                    align="center"
                    layout="horizontal"
                    iconType="square"
                    iconSize={10}
                    wrapperStyle={{
                      paddingTop: 8,
                      display: "flex",
                      justifyContent: "center",
                      gap: 12,
                    }}
                    formatter={(value: string, _entry: any) => {
                      const count = _entry?.payload?.value ?? 0;
                      return `${value} (${count})`;
                    }}
                  />
                </PieChartCompat>
              </ResponsiveContainerCompat>
            </div>
          </div>
        </div>
      ) : // Drill-down View Logic
        selectedDetailDept ? (
          <DepartmentDetailView
            departmentName={selectedDetailDept}
            allDepartments={allDepartments}
            documents={documents}
            tickets={tickets}
            darkMode={darkMode}
            onBack={handleBackToGrid}
            onDepartmentChange={handleDeptSelect}
          />
        ) : (
          <DepartmentGrid
            orgStructure={orgStructure}
            darkMode={darkMode}
            onSelectDepartment={handleDeptSelect}
          />
        )}
    </div>
  );
};

// ==========================================
// DASHBOARD PRINCIPAL (MODULAR)
// ==========================================
export default function Dashboard() {
  // OK: Hooks (must be at top)
  useIdleTimer(); // Auto-logout timeout is configurable via env

  const [darkMode, setDarkMode] = useState(true);
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [activeSection, setActiveSection] = useState("dashboard");
  const [billingUrl, setBillingUrl] = useState<string>("");
  const [activeTab, setActiveTab] = useState("overview");
  const [expandedCategories, setExpandedCategories] = useState<number[]>([
    0, 1, 2, 3, 4,
  ]);
  const [selectedManagement, setSelectedManagement] = useState<string | null>(
    null,
  );
  const [managementDetailsMap, setManagementDetailsMap] = useState<Record<string, ManagementDetail>>({});

  const getNormalizedDetail = useCallback((name: string): ManagementDetail => {
    const raw = managementDetailsMap[name];
    if (!raw) {
      return { funciones: getDefaultFunctions(name), lider: "", contacto: "", objetivos: [] };
    }
    if (Array.isArray(raw)) {
      return { funciones: raw, lider: "", contacto: "", objetivos: [] };
    }
    return {
      funciones: raw.funciones || [],
      lider: raw.lider || "",
      contacto: raw.contacto || "",
      objetivos: raw.objetivos || [],
    };
  }, [managementDetailsMap]);

  const { user, logout, switchRole, hasPermission, isLoading } = useAuth();
  const userRole = user?.role || "Usuario";
  const isDev = userRole === "Desarrollador";

  const isModuleAllowed = useCallback((moduleId: string) => {
    if (!user?.allowed_modules || user.allowed_modules.includes("all")) return true;
    return user.allowed_modules.includes(moduleId);
  }, [user]);

  // Granular Access Controls base on hasPermission and Subscription Plans
  const baseCanAccessOverview = (hasPermission(PERMISSIONS_MASTER.VIEW_DASHBOARD) || isDev) && isModuleAllowed("dashboard");
  const baseCanAccessDocumentos = isModuleAllowed("comunidad");
  const baseCanAccessSecurity =
    (hasPermission(PERMISSIONS_MASTER.VIEW_SECURITY) ||
    userRole === "Administrador" ||
    userRole === "Desarrollador") && isModuleAllowed("configuracion");
  const baseCanAccessStats = hasPermission(PERMISSIONS_MASTER.VIEW_STATS) && isModuleAllowed("graficos");
  const baseCanAccessTickets = hasPermission(PERMISSIONS_MASTER.VIEW_TICKETS) && isModuleAllowed("tickets");
  const baseCanAccessPriorities =
    (hasPermission(PERMISSIONS_MASTER.VIEW_PRIORITIES) ||
    userRole === "Usuario" ||
    userRole === "Gerente") && isModuleAllowed("prioridades");
  const canAccessOverview = baseCanAccessOverview;
  const canAccessDocumentos = baseCanAccessDocumentos;
  const canAccessSecurity = baseCanAccessSecurity;
  const canAccessStats = baseCanAccessStats;
  const canAccessTickets = baseCanAccessTickets;
  const canAccessPriorities = baseCanAccessPriorities;
  const canAccessRoadmap = isModuleAllowed("hoja-de-ruta");
  const canAccessBilling = isModuleAllowed("facturacion");
  const canEditOrgStructure =
    userRole === "Desarrollador" || userRole === "Administrador" || userRole === "CEO";
  const canEditManagementDetails =
    userRole === "Desarrollador" || userRole === "Administrador";

  // ── Sidebar Accordion State ──
  const [openAccordions, setOpenAccordions] = useState<Record<string, boolean>>({
    "mi-negocio": true,
    "mi-equipo": true,
    "soporte-tecnico": true,
  });
  const toggleAccordion = useCallback((groupId: string) => {
    setOpenAccordions((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  }, []);

  // RBAC: ¿Es rol "Administrative" (IT master/Soporte)?
  const isAdministrative = userRole === "Administrador" || userRole === "Desarrollador";



  const isTabAccessible = useCallback((tab: string) => {
    switch (tab) {
      case "overview":
        return canAccessOverview;
      case "tickets":
        return canAccessTickets;
      case "documentos":
        return canAccessDocumentos;
      case "prioridades":
        return canAccessPriorities;
      case "graficos":
        return canAccessStats;
      case "seguridad":
        return canAccessSecurity;
      case "hoja-de-ruta":
        return canAccessRoadmap;
      case "facturacion":
        return canAccessBilling;
      case "directorio":
        return true;
      case "directorio-personas":
        return true;
      default:
        return true;
    }
  }, [canAccessOverview, canAccessTickets, canAccessDocumentos, canAccessPriorities, canAccessStats, canAccessSecurity, canAccessRoadmap, canAccessBilling, isDev, userRole, hasPermission, isModuleAllowed]);

  const firstAccessibleTab = useMemo(() => {
    const orderedTabs = ["overview", "documentos", "tickets", "prioridades", "seguridad", "graficos", "directorio", "directorio-personas", "hoja-de-ruta", "facturacion"];
    return orderedTabs.find((tab) => isTabAccessible(tab)) || "overview";
  }, [isTabAccessible]);

  // Action specific check
  const isReadOnly = !hasPermission(PERMISSIONS_MASTER.DOCS_UPLOAD);

  // Lifted state for documents to share with SecurityModule
  const [documents, setDocuments] = useState<Document[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [gerencias, setGerencias] = useState<any[]>([]);
  const safeDocuments = ensureArray<Document>(documents);
  const safeUsers = ensureArray<any>(users);
  const safeGerencias = ensureArray<any>(gerencias);
  const previousUnreadIncomingIdsRef = useRef<Set<string>>(new Set());
  const inboxBaselineReadyRef = useRef(false);
  const playInboxAlert = useCallback(() => {
    // Audio deshabilitado por limpieza visual.
  }, []);

  const isIncomingDocumentForUser = useCallback((doc: Document) => {
    const isDirectRecipient =
      !!doc.receptor_id && !!user?.id && String(doc.receptor_id) === String(user.id);
    const isDeptRecipient =
      !!doc.receptor_gerencia_id &&
      !!user?.gerencia_id &&
      String(doc.receptor_gerencia_id) === String(user.gerencia_id);
    const isOwnMessage =
      !!doc.remitente_id && !!user?.id && String(doc.remitente_id) === String(user.id);

    return (isDirectRecipient || isDeptRecipient) && !isOwnMessage;
  }, [user?.gerencia_id, user?.id]);

  const canSeeDocumentInInbox = useCallback((doc: Document) => {
    const canViewAll = hasPermission(PERMISSIONS_MASTER.DOCS_VIEW_ALL);
    if (canViewAll) return true;

    const isOwnMessage =
      !!doc.remitente_id && !!user?.id && String(doc.remitente_id) === String(user.id);
    if (isOwnMessage) return false;

    const isDirectRecipient =
      !!doc.receptor_id && !!user?.id && String(doc.receptor_id) === String(user.id);
    if (isDirectRecipient) return true;

    const isDeptRecipient =
      !!doc.receptor_gerencia_id &&
      !!user?.gerencia_id &&
      String(doc.receptor_gerencia_id) === String(user.gerencia_id);
    if (isDeptRecipient) return true;

    const docDept = String(doc.targetDepartment || "").toLowerCase().trim();
    const userDeptLower = String(user?.gerencia_depto || "").toLowerCase().trim();
    return !!docDept && !!userDeptLower && docDept === userDeptLower;
  }, [hasPermission, user?.gerencia_depto, user?.gerencia_id, user?.id]);

  const unreadInboxCount = useMemo(
    () => safeDocuments.filter((doc) => isIncomingDocumentForUser(doc) && !doc.leido).length,
    [safeDocuments, isIncomingDocumentForUser],
  );

  // Sidebar navigation groups con RBAC
  const sidebarGroups: SidebarGroup[] = useMemo(() => [
    {
      id: "mi-negocio",
      label: "MI NEGOCIO",
      icon: Briefcase,
      allowedRoles: ["CEO", "Gerente", "Administrador", "Desarrollador"],
      items: [
        { id: "graficos", label: "Gráficos", icon: BarChart2, canAccess: canAccessStats },
        { id: "facturacion", label: "Módulo de Facturación", icon: FileSpreadsheet, canAccess: canAccessBilling, href: billingUrl || undefined },
      ],
    },
    {
      id: "mi-equipo",
      label: "MI EQUIPO",
      icon: Users,
      allowedRoles: null, // Todos los roles
      items: [
        { id: "documentos", label: "Mensajería Interna", icon: Mail, canAccess: canAccessDocumentos, badgeCount: unreadInboxCount },
        { id: "prioridades", label: "Control de Seguimiento", icon: Flag, canAccess: canAccessPriorities },
        { id: "directorio", label: "Trazabilidad de Gerencias", icon: Building2, canAccess: true },
        { id: "directorio-personas", label: "Directorio de Personas", icon: UsersRound, canAccess: true },
      ],
    },
    {
      id: "soporte-tecnico",
      label: "SOPORTE TÉCNICO",
      icon: Settings,
      allowedRoles: ["Administrador", "Desarrollador"],
      items: [
        { id: "tickets", label: "Sistema de Tickets", icon: Tag, canAccess: canAccessTickets },
        { id: "seguridad", label: "Módulo de Seguridad", icon: Shield, canAccess: canAccessSecurity },
      ],
    },
  ], [canAccessStats, canAccessBilling, billingUrl, canAccessDocumentos, unreadInboxCount, canAccessPriorities, canAccessTickets, canAccessSecurity]);

  // Filtrar grupos según el rol del usuario
  const visibleSidebarGroups = useMemo(() =>
    sidebarGroups.filter((group) => {
      if (group.allowedRoles === null) return true;
      return group.allowedRoles.includes(userRole);
    }),
  [sidebarGroups, userRole]);

  const handleSidebarNavigate = useCallback((tabId: string) => {
    setActiveSection("dashboard");
    setActiveTab(tabId);
  }, []);

  const fetchDocuments = useCallback(async () => {
    try {
      const data = ensureArray<any>(await getDocumentos());

      const mappedDocs = data.map((d: any) => {
        // Fechas seguras
        let uploadDate = "N/A";
        let uploadTime = "N/A";

        if (d.fecha_creacion || d.uploadDate) {
          try {
            // Priorizar la cadena formateada del backend si existe
            if (d.uploadDate) {
              uploadDate = d.uploadDate;
              uploadTime = d.uploadTime || "N/A";
            } else {
              const date = new Date(d.fecha_creacion);
              if (!isNaN(date.getTime())) {
                uploadDate = date.toLocaleDateString("es-ES");
                uploadTime = date.toLocaleTimeString("es-ES", {
                  hour: "2-digit",
                  minute: "2-digit",
                });
              }
            }
          } catch (e) {
            console.error("Error parsing date:", e);
          }
        }

        const signatureStatusValue =
          d.estado ??
          d.signatureStatus ??
          d.signaturestatus ??
          d.status ??
          "en-proceso";
        const normalizedSignatureStatus = String(signatureStatusValue)
          .toLowerCase()
          .trim()
          .replaceAll("_", "-")
          .replaceAll(" ", "-") as Document["signatureStatus"];

        // URL del archivo
        const rawFileUrl = d.url_archivo || d.fileUrl;
        const fileUrl = rawFileUrl
          ? (String(rawFileUrl).startsWith("http")
            ? rawFileUrl
            : `${BACKEND_BASE_URL}${rawFileUrl}`)
          : undefined;
        const rawCorrelativo =
          d.correlativo ??
          d.idDoc ??
          d.iddoc ??
          d.numero_documento ??
          d.numeroDocumento;
        const correlativoValue =
          rawCorrelativo !== null && rawCorrelativo !== undefined && String(rawCorrelativo).trim() !== ""
            ? String(rawCorrelativo).trim()
            : "N/A";

        return {
          id: d.id,
          idDoc: correlativoValue,
          name: d.titulo || d.title || d.name || "Sin Título",
          category: d.tipo_documento || d.category || "Otros",
          type: "pdf" as const,
          size: "N/A",
          uploadedBy: d.uploadedBy || d.remitente_nombre || "Desconocido",
          receivedBy: d.receptor_nombre || d.receivedBy || "Pendiente",
          // IDs como strings para comparación
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
          department:
            d.department ||
            d.remitente_gerencia_nombre ||
            d.receptor_gerencia_nombre_usuario ||
            "Sin Asignar",
          targetDepartment:
            d.targetDepartment ||
            d.receptor_gerencia_nombre ||
            d.receptor_gerencia_nombre_usuario ||
            "Sin Asignar",
          correlativo: correlativoValue,
          fileUrl: d.fileUrl || (d.archivos && d.archivos.length > 0 ? d.archivos[0] : undefined),
          archivos: (d.archivos || []).map((url: string) =>
            url.startsWith("http") ? url : `${BACKEND_BASE_URL}${url}`
          ),
          prioridad: d.prioridad || "media",
          tenant_id: d.tenant_id,
          user_id: d.user_id,
          contenido: d.contenido, // Nuevo
          leido: d.leido,          // Nuevo
          respuesta_contenido: d.respuesta_contenido || "",
          respuesta_usuario_id: d.respuesta_usuario_id ? String(d.respuesta_usuario_id) : undefined,
          respuesta_usuario_nombre: d.respuesta_usuario_nombre || "",
          respuesta_fecha: d.respuesta_fecha || undefined,
          respuesta_archivos: (d.respuesta_archivos || []).map((url: string) =>
            url.startsWith("http") ? url : `${BACKEND_BASE_URL}${url}`
          ),
          respuesta_url_archivo: (d.respuesta_archivos && d.respuesta_archivos.length > 0)
            ? (String(d.respuesta_archivos[0]).startsWith("http")
              ? d.respuesta_archivos[0]
              : `${BACKEND_BASE_URL}${d.respuesta_archivos[0]}`)
            : undefined,
          fecha_caducidad: d.fecha_caducidad || undefined,
        };
      });

      const inboxDocs = mappedDocs.filter((doc) => isIncomingDocumentForUser(doc));
      const inboxUnreadDocs = inboxDocs.filter((doc) => !doc.leido);

      const currentUnreadIncomingIds = new Set(
        inboxUnreadDocs.map((doc) => String(doc.id)),
      );
      const previousUnreadIncomingIds = previousUnreadIncomingIdsRef.current;
      const hasNewUnreadIncoming = Array.from(currentUnreadIncomingIds).some(
        (id) => !previousUnreadIncomingIds.has(id),
      );

      if (inboxBaselineReadyRef.current && hasNewUnreadIncoming) {
        playInboxAlert();
      }

      previousUnreadIncomingIdsRef.current = currentUnreadIncomingIds;
      inboxBaselineReadyRef.current = true;
      setDocuments(mappedDocs as any);
    } catch (e) {
      console.error("Error fetching documents", e);
      setDocuments([]);
    }
  }, [isIncomingDocumentForUser, playInboxAlert]);

  const fetchGerencias = useCallback(async () => {
    try {
      const response = await getGerencias(50, 0);
      setGerencias(ensureArray<any>(response?.data));
    } catch (e) {
      console.error("Error fetching gerencias", e);
      setGerencias([]);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const response = await getAllUsers(50, 0);
      setUsers(ensureArray<any>(response?.data));
    } catch (e) {
      console.error("Error fetching users", e);
      setUsers([]);
    }
  }, []);

  const fetchTickets = useCallback(async () => {
    try {
      const rows = ensureArray<any>(await getTickets());
      const mapped: Ticket[] = rows.map((t: any) => ({
        id: t.id,
        title: t.titulo || "Sin Título",
        description: t.descripcion || "",
        area:
          t.area ||
          "Gerencia Nacional de Tecnologías de la Información y la Comunicación",
        creatorDept: t.solicitante_gerencia || "Sin Asignar",
        priority: (String(t.prioridad || "media").toUpperCase() as Ticket["priority"]),
        status:
          String(t.estado || "abierto").toLowerCase() === "eliminado"
            ? "ELIMINADO"
            :
            String(t.estado || "abierto").toLowerCase() === "resuelto"
              ? "RESUELTO"
              : String(t.estado || "abierto").toLowerCase() === "en-proceso"
                ? "EN-PROCESO"
                : "ABIERTO",
        createdAt: t.fecha_creacion
          ? new Date(t.fecha_creacion).toLocaleDateString("es-ES")
          : new Date().toLocaleDateString("es-ES"),
        ownerId: t.solicitante_id ? String(t.solicitante_id) : undefined,
        owner: t.solicitante_nombre || "Desconocido",
        observations: t.observaciones || "",
        takenBy: t.tecnico_nombre || undefined,
      }));
      setTickets(mapped);
    } catch (e) {
      console.error("Error fetching tickets", e);
      setTickets([]);
    }
  }, []);

  // Pre-warm: ping al backend lo antes posible para evitar cold-start de Render
  useEffect(() => {
    fetch('/api/health').catch(() => {});
  }, []);

  useEffect(() => {
    if (isLoading) return;
    fetchDocuments();
    fetchUsers();
    fetchGerencias();
    fetchTickets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remote = await getOrgManagementDetails();
        const remoteMap = remote?.management_details || {};
        if (!cancelled) {
          const merged: Record<string, ManagementDetail> = {};
          Object.keys(MANAGEMENT_DETAILS).forEach((key) => {
            merged[key] = { funciones: MANAGEMENT_DETAILS[key] || [], lider: "", contacto: "", objetivos: [] };
          });
          Object.keys(remoteMap).forEach((key) => {
            const raw = remoteMap[key];
            if (Array.isArray(raw)) {
              merged[key] = { funciones: raw, lider: "", contacto: "", objetivos: [] };
            } else if (raw && typeof raw === "object") {
              merged[key] = {
                funciones: raw.funciones || [],
                lider: raw.lider || "",
                contacto: raw.contacto || "",
                objetivos: raw.objetivos || [],
              };
            }
          });
          setManagementDetailsMap(merged);
          localStorage.setItem(MANAGEMENT_DETAILS_STORAGE_KEY, JSON.stringify(merged));
        }
        return;
      } catch (error) {
        console.error("No se pudieron cargar detalles de gerencias desde API", error);
      }

      try {
        const raw = localStorage.getItem(MANAGEMENT_DETAILS_STORAGE_KEY);
        if (!raw) {
          if (!cancelled) {
            const merged: Record<string, ManagementDetail> = {};
            Object.keys(MANAGEMENT_DETAILS).forEach((key) => {
              merged[key] = { funciones: MANAGEMENT_DETAILS[key] || [], lider: "", contacto: "", objetivos: [] };
            });
            setManagementDetailsMap(merged);
          }
          return;
        }
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !cancelled) {
          const merged: Record<string, ManagementDetail> = {};
          Object.keys(MANAGEMENT_DETAILS).forEach((key) => {
            merged[key] = { funciones: MANAGEMENT_DETAILS[key] || [], lider: "", contacto: "", objetivos: [] };
          });
          Object.keys(parsed).forEach((key) => {
            const val = parsed[key];
            if (Array.isArray(val)) {
              merged[key] = { funciones: val, lider: "", contacto: "", objetivos: [] };
            } else if (val && typeof val === "object") {
              merged[key] = {
                funciones: val.funciones || [],
                lider: val.lider || "",
                contacto: val.contacto || "",
                objetivos: val.objetivos || [],
              };
            }
          });
          setManagementDetailsMap(merged);
        }
      } catch (error) {
        console.error("No se pudieron cargar los detalles de gerencias personalizados", error);
        if (!cancelled) {
          const merged: Record<string, ManagementDetail> = {};
          Object.keys(MANAGEMENT_DETAILS).forEach((key) => {
            merged[key] = { funciones: MANAGEMENT_DETAILS[key] || [], lider: "", contacto: "", objetivos: [] };
          });
          setManagementDetailsMap(merged);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveManagementDetails = useCallback(async (name: string, nextDetail: ManagementDetail) => {
    const nextMap = {
      ...managementDetailsMap,
      [name]: nextDetail,
    };
    setManagementDetailsMap(nextMap);
    try {
      localStorage.setItem(MANAGEMENT_DETAILS_STORAGE_KEY, JSON.stringify(nextMap));
    } catch (error) {
      console.error("No se pudo persistir personalización local de gerencia", error);
    }
    try {
      await saveOrgManagementDetails(nextMap);
    } catch (error) {
      console.error("No se pudo persistir personalización de gerencia en backend", error);
    }
  }, [managementDetailsMap]);

  useEffect(() => {
    const syncDocs = () => {
      if (document.visibilityState !== "visible") return;
      fetchDocuments();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncDocs();
      }
    };

    const intervalId = window.setInterval(syncDocs, 15000);
    window.addEventListener("focus", syncDocs);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncDocs);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchDocuments]);

  useEffect(() => {
    const syncTickets = () => {
      if (document.visibilityState !== "visible") return;
      fetchTickets();
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        syncTickets();
      }
    };

    const intervalId = window.setInterval(syncTickets, 20000);
    window.addEventListener("focus", syncTickets);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncTickets);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchTickets]);

  // Refetch when switching to important tabs to ensure data is always up to date
  useEffect(() => {
    if (mounted) {
      if (activeTab === "graficos" || activeTab === "prioridades" || activeTab === "tickets") {
        void fetchTickets();
        void fetchDocuments();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, mounted]);

  // Lifted state for tickets
  const [tickets, setTickets] = useState<Ticket[]>([]);

  // Organizational Structure State
  const [orgStructure, setOrgStructure] = useState<OrgCategory[]>([]);
  const safeTickets = ensureArray<Ticket>(tickets);
  const safeOrgStructure = normalizeOrgStructurePayload(orgStructure);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let data: OrgCategory[] = [];
      let source: string | undefined;
      try {
        const remote = await getOrgStructure();
        const remoteOrgStructure = normalizeOrgStructurePayload(remote?.org_structure);
        if (remoteOrgStructure.length > 0) {
          data = remoteOrgStructure;
          source = remote.source;
        }
        if (remote?.management_details && typeof remote.management_details === "object") {
          setManagementDetailsMap((prev) => ({
            ...prev,
            ...remote.management_details,
          }));
        }
      } catch (e) {
        console.error("Error loading org structure from API, using fallback", e);
      }

      if (data.length === 0) {
        data = JSON.parse(JSON.stringify(DEFAULT_ORG_STRUCTURE));
        source = source || "default";
      }

      if (source === "catalog") {
        // Always show the proper grouped structure visually
        data = JSON.parse(JSON.stringify(DEFAULT_ORG_STRUCTURE));
        if (canEditOrgStructure) {
          try {
            await saveOrgStructure(DEFAULT_ORG_STRUCTURE);
            source = "seeded";
          } catch (e) {
            console.error("No se pudo inicializar la estructura organizativa", e);
          }
        }
      }

      if (userRole === "Desarrollador" && !data.some((g) => g.category?.includes("Desarrollo"))) {
        data.push({
          category: "VI. Módulo de Desarrollo y Control Raíz",
          icon: "Shield",
          items: ["Gestión Directa", "Logs de Auditoría", "Control de Dominios"],
        });
      }

      if (!cancelled) setOrgStructure(normalizeOrgStructurePayload(data));
    })();

    return () => {
      cancelled = true;
    };
  }, [userRole, user?.id, canEditOrgStructure]);


  // ESTADO DE ANUNCIOS (Dashboard General)
  const [announcement, setAnnouncement] = useState<AnnouncementData>({
    badge: "Comunicado del Día",
    title: "Actualización de Protocolos de Seguridad 2026",
    description:
      "Se les informa a todas las Gerencias que a partir de las 14:00h se iniciará la migración de los protocolos de firma digital. Por favor, aseguren sus trámites pendientes.",
    status: "Activo",
    urgency: "Alta",
    color: "#075159",
  });

  // Persistencia de anuncios
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const remoteAnnouncement = await getAnnouncement();
        if (!cancelled && remoteAnnouncement) {
          setAnnouncement(remoteAnnouncement);
        }
      } catch (e) {
        console.error("Error loading announcement", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Check for tab in URL and VALIDATE role permissions
  useEffect(() => {
    if (isLoading) return;

    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab) {
      // Security Validation: Only allow access if role permitted
      const isAllowed = isTabAccessible(tab);

      if (isAllowed) {
        setActiveTab(tab);
        if (tab === "seguridad") setActiveSection("dashboard");
      } else {
        console.warn(`Intento de acceso no autorizado a la pestaña: ${tab}`);
        setActiveTab(firstAccessibleTab);
        // Clean URL from malicious tab
        window.history.replaceState({}, "", window.location.pathname);
      }
    }
  }, [userRole, isTabAccessible, firstAccessibleTab, isLoading]); // Re-run if userRole or loading state changes

  useEffect(() => {
    if (isLoading) return;
    if (!isTabAccessible(activeTab)) {
      setActiveTab(firstAccessibleTab);
    }
  }, [activeTab, firstAccessibleTab, isTabAccessible, isLoading]);

  // Sincronizar pestaña activa con la URL para mantener el estado tras recargar
  useEffect(() => {
    if (isLoading) return;
    if (activeTab) {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", activeTab);
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [activeTab, isLoading]);

  // Sync en modo manual: el anuncio se refresca al recargar pagina.

  useEffect(() => {
    if (mounted) {
      localStorage.setItem(
        "dashboard_announcement",
        JSON.stringify(announcement),
      );
    }
  }, [announcement, mounted]);

  // Documents Persistence REMOVED: Always fetch fresh from API
  // useEffect(() => {
  //   const saved = localStorage.getItem('dashboard_documents');
  //   if (saved) {
  //     try {
  //       setDocuments(JSON.parse(saved));
  //     } catch (e) {
  //       console.error("Error loading documents", e);
  //     }
  //   }
  // }, []);

  // Evita serializar un payload grande en cada refresh; los documentos se obtienen siempre del API.

  const theme = useMemo(
    () => ({
      bg: darkMode ? "bg-[#0B1313]" : "bg-[#eef7f6]",
      header: darkMode
        ? "bg-[#0e1c1d]/95 backdrop-blur-md border-[#1d3538]"
        : "bg-[#f4fbfa]/95 border-[#c7e8de]",
      sidebar: darkMode
        ? "bg-[#0e1c1d] border-[#1d3538]"
        : "bg-[#f4fbfa] border-[#c7e8de]",
      text: darkMode ? "text-[#E0E6E6]" : "text-[#042f36]",
      subtext: darkMode ? "text-[#94A3B8]" : "text-[#5f837d]",
      cardBg: darkMode ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70" : "bg-[#fbfffe]",
    }),
    [darkMode],
  );

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("sgd_token");
      const host = window.location.hostname;
      let baseUrl = '/facturacion/';
      if (host === 'localhost' || host === '127.0.0.1') {
        baseUrl = `http://${host}:5174`;
      } else if (host.includes('.ts.net')) {
        baseUrl = `https://${host}:8443`;
      }
      setBillingUrl(token ? `${baseUrl}?token=${token}` : baseUrl);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const storedTheme = localStorage.getItem(DASHBOARD_THEME_STORAGE_KEY);
      if (storedTheme === "light") {
        setDarkMode(false);
        return;
      }
      if (storedTheme === "dark") {
        setDarkMode(true);
      }
    } catch (error) {
      console.error("No se pudo leer el tema del dashboard", error);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      document.documentElement.classList.toggle("dark", darkMode);
      try {
        localStorage.setItem(DASHBOARD_THEME_STORAGE_KEY, darkMode ? "dark" : "light");
      } catch (error) {
        console.error("No se pudo persistir el tema del dashboard", error);
      }
    }
  }, [darkMode, mounted]);

  const stats = useMemo(() => {
    if (userRole === "Usuario") {
      const myTickets = safeTickets.filter((t) => t.ownerId === user?.id);
      const myTicketsOpen = myTickets.filter((t) => t.status === "ABIERTO").length;
      const myTicketsResolved = myTickets.filter((t) => t.status === "RESUELTO").length;
      const myDocsReceived = safeDocuments.filter((d) => canSeeDocumentInInbox(d)).length;
      const myDocsSent = safeDocuments.filter(
        (d) => !!d.remitente_id && String(d.remitente_id) === String(user?.id),
      ).length;
      return [
        {
          title: "Mis Tickets",
          value: String(myTickets.length),
          subtext: `${myTicketsOpen} Abiertos / ${myTicketsResolved} Resueltos`,
          icon: Tag,
          trend: "Activos",
        },
        {
          title: "Mis Documentos",
          value: String(myDocsReceived + myDocsSent),
          subtext: `${myDocsReceived} Recibidos / ${myDocsSent} Enviados`,
          icon: FileText,
          trend: "Total",
        },
        {
          title: "No Leídos",
          value: String(unreadInboxCount),
          subtext: "En bandeja de entrada",
          icon: Bell,
          trend: unreadInboxCount > 0 ? "Pendientes" : "Al día",
        },
        {
          title: "Nivel de Acceso",
          value: "Estándar",
          subtext: user?.gerencia_depto || "Usuario TIC",
          icon: Shield,
          trend: "Verificado",
        },
      ];
    }

    if (userRole === "CEO" || userRole === "Desarrollador") {
      const activeUsers = safeUsers.filter((u: any) => u?.estado !== false).length;
      const totalDocs = safeDocuments.length;
      const pendingDocs = safeDocuments.filter(
        (d) => d.signatureStatus === "en-proceso" || d.signatureStatus === "pendiente",
      ).length;
      const totalTicketsOpen = safeTickets.filter((t) => t.status === "ABIERTO").length;
      return [
        {
          title: "Usuarios Activos",
          value: String(activeUsers),
          subtext: "Con cuenta habilitada",
          icon: Users,
          trend: "Total",
          trendPositive: true,
        },
        {
          title: "Documentos",
          value: String(totalDocs),
          subtext: `${pendingDocs} en proceso`,
          icon: FileText,
          trend: "Total",
          trendPositive: true,
        },
        {
          title: "Tickets Abiertos",
          value: String(totalTicketsOpen),
          subtext: `De ${safeTickets.length} totales`,
          icon: Tag,
          trend: totalTicketsOpen === 0 ? "Sin pendientes" : "Pendientes",
          trendPositive: totalTicketsOpen === 0,
        },
        {
          title: "No Leídos",
          value: String(unreadInboxCount),
          subtext: "En bandeja de entrada",
          icon: Bell,
          trend: unreadInboxCount > 0 ? "Pendientes" : "Al día",
          trendPositive: unreadInboxCount === 0,
        },
      ];
    }

    // Administrador / Gerente
    const totalTickets = safeTickets.length;
    const openTickets = safeTickets.filter((t) => t.status === "ABIERTO").length;
    const pendingDocs = safeDocuments.filter(
      (d) => d.signatureStatus === "en-proceso" || d.signatureStatus === "pendiente",
    ).length;
    return [
      {
        title: "Tickets Totales",
        value: String(totalTickets),
        subtext: `${openTickets} abiertos`,
        icon: Tag,
        trend: openTickets > 0 ? `${openTickets} pendientes` : "Al día",
      },
      {
        title: "Docs. Pendientes",
        value: String(pendingDocs),
        subtext: "En proceso",
        icon: FileText,
        trend: pendingDocs > 0 ? "Requieren atención" : "Al día",
      },
      {
        title: "No Leídos",
        value: String(unreadInboxCount),
        subtext: "En bandeja de entrada",
        icon: Bell,
        trend: unreadInboxCount > 0 ? "Nuevos mensajes" : "Al día",
        trendPositive: unreadInboxCount === 0,
      },
    ];
  }, [userRole, safeTickets, safeDocuments, safeUsers, user?.id, user?.gerencia_depto, unreadInboxCount, canSeeDocumentInInbox]);

  const toggleCategory = (index: number) => {
    setExpandedCategories((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  };

  const normalizeDept = useCallback((value: string) => {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }, []);

  const dedupeDeptItems = useCallback((items: unknown) => {
    const seen = new Set<string>();
    return normalizeOrgStructurePayload([{ category: "tmp", icon: "Shield", items }])
      .flatMap((group) => group.items)
      .filter((item) => {
      const key = normalizeDept(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [normalizeDept]);

  const canViewAllGerencias =
    userRole === "Desarrollador" || userRole === "Administrador" || userRole === "CEO";

  const effectiveOrgStructure = useMemo(() => {
    const source: OrgCategory[] = safeOrgStructure.length > 0
      ? safeOrgStructure
      : (JSON.parse(JSON.stringify(DEFAULT_ORG_STRUCTURE)) as OrgCategory[]);
    const base = source.map((group) => ({
      ...group,
      items: dedupeDeptItems(group.items || []),
    }));

    if (canViewAllGerencias) return base;

    const myDept = normalizeDept(user?.gerencia_depto || "");
    if (!myDept) return [];

    return base
      .map((group: OrgCategory) => ({
        ...group,
        items: dedupeDeptItems(
          ensureArray<string>(group.items).filter((item: string) => normalizeDept(item) === myDept),
        ),
      }))
      .filter((group: OrgCategory) => group.items.length > 0);
  }, [safeOrgStructure, canViewAllGerencias, dedupeDeptItems, normalizeDept, user?.gerencia_depto]);

  if (!mounted) return null;

  const isGradient = announcement?.color?.includes('linear-gradient') || false;
  let extractedBaseColor = announcement?.color || "#0DA67B";
  if (isGradient) {
    const match = announcement?.color?.match(/#([0-9a-fA-F]{3,8})/);
    if (match) extractedBaseColor = match[0];
  }

  const announcementBaseColor = normalizeHexColor(isGradient ? extractedBaseColor : announcement?.color, "#0DA67B");
  const announcementStartColor = shiftHexColor(announcementBaseColor, -12);
  const announcementEndColor = shiftHexColor(announcementBaseColor, 20);
  const announcementBadgeColor = isGradient ? 'rgba(0,0,0,0.25)' : shiftHexColor(announcementBaseColor, -18);

  const renderContent = () => {
    switch (activeTab) {
      case "prioridades":
        return canAccessPriorities ? (
          <PriorityMatrix
            darkMode={darkMode}
            userRole={userRole}
            user={user}
            isReadOnly={isReadOnly}
            documents={safeDocuments}
            hasPermission={hasPermission}
            refreshDocs={fetchDocuments}
          />
        ) : (
          <div className="text-center p-20 font-bold text-red-500">
            Acceso Restringido
          </div>
        );
      case "tickets":
        return canAccessTickets ? (
          <TicketSystem
            darkMode={darkMode}
            orgStructure={effectiveOrgStructure}
            userRole={userRole}
            userDept={user?.gerencia_depto || ""}
            currentUser={user?.nombre + " " + user?.apellido}
            currentUserId={user?.id || ""}
            tickets={safeTickets}
            hasPermission={hasPermission}
            refreshTickets={fetchTickets}
          />
        ) : (
          <div className="text-center p-20 font-bold text-red-500">
            Acceso Restringido
          </div>
        );
      case "documentos":
        return canAccessDocumentos ? (
          <DocumentManager
            darkMode={darkMode}
            userRole={userRole}
            userDept={user?.gerencia_depto || "Usuario"}
            documents={safeDocuments}
            setDocuments={setDocuments}
            orgStructure={effectiveOrgStructure}
            hasPermission={hasPermission}
            user={user}
            users={safeUsers}
            gerencias={safeGerencias}
            refreshDocs={fetchDocuments}
          />
        ) : (
          <div className="text-center p-20 font-bold text-red-500">
            Acceso Restringido
          </div>
        );
      case "seguridad":
        return canAccessSecurity ? (
          <SecurityModule
            darkMode={darkMode}
            announcement={announcement}
            setAnnouncement={setAnnouncement}
            documents={safeDocuments}
            setDocuments={setDocuments}
            userRole={userRole}
            orgStructure={safeOrgStructure}
            setOrgStructure={setOrgStructure}
          />
        ) : (
          <div className="text-center p-20 font-bold text-red-500">
            Acceso Restringido
          </div>
        );
      case "graficos":
        return canAccessStats ? (
          <ChartsModule
            darkMode={darkMode}
            documents={safeDocuments}
            tickets={safeTickets}
            orgStructure={effectiveOrgStructure}
            userRole={userRole}
            userId={user?.id ? String(user.id) : undefined}
            userDept={user?.gerencia_depto || ""}
            hasPermission={hasPermission}
          />
        ) : (
          <div className="text-center p-20 font-bold text-red-500">
            Acceso Restringido
          </div>
        );
      case "hoja-de-ruta":
        return canAccessRoadmap ? (
          <HojaDeRuta
            darkMode={darkMode}
            users={safeUsers}
            userRole={userRole}
            currentUserId={user?.id ? String(user.id) : ""}
          />
        ) : (
          <div className="text-center p-20 font-bold text-red-500">
            Acceso Restringido
          </div>
        );
      case "facturacion":
        return canAccessBilling ? (
          <BillingModule darkMode={darkMode} />
        ) : (
          <div className="text-center p-20 font-bold text-red-500">
            Acceso Restringido
          </div>
        );
      case "directorio":
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full">
            {/* MANAGEMENT HISTORY / STRUCTURE GRID */}
            <div
              className={`rounded-2xl border ${darkMode ? "bg-gradient-to-br from-[#122224] to-[#0a1415] border-[#1d3538]/70 shadow-lg shadow-black/20" : "bg-white border-slate-200"} overflow-hidden`}
            >
              <div
                className={`px-6 py-4 border-b ${darkMode ? "border-[#1d3538]/50" : "border-slate-100"} flex justify-between items-center`}
              >
                <div>
                  <h3
                    className={`font-bold text-base ${darkMode ? "text-[#E0E6E6]" : "text-slate-800"}`}
                  >
                    Trazabilidad de Gerencias
                  </h3>
                  <p className={`text-xs mt-0.5 ${darkMode ? "text-[#94A3B8]" : "text-slate-500"}`}>
                    Historial de estructura y departamentos institucionales
                  </p>
                </div>
              </div>
              <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {effectiveOrgStructure.length > 0 ? (
                  effectiveOrgStructure.map((group: OrgCategory, index: number) => (
                    <DeptCard
                      key={index}
                      group={group}
                      darkMode={darkMode}
                      onToggle={() => toggleCategory(index)}
                      onItemClick={(item) => setSelectedManagement(item)}
                    />
                  ))
                ) : (
                  <div className={`col-span-full rounded-xl border p-6 text-sm ${darkMode ? "border-[#1d3538]/50 text-[#94A3B8]" : "border-slate-200 text-slate-500"}`}>
                    No hay gerencias disponibles para tu perfil en este momento.
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      case "directorio-personas":
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full">
            <DirectorioPersonas users={safeUsers} orgStructure={effectiveOrgStructure} darkMode={darkMode} />
          </div>
        );
      case "overview":
      default:
        if (!canAccessOverview) {
          return (
            <div className="text-center p-20 font-bold text-red-500">
              Acceso Restringido
            </div>
          );
        }

        switch (userRole) {
          case "CEO":
            return (
              <VistaDirectivo
                user={user as any}
                darkMode={darkMode}
                announcement={announcement}
                announcementColors={{
                  base: announcementBaseColor,
                  start: announcementStartColor,
                  end: announcementEndColor,
                  badge: announcementBadgeColor,
                  isGradient,
                }}
                metrics={{
                  usersCount: safeUsers.length,
                  documentsCount: safeDocuments.length,
                  ticketsCount: safeTickets.length,
                }}
                logout={logout}
              >
                <ChartsModule
                  darkMode={darkMode}
                  documents={safeDocuments}
                  tickets={safeTickets}
                  orgStructure={effectiveOrgStructure}
                  userRole={userRole}
                  userId={user?.id ? String(user.id) : undefined}
                  userDept={user?.gerencia_depto || ""}
                  hasPermission={hasPermission}
                />
              </VistaDirectivo>
            );

          case "Gerente":
            return (
              <VistaGerente
                user={user as any}
                users={safeUsers}
                userRole={userRole}
                darkMode={darkMode}
                logout={logout}
                announcement={announcement}
                announcementColors={{
                  base: announcementBaseColor,
                  start: announcementStartColor,
                  end: announcementEndColor,
                  badge: announcementBadgeColor,
                  isGradient,
                }}
              />
            );

          case "Administrador":
          case "Desarrollador":
            return (
              <VistaAdminTI
                user={user as any}
                users={safeUsers}
                documents={safeDocuments}
                tickets={safeTickets}
                unreadInboxCount={unreadInboxCount}
                darkMode={darkMode}
                logout={logout}
                announcement={announcement}
                announcementColors={{
                  base: announcementBaseColor,
                  start: announcementStartColor,
                  end: announcementEndColor,
                  badge: announcementBadgeColor,
                  isGradient,
                }}
              />
            );

          case "Usuario":
          default:
            return (
              <VistaUsuarioComun
                user={user as any}
                darkMode={darkMode}
                logout={logout}
                announcement={announcement}
                announcementColors={{
                  base: announcementBaseColor,
                  start: announcementStartColor,
                  end: announcementEndColor,
                  badge: announcementBadgeColor,
                  isGradient,
                }}
              />
            );
        }
    }
  };

  return (
    <RoleGuard
      allowedRoles={["CEO", "Administrador", "Usuario", "Desarrollador", "Gerente"]}
      redirectTo="/login"
    >
      <div
        className={`min-h-screen remaster-shell ${theme.bg} ${theme.text} font-sans transition-colors duration-300`}
      >
        {/* SIDEBAR */}
        <aside
          className={`
        remaster-sidebar fixed top-0 left-0 bottom-0 z-50 ${theme.sidebar} border-r transition-all duration-300
        ${collapsed ? "w-16" : "w-60"}
      `}
        >
          <div className="flex flex-col h-full">
            {/* HEADER SIDEBAR */}
            {collapsed ? (
              <div className="h-20 px-2 flex items-center justify-center border-b border-[#1d3538]/50">
                <div className="w-12 h-12 flex items-center justify-center my-4">
                  <img
                    src="/LogoGlass.webp"
                    alt="KODA"
                    className="h-12 w-12 rounded-xl object-contain"
                  />
                </div>
              </div>
            ) : (
              <div className="w-full overflow-hidden border-b border-[#1d3538]/50 mb-3">
                <img
                  src="/logorecortado.webp"
                  alt="KODA Logo"
                  className="w-full h-auto block object-contain"
                />
              </div>
            )}

            {/* NAVIGATION */}
            <nav className="flex-1 p-3 space-y-1 overflow-y-auto no-scrollbar">
              {/* Dashboard General — Siempre visible, fuera de acordeones */}
              {canAccessOverview && (
                <SidebarItem
                  icon={Home}
                  label="Dashboard General"
                  active={
                    activeSection === "dashboard" && activeTab === "overview"
                  }
                  collapsed={collapsed}
                  darkMode={darkMode}
                  onClick={() => {
                    setActiveSection("dashboard");
                    setActiveTab("overview");
                  }}
                />
              )}

              {/* Separador sutil */}
              {!collapsed && (
                <div className={`my-2 border-t ${darkMode ? "border-[#1d3538]/50" : "border-slate-200/60"}`} />
              )}

              {/* Grupos Acordeón con RBAC */}
              {visibleSidebarGroups.map((group) => (
                <SidebarAccordion
                  key={group.id}
                  group={group}
                  isOpen={openAccordions[group.id] ?? true}
                  onToggle={() => toggleAccordion(group.id)}
                  collapsed={collapsed}
                  darkMode={darkMode}
                  activeTab={activeTab}
                  activeSection={activeSection}
                  onNavigate={handleSidebarNavigate}
                />
              ))}
            </nav>
            {/* FOOTER SIDEBAR */}
            <div
              className={`p-3 border-t ${darkMode ? "border-slate-800" : "border-slate-200"}`}
            >
              <button
                onClick={() => setCollapsed(!collapsed)}
                className={`
                w-full flex items-center justify-center h-9 rounded-md transition-colors
                ${darkMode
                    ? "text-slate-400 hover:bg-slate-800 hover:text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }
              `}
              >
                <ChevronRight
                  size={18}
                  className={`transition-transform duration-300 ${!collapsed && "rotate-180"}`}
                />
              </button>
            </div>
          </div>
        </aside>
        {/* MAIN CONTENT */}
        <main
          className={`transition-all duration-300 ${collapsed ? "ml-16" : "ml-60"} min-h-screen min-w-0 ${theme.bg} flex flex-col overflow-x-hidden`}
        >
          {/* TOP HEADER */}
          <header
            className={`
          remaster-topbar sticky top-0 z-40 min-h-16 px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3 ${theme.header} border-b shrink-0
        `}
          >
            <div className="flex items-center gap-3 min-w-0">
              <h2
                className={`font-semibold text-sm ${darkMode ? "text-slate-200" : "text-slate-800"} truncate flex items-center gap-2.5`}
              >
                {user?.tenant_name ? (
                  <span>
                    KODA OS | <span className={`${darkMode ? "text-emerald-400" : "text-emerald-600"} font-bold uppercase tracking-wider`}>{user.tenant_name}</span>
                  </span>
                ) : (
                  <span>KODA OS | Dashboard Ejecutivo</span>
                )}
              </h2>
            </div>
            <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-end">
              <ThemeToggle
                darkMode={darkMode}
                onToggle={() => setDarkMode(!darkMode)}
              />

              <div
                className={`h-6 w-px ${darkMode ? "bg-slate-800" : "bg-slate-300"}`}
              />
              <div
                className="flex items-center gap-3 cursor-pointer hover:bg-slate-100/10 p-1 rounded-md transition-colors"
                onClick={async () => {
                  const ok = await uiConfirm("¿Desea cerrar sesión?", "Cerrar sesión");
                  if (ok) {
                    void logout();
                  }
                }}
              >
                <div className="text-right hidden sm:block leading-tight">
                  <p
                    className={`text-sm font-semibold ${darkMode ? "text-slate-200" : "text-slate-900"}`}
                  >
                    {user?.nombre} {user?.apellido}
                  </p>
                  <div className="flex items-center justify-end gap-2">
                    {userRole === "Desarrollador" && (
                      <span className="text-[10px] font-black bg-sky-600 text-white px-1.5 py-0.5 rounded animate-pulse">
                        DEV MODE
                      </span>
                    )}
                    <p
                      className={`text-xs ${darkMode ? "text-slate-500" : "text-slate-700"}`}
                    >
                      {userRole.toUpperCase()}
                    </p>
                  </div>
                </div>

                {/* ROLE SWITCHER dropdown - visible for admins and persona-switchers */}
                {hasPermission(PERMISSIONS_MASTER.SYS_SWITCH_ROLE) &&
                  userRole === "Desarrollador" && (
                    <div
                      className="flex items-center gap-1 border-l pl-3 border-slate-700 ml-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <select
                        value={userRole}
                        onChange={async (e) => {
                          const ok = await switchRole(e.target.value as UserRole);
                          if (!ok) {
                            void uiAlert("SwitchRole deshabilitado en este entorno por seguridad. Usa staging/dev con NEXT_PUBLIC_ENABLE_ROLE_SIMULATION=true.", "Seguridad");
                          }
                        }}
                        className={`bg-transparent text-[10px] font-bold border rounded px-1 outline-none transition-colors ${darkMode ? "border-zinc-700 text-zinc-400 focus:border-cyan-400" : "border-slate-300 text-slate-600 focus:border-sky-500"}`}
                      >
                        <option value="Usuario">USR</option>
                        <option value="Administrador">ADM</option>
                        <option value="Gerente">GER</option>
                        <option value="CEO">CEO</option>
                        <option value="Desarrollador">DEV</option>
                      </select>
                    </div>
                  )}
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ring-2 ring-offset-2 ring-offset-transparent ring-slate-200/20 ${
                    darkMode
                      ? "bg-[#00C294] text-[#0B1313]"
                      : `text-white ${userRole === "CEO" ? "bg-red-800" : userRole === "Administrador" ? "bg-amber-600" : "bg-blue-600"}`
                  }`}
                >
                  {user?.nombre?.substring(0, 1)}
                  {user?.apellido?.substring(0, 1)}
                </div>
              </div>
            </div>
          </header>
          {/* WORKSPACE */}
          <div className="remaster-workspace px-4 py-6 sm:px-6 md:px-8 w-full max-w-[1600px] mx-auto space-y-8 flex-1 min-w-0 transition-all duration-300">
            {/* BREADCRUMB / TITLE */}
            {/* BREADCRUMB / TITLE - Hidden on overview as it has its own welcome header, and on graficos as it has internal headers */}
            {activeTab !== "overview" &&
              activeTab !== "graficos" && (
                <div className="flex justify-between items-center pb-6 border-b border-slate-200/10">
                  <div>
                    <h1
                      className={`text-2xl font-bold ${darkMode ? "text-white" : "text-slate-900"}`}
                    >
                      {activeTab === "prioridades"
                        ? "Control de seguimiento"
                        : activeTab === "tickets"
                          ? "Sistema de Tickets"
                          : activeTab === "documentos"
                            ? "Mensajería Interna"
                            : activeTab === "directorio"
                              ? "Trazabilidad de Gerencias"
                              : activeTab === "directorio-personas"
                                ? "Directorio de Personas"
                                : "Panel Detalle"}
                    </h1>
                    <p
                      className={`mt-1 text-sm ${darkMode ? "text-slate-400" : "text-slate-500"}`}
                    >
                      {activeTab === "prioridades"
                        ? "Control de seguimiento de documentos con prioridad."
                        : activeTab === "tickets"
                          ? "Gestión de solicitudes técnicas y administrativas."
                          : activeTab === "documentos"
                            ? "Administración de correspondencia y comunicación interna."
                            : activeTab === "seguridad"
                              ? "Gestión de usuarios, permisos y auditoría de seguridad."
                              : activeTab === "impresoras"
                                ? "Monitoreo del estado operativo de impresoras y niveles de suministros."
                                : activeTab === "directorio"
                                  ? "Historial de estructura y departamentos institucionales."
                                  : activeTab === "directorio-personas"
                                    ? "Lista de contactos y personal de la organización."
                                    : "Vista de detalles del Módulo seleccionado."}
                    </p>
                  </div>
                </div>
              )}
            {/* CONTENT AREA */}
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                className="w-full flex-1"
              >
                {renderContent()}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>


        {/* MODAL DE DETALLE DE GERENCIA */}
        <DetailModal
          isOpen={!!selectedManagement}
          onClose={() => setSelectedManagement(null)}
          title={selectedManagement || ""}
          detail={selectedManagement ? getNormalizedDetail(selectedManagement) : { funciones: [], lider: "", contacto: "", objetivos: [] }}
          darkMode={darkMode}
          canEdit={canEditManagementDetails}
          onSave={handleSaveManagementDetails}
        />


      </div>
    </RoleGuard>
  );
}









