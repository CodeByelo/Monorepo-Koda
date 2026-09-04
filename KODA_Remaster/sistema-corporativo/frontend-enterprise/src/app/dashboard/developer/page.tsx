"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { RoleGuard } from '@/components/RoleGuard';
import { useAuth } from '@/hooks/useAuth';
import {
  getTenants,
  createTenant,
  updateTenant,
  deleteTenant,
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
  uploadPlanImage,
  getCriticalSecurityEvents,
  disconnectSession,
  getDevUsers,
  createDevUser,
  deleteDevUser,
  generateProvisionToken,
  getSystemMetrics
} from '@/lib/api';
import {
  Activity,
  Shield,
  PlusCircle,
  Users,
  Radio,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Database,
  Server,
  Layers,
  Search,
  Edit3,
  Check,
  X,
  Key,
  Copy,
  Cpu,
  ArrowLeft,
  Eye,
  EyeOff,
  ExternalLink,
  ShieldAlert
} from 'lucide-react';

export interface ActiveSession {
  session_id: string;
  tenant_id: string;
  user_id: string;
  username: string;
  ip: string;
  device: string;
  modulo: string;
  connected_at: string;
}

export interface SecurityEvent {
  id: number;
  tenant_id: string | null;
  user_id: string | null;
  username: string;
  evento: string;
  detalles: string;
  estado: string;
  ip_address: string;
  created_at: string;
}

export interface Tenant {
  id: string;
  nombre: string;
  plan_id?: number | null;
  plan_name?: string | null;
  max_users: number;
  allowed_modules: string[];
  created_at: string | null;
}

export interface Plan {
  id: number;
  name: string;
  max_users: number;
  allowed_modules: string[];
  price: number;
  is_active: boolean;
  features: string[];
  sort_order: number;
  image_url: string | null;
}

export interface DevUser {
  id: string;
  username: string;
  nombre: string;
  apellido: string;
  email: string;
  rol_id: number;
  role: string;
  estado: boolean;
  tenant_id: string | null;
  tenant_nombre: string;
}

export interface SystemMetrics {
  system: {
    cpu_percent: number;
    cpu_load: number;
    memory_used_percent: number;
    memory_total_mb: number;
    memory_used_mb: number;
  };
  services: {
    database: boolean;
    redis: boolean;
    ollama: boolean;
    loki: boolean;
    vector: boolean;
  };
}

export interface AlertData {
  message: string;
  event_type: string;
  details: any;
  timestamp: string;
}

