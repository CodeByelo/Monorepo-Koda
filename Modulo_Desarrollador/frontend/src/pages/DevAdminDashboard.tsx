import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/providers/AuthProvider';
import { api } from '@/api/client';
import {
  Activity, Shield, PlusCircle, Users, Radio,
  Trash2, RefreshCw, Terminal, AlertCircle,
  CheckCircle, Database, Network, Globe, RefreshCcw,
  Server, Layers, LogOut, Clock, Search, Edit3, Check, X, ShieldAlert,
  Eye, EyeOff
} from 'lucide-react';

interface ActiveSession {
  session_id: string;
  tenant_id: string;
  user_id: string;
  username: string;
  ip: string;
  device: string;
  modulo: string;
  connected_at: string;
}

interface SecurityEvent {
  id: number;
  tenant_id: string;
  user_id: string;
  username: string;
  evento: string;
  detalles: string;
  estado: string;
  ip_address: string;
  created_at: string;
}

interface Tenant {
  id: string;
  nombre: string;
  max_users: number;
  allowed_modules: string[];
  created_at: string;
  plan_name?: string;
}

interface AlertData {
  message: string;
  event_type: string;
  details: any;
  timestamp: string;
}

const AVAILABLE_MODULES = [
  { id: 'all', label: 'Suite Completa' },
  { id: 'administrativo', label: 'Ventas, Facturación, Compras e Inventario' },
  { id: 'financiero', label: 'Tesorería, Cobranzas y Pagos' },
  { id: 'contable', label: 'Contabilidad' },
  { id: 'fiscal', label: 'Libros Fiscales e IVA/ISLR' },
  { id: 'nomina', label: 'Cálculo de Nómina' }
];

export const DevAdminDashboard: React.FC = () => {
  const { token, logout, username, tenantName } = useAuth();
  const [activeTab, setActiveTab] = useState<'sessions' | 'tenants' | 'plans' | 'users' | 'resources' | 'audit'>('sessions');
  const [sessions, setSessions] = useState<ActiveSession[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');

  // Plans State
  interface Plan {
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
  const [plans, setPlans] = useState<Plan[]>([]);
  const [planName, setPlanName] = useState('');
  const [planMaxUsers, setPlanMaxUsers] = useState(12);
  const [planAllowedModules, setPlanAllowedModules] = useState<string[]>(['all']);
  const [planPrice, setPlanPrice] = useState(0.0);
  const [planFeatures, setPlanFeatures] = useState<string>('');
  const [planSortOrder, setPlanSortOrder] = useState(0);
  const [planImage, setPlanImage] = useState<File | null>(null);
  const [isSubmittingPlan, setIsSubmittingPlan] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState<number | null>(null);

  // Custom Plan override state for Tenant Form
  const [selectedPlanId, setSelectedPlanId] = useState<number | 'custom'>('custom');

  // User Management State
  interface UserProfile {
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
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newNombre, setNewNombre] = useState('');
  const [newApellido, setNewApellido] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newRolId, setNewRolId] = useState<number>(3);
  const [newTenantId, setNewTenantId] = useState('');
  const [isSubmittingUser, setIsSubmittingUser] = useState(false);

  // Resources State
  interface ResourceMetrics {
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
  const [resources, setResources] = useState<ResourceMetrics | null>(null);
  const [isLoadingResources, setIsLoadingResources] = useState(false);

  // Form State
  const [newTenantName, setNewTenantName] = useState('');
  const [maxUsers, setMaxUsers] = useState(12);
  const [selectedModules, setSelectedModules] = useState<string[]>(['all']);

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState<string | null>(null);
  const [isSubmittingTenant, setIsSubmittingTenant] = useState(false);

  // Tenant Editing State
  const [editingTenantId, setEditingTenantId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingMaxUsers, setEditingMaxUsers] = useState(12);
  const [editingAllowedModules, setEditingAllowedModules] = useState<string[]>(['all']);
  const [isUpdatingTenant, setIsUpdatingTenant] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);

  // Fetch initial REST data
  const fetchTenants = async () => {
    try {
      const data = await api.get<Tenant[]>('/dev/tenants');
      setTenants(data);
    } catch (err: any) {
      setError(err.message || 'Error al obtener tenants');
    }
  };

  const fetchPlans = async () => {
    try {
      const data = await api.get<Plan[]>('/dev/plans');
      setPlans(data);
    } catch (err: any) {
      setError(err.message || 'Error al obtener planes');
    }
  };

  const submitPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmittingPlan(true);

    try {
      const payload = {
        name: planName,
        max_users: planMaxUsers,
        allowed_modules: planAllowedModules,
        price: planPrice,
        features: planFeatures.split('\n').filter(f => f.trim() !== ''),
        sort_order: planSortOrder
      };

      let planIdToUse = editingPlanId;

      if (editingPlanId) {
        await api.put(`/dev/plans/${editingPlanId}`, payload);
        setSuccess('Plan actualizado exitosamente');
      } else {
        const result: any = await api.post('/dev/plans', payload);
        planIdToUse = result.id;
        setSuccess('Plan creado exitosamente');
      }

      // Upload image if selected
      if (planImage && planIdToUse) {
        const formData = new FormData();
        formData.append('file', planImage);
        
        await fetch(`/api/dev/plans/${planIdToUse}/image`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`
          },
          body: formData
        });
      }

      setPlanName('');
      setPlanMaxUsers(12);
      setPlanAllowedModules(['all']);
      setPlanPrice(0.0);
      setPlanFeatures('');
      setPlanSortOrder(0);
      setPlanImage(null);
      
      // Reset file input
      const fileInput = document.getElementById('plan-image-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';

      setEditingPlanId(null);
      await fetchPlans();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Error al guardar el plan');
    } finally {
      setIsSubmittingPlan(false);
    }
  };

  const deletePlan = async (planId: number) => {
    if (!confirm('¿Seguro que deseas eliminar/desactivar este plan?')) return;
    setError(null);
    try {
      await api.delete(`/dev/plans/${planId}`);
      setSuccess('Plan desactivado exitosamente');
      await fetchPlans();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Error al eliminar el plan');
    }
  };

  const handleEditPlan = (plan: Plan) => {
    setEditingPlanId(plan.id);
    setPlanName(plan.name);
    setPlanMaxUsers(plan.max_users);
    setPlanAllowedModules(plan.allowed_modules);
    setPlanPrice(plan.price);
    setPlanFeatures(plan.features ? plan.features.join('\n') : '');
    setPlanSortOrder(plan.sort_order || 0);
  };

  const handleCancelEditPlan = () => {
    setEditingPlanId(null);
    setPlanName('');
    setPlanMaxUsers(12);
    setPlanAllowedModules(['all']);
    setPlanPrice(0.0);
    setPlanFeatures('');
    setPlanSortOrder(0);
    setPlanImage(null);
    const fileInput = document.getElementById('plan-image-upload') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  };

  const fetchSecurityEvents = async () => {
    try {
      const data = await api.get<SecurityEvent[]>('/dev/security-events/critical');
      setSecurityEvents(data);
    } catch (err: any) {
      setError(err.message || 'Error al obtener bitácoras de seguridad');
    }
  };

  const fetchUsers = async () => {
    try {
      const data = await api.get<UserProfile[]>('/dev/users');
      setUsers(data);
    } catch (err: any) {
      setError(err.message || 'Error al obtener directorio de usuarios');
    }
  };

  const fetchResources = async () => {
    setIsLoadingResources(true);
    try {
      const data = await api.get<ResourceMetrics>('/dev/system-metrics');
      setResources(data);
    } catch (err: any) {
      setError(err.message || 'Error al obtener estado de recursos del sistema');
    } finally {
      setIsLoadingResources(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'resources') {
      fetchResources();
      const interval = setInterval(fetchResources, 4000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  useEffect(() => {
    fetchTenants();
    fetchPlans();
    fetchSecurityEvents();
    fetchUsers();
    fetchResources();

    if (!token) return;

    // Connect to Developer WebSocket for real-time monitoring
    const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsHost = window.location.host;
    let wsPath = '/api/dev/ws';

    if (window.location.port === '5175') {
      wsHost = `${window.location.hostname}:8000`;
      wsPath = '/dev/ws';
    } else if (window.location.hostname.includes('tail')) {
      // Use the known working funnel port on Tailscale
      wsHost = `${window.location.hostname}:8443`;
      wsPath = '/api/dev/ws';
    }

    const wsUrl = `${wsProto}//${wsHost}${wsPath}?token=${encodeURIComponent(token)}`;

    const connectWS = () => {
      setWsStatus('connecting');
      const socket = new WebSocket(wsUrl);
      wsRef.current = socket;

      socket.onopen = () => {
        setWsStatus('connected');
        setError(null);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'active_sessions') {
            setSessions(payload.data);
          } else if (payload.type === 'abuse_alert') {
            setAlerts((prev: AlertData[]) => [payload.data, ...prev].slice(0, 30));
            // Automatically refresh database logs since an abuse event was logged
            fetchSecurityEvents();
          }
        } catch (err) {
          console.error("Error decoding developer websocket data", err);
        }
      };

      socket.onclose = () => {
        setWsStatus('disconnected');
      };

      socket.onerror = () => {
        setWsStatus('disconnected');
      };
    };

    connectWS();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token]);

  // Kill Switch Handler
  const handleDisconnect = async (sessionId: string) => {
    setIsDisconnecting(sessionId);
    setError(null);
    try {
      await api.post('/dev/disconnect', { session_id: sessionId });
      setSuccess('Usuario desconectado exitosamente');
      setTimeout(() => setSuccess(null), 3000);
      // Wait for WS update, but also proactively remove locally
      setSessions((prev: ActiveSession[]) => prev.filter((s: ActiveSession) => s.session_id !== sessionId));
    } catch (err: any) {
      setError(err.message || 'Error al desconectar usuario');
    } finally {
      setIsDisconnecting(null);
    }
  };

  // Create Tenant Handler
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTenantName.trim()) {
      setError('El nombre de la empresa es obligatorio');
      return;
    }
    setError(null);
    setSuccess(null);
    setIsSubmittingTenant(true);

    try {
      const payload: any = { nombre: newTenantName };

      if (selectedPlanId !== 'custom') {
        payload.plan_id = selectedPlanId;
      } else {
        payload.max_users = maxUsers;
        payload.allowed_modules = selectedModules;
      }

      const newTenant = await api.post<Tenant>('/dev/tenants', payload);
      setSuccess(`Empresa '${newTenant.nombre}' creada con éxito.`);
      setNewTenantName('');
      setMaxUsers(12);
      setSelectedModules(['all']);
      setSelectedPlanId('custom');
      fetchTenants();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Error al crear la empresa');
    } finally {
      setIsSubmittingTenant(false);
    }
  };

  // Create Company User Handler
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const isDeveloperRole = newRolId === 4;
    if (!newUsername.trim() || !newEmail.trim() || !newPassword.trim() || (!isDeveloperRole && !newTenantId)) {
      setError(isDeveloperRole
        ? 'Usuario, Email y Contraseña son obligatorios para crear un Desarrollador'
        : 'Usuario, Email, Contraseña y Empresa son campos obligatorios'
      );
      return;
    }
    setError(null);
    setSuccess(null);
    setIsSubmittingUser(true);

    try {
      await api.post('/dev/users', {
        username: newUsername,
        nombre: newNombre,
        apellido: newApellido,
        email: newEmail,
        password: newPassword,
        rol_id: newRolId,
        tenant_id: newTenantId || null
      });
      setSuccess(`Usuario '${newUsername}' creado y asociado con éxito.`);
      setNewUsername('');
      setNewNombre('');
      setNewApellido('');
      setNewEmail('');
      setNewPassword('');
      setNewRolId(3);
      setNewTenantId('');
      fetchUsers();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Error al crear el usuario de empresa');
    } finally {
      setIsSubmittingUser(false);
    }
  };

  const handleModuleToggle = (moduleId: string) => {
    if (moduleId === 'all') {
      setSelectedModules(['all']);
    } else {
      setSelectedModules((prev: string[]) => {
        const withoutAll = prev.filter((m: string) => m !== 'all');
        if (withoutAll.includes(moduleId)) {
          const next = withoutAll.filter((m: string) => m !== moduleId);
          return next.length === 0 ? ['all'] : next;
        } else {
          return [...withoutAll, moduleId];
        }
      });
    }
  };

  const startEditing = (t: Tenant) => {
    setEditingTenantId(t.id);
    setEditingName(t.nombre);
    setEditingMaxUsers(t.max_users);
    setEditingAllowedModules(t.allowed_modules);
  };

  const cancelEditing = () => {
    setEditingTenantId(null);
  };

  const handleEditingModuleToggle = (moduleId: string) => {
    if (moduleId === 'all') {
      setEditingAllowedModules(['all']);
    } else {
      setEditingAllowedModules((prev: string[]) => {
        const withoutAll = prev.filter((m: string) => m !== 'all');
        if (withoutAll.includes(moduleId)) {
          const next = withoutAll.filter((m: string) => m !== moduleId);
          return next.length === 0 ? ['all'] : next;
        } else {
          return [...withoutAll, moduleId];
        }
      });
    }
  };

  const handleUpdateTenant = async (id: string) => {
    setIsUpdatingTenant(true);
    try {
      await api.put(`/dev/tenants/${id}`, {
        nombre: editingName,
        max_users: editingMaxUsers,
        allowed_modules: editingAllowedModules
      });
      setSuccess('Empresa actualizada correctamente');
      setEditingTenantId(null);
      fetchTenants();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Error al actualizar empresa');
      setTimeout(() => setError(null), 5000);
    } finally {
      setIsUpdatingTenant(false);
    }
  };

  const handleDeleteTenant = async (id: string, name: string) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar la empresa "${name}" y todos sus usuarios y datos asociados? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await api.delete(`/dev/tenants/${id}`);
      setSuccess(`Empresa "${name}" eliminada correctamente`);
      fetchTenants();
      fetchUsers(); // Refresh users since company users were deleted
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Error al eliminar empresa');
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleDeleteUser = async (id: string, username: string) => {
    if (!window.confirm(`¿Está seguro de que desea eliminar el usuario "${username}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      await api.delete(`/dev/users/${id}`);
      setSuccess(`Usuario "${username}" eliminado correctamente`);
      fetchUsers();
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      setError(err.message || 'Error al eliminar usuario');
      setTimeout(() => setError(null), 5000);
    }
  };

  return (
    <div className="dev-dashboard-container">
      {/* Google Fonts and Premium Styling */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Share+Tech+Mono&display=swap');

        /* Color variables and theme definitions */
        :root {
          --cyber-bg: #0B1313;
          --cyber-panel: rgba(18, 34, 36, 0.8);
          --cyber-border: rgba(29, 53, 56, 0.7);
          --cyber-border-glow: rgba(0, 194, 148, 0.15);
          --cyber-accent: #00C294;
          --cyber-accent-dim: #00A37C;
          --cyber-accent-glow: rgba(0, 194, 148, 0.2);
          --cyber-text: #E0E6E6;
          --cyber-text-muted: #94A3B8;
          --cyber-danger: #ef4444;
          --cyber-danger-glow: rgba(239, 68, 68, 0.3);
          --cyber-warning: #f59e0b;
          --cyber-warning-glow: rgba(245, 158, 11, 0.3);
          --cyber-font-title: 'Inter', sans-serif;
          --cyber-font-body: 'Inter', sans-serif;
          --cyber-font-mono: 'Share Tech Mono', monospace;
        }

        /* Layout Grid */
        .dev-dashboard-container {
          display: flex;
          height: 100vh;
          width: 100vw;
          background-color: var(--cyber-bg);
          background-image:
            radial-gradient(circle at 10% 20%, rgba(11, 191, 140, 0.08) 0%, transparent 45%),
            radial-gradient(circle at 90% 80%, rgba(13, 166, 123, 0.06) 0%, transparent 45%),
            linear-gradient(rgba(11, 191, 140, 0.02) 1px, transparent 1px),
            linear-gradient(90deg, rgba(11, 191, 140, 0.02) 1px, transparent 1px);
          background-size: 100% 100%, 100% 100%, 25px 25px, 25px 25px;
          color: var(--cyber-text);
          font-family: var(--cyber-font-body);
          overflow: hidden;
        }

        /* Left Navigation Sidebar */
        .dev-sidebar {
          width: 260px;
          background: #0e1c1d;
          border-right: 1px solid #1d3538;
          display: flex;
          flex-direction: column;
          padding: 0;
          height: 100%;
          flex-shrink: 0;
          box-shadow: 10px 0 30px rgba(0, 0, 0, 0.4);
          z-index: 50;
        }
        .dev-sidebar-logo-container {
          background: #ffffff;
          border-bottom: 1px solid rgba(29, 53, 56, 0.5);
          padding: 16px;
          margin-bottom: 16px;
          width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        .dev-sidebar-menu {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex-grow: 1;
          padding: 0 12px;
        }
        .dev-sidebar-link {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 6px;
          color: #94A3B8;
          font-weight: 500;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
          border: 1px solid transparent;
          position: relative;
        }
        .dev-sidebar-link:hover {
          color: #E0E6E6;
          background: #263636;
        }
        .dev-sidebar-link.active {
          color: #00C294;
          background: rgba(0, 194, 148, 0.1);
          border-color: rgba(0, 194, 148, 0.5);
          font-weight: 600;
          box-shadow: 0 0 10px rgba(0, 194, 148, 0.15);
        }
        .dev-sidebar-link.active svg {
          stroke-width: 2px;
        }
        .dev-sidebar-footer {
          padding: 16px 12px;
          border-top: 1px solid #1d3538;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        /* Main Workspace Container */
        .dev-main {
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
        }

        /* Top System Status Header */
        .dev-top-bar {
          height: 80px;
          border-bottom: 1px solid var(--cyber-border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 32px;
          background: rgba(3, 12, 15, 0.65);
          backdrop-filter: blur(15px);
          flex-shrink: 0;
        }
        .dev-top-bar-title {
          font-family: var(--cyber-font-title);
          font-size: 17px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #fff;
        }
        .dev-top-bar-title span {
          color: var(--cyber-accent);
          text-shadow: 0 0 10px rgba(11, 191, 140, 0.2);
        }
        .dev-status-grid {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .status-pill {
          background: rgba(4, 15, 18, 0.8);
          border: 1px solid var(--cyber-border);
          border-radius: 50px;
          padding: 6px 14px;
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .status-pill.ws-connected {
          color: var(--cyber-accent);
          border-color: rgba(11, 191, 140, 0.3);
          box-shadow: 0 0 12px rgba(11, 191, 140, 0.12);
        }
        .status-pill.ws-connecting {
          color: var(--cyber-warning);
          border-color: rgba(245, 158, 11, 0.3);
        }
        .status-pill.ws-disconnected {
          color: var(--cyber-danger);
          border-color: rgba(239, 68, 68, 0.3);
        }
        .status-indicator-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
        }
        .status-indicator-dot.active {
          background-color: var(--cyber-accent);
          box-shadow: 0 0 8px var(--cyber-accent);
          animation: pulse-active 2s infinite;
        }
        .status-indicator-dot.warning {
          background-color: var(--cyber-warning);
          box-shadow: 0 0 8px var(--cyber-warning);
          animation: pulse-warning 1.5s infinite;
        }
        .status-indicator-dot.danger {
          background-color: var(--cyber-danger);
          box-shadow: 0 0 8px var(--cyber-danger);
        }

        /* Workspace Grid Split */
        .dev-workspace {
          flex-grow: 1;
          display: grid;
          grid-template-columns: 1fr 340px;
          gap: 24px;
          padding: 24px;
          overflow: hidden;
        }
        @media (max-width: 1200px) {
          .dev-workspace {
            grid-template-columns: 1fr;
          }
          .alerts-feed-container {
            display: none !important;
          }
        }
        .dev-workspace-main {
          overflow-y: auto;
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding-right: 4px;
        }

        /* Premium Cyber Cards */
        .cyber-card {
          background: var(--cyber-panel);
          border: 1px solid var(--cyber-border);
          border-radius: 20px;
          padding: 24px;
          box-shadow: 0 20px 45px rgba(0, 0, 0, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.04);
          position: relative;
          overflow: hidden;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .cyber-card:hover {
          border-color: rgba(11, 191, 140, 0.25);
          box-shadow: 0 20px 45px rgba(11, 191, 140, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.05);
        }
        .cyber-card::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 2px;
          background: linear-gradient(90deg, transparent, var(--cyber-accent), transparent);
          opacity: 0.3;
        }
        .cyber-card-title {
          font-family: var(--cyber-font-title);
          font-size: 13px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--cyber-accent);
          margin-bottom: 22px;
          display: flex;
          align-items: center;
          gap: 10px;
          border-bottom: 1px solid rgba(11, 191, 140, 0.08);
          padding-bottom: 12px;
        }

        /* Forms & Inputs */
        .cyber-form {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }
        .cyber-input-group {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .cyber-label {
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--cyber-text-muted);
        }
        .cyber-input {
          background: rgba(2, 6, 8, 0.85);
          border: 1px solid var(--cyber-border);
          color: var(--cyber-text);
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 12.5px;
          transition: all 0.3s;
        }
        .cyber-input:focus {
          outline: none;
          border-color: var(--cyber-accent);
          box-shadow: 0 0 15px var(--cyber-accent-glow);
          background: rgba(2, 6, 8, 0.98);
        }
        select.cyber-input option {
          background: var(--cyber-bg);
          color: var(--cyber-text);
        }

        /* Cyber Buttons */
        .cyber-btn {
          background: linear-gradient(135deg, var(--cyber-accent) 0%, var(--cyber-accent-dim) 100%);
          color: #010506;
          font-weight: 900;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 12px 22px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          border: none;
          box-shadow: 0 4px 15px rgba(11, 191, 140, 0.2);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .cyber-btn:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(11, 191, 140, 0.4);
          filter: brightness(1.1);
        }
        .cyber-btn:active:not(:disabled) {
          transform: translateY(0);
        }
        .cyber-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }
        .cyber-btn-secondary {
          background: rgba(15, 23, 42, 0.4);
          border: 1px solid var(--cyber-border);
          color: var(--cyber-text);
          box-shadow: none;
        }
        .cyber-btn-secondary:hover:not(:disabled) {
          background: rgba(15, 23, 42, 0.7);
          border-color: var(--cyber-accent);
          color: #fff;
          box-shadow: 0 0 15px rgba(11, 191, 140, 0.15);
        }
        .cyber-btn-danger {
          background: rgba(239, 68, 68, 0.08);
          border: 1px solid rgba(239, 68, 68, 0.25);
          color: #f87171;
          box-shadow: none;
        }
        .cyber-btn-danger:hover:not(:disabled) {
          background: var(--cyber-danger);
          color: #fff;
          border-color: var(--cyber-danger);
          box-shadow: 0 0 15px var(--cyber-danger-glow);
        }

        /* Cyber Table styling */
        .cyber-table-container {
          overflow-x: auto;
          border-radius: 12px;
          border: 1px solid rgba(11, 191, 140, 0.08);
          background: rgba(2, 6, 8, 0.4);
        }
        .cyber-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
          font-size: 12px;
        }
        .cyber-table th {
          border-bottom: 2px solid rgba(11, 191, 140, 0.1);
          padding: 14px 18px;
          color: var(--cyber-text-muted);
          font-weight: 800;
          text-transform: uppercase;
          font-size: 9px;
          letter-spacing: 0.08em;
          font-family: var(--cyber-font-title);
          background: rgba(3, 12, 15, 0.3);
        }
        .cyber-table td {
          border-bottom: 1px solid rgba(11, 191, 140, 0.05);
          padding: 14px 18px;
          color: #cbd5e1;
          vertical-align: middle;
        }
        .cyber-table tr:last-child td {
          border-bottom: none;
        }
        .cyber-table tr:hover td {
          background: rgba(11, 191, 140, 0.03);
          color: #fff;
        }

        /* Banner Messages */
        .system-notification {
          padding: 14px 20px;
          border-radius: 12px;
          font-size: 11.5px;
          font-weight: 700;
          display: flex;
          align-items: center;
          gap: 12px;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          animation: slide-down 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          border: 1px solid transparent;
        }
        .system-notification.error {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.25);
          color: #f87171;
        }
        .system-notification.success {
          background: rgba(11, 191, 140, 0.1);
          border-color: rgba(11, 191, 140, 0.25);
          color: var(--cyber-accent);
        }

        /* Right Panel Alerts Stream */
        .alerts-feed-container {
          background: rgba(3, 12, 15, 0.75);
          backdrop-filter: blur(20px);
          border-left: 1px solid var(--cyber-border);
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          padding: 24px;
          box-shadow: -10px 0 30px rgba(0, 0, 0, 0.4);
        }
        .alert-item {
          background: rgba(239, 68, 68, 0.04);
          border: 1px solid rgba(239, 68, 68, 0.15);
          border-left: 3px solid var(--cyber-danger);
          padding: 12px;
          border-radius: 10px;
          font-size: 11px;
          margin-bottom: 12px;
          animation: slide-left 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .alert-item.license {
          background: rgba(245, 158, 11, 0.04);
          border-color: rgba(245, 158, 11, 0.15);
          border-left-color: var(--cyber-warning);
        }
        .alert-item.kick {
          background: rgba(11, 191, 140, 0.04);
          border-color: rgba(11, 191, 140, 0.15);
          border-left-color: var(--cyber-accent);
        }

        /* Modern Badges */
        .badge {
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 3px 8px;
          border-radius: 6px;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-family: var(--cyber-font-title);
          border: 1px solid transparent;
        }
        .badge.accent {
          background: rgba(11, 191, 140, 0.12);
          color: var(--cyber-accent);
          border-color: rgba(11, 191, 140, 0.25);
        }
        .badge.muted {
          background: rgba(87, 120, 132, 0.12);
          color: #94a3b8;
          border-color: rgba(87, 120, 132, 0.2);
        }
        .badge.danger {
          background: rgba(239, 68, 68, 0.1);
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.2);
        }
        .badge.warning {
          background: rgba(245, 158, 11, 0.1);
          color: #fbbf24;
          border-color: rgba(245, 158, 11, 0.2);
        }

        /* Plan SaaS Pricing Cards */
        .plan-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
          gap: 20px;
          margin-top: 16px;
        }
        .plan-card {
          background: rgba(2, 8, 10, 0.65);
          border: 1px solid var(--cyber-border);
          border-radius: 18px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .plan-card:hover {
          border-color: var(--cyber-accent);
          transform: translateY(-4px);
          box-shadow: 0 15px 30px rgba(11, 191, 140, 0.15);
        }
        .plan-card-header {
          border-bottom: 1px solid rgba(11, 191, 140, 0.08);
          padding-bottom: 16px;
          margin-bottom: 16px;
        }
        .plan-card-price {
          font-family: var(--cyber-font-title);
          font-size: 26px;
          font-weight: 900;
          color: var(--cyber-accent);
          display: flex;
          align-items: baseline;
          gap: 4px;
          margin-top: 8px;
        }
        .plan-card-price span {
          font-size: 10px;
          color: var(--cyber-text-muted);
          text-transform: uppercase;
        }

        /* Modules Custom Checks */
        .module-check-card {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(2, 6, 8, 0.4);
          border: 1px solid var(--cyber-border);
          padding: 12px 16px;
          border-radius: 12px;
          font-size: 11.5px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .module-check-card:hover {
          border-color: var(--cyber-accent);
          background: rgba(11, 191, 140, 0.03);
        }
        .module-check-card.checked {
          background: rgba(11, 191, 140, 0.1);
          border-color: var(--cyber-accent);
          color: var(--cyber-accent);
          box-shadow: 0 0 12px rgba(11, 191, 140, 0.08);
        }
        .module-check-dot {
          width: 14px;
          height: 14px;
          border-radius: 4px;
          border: 1.5px solid var(--cyber-text-muted);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.2s;
        }
        .module-check-card.checked .module-check-dot {
          border-color: var(--cyber-accent);
          background-color: var(--cyber-accent);
          color: #010506;
        }

        /* Resource Gauges & Infrastructure checks */
        .resource-gauge-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }
        @media (max-width: 768px) {
          .resource-gauge-grid {
            grid-template-columns: 1fr;
          }
        }
        .resource-progress-box {
          background: rgba(2, 6, 8, 0.4);
          border: 1px solid rgba(11, 191, 140, 0.08);
          border-radius: 14px;
          padding: 20px;
        }
        .service-rack {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 16px;
          margin-top: 16px;
        }
        .service-node {
          background: rgba(2, 6, 8, 0.5);
          border: 1px solid rgba(11, 191, 140, 0.1);
          border-radius: 14px;
          padding: 16px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          transition: all 0.3s;
        }
        .service-node:hover {
          border-color: var(--cyber-accent);
          background: rgba(2, 6, 8, 0.8);
          box-shadow: 0 0 15px rgba(11, 191, 140, 0.05);
        }
        .progress-rack-bar {
          width: 100%;
          height: 8px;
          background: rgba(3, 10, 13, 0.8);
          border-radius: 10px;
          overflow: hidden;
          margin-top: 8px;
          border: 1px solid rgba(255, 255, 255, 0.02);
        }
        .progress-rack-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--cyber-accent-dim) 0%, var(--cyber-accent) 100%);
          border-radius: 10px;
          transition: width 0.6s cubic-bezier(0.1, 0.8, 0.3, 1);
        }
        .progress-rack-fill.warning {
          background: linear-gradient(90deg, var(--cyber-warning) 0%, #fbbf24 100%);
        }
        .progress-rack-fill.danger {
          background: linear-gradient(90deg, var(--cyber-danger) 0%, #f87171 100%);
        }

        /* Terminal Logs Console */
        .terminal-box {
          background: #010406;
          border: 1px solid var(--cyber-border);
          border-radius: 16px;
          padding: 20px;
          font-family: var(--cyber-font-mono);
          font-size: 11.5px;
          color: #a7f3d0;
          box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.9);
          overflow-y: auto;
          max-height: 520px;
          min-height: 380px;
          line-height: 1.6;
        }
        .terminal-log-row {
          padding: 6px 8px;
          border-radius: 4px;
          border-bottom: 1px solid rgba(11, 191, 140, 0.03);
          display: flex;
          align-items: flex-start;
          gap: 10px;
          transition: background 0.2s;
        }
        .terminal-log-row:hover {
          background: rgba(11, 191, 140, 0.04);
        }
        .terminal-log-time {
          color: var(--cyber-text-muted);
          flex-shrink: 0;
        }

        /* User Avatar indicators */
        .user-node-avatar {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: rgba(11, 191, 140, 0.08);
          border: 1px solid rgba(11, 191, 140, 0.25);
          color: var(--cyber-accent);
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--cyber-font-title);
          font-size: 11px;
          font-weight: 800;
        }
      `}</style>

      {/* 1. LEFT SIDEBAR */}
      <aside className="dev-sidebar">
        <div className="dev-sidebar-logo-container">
          <img src="/dev/logorecortado.png" alt="KODA Logo" className="w-full h-auto block object-contain" />
        </div>

        <nav className="dev-sidebar-menu">
          <div
            onClick={() => setActiveTab('sessions')}
            className={`dev-sidebar-link ${activeTab === 'sessions' ? 'active' : ''}`}
          >
            <Activity size={15} />
            <span>Sesiones en Vivo</span>
          </div>

          <div
            onClick={() => setActiveTab('tenants')}
            className={`dev-sidebar-link ${activeTab === 'tenants' ? 'active' : ''}`}
          >
            <Users size={15} />
            <span>Empresas (Tenants)</span>
          </div>

          <div
            onClick={() => setActiveTab('plans')}
            className={`dev-sidebar-link ${activeTab === 'plans' ? 'active' : ''}`}
          >
            <Layers size={15} />
            <span>Gestión de Planes</span>
          </div>

          <div
            onClick={() => setActiveTab('users')}
            className={`dev-sidebar-link ${activeTab === 'users' ? 'active' : ''}`}
          >
            <Database size={15} />
            <span>Cuentas Usuarios</span>
          </div>

          <div
            onClick={() => setActiveTab('resources')}
            className={`dev-sidebar-link ${activeTab === 'resources' ? 'active' : ''}`}
          >
            <Server size={15} />
            <span>Recursos Servidor</span>
          </div>

          <div
            onClick={() => setActiveTab('audit')}
            className={`dev-sidebar-link ${activeTab === 'audit' ? 'active' : ''}`}
          >
            <Terminal size={15} />
            <span>Terminal de Logs</span>
          </div>
        </nav>

        <div className="dev-sidebar-footer">
          <div className="flex items-center gap-3 bg-[#020608] p-3.5 border border-slate-800/40 rounded-xl">
            <div className="w-8 h-8 rounded-lg bg-slate-900 border border-[#0bbf8c]/20 flex items-center justify-center font-bold text-[#0bbf8c] text-[10px] font-mono uppercase">
              {username ? username.substring(0, 2) : 'DV'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-black text-white uppercase tracking-tight leading-none truncate" title={username || "Desarrollador"}>
                {username || "Desarrollador"}
              </p>
              <p className="text-[8px] font-black text-[#577884] uppercase tracking-wider mt-1 truncate" title={tenantName || "Super Admin"}>
                {tenantName ? `🏢 ${tenantName}` : "Super Admin"}
              </p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full py-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 hover:border-rose-500/65 text-rose-400 hover:text-rose-300 rounded-xl text-[10px] font-black uppercase transition-all duration-200 flex items-center justify-center gap-2"
          >
            <LogOut size={12} />
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* 2. MAIN WORKSPACE */}
      <main className="dev-main">
        {/* Top Status Header Bar */}
        <header className="dev-top-bar">
          <div className="dev-top-bar-title">
            {activeTab === 'sessions' && <>Monitoreo de <span>Sesiones Activas</span></>}
            {activeTab === 'tenants' && <>Aprovisionamiento de <span>Empresas</span></>}
            {activeTab === 'plans' && <>Catálogo de <span>Planes SaaS</span></>}
            {activeTab === 'users' && <>Control de <span>Cuentas de Acceso</span></>}
            {activeTab === 'resources' && <>Estatus de <span>Recursos de Hardware</span></>}
            {activeTab === 'audit' && <>Bitácora del <span>Abuse Shield</span></>}
          </div>

          <div className="dev-status-grid">
            <button
              onClick={() => { fetchTenants(); fetchSecurityEvents(); fetchUsers(); fetchPlans(); }}
              className="p-2.5 bg-[#030c0f] border border-[#0bbf8c]/12 text-slate-400 hover:text-[#0bbf8c] hover:border-[#0bbf8c] hover:shadow-[0_0_12px_rgba(11,191,140,0.15)] rounded-xl transition-all flex items-center justify-center"
              title="Sincronizar datos REST"
            >
              <RefreshCcw size={13} />
            </button>

            <div className={`status-pill ws-${wsStatus}`}>
              <div className={`status-indicator-dot ${
                wsStatus === 'connected' ? 'active' :
                wsStatus === 'connecting' ? 'warning' : 'danger'
              }`} />
              <span>
                {wsStatus === 'connected' && 'Real-time online'}
                {wsStatus === 'connecting' && 'Conectando...'}
                {wsStatus === 'disconnected' && 'Offline'}
              </span>
            </div>
          </div>
        </header>

        {/* Workspace Layout Split */}
        <div className="dev-workspace">

          {/* Main workspace scrolling panel */}
          <div className="dev-workspace-main">
            {error && (
              <div className="system-notification error">
                <AlertCircle size={14} className="shrink-0" />
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="system-notification success">
                <CheckCircle size={14} className="shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {/* TAB 1: SESSIONS VIEW */}
            {activeTab === 'sessions' && (
              <div className="cyber-card">
                <h3 className="cyber-card-title">
                  <Activity size={18} />
                  <span>Usuarios Conectados en Vivo</span>
                </h3>

                <div className="cyber-table-container">
                  <table className="cyber-table">
                    <thead>
                      <tr>
                        <th>Identificador</th>
                        <th>Nombre Usuario</th>
                        <th>Dirección IP</th>
                        <th>Herramienta</th>
                        <th>Dispositivo</th>
                        <th>Ingreso</th>
                        <th className="text-right">Kill Switch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sessions.length > 0 ? (
                        sessions.map((session: ActiveSession) => (
                          <tr key={session.session_id}>
                            <td>
                              <span className="badge accent font-mono">{session.tenant_id.substring(0, 8)}...</span>
                            </td>
                            <td>
                              <div className="flex items-center gap-2">
                                <div className="user-node-avatar">{session.username.substring(0, 2).toUpperCase()}</div>
                                <span className="font-bold text-[#e2e8f0]">{session.username}</span>
                              </div>
                            </td>
                            <td>
                              <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#94a3b8]">
                                <Globe size={11} />
                                {session.ip}
                              </div>
                            </td>
                            <td>
                              <span className="badge muted">
                                {session.modulo}
                              </span>
                            </td>
                            <td>{session.device}</td>
                            <td className="font-mono text-[11px] text-slate-400">
                              {new Date(session.connected_at).toLocaleTimeString()}
                            </td>
                            <td className="text-right">
                              <button
                                onClick={() => handleDisconnect(session.session_id)}
                                disabled={isDisconnecting === session.session_id}
                                className="cyber-btn cyber-btn-danger py-1 px-3 text-[9px] font-black rounded-lg"
                              >
                                {isDisconnecting === session.session_id ? 'Ejecutando...' : 'Desconectar'}
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="text-center py-16 text-slate-500 uppercase tracking-widest text-[10px] font-bold">
                            No hay sesiones de usuarios activas en este momento
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 2: TENANTS PROVISIONING */}
            {activeTab === 'tenants' && (
              <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">

                {/* Form Col: 2/5 */}
                <div className="cyber-card xl:col-span-2">
                  <h3 className="cyber-card-title">
                    <PlusCircle size={18} />
                    <span>Registrar Empresa</span>
                  </h3>

                  <form onSubmit={handleCreateTenant} className="cyber-form">
                    <div className="cyber-input-group">
                      <label className="cyber-label">Nombre de la Empresa</label>
                      <input
                        type="text"
                        required
                        className="cyber-input"
                        placeholder="Ej. Koda Corporación S.A."
                        value={newTenantName}
                        onChange={(e) => setNewTenantName(e.target.value)}
                      />
                    </div>

                    <div className="cyber-input-group">
                      <label className="cyber-label">Plan de Suscripción</label>
                      <select
                        className="cyber-input"
                        value={selectedPlanId}
                        onChange={(e) => setSelectedPlanId(e.target.value === 'custom' ? 'custom' : parseInt(e.target.value))}
                      >
                        <option value="custom">Personalizado (Límites Manuales)</option>
                        {plans.map(p => (
                          <option key={p.id} value={p.id}>{p.name} - ${p.price} ({p.max_users} Usuarios)</option>
                        ))}
                      </select>
                    </div>

                    {selectedPlanId === 'custom' && (
                      <>
                        <div className="cyber-input-group">
                          <label className="cyber-label">Max. Usuarios Concurrentes</label>
                          <input
                            type="number"
                            min="1"
                            className="cyber-input"
                            value={maxUsers}
                            onChange={(e) => setMaxUsers(parseInt(e.target.value) || 12)}
                          />
                        </div>

                        <div className="cyber-input-group">
                          <label className="cyber-label">Módulos ERP Habilitados</label>
                          <div className="space-y-2 mt-2">
                            {AVAILABLE_MODULES.map((mod) => (
                              <div
                                key={mod.id}
                                onClick={() => handleModuleToggle(mod.id)}
                                className={`module-check-card ${selectedModules.includes(mod.id) ? 'checked' : ''}`}
                              >
                                <div className="module-check-dot">
                                  {selectedModules.includes(mod.id) && <Check size={10} strokeWidth={3} />}
                                </div>
                                <span className="font-bold uppercase tracking-tight text-[10px]">{mod.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    )}

                    <button
                      type="submit"
                      disabled={isSubmittingTenant}
                      className="cyber-btn w-full mt-4"
                    >
                      {isSubmittingTenant ? 'Provisionando...' : 'Aprovisionar Empresa'}
                    </button>
                  </form>
                </div>

                {/* List Col: 3/5 */}
                <div className="cyber-card xl:col-span-3">
                  <h3 className="cyber-card-title">
                    <Users size={18} />
                    <span>Empresas Registradas</span>
                  </h3>

                  <div className="space-y-4 max-h-[560px] overflow-y-auto pr-1">
                    {tenants.length > 0 ? (
                      tenants.map((t: Tenant) => (
                        <div key={t.id} className="p-4 rounded-xl border border-slate-800/60 bg-[#03090b]/40 space-y-3 transition-colors hover:border-[#0bbf8c]/30">
                          {editingTenantId === t.id ? (
                            <div className="space-y-4">
                              <div className="cyber-input-group">
                                <label className="cyber-label">Nombre de la Empresa</label>
                                <input
                                  type="text"
                                  className="cyber-input"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                />
                              </div>
                              <div className="cyber-input-group">
                                <label className="cyber-label">Máx. Licencias (Usuarios)</label>
                                <input
                                  type="number"
                                  className="cyber-input"
                                  value={editingMaxUsers}
                                  onChange={(e) => setEditingMaxUsers(parseInt(e.target.value) || 1)}
                                />
                              </div>
                              <div className="cyber-input-group">
                                <label className="cyber-label">Módulos ERP Habilitados</label>
                                <div className="flex flex-wrap gap-1.5 mt-1">
                                  {AVAILABLE_MODULES.map((mod) => (
                                    <button
                                      key={mod.id}
                                      type="button"
                                      onClick={() => handleEditingModuleToggle(mod.id)}
                                      className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${
                                        editingAllowedModules.includes(mod.id)
                                          ? 'bg-[#0bbf8c]/10 border-[#0bbf8c] text-[#0bbf8c]'
                                          : 'bg-[#020608] border-slate-700 text-slate-400 hover:border-slate-600'
                                      }`}
                                    >
                                      {mod.label.replace('Ventas, ', '').split(' ')[0]}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800/50">
                                <button
                                  type="button"
                                  onClick={cancelEditing}
                                  className="cyber-btn cyber-btn-secondary py-1 px-3 text-[9px] font-bold"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateTenant(t.id)}
                                  disabled={isUpdatingTenant}
                                  className="cyber-btn py-1 px-3 text-[9px] font-bold"
                                >
                                  {isUpdatingTenant ? 'Guardando...' : 'Guardar'}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-extrabold text-[#e2e8f0] uppercase tracking-tight text-sm">{t.nombre}</h4>
                                  <span className="badge muted font-mono mt-1 text-[8px]">{t.id}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() => startEditing(t)}
                                    className="p-1.5 bg-slate-900 border border-slate-800 hover:border-cyan-500/40 text-slate-300 hover:text-cyan-400 rounded-lg transition"
                                    title="Editar Empresa"
                                  >
                                    <Edit3 size={11} />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTenant(t.id, t.nombre)}
                                    className="p-1.5 bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-slate-300 hover:text-rose-400 rounded-lg transition"
                                    title="Eliminar Empresa"
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 text-[10px] text-slate-400 font-bold uppercase pt-1 border-t border-slate-800/20">
                                <div>Licencias: <strong className="text-white font-extrabold ml-1">{t.max_users}</strong></div>
                                {t.plan_name && <div>Plan: <span className="text-emerald-400 font-extrabold ml-1">{t.plan_name}</span></div>}
                              </div>

                              <div className="flex flex-wrap gap-1 mt-1">
                                {t.allowed_modules.includes('all') ? (
                                  <span className="px-1.5 py-0.5 bg-[#0bbf8c]/10 text-[#0bbf8c] rounded text-[8px] uppercase font-bold border border-[#0bbf8c]/20">Suite Completa</span>
                                ) : (
                                  t.allowed_modules.map((m: string) => (
                                    <span key={m} className="bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase border border-slate-800">
                                      {m}
                                    </span>
                                  ))
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-600 font-bold text-center text-xs uppercase py-12">No hay empresas registradas</p>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* TAB 3: SUBSCRIPTION PLANS */}
            {activeTab === 'plans' && (
              <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">

                {/* Creator Form: 2/5 */}
                <div className="cyber-card xl:col-span-2">
                  <h3 className="cyber-card-title">
                    <PlusCircle size={18} />
                    <span>{editingPlanId ? 'Editar Plan SaaS' : 'Nuevo Plan SaaS'}</span>
                  </h3>

                  <form onSubmit={submitPlan} className="cyber-form">
                    <div className="cyber-input-group">
                      <label className="cyber-label">Nombre del Plan</label>
                      <input
                        type="text"
                        required
                        className="cyber-input"
                        value={planName}
                        onChange={e => setPlanName(e.target.value)}
                        placeholder="Ej. Plan Pro"
                      />
                    </div>

                    <div className="cyber-input-group">
                      <label className="cyber-label">Usuarios Máximos</label>
                      <input
                        type="number"
                        required
                        min="1"
                        className="cyber-input"
                        value={planMaxUsers}
                        onChange={e => setPlanMaxUsers(parseInt(e.target.value) || 1)}
                      />
                    </div>
                    
                    <div className="cyber-input-group">
                      <label className="cyber-label">Precio Mensual ($)</label>
                      <input
                        type="number"
                        required
                        step="0.01"
                        min="0"
                        className="cyber-input"
                        value={planPrice}
                        onChange={e => setPlanPrice(parseFloat(e.target.value) || 0)}
                      />
                    </div>

                    <div className="cyber-input-group">
                      <label className="cyber-label">Orden (0 = destacado)</label>
                      <input
                        type="number"
                        required
                        min="0"
                        className="cyber-input"
                        value={planSortOrder}
                        onChange={e => setPlanSortOrder(parseInt(e.target.value) || 0)}
                      />
                    </div>
                    
                    <div className="cyber-input-group">
                      <label className="cyber-label">Imagen / Banner del Plan</label>
                      <input
                        id="plan-image-upload"
                        type="file"
                        accept="image/*"
                        className="cyber-input"
                        style={{ padding: '0.5rem', fontSize: '0.8rem', cursor: 'pointer', lineHeight: '1.5' }}
                        onChange={e => setPlanImage(e.target.files ? e.target.files[0] : null)}
                      />
                    </div>
                    
                    <div className="cyber-input-group">
                      <label className="cyber-label">Características (una por línea)</label>
                      <textarea
                        className="cyber-input resize-none h-24"
                        placeholder="Ej. Soporte 24/7\nFacturación Ilimitada\nInventario Avanzado"
                        value={planFeatures}
                        onChange={e => setPlanFeatures(e.target.value)}
                      />
                    </div>

                    <div className="cyber-input-group">
                      <label className="cyber-label">Módulos ERP Incluidos</label>
                      <div className="space-y-2 mt-2">
                        {AVAILABLE_MODULES.map((mod) => (
                          <div
                            key={mod.id}
                            onClick={() => {
                              if (mod.id === 'all') {
                                setPlanAllowedModules(['all']);
                              } else {
                                setPlanAllowedModules(prev => {
                                  const withoutAll = prev.filter(m => m !== 'all');
                                  if (withoutAll.includes(mod.id)) {
                                    const next = withoutAll.filter(m => m !== mod.id);
                                    return next.length === 0 ? ['all'] : next;
                                  } else {
                                    return [...withoutAll, mod.id];
                                  }
                                });
                              }
                            }}
                            className={`module-check-card ${planAllowedModules.includes(mod.id) ? 'checked' : ''}`}
                          >
                            <div className="module-check-dot">
                              {planAllowedModules.includes(mod.id) && <Check size={10} strokeWidth={3} />}
                            </div>
                            <span className="font-bold uppercase tracking-tight text-[10px]">{mod.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2.5 mt-4">
                      {editingPlanId && (
                        <button
                          type="button"
                          onClick={handleCancelEditPlan}
                          className="cyber-btn cyber-btn-secondary w-1/3"
                        >
                          Cancelar
                        </button>
                      )}
                      <button
                        type="submit"
                        disabled={isSubmittingPlan}
                        className={`cyber-btn ${editingPlanId ? 'w-2/3' : 'w-full'}`}
                      >
                        {isSubmittingPlan ? 'Guardando...' : (editingPlanId ? 'Actualizar Plan' : 'Crear Plan')}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Catalog Grid: 3/5 */}
                <div className="cyber-card xl:col-span-3">
                  <h3 className="cyber-card-title">
                    <Layers size={18} />
                    <span>Planes de Suscripción Activos</span>
                  </h3>

                  <div className="plan-grid">
                    {plans.length > 0 ? (
                      plans.map(p => (
                        <div key={p.id} className="plan-card">
                          <div>
                            <div className="plan-card-header flex justify-between items-start">
                              <div>
                                <h4 className="text-white font-extrabold text-sm uppercase tracking-tight">{p.name}</h4>
                                <div className="plan-card-price">${p.price}<span>/mes</span></div>
                              </div>
                              {p.image_url && (
                                <img src={`/api${p.image_url}`} alt={p.name} className="w-12 h-12 object-cover rounded-xl border border-[#0bbf8c]/30" />
                              )}
                            </div>

                            <div className="space-y-2 mb-6 text-[10px] text-slate-400 font-bold uppercase">
                              <div className="flex justify-between">
                                <span>Usuarios:</span>
                                <span className="text-white font-black">{p.max_users}</span>
                              </div>
                              <div className="pt-2 border-t border-slate-800/40">
                                <span className="block mb-1">Módulos:</span>
                                <div className="flex flex-wrap gap-1">
                                  {p.allowed_modules.includes('all') ? (
                                    <span className="px-1.5 py-0.5 bg-[#0bbf8c]/10 text-[#0bbf8c] rounded text-[8px] font-black uppercase">Suite Completa</span>
                                  ) : (
                                    p.allowed_modules.map(m => (
                                      <span key={m} className="bg-slate-900 border border-slate-800 text-slate-300 px-1.5 py-0.5 rounded text-[8px] font-black uppercase">{m}</span>
                                    ))
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex gap-2 pt-3 border-t border-slate-850">
                            <button
                              onClick={() => handleEditPlan(p)}
                              className="cyber-btn cyber-btn-secondary flex-grow py-1.5 text-[9px] font-bold"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() => deletePlan(p.id)}
                              className="cyber-btn cyber-btn-danger py-1.5 px-3 text-[9px] font-bold"
                            >
                              Eliminar
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="col-span-full text-center py-16 text-slate-600 font-bold text-xs uppercase">No hay planes registrados</div>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* TAB 4: COMPANY USERS */}
            {activeTab === 'users' && (
              <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">

                {/* Form Card: 2/5 */}
                <div className="cyber-card xl:col-span-2">
                  <h3 className="cyber-card-title">
                    <PlusCircle size={18} />
                    <span>Crear Usuario Administrativo</span>
                  </h3>

                  <form onSubmit={handleCreateUser} className="cyber-form">
                    <div className="cyber-input-group">
                      <label className="cyber-label">
                        Empresa Asociada (Tenant) {newRolId !== 4 ? '*' : '(Opcional para Desarrolladores)'}
                      </label>
                      <select
                        required={newRolId !== 4}
                        className="cyber-input"
                        value={newTenantId}
                        onChange={(e) => setNewTenantId(e.target.value)}
                      >
                        <option value="">Seleccione una Empresa...</option>
                        {tenants.map((t) => (
                          <option key={t.id} value={t.id}>{t.nombre}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="cyber-input-group">
                        <label className="cyber-label">Nombre</label>
                        <input
                          type="text"
                          className="cyber-input"
                          placeholder="Juan"
                          value={newNombre}
                          onChange={(e) => setNewNombre(e.target.value)}
                        />
                      </div>
                      <div className="cyber-input-group">
                        <label className="cyber-label">Apellido</label>
                        <input
                          type="text"
                          className="cyber-input"
                          placeholder="Perez"
                          value={newApellido}
                          onChange={(e) => setNewApellido(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="cyber-input-group">
                      <label className="cyber-label">Username (Usuario) *</label>
                      <input
                        type="text"
                        required
                        className="cyber-input"
                        placeholder="jperez"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                      />
                    </div>

                    <div className="cyber-input-group">
                      <label className="cyber-label">Email (Correo) *</label>
                      <input
                        type="email"
                        required
                        className="cyber-input"
                        placeholder="juan.perez@empresa.com"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                      />
                    </div>

                    <div className="cyber-input-group">
                      <label className="cyber-label">Contraseña *</label>
                      <div className="relative flex items-center">
                        <input
                          type={showNewPassword ? "text" : "password"}
                          required
                          className="cyber-input pr-10 w-full"
                          placeholder="Min. 8 caracteres"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewPassword(!showNewPassword)}
                          className="absolute right-3 text-slate-400 hover:text-white transition-colors flex items-center justify-center bg-transparent border-none p-0 cursor-pointer"
                          title={showNewPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                        >
                          {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    <div className="cyber-input-group">
                      <label className="cyber-label">Rol y Permisos *</label>
                      <select
                        className="cyber-input"
                        value={newRolId}
                        onChange={(e) => setNewRolId(parseInt(e.target.value) || 3)}
                      >
                        <option value="1">CEO / Director General</option>
                        <option value="5">Gerente de Departamento</option>
                        <option value="2">Administrativo (Ventas/Contabilidad)</option>
                        <option value="3">Usuario Estándar / Operativo</option>
                        <option value="4">Desarrollador / Super Admin</option>
                      </select>
                    </div>

                    <button
                      type="submit"
                      disabled={isSubmittingUser}
                      className="cyber-btn w-full mt-4"
                    >
                      {isSubmittingUser ? 'Creando...' : 'Crear Usuario'}
                    </button>
                  </form>
                </div>

                {/* Directory Card: 3/5 */}
                <div className="cyber-card xl:col-span-3">
                  <h3 className="cyber-card-title">
                    <Users size={18} />
                    <span>Directorio de Cuentas Provisionadas</span>
                  </h3>

                  <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
                    {users.length > 0 ? (
                      users.map((u: UserProfile) => (
                        <div key={u.id} className="p-4 rounded-xl border border-slate-800/60 bg-[#03090b]/40 flex justify-between items-center transition-colors hover:border-[#0bbf8c]/20">
                          <div>
                            <h4 className="font-extrabold text-[#e2e8f0] uppercase tracking-tight text-sm">{u.username}</h4>
                            <p className="text-[10px] text-slate-400 font-semibold">{u.nombre} {u.apellido} | {u.email}</p>
                            <p className="text-[9px] text-[#577884] font-bold uppercase mt-1">Tenant: <strong className="text-slate-300 font-black">{u.tenant_nombre}</strong></p>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className={`badge ${
                              u.rol_id === 1 ? 'warning' :
                              u.rol_id === 4 ? 'accent' :
                              'muted'
                            }`}>
                              {u.role}
                            </span>
                            <button
                              onClick={() => handleDeleteUser(u.id, u.username)}
                              className="p-1.5 bg-slate-900 border border-slate-800 hover:border-rose-500/40 text-slate-300 hover:text-rose-400 rounded-lg transition"
                              title="Eliminar Usuario"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-slate-600 font-bold text-center text-xs uppercase py-16">No hay usuarios registrados</p>
                    )}
                  </div>
                </div>

              </div>
            )}

            {/* TAB 5: SYSTEM RESOURCES MONITOR */}
            {activeTab === 'resources' && (
              <div className="space-y-6">

                {/* Circular Gauges Box */}
                <div className="cyber-card">
                  <h3 className="cyber-card-title">
                    <Server size={18} />
                    <span>Monitoreo de Recursos de Hardware (Docker Environment)</span>
                  </h3>

                  {resources ? (
                      <div className="resource-gauge-grid">
                      {/* CPU Circle Percent & Load */}
                      <div className="resource-gauge-container">
                        <div className="resource-gauge-circle">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            {/* Track */}
                            <circle cx="50" cy="50" r="40" stroke="rgba(11, 191, 140, 0.08)" strokeWidth="6" fill="transparent" />
                            {/* Value */}
                            <circle
                              cx="50"
                              cy="50"
                              r="40"
                              stroke={resources.system.cpu_percent > 80 ? 'var(--cyber-danger)' : 'var(--cyber-accent)'}
                              strokeWidth="7"
                              fill="transparent"
                              strokeDasharray={`${2 * Math.PI * 40}`}
                              strokeDashoffset={`${2 * Math.PI * 40 * (1 - resources.system.cpu_percent / 100)}`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="resource-gauge-value text-[#fff]">
                            {resources.system.cpu_percent.toFixed(0)}%
                          </div>
                        </div>
                        <div className="resource-gauge-label">CPU (Load avg 1m: {resources.system.cpu_load.toFixed(2)})</div>
                      </div>

                      {/* RAM usage percent circle */}
                      <div className="resource-gauge-container">
                        <div className="resource-gauge-circle">
                          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            {/* Track */}
                            <circle cx="50" cy="50" r="40" stroke="rgba(11, 191, 140, 0.08)" strokeWidth="6" fill="transparent" />
                            {/* Value */}
                            <circle
                              cx="50"
                              cy="50"
                              r="40"
                              stroke={resources.system.memory_used_percent > 80 ? 'var(--cyber-danger)' : 'var(--cyber-accent)'}
                              strokeWidth="7"
                              fill="transparent"
                              strokeDasharray={`${2 * Math.PI * 40}`}
                              strokeDashoffset={`${2 * Math.PI * 40 * (1 - resources.system.memory_used_percent / 100)}`}
                              strokeLinecap="round"
                            />
                          </svg>
                          <div className="resource-gauge-value text-[#fff]">
                            {resources.system.memory_used_percent.toFixed(0)}%
                          </div>
                        </div>
                        <div className="resource-gauge-label">RAM ({resources.system.memory_used_mb.toFixed(0)}MB / {resources.system.memory_total_mb.toFixed(0)}MB)</div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-16 text-center text-slate-500 font-bold text-xs uppercase animate-pulse">Consultando estado de hardware...</div>
                  )}
                </div>

                {/* Infrastructure health status */}
                <div className="cyber-card">
                  <h3 className="cyber-card-title">
                    <Database size={18} />
                    <span>Microservicios y Conectividad Remaster</span>
                  </h3>

                  <div className="service-rack">
                    {/* Database Check */}
                    <div className="service-node">
                      <div>
                        <h4 className="text-[11px] font-black text-white uppercase tracking-wider">Base de Datos</h4>
                        <p className="text-[8px] text-[#577884] font-bold uppercase mt-0.5">PostgreSQL Supabase</p>
                      </div>
                      <div className={`status-indicator-dot ${resources?.services.database ? 'active' : 'danger'}`} />
                    </div>

                    {/* Redis Cache */}
                    <div className="service-node">
                      <div>
                        <h4 className="text-[11px] font-black text-white uppercase tracking-wider">Redis Cache</h4>
                        <p className="text-[8px] text-[#577884] font-bold uppercase mt-0.5">Caché en Memoria</p>
                      </div>
                      <div className={`status-indicator-dot ${resources?.services.redis ? 'active' : 'danger'}`} />
                    </div>

                    {/* IA Ollama */}
                    <div className="service-node">
                      <div>
                        <h4 className="text-[11px] font-black text-white uppercase tracking-wider">IA Ollama</h4>
                        <p className="text-[8px] text-[#577884] font-bold uppercase mt-0.5">Qwen2.5 Local</p>
                      </div>
                      <div className={`status-indicator-dot ${resources?.services.ollama ? 'active' : 'danger'}`} />
                    </div>

                    {/* Loki Log Bunker */}
                    <div className="service-node">
                      <div>
                        <h4 className="text-[11px] font-black text-white uppercase tracking-wider">Loki WORM</h4>
                        <p className="text-[8px] text-[#577884] font-bold uppercase mt-0.5">Bitácoras Loki</p>
                      </div>
                      <div className="status-indicator-dot active" />
                    </div>

                    {/* Vector Collector */}
                    <div className="service-node">
                      <div>
                        <h4 className="text-[11px] font-black text-white uppercase tracking-wider">Vector agent</h4>
                        <p className="text-[8px] text-[#577884] font-bold uppercase mt-0.5">Logs Collector</p>
                      </div>
                      <div className="status-indicator-dot active" />
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* TAB 6: TERMINAL LOGS */}
            {activeTab === 'audit' && (
              <div className="cyber-card">
                <div className="flex justify-between items-center mb-5 border-b border-[#0bbf8c]/08 pb-4">
                  <h3 className="cyber-card-title !mb-0 !border-none !pb-0">
                    <Terminal size={18} />
                    <span>Consola de Auditoría del Shield de Prevención</span>
                  </h3>

                  <button
                    onClick={fetchSecurityEvents}
                    className="cyber-btn cyber-btn-secondary py-1.5 px-3 text-[9px] font-bold flex items-center gap-1.5"
                  >
                    <RefreshCw size={11} />
                    Recargar Terminal
                  </button>
                </div>

                <div className="terminal-box">
                  {securityEvents.length > 0 ? (
                    securityEvents.map((evt: SecurityEvent) => {
                      let levelClass = "badge muted";
                      if (evt.evento.includes("duplicidad") || evt.evento.includes("licencia")) levelClass = "badge warning";
                      else if (evt.evento.includes("bloqueado") || evt.evento.includes("abuso")) levelClass = "badge danger";

                      return (
                        <div key={evt.id} className="terminal-log-row">
                          <span className="terminal-log-time font-mono">{new Date(evt.created_at).toLocaleTimeString()}</span>
                          <span className="badge muted font-mono">{evt.tenant_id ? evt.tenant_id.substring(0, 8) : 'sys'}</span>
                          <span className="font-extrabold text-[#e2e8f0] uppercase">{evt.username}</span>
                          <span className={levelClass}>{evt.evento}</span>
                          <span className="text-emerald-300 font-semibold">{evt.detalles}</span>
                          <span className="font-mono text-[#577884]">{evt.ip_address || '127.0.0.1'}</span>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-20 text-slate-500 uppercase tracking-widest text-[10px] font-bold font-mono">
                      No se han registrado eventos en la bitácora
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* Right Panel Alert Stream (WebSocket feed) */}
          <aside className="alerts-feed-container cyber-card">
            <div>
              <h3 className="cyber-card-title">
                <Network className="text-rose-500 animate-pulse" size={17} />
                <span>Alertas en Vivo (WebSocket)</span>
              </h3>

              <div className="space-y-3 overflow-y-auto max-h-[500px] pr-1">
                {alerts.length > 0 ? (
                  alerts.map((alert: AlertData, i: number) => {
                    let alertClass = "kick";
                    if (alert.event_type.includes("duplicidad")) alertClass = "duplicate";
                    else if (alert.event_type.includes("licencia")) alertClass = "license";

                    return (
                      <div key={i} className={`alert-item ${alertClass}`}>
                        <div className="flex justify-between items-start mb-1.5">
                          <strong className="uppercase text-[9px] tracking-wide font-black">
                            {alert.event_type.replace(/_/g, ' ')}
                          </strong>
                          <span className="text-[8px] opacity-60 font-mono">
                            {new Date(alert.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="font-semibold mb-1 text-slate-100">{alert.message}</p>
                        {alert.details && (
                          <div className="bg-black/35 p-1.5 rounded-lg font-mono text-[9px] opacity-70 leading-normal text-slate-300 border border-slate-900">
                            U: {alert.details.username} | Mod: {alert.details.modulo}
                            <br />
                            IP: {alert.details.ip}
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-24 text-slate-600 space-y-4">
                    <Terminal size={28} className="mx-auto opacity-30 animate-pulse" />
                    <p className="text-[9px] font-black uppercase tracking-widest leading-relaxed">
                      Escuchando eventos de red <br />en tiempo real...
                    </p>
                  </div>
                )}
              </div>
            </div>
          </aside>

        </div>
      </main>
    </div>
  );
};

export default DevAdminDashboard;