const AVAILABLE_MODULES = [
  { id: 'all', label: 'Suite Completa (Todos los módulos)', badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
  { id: 'retail_basico', label: 'Retail Básico: Inventario, Compras operativas, POS/Facturación y Caja', badgeClass: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' },
  { id: 'administrativo', label: 'S. Administrativo: Ventas, Facturación, Compras e Inventario', badgeClass: 'bg-teal-500/10 text-teal-400 border-teal-500/20' },
  { id: 'financiero', label: 'S. Financiero: Tesorería, Cobranzas y Pagos', badgeClass: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  { id: 'contable', label: 'S. Contable: Contabilidad, Balances y Asientos', badgeClass: 'bg-purple-500/10 text-purple-400 border-purple-500/20' },
  { id: 'fiscal', label: 'S. Fiscal: Libros Fiscales e Impuestos IVA/ISLR', badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  { id: 'nomina', label: 'S. Nómina: Gestión y Cálculo de Personal', badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20' },
];

function DeveloperDashboardContent() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<'tenants' | 'plans' | 'sessions' | 'audit' | 'users' | 'provisioning' | 'resources'>('tenants');

  // Common Feedback State
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Tenants State
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantSearch, setTenantSearch] = useState('');
  const [isLoadingTenants, setIsLoadingTenants] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [selectedPlanId, setSelectedPlanId] = useState<number | 'custom'>('custom');
  const [maxUsers, setMaxUsers] = useState(12);
  const [selectedModules, setSelectedModules] = useState<string[]>(['all']);
  const [isSubmittingTenant, setIsSubmittingTenant] = useState(false);

  // Tenant Editing State
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingMaxUsers, setEditingMaxUsers] = useState(12);
  const [editingAllowedModules, setEditingAllowedModules] = useState<string[]>(['all']);
  const [editingPlanIdForTenant, setEditingPlanIdForTenant] = useState<number | null>(null);
  const [isUpdatingTenant, setIsUpdatingTenant] = useState(false);

  // Plans State
  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoadingPlans, setIsLoadingPlans] = useState(false);
  const [planName, setPlanName] = useState('');
  const [planMaxUsers, setPlanMaxUsers] = useState(12);
  const [planAllowedModules, setPlanAllowedModules] = useState<string[]>(['all']);
  const [planPrice, setPlanPrice] = useState(0.0);
  const [planFeatures, setPlanFeatures] = useState('');
  const [planSortOrder, setPlanSortOrder] = useState(0);
  const [planImage, setPlanImage] = useState<File | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);

  // Sessions State
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
  const [isDisconnecting, setIsDisconnecting] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Audit State
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);

  // Users State
  const [users, setUsers] = useState<DevUser[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newNombre, setNewNombre] = useState('');
  const [newApellido, setNewApellido] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [newRolId, setNewRolId] = useState<number>(3);
  const [newTenantId, setNewTenantId] = useState('');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  // Provisioning State
  const [provisionTenantId, setProvisionTenantId] = useState('');
  const [provisionMaxUsers, setProvisionMaxUsers] = useState(10);
  const [provisionExpiresHours, setProvisionExpiresHours] = useState(48);
  const [provisionResult, setProvisionResult] = useState<{ token: string; expires_at: string; tenant_id: string } | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);
  const [copiedToken, setCopiedToken] = useState(false);

  // Resources State
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);

  // Auto-dismiss banners
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Data fetchers
  const loadTenants = async () => {
    setIsLoadingTenants(true);
    try {
      const data = await getTenants();
      setTenants(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar empresas');
    } finally {
      setIsLoadingTenants(false);
    }
  };

  const loadPlans = async () => {
    setIsLoadingPlans(true);
    try {
      const data = await getPlans();
      setPlans(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar planes');
    } finally {
      setIsLoadingPlans(false);
    }
  };

  const loadSecurityEvents = async () => {
    setIsLoadingEvents(true);
    try {
      const data = await getCriticalSecurityEvents();
      setSecurityEvents(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar auditoría');
    } finally {
      setIsLoadingEvents(false);
    }
  };

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    try {
      const data = await getDevUsers();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar usuarios');
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const loadMetrics = async () => {
    setIsLoadingMetrics(true);
    try {
      const data = await getSystemMetrics();
      setMetrics(data);
    } catch (err: any) {
      // Silently catch or handle
    } finally {
      setIsLoadingMetrics(false);
    }
  };

  // Initial loads
  useEffect(() => {
    loadTenants();
    loadPlans();
    loadSecurityEvents();
    loadUsers();
    loadMetrics();
  }, []);

  // Periodic metrics if on tab
  useEffect(() => {
    if (activeTab === 'resources') {
      loadMetrics();
      const interval = setInterval(loadMetrics, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // WebSocket for real-time monitoring
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isProduction =
      window.location.hostname.includes('vercel.app') ||
      window.location.hostname.includes('onrender.com') ||
      window.location.hostname.includes('cloudflare');

    const resolvedApiUrl =
      process.env.NEXT_PUBLIC_API_URL ||
      (isProduction
        ? 'https://monorepo-koda.onrender.com'
        : window.location.hostname.includes('.ts.net')
        ? `https://${window.location.hostname}:8443`
        : 'http://localhost:8000');

    const backendWsUrl = resolvedApiUrl.replace(/^http/, 'ws');
    const wsUrl = `${backendWsUrl}/dev/ws`;
    const token = localStorage.getItem('sgd_token') || '';

    let socket: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWS = () => {
      try {
        setWsStatus('connecting');
        socket = new WebSocket(wsUrl);
        wsRef.current = socket;

        socket.onopen = () => {
          if (token) {
            socket?.send(JSON.stringify({ type: 'auth', token }));
          }
          setWsStatus('connected');
        };

        socket.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload.type === 'active_sessions') {
              setSessions(Array.isArray(payload.data) ? payload.data : []);
            } else if (payload.type === 'abuse_alert') {
              setAlerts((prev) => [payload.data, ...prev].slice(0, 30));
              loadSecurityEvents();
            }
          } catch (err) {
            console.error('Error procesando mensaje WS dev:', err);
          }
        };

        socket.onclose = () => {
          setWsStatus('disconnected');
          reconnectTimeout = setTimeout(connectWS, 6000);
        };

        socket.onerror = () => {
          setWsStatus('disconnected');
        };
      } catch (err) {
        setWsStatus('disconnected');
      }
    };

    connectWS();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
    };
  }, []);

  // --- Handlers: Tenants ---
  const handleModuleToggle = (moduleId: string) => {
    if (moduleId === 'all') {
      setSelectedModules(['all']);
    } else {
      setSelectedModules((prev) => {
        const withoutAll = prev.filter((m) => m !== 'all');
        if (withoutAll.includes(moduleId)) {
          const next = withoutAll.filter((m) => m !== moduleId);
          return next.length === 0 ? ['all'] : next;
        } else {
          return [...withoutAll, moduleId];
        }
      });
    }
  };

  const handleEditingModuleToggle = (moduleId: string) => {
    if (moduleId === 'all') {
      setEditingAllowedModules(['all']);
    } else {
      setEditingAllowedModules((prev) => {
        const withoutAll = prev.filter((m) => m !== 'all');
        if (withoutAll.includes(moduleId)) {
          const next = withoutAll.filter((m) => m !== moduleId);
          return next.length === 0 ? ['all'] : next;
        } else {
          return [...withoutAll, moduleId];
        }
      });
    }
  };

  const handleCreateTenantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim()) {
      setError('El nombre de la empresa es obligatorio.');
      return;
    }
    setIsSubmittingTenant(true);
    setError(null);
    try {
      const payload: any = { nombre: newTenantName.trim() };
      if (selectedPlanId !== 'custom') {
        payload.plan_id = selectedPlanId;
      } else {
        payload.max_users = maxUsers;
        payload.allowed_modules = selectedModules;
      }
      await createTenant(payload);
      setSuccess(`Empresa '${newTenantName}' creada con éxito.`);
      setNewTenantName('');
      setMaxUsers(12);
      setSelectedModules(['all']);
      setSelectedPlanId('custom');
      await loadTenants();
    } catch (err: any) {
      setError(err?.message || 'Error al crear la empresa');
    } finally {
      setIsSubmittingTenant(false);
    }
  };

  const startEditTenant = (t: Tenant) => {
    setEditingTenantId(t.id);
    setEditingName(t.nombre);
    setEditingMaxUsers(t.max_users);
    setEditingAllowedModules(t.allowed_modules || ['all']);
    setEditingPlanIdForTenant(t.plan_id || null);
  };

  const cancelEditTenant = () => {
    setEditingTenantId(null);
    setEditingName('');
  };

  const handleUpdateTenantSubmit = async () => {
    if (!editingTenantId || !editingName.trim()) return;
    setIsUpdatingTenant(true);
    try {
      await updateTenant(editingTenantId, {
        nombre: editingName.trim(),
        plan_id: editingPlanIdForTenant,
        max_users: editingMaxUsers,
        allowed_modules: editingAllowedModules,
      });
      setSuccess('Empresa actualizada correctamente.');
      setEditingTenantId(null);
      await loadTenants();
    } catch (err: any) {
      setError(err?.message || 'Error al actualizar empresa');
    } finally {
      setIsUpdatingTenant(false);
    }
  };

  const handleDeleteTenantSubmit = async (id: string, name: string) => {
    if (!window.confirm(`¿Seguro que deseas eliminar la empresa "${name}" y todos sus usuarios y datos? Esta acción es irreversible.`)) {
      return;
    }
    try {
      await deleteTenant(id);
      setSuccess(`Empresa "${name}" eliminada.`);
      await loadTenants();
      await loadUsers();
    } catch (err: any) {
      setError(err?.message || 'Error al eliminar empresa');
    }
  };

  // --- Handlers: Plans ---
  const handlePlanModuleToggle = (moduleId: string) => {
    if (moduleId === 'all') {
      setPlanAllowedModules(['all']);
    } else {
      setPlanAllowedModules((prev) => {
        const withoutAll = prev.filter((m) => m !== 'all');
        if (withoutAll.includes(moduleId)) {
          const next = withoutAll.filter((m) => m !== moduleId);
          return next.length === 0 ? ['all'] : next;
        } else {
          return [...withoutAll, moduleId];
        }
      });
    }
  };

  const handlePlanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planName.trim()) {
      setError('El nombre del plan es obligatorio.');
      return;
    }
    setIsSubmittingPlan(true);
    setError(null);
    try {
      const payload = {
        name: planName.trim(),
        max_users: planMaxUsers,
        allowed_modules: planAllowedModules,
        price: planPrice,
        features: planFeatures.split('\n').map((f) => f.trim()).filter(Boolean),
        sort_order: planSortOrder,
      };

      let currentId = editingPlanId;
      if (editingPlanId) {
        await updatePlan(editingPlanId, payload);
        setSuccess('Plan actualizado exitosamente.');
      } else {
        const res = await createPlan(payload);
        currentId = res?.id;
        setSuccess('Plan creado exitosamente.');
      }

      if (planImage && currentId) {
        await uploadPlanImage(currentId, planImage);
      }

      setPlanName('');
      setPlanMaxUsers(12);
      setPlanAllowedModules(['all']);
      setPlanPrice(0.0);
      setPlanFeatures('');
      setPlanSortOrder(0);
      setPlanImage(null);
      setEditingPlanId(null);
      await loadPlans();
    } catch (err: any) {
      setError(err?.message || 'Error al guardar el plan');
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  const startEditPlan = (p: Plan) => {
    setEditingPlanId(p.id);
    setPlanName(p.name);
    setPlanMaxUsers(p.max_users);
    setPlanAllowedModules(p.allowed_modules || ['all']);
    setPlanPrice(p.price || 0);
    setPlanFeatures(Array.isArray(p.features) ? p.features.join('\n') : '');
    setPlanSortOrder(p.sort_order || 0);
  };

  const cancelEditPlan = () => {
    setEditingPlanId(null);
    setPlanName('');
    setPlanMaxUsers(12);
    setPlanAllowedModules(['all']);
    setPlanPrice(0.0);
    setPlanFeatures('');
    setPlanSortOrder(0);
    setPlanImage(null);
  };

  const handleDeletePlanSubmit = async (id: number, name: string) => {
    if (!window.confirm(`¿Seguro que deseas desactivar el plan "${name}"?`)) return;
    try {
      await deletePlan(id);
      setSuccess(`Plan "${name}" desactivado.`);
      await loadPlans();
    } catch (err: any) {
      setError(err?.message || 'Error al desactivar el plan');
    }
  };

  // --- Handlers: Sessions ---
  const handleKillSession = async (sessionId: string) => {
    setIsDisconnecting(sessionId);
    try {
      await disconnectSession(sessionId);
      setSuccess('Sesión desconectada correctamente.');
      setSessions((prev) => prev.filter((s) => s.session_id !== sessionId));
    } catch (err: any) {
      setError(err?.message || 'Error al desconectar la sesión');
    } finally {
      setIsDisconnecting(null);
    }
  };

  // --- Handlers: Users ---
  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isDev = newRolId === 4;
    if (!newUsername.trim() || !newEmail.trim() || !newPassword.trim() || (!isDev && !newTenantId)) {
      setError(isDev ? 'Usuario, email y contraseña son obligatorios.' : 'Usuario, email, contraseña y empresa son obligatorios.');
      return;
    }
    setIsSubmittingUser(true);
    try {
      await createDevUser({
        username: newUsername.trim(),
        nombre: newNombre.trim(),
        apellido: newApellido.trim(),
        email: newEmail.trim(),
        password: newPassword,
        rol_id: newRolId,
        tenant_id: newTenantId || null,
      });
      setSuccess(`Usuario "${newUsername}" creado con éxito.`);
      setNewUsername('');
      setNewNombre('');
      setNewApellido('');
      setNewEmail('');
      setNewPassword('');
      setNewRolId(3);
      setNewTenantId('');
      await loadUsers();
    } catch (err: any) {
      setError(err?.message || 'Error al crear usuario');
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleDeleteUserSubmit = async (userId: string, username: string) => {
    if (!window.confirm(`¿Seguro que deseas eliminar el usuario "${username}"?`)) return;
    try {
      await deleteDevUser(userId);
      setSuccess(`Usuario "${username}" eliminado.`);
      await loadUsers();
    } catch (err: any) {
      setError(err?.message || 'Error al eliminar usuario');
    }
  };

  // --- Handlers: Provisioning ---
  const handleProvisionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provisionTenantId.trim()) {
      setError('El UUID del Tenant es requerido.');
      return;
    }
    setIsProvisioning(true);
    setProvisionResult(null);
    try {
      const res = await generateProvisionToken({
        tenant_id: provisionTenantId.trim(),
        max_users: provisionMaxUsers,
        expires_in_hours: provisionExpiresHours,
      });
      setProvisionResult(res);
      setSuccess('Token de aprovisionamiento generado con éxito.');
    } catch (err: any) {
      setError(err?.message || 'Error al generar token de aprovisionamiento');
    } finally {
      setIsProvisioning(false);
    }
  };

  const handleCopyToken = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    } catch {
      // Fallback
    }
  };

  // Filtered tenants list
  const filteredTenants = useMemo(() => {
    if (!tenantSearch.trim()) return tenants;
    const q = tenantSearch.toLowerCase();
    return tenants.filter(
      (t) =>
        t.nombre.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        (t.plan_name && t.plan_name.toLowerCase().includes(q))
    );
  }, [tenants, tenantSearch]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 font-sans selection:bg-red-600 selection:text-white pb-16">
      {/* Top Bar */}
      <header className="border-b border-gray-800 bg-gray-900/60 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-2 rounded-xl bg-gray-800/80 hover:bg-gray-700 text-gray-400 hover:text-white transition-colors"
              title="Volver al Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                  <Shield className="w-5 h-5 text-red-500" />
                  Dueño de la Plataforma
                </h1>
                <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                  Desarrollador / Root
                </span>
              </div>
              <p className="text-xs text-gray-400">Control multi-tenant, suscripciones SaaS, auditoría y monitoreo global</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-800/80 border border-gray-700">
              <span
                className={`w-2 h-2 rounded-full ${
                  wsStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : wsStatus === 'connecting' ? 'bg-amber-400' : 'bg-rose-500'
                }`}
              />
              <span className="text-gray-300 font-medium">
                {wsStatus === 'connected' ? 'WebSocket Activo' : wsStatus === 'connecting' ? 'Conectando WS...' : 'WS Desconectado'}
              </span>
            </div>

            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800/80 border border-gray-700 text-gray-300">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>{sessions.length} sesiones vivas</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 border-t border-gray-800/60 overflow-x-auto scrollbar-none">
          <nav className="flex space-x-2 py-2">
            {[
              { id: 'tenants', label: 'Empresas (Tenants)', icon: Layers, count: tenants.length },
              { id: 'plans', label: 'Planes de Suscripción', icon: Database, count: plans.length },
              { id: 'sessions', label: 'Sesiones en Vivo', icon: Radio, count: sessions.length },
              { id: 'audit', label: 'Auditoría y Eventos', icon: ShieldAlert, count: securityEvents.length },
              { id: 'users', label: 'Usuarios y Accesos', icon: Users, count: users.length },
              { id: 'provisioning', label: 'Aprovisionamiento', icon: Key },
              { id: 'resources', label: 'Recursos del Servidor', icon: Cpu },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg shadow-red-600/20'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        isActive ? 'bg-black/30 text-white' : 'bg-gray-800 text-gray-400'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Global Notifications */}
        {success && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 text-sm animate-fadeIn">
            <CheckCircle className="w-5 h-5 shrink-0 text-emerald-400" />
            <div className="flex-1 font-medium">{success}</div>
            <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-sm animate-fadeIn">
            <AlertCircle className="w-5 h-5 shrink-0 text-red-400" />
            <div className="flex-1 font-medium">{error}</div>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* TAB: TENANTS */}
        {activeTab === 'tenants' && (
          <div className="space-y-6">
            {/* Create Tenant Form */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 shadow-xl backdrop-blur-xl">
              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-red-500" />
                Registrar Nueva Empresa / Tenant
              </h2>

              <form onSubmit={handleCreateTenantSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Nombre Comercial de la Empresa
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Distribuidora Central C.A."
                      value={newTenantName}
                      onChange={(e) => setNewTenantName(e.target.value)}
                      required
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Asignar Plan de Suscripción
                    </label>
                    <select
                      value={selectedPlanId}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedPlanId(val === 'custom' ? 'custom' : parseInt(val, 10));
                      }}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-red-500"
                    >
                      <option value="custom">Configuración Manual / A Medida</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.max_users} usuarios - ${p.price}/mes)
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Custom Configuration Options if not using pre-made plan */}
                {selectedPlanId === 'custom' && (
                  <div className="p-4 bg-gray-950/60 border border-gray-800 rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                        Límite de Usuarios Concurrentes:
                      </span>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={500}
                          value={maxUsers}
                          onChange={(e) => setMaxUsers(parseInt(e.target.value, 10) || 1)}
                          className="w-24 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-center text-white focus:outline-none focus:border-red-500"
                        />
                        <span className="text-xs text-gray-500">usuarios</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                        Suites y Módulos Permitidos para esta Empresa:
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {AVAILABLE_MODULES.map((mod) => {
                          const isChecked = selectedModules.includes(mod.id);
                          return (
                            <label
                              key={mod.id}
                              className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                                isChecked
                                  ? 'bg-red-600/10 border-red-500/40 text-gray-100'
                                  : 'bg-gray-900/40 border-gray-800 text-gray-400 hover:border-gray-700'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleModuleToggle(mod.id)}
                                className="mt-0.5 rounded border-gray-700 text-red-600 focus:ring-0"
                              />
                              <div>
                                <span className="font-semibold block">{mod.id}</span>
                                <span className="text-[11px] text-gray-400">{mod.label}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSubmittingTenant}
                    className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-red-600/20 disabled:opacity-50 transition-all flex items-center gap-2"
                  >
                    {isSubmittingTenant && <RefreshCw className="w-4 h-4 animate-spin" />}
                    Crear Empresa
                  </button>
                </div>
              </form>
            </div>

            {/* Tenants List */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 shadow-xl backdrop-blur-xl">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-white">Empresas Registradas ({tenants.length})</h2>
                  <button
                    onClick={loadTenants}
                    className="p-1 text-gray-400 hover:text-white transition-colors"
                    title="Recargar lista"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingTenants ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                <div className="relative w-full sm:w-72">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    placeholder="Buscar empresa por nombre o ID..."
                    value={tenantSearch}
                    onChange={(e) => setTenantSearch(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl pl-9 pr-4 py-2 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-red-500"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="bg-gray-950/60 text-gray-400 uppercase tracking-wider text-[10px] border-b border-gray-800">
                    <tr>
                      <th className="py-3 px-4">Empresa / ID</th>
                      <th className="py-3 px-4">Plan Asignado</th>
                      <th className="py-3 px-4 text-center">Usuarios Máx</th>
                      <th className="py-3 px-4">Módulos Habilitados</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60 font-mono text-[11px]">
                    {filteredTenants.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-gray-500 font-sans">
                          {isLoadingTenants ? 'Cargando empresas...' : 'No se encontraron empresas registradas.'}
                        </td>
                      </tr>
                    ) : (
                      filteredTenants.map((t) => {
                        const isEditing = editingTenantId === t.id;
                        return (
                          <tr key={t.id} className="hover:bg-gray-850/30 transition-colors">
                            <td className="py-3 px-4 font-sans">
                              {isEditing ? (
                                <input
                                  type="text"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-white w-full"
                                />
                              ) : (
                                <div>
                                  <div className="font-semibold text-white text-sm">{t.nombre}</div>
                                  <div className="text-[10px] text-gray-500 font-mono">{t.id}</div>
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4 font-sans">
                              {isEditing ? (
                                <select
                                  value={editingPlanIdForTenant || ''}
                                  onChange={(e) => {
                                    const val = e.target.value ? parseInt(e.target.value, 10) : null;
                                    setEditingPlanIdForTenant(val);
                                  }}
                                  className="bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-white"
                                >
                                  <option value="">Personalizado</option>
                                  {plans.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-800 text-gray-300 border border-gray-700">
                                  {t.plan_name || 'Personalizado'}
                                </span>
                              )}
                            </td>

                            <td className="py-3 px-4 text-center">
                              {isEditing ? (
                                <input
                                  type="number"
                                  min={1}
                                  max={500}
                                  value={editingMaxUsers}
                                  onChange={(e) => setEditingMaxUsers(parseInt(e.target.value, 10) || 1)}
                                  className="w-16 bg-gray-950 border border-gray-700 rounded px-2 py-1 text-xs text-center text-white"
                                />
                              ) : (
                                <span className="font-bold text-white">{t.max_users}</span>
                              )}
                            </td>

                            <td className="py-3 px-4 font-sans">
                              {isEditing ? (
                                <div className="space-y-1 max-w-xs">
                                  {AVAILABLE_MODULES.map((m) => (
                                    <label key={m.id} className="flex items-center gap-1.5 text-[11px] text-gray-300">
                                      <input
                                        type="checkbox"
                                        checked={editingAllowedModules.includes(m.id)}
                                        onChange={() => handleEditingModuleToggle(m.id)}
                                      />
                                      <span>{m.id}</span>
                                    </label>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-1 max-w-md">
                                  {(t.allowed_modules || []).map((m) => {
                                    const modDef = AVAILABLE_MODULES.find((mod) => mod.id === m);
                                    return (
                                      <span
                                        key={m}
                                        className={`text-[10px] px-2 py-0.5 rounded-md border font-semibold ${
                                          modDef?.badgeClass || 'bg-gray-800 text-gray-300 border-gray-700'
                                        }`}
                                      >
                                        {m}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </td>

                            <td className="py-3 px-4 text-right font-sans">
                              {isEditing ? (
                                <div className="flex items-center justify-end gap-1">
                                  <button
                                    onClick={handleUpdateTenantSubmit}
                                    disabled={isUpdatingTenant}
                                    className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white"
                                    title="Guardar cambios"
                                  >
                                    <Check className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={cancelEditTenant}
                                    className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white"
                                    title="Cancelar"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    onClick={() => startEditTenant(t)}
                                    className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
                                    title="Editar empresa"
                                  >
                                    <Edit3 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTenantSubmit(t.id, t.nombre)}
                                    className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-200 border border-red-900/50 transition-colors"
                                    title="Eliminar empresa"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: PLANS */}
        {activeTab === 'plans' && (
          <div className="space-y-6">
            {/* Create/Edit Plan Form */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 shadow-xl backdrop-blur-xl">
              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <Database className="w-5 h-5 text-red-500" />
                {editingPlanId ? `Modificar Plan (ID #${editingPlanId})` : 'Crear Nuevo Plan de Suscripción'}
              </h2>

              <form onSubmit={handlePlanSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Nombre del Plan
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Plan Retail Pro"
                      value={planName}
                      onChange={(e) => setPlanName(e.target.value)}
                      required
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Límite de Usuarios
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={planMaxUsers}
                      onChange={(e) => setPlanMaxUsers(parseInt(e.target.value, 10) || 1)}
                      required
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Precio Mensual (USD)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={planPrice}
                      onChange={(e) => setPlanPrice(parseFloat(e.target.value) || 0)}
                      required
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Orden Visual (Prioridad)
                    </label>
                    <input
                      type="number"
                      value={planSortOrder}
                      onChange={(e) => setPlanSortOrder(parseInt(e.target.value, 10) || 0)}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-red-500"
                    />
                  </div>
                </div>

                {/* Modules Allowed */}
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2">
                    Módulos y Suites Incluidas en este Plan:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {AVAILABLE_MODULES.map((mod) => {
                      const isChecked = planAllowedModules.includes(mod.id);
                      return (
                        <label
                          key={mod.id}
                          className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                            isChecked
                              ? 'bg-red-600/10 border-red-500/40 text-gray-100'
                              : 'bg-gray-900/40 border-gray-800 text-gray-400 hover:border-gray-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handlePlanModuleToggle(mod.id)}
                            className="mt-0.5 rounded border-gray-700 text-red-600 focus:ring-0"
                          />
                          <div>
                            <span className="font-semibold block">{mod.id}</span>
                            <span className="text-[11px] text-gray-400">{mod.label}</span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Features list */}
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Características Destacadas (Una por línea, para mostrar en Landing / Pricing)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Soporte prioritario 24/7&#10;Facturación ilimitada&#10;Kardex y control multialmacén"
                    value={planFeatures}
                    onChange={(e) => setPlanFeatures(e.target.value)}
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-xs text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500 font-sans"
                  />
                </div>

                {/* Image upload */}
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Imagen / Badge del Plan (Opcional)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setPlanImage(e.target.files?.[0] || null)}
                    className="text-xs text-gray-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-gray-800 file:text-gray-200 hover:file:bg-gray-700"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  {editingPlanId && (
                    <button
                      type="button"
                      onClick={cancelEditPlan}
                      className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-xl"
                    >
                      Cancelar
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmittingPlan}
                    className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-red-600/20 disabled:opacity-50 transition-all flex items-center gap-2"
                  >
                    {isSubmittingPlan && <RefreshCw className="w-4 h-4 animate-spin" />}
                    {editingPlanId ? 'Guardar Cambios' : 'Crear Plan'}
                  </button>
                </div>
              </form>
            </div>

            {/* Plans Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className={`bg-gray-900/60 border rounded-2xl p-6 flex flex-col justify-between backdrop-blur-xl transition-all ${
                    plan.is_active ? 'border-gray-800 hover:border-gray-700' : 'border-red-900/40 opacity-60'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                        <p className="text-xs text-gray-400">{plan.max_users} usuarios concurrentes</p>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-white">${plan.price}</div>
                        <div className="text-[10px] text-gray-500 uppercase">por mes</div>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Módulos:</div>
                      <div className="flex flex-wrap gap-1">
                        {(plan.allowed_modules || []).map((m) => (
                          <span
                            key={m}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-gray-800/80 text-gray-300 border border-gray-700"
                          >
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>

                    {plan.features && plan.features.length > 0 && (
                      <div className="space-y-1 mb-4 pt-3 border-t border-gray-800/60">
                        {plan.features.map((feat, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-gray-300">
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{feat}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-800/60">
                    <span
                      className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${
                        plan.is_active ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      }`}
                    >
                      {plan.is_active ? 'Activo' : 'Desactivado'}
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEditPlan(plan)}
                        className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white"
                        title="Editar plan"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      {plan.is_active && (
                        <button
                          onClick={() => handleDeletePlanSubmit(plan.id, plan.name)}
                          className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-200 border border-red-900/50"
                          title="Desactivar plan"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB: SESSIONS */}
        {activeTab === 'sessions' && (
          <div className="space-y-6">
            {/* Live Alerts Box */}
            {alerts.length > 0 && (
              <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                  <ShieldAlert className="w-4 h-4" />
                  Alertas de Abuso Detectadas en Tiempo Real
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-2">
                  {alerts.map((al, idx) => (
                    <div
                      key={idx}
                      className="text-xs text-amber-200 bg-amber-950/50 border border-amber-500/20 rounded-lg p-2 flex justify-between gap-2"
                    >
                      <span>{al.message}</span>
                      <span className="text-[10px] text-amber-400 shrink-0 font-mono">
                        {new Date(al.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 shadow-xl backdrop-blur-xl">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <Radio className="w-5 h-5 text-red-500 animate-pulse" />
                    Sesiones de Usuario Activas ({sessions.length})
                  </h2>
                  <p className="text-xs text-gray-400">
                    Monitoreo en vivo vía WebSocket de usuarios conectados en todos los módulos de Koda
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="bg-gray-950/60 text-gray-400 uppercase tracking-wider text-[10px] border-b border-gray-800">
                    <tr>
                      <th className="py-3 px-4">Usuario</th>
                      <th className="py-3 px-4">Tenant / Empresa</th>
                      <th className="py-3 px-4">Módulo</th>
                      <th className="py-3 px-4">Dispositivo</th>
                      <th className="py-3 px-4">IP Origen</th>
                      <th className="py-3 px-4">Conexión</th>
                      <th className="py-3 px-4 text-right">Kill Switch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60 font-mono text-[11px]">
                    {sessions.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-500 font-sans">
                          No hay sesiones activas en este instante.
                        </td>
                      </tr>
                    ) : (
                      sessions.map((s) => (
                        <tr key={s.session_id} className="hover:bg-gray-850/30 transition-colors">
                          <td className="py-3 px-4 font-sans font-semibold text-white">{s.username}</td>
                          <td className="py-3 px-4 text-gray-400">{s.tenant_id}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[10px]">
                              {s.modulo}
                            </span>
                          </td>
                          <td className="py-3 px-4 font-sans text-gray-400">{s.device}</td>
                          <td className="py-3 px-4 text-gray-300">{s.ip}</td>
                          <td className="py-3 px-4 text-gray-400">{new Date(s.connected_at).toLocaleTimeString()}</td>
                          <td className="py-3 px-4 text-right font-sans">
                            <button
                              onClick={() => handleKillSession(s.session_id)}
                              disabled={isDisconnecting === s.session_id}
                              className="px-3 py-1 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                            >
                              {isDisconnecting === s.session_id ? 'Cortando...' : 'Desconectar'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: AUDIT */}
        {activeTab === 'audit' && (
          <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 shadow-xl backdrop-blur-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-red-500" />
                  Eventos Críticos de Seguridad y Licenciamiento
                </h2>
                <p className="text-xs text-gray-400">
                  Bitácora de cierres forzados por duplicidad, accesos bloqueados por límite de licencia y kill switches
                </p>
              </div>
              <button
                onClick={loadSecurityEvents}
                className="p-1.5 text-gray-400 hover:text-white transition-colors"
                title="Actualizar eventos"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingEvents ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-gray-300">
                <thead className="bg-gray-950/60 text-gray-400 uppercase tracking-wider text-[10px] border-b border-gray-800">
                  <tr>
                    <th className="py-3 px-4">Fecha y Hora</th>
                    <th className="py-3 px-4">Usuario</th>
                    <th className="py-3 px-4">Evento</th>
                    <th className="py-3 px-4">Estado</th>
                    <th className="py-3 px-4">IP</th>
                    <th className="py-3 px-4">Detalles</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60 font-mono text-[11px]">
                  {securityEvents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-gray-500 font-sans">
                        {isLoadingEvents ? 'Cargando bitácora de seguridad...' : 'No se registraron eventos críticos recientes.'}
                      </td>
                    </tr>
                  ) : (
                    securityEvents.map((evt) => (
                      <tr key={evt.id} className="hover:bg-gray-850/30 transition-colors">
                        <td className="py-3 px-4 text-gray-400">
                          {new Date(evt.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-sans font-semibold text-white">{evt.username}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                              evt.evento.includes('duplicidad')
                                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                                : evt.evento.includes('límite')
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            }`}
                          >
                            {evt.evento}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`uppercase text-[10px] font-bold ${
                              evt.estado === 'warning' ? 'text-amber-400' : evt.estado === 'success' ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {evt.estado}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-400">{evt.ip_address || 'N/A'}</td>
                        <td className="py-3 px-4 font-sans text-gray-300 max-w-sm truncate">{evt.detalles}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: USERS */}
        {activeTab === 'users' && (
          <div className="space-y-6">
            {/* Create Company User Form */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 shadow-xl backdrop-blur-xl">
              <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
                <PlusCircle className="w-5 h-5 text-red-500" />
                Crear Usuario Corporativo / Desarrollador
              </h2>

              <form onSubmit={handleCreateUserSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Nombre de Usuario (Login)
                    </label>
                    <input
                      type="text"
                      placeholder="ej. jperalta"
                      value={newUsername}
                      onChange={(e) => setNewUsername(e.target.value)}
                      required
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Nombre
                    </label>
                    <input
                      type="text"
                      placeholder="Juan"
                      value={newNombre}
                      onChange={(e) => setNewNombre(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Apellido
                    </label>
                    <input
                      type="text"
                      placeholder="Peralta"
                      value={newApellido}
                      onChange={(e) => setNewApellido(e.target.value)}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Correo Electrónico
                    </label>
                    <input
                      type="email"
                      placeholder="jperalta@empresa.com"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      required
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Contraseña Inicial
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-gray-100 placeholder-gray-600 focus:outline-none focus:border-red-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                      Rol Asignado
                    </label>
                    <select
                      value={newRolId}
                      onChange={(e) => setNewRolId(parseInt(e.target.value, 10))}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-gray-100 focus:outline-none focus:border-red-500"
                    >
                      <option value={1}>CEO / Propietario</option>
                      <option value={2}>Administrador</option>
                      <option value={3}>Usuario Estándar</option>
                      <option value={4}>Desarrollador (Root)</option>
                      <option value={5}>Gerente</option>
                    </select>
                  </div>

                  {newRolId !== 4 && (
                    <div className="sm:col-span-2 lg:col-span-3">
                      <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1">
                        Empresa / Tenant Asociado
                      </label>
                      <select
                        value={newTenantId}
                        onChange={(e) => setNewTenantId(e.target.value)}
                        required
                        className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-gray-100 focus:outline-none focus:border-red-500"
                      >
                        <option value="">Selecciona la empresa a la que pertenecerá...</option>
                        {tenants.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nombre} ({t.id})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={isSubmittingUser}
                    className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white text-sm font-semibold rounded-xl shadow-lg shadow-red-600/20 disabled:opacity-50 transition-all flex items-center gap-2"
                  >
                    {isSubmittingUser && <RefreshCw className="w-4 h-4 animate-spin" />}
                    Crear y Vincular Usuario
                  </button>
                </div>
              </form>
            </div>

            {/* Users List */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 shadow-xl backdrop-blur-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-red-500" />
                  Directorio Global de Usuarios ({users.length})
                </h2>
                <button
                  onClick={loadUsers}
                  className="p-1.5 text-gray-400 hover:text-white transition-colors"
                  title="Recargar usuarios"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoadingUsers ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-gray-300">
                  <thead className="bg-gray-950/60 text-gray-400 uppercase tracking-wider text-[10px] border-b border-gray-800">
                    <tr>
                      <th className="py-3 px-4">Usuario</th>
                      <th className="py-3 px-4">Nombre Completo</th>
                      <th className="py-3 px-4">Email</th>
                      <th className="py-3 px-4">Rol</th>
                      <th className="py-3 px-4">Empresa (Tenant)</th>
                      <th className="py-3 px-4 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800/60 font-mono text-[11px]">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-850/30 transition-colors">
                        <td className="py-3 px-4 font-sans font-semibold text-white">{u.username}</td>
                        <td className="py-3 px-4 font-sans">
                          {u.nombre} {u.apellido}
                        </td>
                        <td className="py-3 px-4 text-gray-400 font-sans">{u.email}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              u.role === 'Desarrollador'
                                ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                : u.role === 'Administrador'
                                ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                                : 'bg-gray-800 text-gray-300'
                            }`}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-sans text-gray-400">{u.tenant_nombre || 'N/A'}</td>
                        <td className="py-3 px-4 text-right font-sans">
                          {u.id !== user?.id && (
                            <button
                              onClick={() => handleDeleteUserSubmit(u.id, u.username)}
                              className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-200 border border-red-900/50"
                              title="Eliminar usuario"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: PROVISIONING */}
        {activeTab === 'provisioning' && (
          <div className="max-w-2xl mx-auto space-y-6">
            <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-6 shadow-xl backdrop-blur-xl">
              <div className="mb-6">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Key className="w-5 h-5 text-red-500" />
                  Aprovisionamiento de Cuenta (Token de Activación Único)
                </h2>
                <p className="text-xs text-gray-400 mt-1">
                  Genera un token seguro y efímero para que un cliente reclame su organización y configure su primer administrador.
                </p>
              </div>

              <form onSubmit={handleProvisionSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                    Empresa / UUID del Tenant
                  </label>
                  <select
                    value={provisionTenantId}
                    onChange={(e) => setProvisionTenantId(e.target.value)}
                    required
                    className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-red-500 font-sans"
                  >
                    <option value="">Selecciona la empresa a aprovisionar...</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre} ({t.id})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Límite de Usuarios
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={provisionMaxUsers}
                      onChange={(e) => setProvisionMaxUsers(parseInt(e.target.value, 10) || 10)}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-red-500 font-sans"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-300 uppercase tracking-wider mb-1.5">
                      Expiración (Horas)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={provisionExpiresHours}
                      onChange={(e) => setProvisionExpiresHours(parseInt(e.target.value, 10) || 48)}
                      className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-100 focus:outline-none focus:border-red-500 font-sans"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isProvisioning}
                  className="w-full py-3 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-semibold rounded-xl shadow-lg shadow-red-600/20 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {isProvisioning && <RefreshCw className="w-4 h-4 animate-spin" />}
                  Generar Token de Aprovisionamiento
                </button>
              </form>

              {provisionResult && (
                <div className="mt-6 pt-6 border-t border-gray-800 space-y-4">
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-200 text-xs flex gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0 text-amber-400" />
                    <div>
                      <span className="font-semibold block mb-0.5">ADVERTENCIA DE SEGURIDAD</span>
                      Copia este token ahora. Por motivos criptográficos no se almacenará en texto plano y no podrá volver a ser consultado.
                    </div>
                  </div>

                  <div className="bg-gray-950 border border-gray-800 rounded-xl p-4 font-mono text-xs text-gray-200 break-all flex items-center justify-between gap-3">
                    <span>{provisionResult.token}</span>
                    <button
                      onClick={() => handleCopyToken(provisionResult.token)}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg shrink-0 flex items-center gap-1.5 transition-colors font-sans text-xs font-semibold"
                    >
                      {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedToken ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>

                  <div className="text-[11px] text-gray-400 text-center font-sans">
                    Válido hasta: {new Date(provisionResult.expires_at).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB: RESOURCES */}
        {activeTab === 'resources' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-red-500" />
                  Métricas de Servidor y Microservicios
                </h2>
                <p className="text-xs text-gray-400">Estado de salud del backend FastAPI, base de datos y memoria</p>
              </div>
              <button
                onClick={loadMetrics}
                className="p-1.5 text-gray-400 hover:text-white transition-colors"
                title="Actualizar métricas"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingMetrics ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {metrics ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* CPU Card */}
                <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 shadow-xl backdrop-blur-xl">
                  <div className="flex items-center justify-between text-gray-400 text-xs font-semibold mb-2">
                    <span>USO DE CPU</span>
                    <Cpu className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{metrics.system.cpu_percent}%</div>
                  <div className="text-xs text-gray-500 mt-1">Carga 1m: {metrics.system.cpu_load}</div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5 mt-3 overflow-hidden">
                    <div
                      className="bg-cyan-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(metrics.system.cpu_percent, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Memory Card */}
                <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 shadow-xl backdrop-blur-xl">
                  <div className="flex items-center justify-between text-gray-400 text-xs font-semibold mb-2">
                    <span>MEMORIA RAM</span>
                    <Server className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl font-bold text-white">{metrics.system.memory_used_percent}%</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {metrics.system.memory_used_mb} MB / {metrics.system.memory_total_mb} MB
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1.5 mt-3 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(metrics.system.memory_used_percent, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Database Card */}
                <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 shadow-xl backdrop-blur-xl">
                  <div className="flex items-center justify-between text-gray-400 text-xs font-semibold mb-2">
                    <span>BASE DE DATOS</span>
                    <Database className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`w-3 h-3 rounded-full ${
                        metrics.services.database ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                      }`}
                    />
                    <span className="text-lg font-bold text-white">
                      {metrics.services.database ? 'Operativa' : 'Caída'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2 font-mono">PostgreSQL AsyncPool</div>
                </div>

                {/* Redis Card */}
                <div className="bg-gray-900/60 border border-gray-800 rounded-2xl p-5 shadow-xl backdrop-blur-xl">
                  <div className="flex items-center justify-between text-gray-400 text-xs font-semibold mb-2">
                    <span>REDIS / CACHÉ</span>
                    <Activity className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`w-3 h-3 rounded-full ${
                        metrics.services.redis ? 'bg-emerald-400' : 'bg-gray-600'
                      }`}
                    />
                    <span className="text-lg font-bold text-white">
                      {metrics.services.redis ? 'Conectado' : 'Inactivo'}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-2 font-mono">Rate Limiting & PubSub</div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500 font-sans">
                {isLoadingMetrics ? 'Obteniendo métricas...' : 'Métricas no disponibles.'}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

export default function DeveloperPage() {
  return (
    <RoleGuard allowedRoles={['Desarrollador']}>
      <DeveloperDashboardContent />
    </RoleGuard>
  );
}
