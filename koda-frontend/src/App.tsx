import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { useState, useEffect, lazy, Suspense } from 'react';
import MainLayout from '@/layouts/MainLayout';
import { AuthProvider, useAuth } from '@/providers/AuthProvider';
import { SecurityProtector } from '@/components/common/SecurityProtector';
import Login from '@/pages/Auth/Login';
import MainDashboard from '@/pages/Dashboard/MainDashboard';
import {
  ArrowUpRight,
  ArrowDownRight,
  ShieldAlert,
  RefreshCw,
  LogOut,
  CheckCircle,
  AlertTriangle,
  X,
  Zap
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { api } from '@/api/client';
import { Toast } from '@/components/common/Toast';
import { SystemProvider, useSystem } from '@/providers/SystemProvider';

// ── Lazy-loaded pages (code splitting: solo se cargan al navegar) ────────────
const PayrollDashboard        = lazy(() => import('./pages/Payroll/PayrollDashboard'));
const AuditorLedger           = lazy(() => import('./pages/Auditor/AuditorLedger'));
const SalesDashboard          = lazy(() => import('./pages/Sales/SalesDashboard'));
const Quotations              = lazy(() => import('./pages/Sales/Quotations'));
const SalesOrders             = lazy(() => import('./pages/Sales/SalesOrders'));
const DeliveryNotes           = lazy(() => import('./pages/Sales/DeliveryNotes'));
const PriceLists              = lazy(() => import('./pages/Sales/PriceLists'));
const BillingDashboard        = lazy(() => import('./pages/Billing/BillingDashboard'));
const InvoiceForm             = lazy(() => import('./pages/Billing/InvoiceForm'));
const NuevaFactura            = lazy(() => import('./pages/Facturacion/NuevaFactura'));
const Customers               = lazy(() => import('./pages/Billing/Customers'));
const POS                     = lazy(() => import('./pages/Billing/POS'));
const CreditNotes             = lazy(() => import('./pages/Billing/CreditNotes'));
const PurchasingDashboard     = lazy(() => import('./pages/Purchasing/PurchasingDashboard'));
const Suppliers               = lazy(() => import('./pages/Purchasing/Suppliers'));
const PurchaseOrders          = lazy(() => import('./pages/Purchasing/PurchaseOrders'));
const NewPurchaseOrder        = lazy(() => import('./pages/Purchasing/NewPurchaseOrder'));
const CostProject             = lazy(() => import('./pages/Purchasing/CostProject'));
const SupplierInvoices        = lazy(() => import('./pages/Purchasing/SupplierInvoices'));
const Requisitions            = lazy(() => import('./pages/Purchasing/Requisitions'));
const NewRequisition          = lazy(() => import('./pages/Purchasing/NewRequisition'));
const Approvals               = lazy(() => import('./pages/Purchasing/Approvals'));
const StockReception          = lazy(() => import('./pages/Purchasing/StockReception'));
const Returns                 = lazy(() => import('./pages/Purchasing/Returns'));
const PurchasingHistory       = lazy(() => import('./pages/Purchasing/PurchasingHistory'));
const InventoryDashboard      = lazy(() => import('./pages/Inventory/InventoryDashboard'));
const Products                = lazy(() => import('./pages/Inventory/Products'));
const Kardex                  = lazy(() => import('./pages/Inventory/Kardex'));
const InventoryAdjustments    = lazy(() => import('./pages/Inventory/InventoryAdjustments'));
const InventoryExists         = lazy(() => import('./pages/Inventory/InventoryExists'));
const InventoryWarehouses     = lazy(() => import('./pages/Inventory/InventoryWarehouses'));
const InventoryTransfer       = lazy(() => import('./pages/Inventory/InventoryTransfer'));
const StockInventory          = lazy(() => import('./pages/Inventory/StockInventory'));
const InventoryCritical       = lazy(() => import('./pages/Inventory/InventoryCritical'));
const LotExpiry               = lazy(() => import('./pages/Inventory/LotExpiry'));
// LOGÍSTICA
const Logistics               = lazy(() => import('./pages/Logistics/Logistics'));
const FleetVehicles           = lazy(() => import('./pages/Logistics/FleetVehicles'));
const FleetDrivers            = lazy(() => import('./pages/Logistics/FleetDrivers'));
const FleetMaintenance        = lazy(() => import('./pages/Logistics/FleetMaintenance'));
const GanttPlanning           = lazy(() => import('./pages/Logistics/GanttPlanning'));
const PersonnelEngine         = lazy(() => import('./pages/Logistics/PersonnelEngine'));
const CollectionsDashboard    = lazy(() => import('./pages/Collections/CollectionsDashboard'));
const AccountsReceivable      = lazy(() => import('./pages/Collections/AccountsReceivable'));
const PaymentApplication      = lazy(() => import('./pages/Collections/PaymentApplication'));
const AgingAnalysis           = lazy(() => import('./pages/Collections/AgingAnalysis'));
const CustomerStatement       = lazy(() => import('./pages/Collections/CustomerStatement'));
const ProjectedCashFlow       = lazy(() => import('./pages/Collections/ProjectedCashFlow'));
const CustomerAdvances        = lazy(() => import('./pages/Collections/CustomerAdvances'));
const PaymentsDashboard       = lazy(() => import('./pages/Payments/PaymentsDashboard'));
const PaymentOrders           = lazy(() => import('./pages/Payments/PaymentOrders'));
const PaymentBatches          = lazy(() => import('./pages/Payments/PaymentBatches'));
const PaymentScheduling       = lazy(() => import('./pages/Payments/PaymentScheduling'));
const PaymentVoucher          = lazy(() => import('./pages/Payments/PaymentVoucher'));
const AccountsPayable         = lazy(() => import('./pages/Payments/AccountsPayable'));
const TreasuryDashboard       = lazy(() => import('./pages/Treasury/TreasuryDashboard'));
const BankAccounts            = lazy(() => import('./pages/Treasury/BankAccounts'));
const ExchangeRates           = lazy(() => import('./pages/Treasury/ExchangeRates'));
const InternalTransfers       = lazy(() => import('./pages/Treasury/InternalTransfers'));
const BankMovements           = lazy(() => import('./pages/Treasury/BankMovements'));
const BankReconciliation      = lazy(() => import('./pages/Treasury/BankReconciliation'));
const PettyCash               = lazy(() => import('./pages/Treasury/PettyCash'));
const CashAudit               = lazy(() => import('./pages/Treasury/CashAudit'));
const CashMovements           = lazy(() => import('./pages/Treasury/CashMovements'));
const CashFlowTreasury        = lazy(() => import('./pages/Treasury/CashFlowTreasury'));
const LoansUVC                = lazy(() => import('./pages/Treasury/LoansUVC'));
const BudgetVariance          = lazy(() => import('./pages/Treasury/BudgetVariance'));
const InvestmentYield         = lazy(() => import('./pages/Treasury/InvestmentYield'));
const ShiftIntegrity          = lazy(() => import('./pages/Treasury/ShiftIntegrity'));
const ImportStatement         = lazy(() => import('./pages/Treasury/ImportStatement'));
const FiscalDashboard         = lazy(() => import('./pages/Fiscal/FiscalDashboard'));
const FiscalBookReport        = lazy(() => import('./pages/Reports/FiscalBookReport'));
const SalesBook               = lazy(() => import('./pages/Fiscal/SalesBook'));
const PurchasesBook           = lazy(() => import('./pages/Fiscal/PurchasesBook'));
const IVADeclaration          = lazy(() => import('./pages/Fiscal/IVADeclaration'));
const IVARetentions           = lazy(() => import('./pages/Fiscal/IVARetentions'));
const ISLRRetentions          = lazy(() => import('./pages/Fiscal/ISLRRetentions'));
const IGTF                    = lazy(() => import('./pages/Fiscal/IGTF'));
const FiscalCalendar          = lazy(() => import('./pages/Fiscal/FiscalCalendar'));
const FiscalObligations       = lazy(() => import('./pages/Fiscal/FiscalObligations'));
const ISLRDeclaration         = lazy(() => import('./pages/Fiscal/ISLRDeclaration'));
const ISLRConcepts            = lazy(() => import('./pages/Fiscal/ISLRConcepts'));
const ARCGenerator            = lazy(() => import('./pages/Fiscal/ARCGenerator'));
const RetentionVoucher        = lazy(() => import('./pages/Fiscal/RetentionVoucher'));

// Accounting
const AccountingDashboard     = lazy(() => import('./pages/Accounting/AccountingDashboard'));
const JournalBook             = lazy(() => import('./pages/Accounting/JournalBook'));
const GeneralLedger           = lazy(() => import('./pages/Accounting/GeneralLedger'));
const TrialBalance            = lazy(() => import('./pages/Accounting/TrialBalance'));
const BalanceSheet            = lazy(() => import('./pages/Accounting/BalanceSheet'));
const IncomeStatement         = lazy(() => import('./pages/Accounting/IncomeStatement'));
const CashFlow                = lazy(() => import('./pages/Accounting/CashFlow'));
const ChartOfAccounts         = lazy(() => import('./pages/Accounting/ChartOfAccounts'));
const ManualJournalEntry      = lazy(() => import('./pages/Accounting/ManualJournalEntry'));
const JournalEntryDetail      = lazy(() => import('./pages/Accounting/JournalEntryDetail'));
const PeriodClosing           = lazy(() => import('./pages/Accounting/PeriodClosing'));
const CostCenters             = lazy(() => import('./pages/Accounting/CostCenters'));
const ExchangeAdjustment      = lazy(() => import('./pages/Accounting/ExchangeAdjustment'));
const InflationAdjustment     = lazy(() => import('./pages/Accounting/InflationAdjustment'));
const CashFlowMapping         = lazy(() => import('./pages/Accounting/CashFlowMapping'));
const JournalAudit            = lazy(() => import('./pages/Accounting/JournalAudit'));
const FinancialConsolidation  = lazy(() => import('./pages/Accounting/FinancialConsolidation'));
const AdminInterface          = lazy(() => import('./pages/Accounting/AdminInterface'));

// Reports
const ReportsDashboard              = lazy(() => import('./pages/Reports/ReportsDashboard'));
const AccountsReceivableAging       = lazy(() => import('./pages/Reports/AccountsReceivableAging'));
const ExchangeDifferenceReport      = lazy(() => import('./pages/Reports/ExchangeDifferenceReport'));
const SalesReport                   = lazy(() => import('./pages/Reports/SalesReport'));
const PurchasingReport              = lazy(() => import('./pages/Reports/PurchasingReport'));
const OperationalEfficiencyReport   = lazy(() => import('./pages/Reports/OperationalEfficiencyReport'));
const ABCMatrixReport               = lazy(() => import('./pages/Reports/ABCMatrixReport'));
const ProductProfitabilityReport    = lazy(() => import('./pages/Reports/ProductProfitabilityReport'));
const SalesForceManagementReport    = lazy(() => import('./pages/Reports/SalesForceManagementReport'));
const ControlExceptionsReport       = lazy(() => import('./pages/Reports/ControlExceptionsReport'));
const QueryBuilderReport            = lazy(() => import('./pages/Reports/QueryBuilderReport'));

// Admin
const AdminDashboard          = lazy(() => import('./pages/Admin/AdminDashboard'));
const UsersPermissions        = lazy(() => import('./pages/Admin/UsersPermissions'));
const NumberingControl        = lazy(() => import('./pages/Admin/NumberingControl'));
const DataImportPanel         = lazy(() => import('./pages/Admin/DataImportPanel'));
const SystemAuditLogs         = lazy(() => import('./pages/Admin/SystemAuditLogs'));
const CloudBackups            = lazy(() => import('./pages/Admin/CloudBackups'));
const SystemHealth            = lazy(() => import('./pages/Admin/SystemHealth'));
const AutomatedNotifications  = lazy(() => import('./pages/Admin/AutomatedNotifications'));
const ImportHistory           = lazy(() => import('./pages/Admin/ImportHistory'));
const QuickImport             = lazy(() => import('./pages/Admin/QuickImport'));
const OmniscienceDashboard    = lazy(() => import('./pages/Dashboard/OmniscienceDashboard'));



// ── Spinner de carga entre navegaciones ──────────────────────────────────────
const PageLoader = () => (
  <div style={{
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh',
    flexDirection: 'column',
    gap: '12px',
  }}>
    <div style={{
      width: '32px',
      height: '32px',
      border: '3px solid #e2e8f0',
      borderTop: '3px solid #0b5156',
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
  </div>
);

// --- COMPONENTES DE APOYO ---
const MetricCard = ({ title, value, trend, trendClass, color, path, type = 'line', label }: any) => (
  <article className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-40">
    <div className="flex justify-between items-start mb-auto">
      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</span>
      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full flex items-center gap-1 ${trendClass}`}>
        {trend.startsWith('+') || trend === 'Sano' ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
        {trend}
      </span>
    </div>
    <div className="flex items-end justify-between">
      <div className="space-y-1">
        <strong className="text-3xl font-black text-slate-800 tracking-tighter">{value}</strong>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{label}</p>
      </div>
      <div className="w-24 h-12">
        <svg viewBox="0 0 100 40" className="w-full h-full" preserveAspectRatio="none" style={{ overflow: 'visible' }}>
          {type === 'line' ? (
            <path d={path} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          ) : (
            <g transform="translate(10, 0)">
              <rect x="0" y="25" width="12" height="15" fill={color} opacity="0.3" rx="2" />
              <rect x="18" y="15" width="12" height="25" fill={color} opacity="0.6" rx="2" />
              <rect x="36" y="20" width="12" height="20" fill={color} opacity="0.8" rx="2" />
              <rect x="54" y="5" width="12" height="35" fill={color} rx="2" />
            </g>
          )}
        </svg>
      </div>
    </div>
  </article>
);

const DashboardHome = () => {
  const { activeSystem } = useSystem();
  if (activeSystem === 'administrativo') return <SalesDashboard />;
  if (activeSystem === 'financiero') return <TreasuryDashboard />;
  if (activeSystem === 'contable') return <AccountingDashboard />;
  if (activeSystem === 'fiscal') return <FiscalDashboard />;
  if (activeSystem === 'nomina') return <PayrollDashboard />;

  return <MainDashboard />;
};

// --- VISTA: CENTRO DE ALERTAS ---
const AlertsCenter = () => {
  const [alerts, setAlerts] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showManual, setShowManual] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await api.get<any>('/dashboard/alertas');
        setAlerts(data);
      } catch (error) {
        console.error("Error fetching data for alerts center", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const alertasActivas = Number(alerts?.total || 0);
  const criticas = Number(alerts?.criticas || 0);
  const financieras = Number(alerts?.financieras || 0);
  const operativas = Number(alerts?.operativas || 0);
  const alertItems = alerts?.items || [];
  const hasAlerts = alertasActivas > 0;

  if (isLoading) {
    return (
      <div className="text-center py-20 text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse bg-white rounded-3xl border border-slate-200 shadow-sm">
         Sincronizando Alertas...
      </div>
    );
  }

  return (
  <div className="space-y-6 animate-in fade-in duration-500">
    <header className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
      <div className="flex justify-between items-start">
        <div className="space-y-2">

          <h2 className="text-4xl font-black text-slate-800 tracking-tighter uppercase">Centro de Alertas</h2>
          <p className="text-slate-500 text-sm font-bold">Riesgos operativos, vencimientos, stock critico, cumplimiento y eventos sensibles.</p>
        </div>
        <Link to="/">
          <button className="bg-slate-800 text-white px-6 py-2 rounded-xl text-xs font-black uppercase hover:bg-slate-700 transition-colors">Inicio</button>
        </Link>
      </div>
      <div className="flex gap-4 mt-8 flex-wrap">
        <button onClick={() => setShowManual(true)} className="bg-[#0b5156] text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-green-900/10 hover:bg-[#083a3e] transition-colors">Manual de esta opcion</button>
        <Link to="/reportes">
          <button className="bg-white text-slate-600 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-colors">Volver a Reportes</button>
        </Link>
        <button onClick={() => window.scrollTo({top: document.body.scrollHeight, behavior: 'smooth'})} className="bg-green-600 text-white px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-green-900/20 hover:bg-green-700 transition-colors">Ver alertas criticas</button>
        <Link to="/">
          <button className="bg-white text-slate-600 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-200 hover:bg-slate-50 transition-colors">Ver dashboard gerencial</button>
        </Link>
      </div>
    </header>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
      {[
        { t: 'Alertas Activas', v: alertasActivas, desc: alertasActivas > 0 ? 'Requieren seguimiento' : 'Sistema al dia', c: alertasActivas > 0 ? 'text-slate-800' : 'text-slate-400' },
        { t: 'Criticas', v: criticas, desc: criticas > 0 ? 'Resolver hoy' : 'Sin problemas', c: criticas > 0 ? 'text-red-600' : 'text-slate-400' },
        { t: 'Financieras', v: financieras, desc: financieras > 0 ? 'Caja, cobros y pagos' : 'Todo en orden', c: financieras > 0 ? 'text-amber-600' : 'text-slate-400' },
        { t: 'Operativas', v: operativas, desc: operativas > 0 ? 'Inventario, ventas y control' : 'Sin reportes', c: operativas > 0 ? 'text-[#0b5156]' : 'text-slate-400' }
      ].map((kpi, i) => (
        <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">{kpi.t}</p>
          <strong className="text-4xl font-black tracking-tighter">{kpi.v}</strong>
          <p className="text-[11px] font-bold mt-2 uppercase opacity-70">{kpi.desc}</p>
        </div>
      ))}
    </div>

    {/* Alertas Críticas de Hoy - Fila de Ancho Completo */}
    <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Alertas criticas de hoy</h3>
      <p className="text-xs font-bold text-slate-400 mb-8 uppercase">Eventos que pueden afectar caja, ventas, cumplimiento o continuidad.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-stretch">
        {alerts?.vencidoCobrar > 0 && <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between"><div className="space-y-3"><span className="text-[9px] font-black px-3 py-1 rounded-full uppercase inline-block bg-red-100 text-red-700">Cobranza</span><p className="text-lg font-black text-slate-700 mb-1">${alerts.vencidoCobrar.toLocaleString()} vencidos</p><p className="text-[10px] text-slate-400 font-bold uppercase leading-tight">Priorizar clientes con mayor impacto en caja.</p></div></div>}
        {alerts?.productosAgotados > 0 && <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between"><div className="space-y-3"><span className="text-[9px] font-black px-3 py-1 rounded-full uppercase inline-block bg-pink-100 text-pink-700">Inventario</span><p className="text-lg font-black text-slate-700 mb-1">{alerts.productosAgotados} productos agotados</p><p className="text-[10px] text-slate-400 font-bold uppercase leading-tight">Afectan venta inmediata y reposicion critica.</p></div></div>}
        {alerts?.vencidoPagar > 0 && <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between"><div className="space-y-3"><span className="text-[9px] font-black px-3 py-1 rounded-full uppercase inline-block bg-amber-100 text-amber-700">Pagos</span><p className="text-lg font-black text-slate-700 mb-1">${alerts.vencidoPagar.toLocaleString()} vencidos</p><p className="text-[10px] text-slate-400 font-bold uppercase leading-tight">Decidir que pagar sin romper caja operativa.</p></div></div>}
        {alerts?.fiscalPendiente && <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col justify-between"><div className="space-y-3"><span className="text-[9px] font-black px-3 py-1 rounded-full uppercase inline-block bg-green-100 text-[#0b5156]">Fiscal</span><p className="text-lg font-black text-slate-700 mb-1">IVA requiere revision</p><p className="text-[10px] text-slate-400 font-bold uppercase leading-tight">Validar soportes antes del cierre fiscal.</p></div></div>}
        {(!alerts?.vencidoCobrar && !alerts?.productosAgotados && !alerts?.vencidoPagar && !alerts?.fiscalPendiente) && (
          <div className="col-span-1 sm:col-span-2 lg:col-span-4 p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-slate-500 font-bold text-sm uppercase tracking-widest">
            No hay alertas críticas en este momento
          </div>
        )}
      </div>
    </article>

    {/* Alertas por Área y Decisión Recomendada - Fila de Grid de 2 Columnas Sincronizada */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
      <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <div>
          <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">Alertas por area</h3>
          <p className="text-[10px] font-bold text-slate-400 mb-8 uppercase tracking-widest">Distribucion de riesgos abiertos segun modulo operativo.</p>
          <div className="space-y-4">
            {alerts?.porArea && alerts.porArea.length > 0 ? (
              alerts.porArea.map((area: any, i: number) => (
                <div key={i} className="flex justify-between items-center p-4 hover:bg-slate-50 rounded-2xl transition-colors border border-slate-100 bg-slate-50/20">
                  <div><h4 className="text-sm font-black text-slate-800 uppercase">{area.a || area.area}</h4><p className="text-[10px] text-slate-400 font-bold uppercase">{area.d || area.descripcion}</p></div>
                  <div className={`w-8 h-8 ${area.c || area.color || 'bg-slate-400'} text-white text-xs font-black flex items-center justify-center rounded-full shadow-lg shadow-black/5`}>{area.n || area.cantidad}</div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-slate-400 text-sm font-bold uppercase tracking-widest">
                No hay alertas por área
              </div>
            )}
          </div>
        </div>
      </article>

      <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <div>
          <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2">Decision recomendada</h3>
          <p className="text-[10px] font-bold text-slate-400 mb-8 uppercase tracking-widest">Acciones optimas sugeridas por el sistema segun criticidad.</p>
          <div className="space-y-4">
            {alerts?.decisiones && alerts.decisiones.length > 0 ? (
              alerts.decisiones.map((item: any, i: number) => (
                <div key={i} className="flex justify-between items-center p-4 hover:bg-slate-50 rounded-2xl transition-colors border border-slate-100 bg-slate-50/20">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-slate-800 text-white text-[10px] font-black flex items-center justify-center rounded-full shrink-0">{item.n || (i+1)}</span>
                    <div>
                      <h4 className="text-sm font-black text-slate-800 uppercase">{item.t || item.titulo}</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase leading-tight">{item.d || item.descripcion}</p>
                    </div>
                  </div>
                  <span className={`${item.bc || item.badgeColor || 'text-slate-600 bg-slate-50'} text-[8px] font-black px-2 py-1 rounded tracking-widest`}>{item.b || item.badge}</span>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-slate-400 text-sm font-bold uppercase tracking-widest">
                No hay decisiones urgentes
              </div>
            )}
          </div>
        </div>
      </article>
    </div>

    <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm mt-6">
      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Resumen operativo</h3>
      <p className="text-xs font-bold text-slate-400 mb-8 uppercase">Que esta pasando y que area debe actuar primero.</p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {alerts?.resumenOperativo && alerts.resumenOperativo.length > 0 ? (
          alerts.resumenOperativo.map((res: any, i: number) => (
            <div key={i} className="p-8 bg-slate-50 rounded-3xl border border-slate-200">
               <span className={`${res.badgeColor || 'bg-slate-500'} text-white text-[9px] font-black px-3 py-1 rounded uppercase mb-4 inline-block`}>{res.badge}</span>
               <h4 className="text-base font-black text-slate-800 uppercase mb-2">{res.titulo}</h4>
               <p className="text-xs text-slate-500 font-bold leading-relaxed uppercase">{res.descripcion}</p>
            </div>
          ))
        ) : (
          <div className="col-span-1 md:col-span-3 p-10 bg-slate-50 rounded-3xl border border-slate-200 flex flex-col items-center justify-center text-center shadow-inner">
             <div className="w-12 h-12 bg-green-100 text-green-700 rounded-full flex items-center justify-center mb-4">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
             </div>
             <h4 className="text-base font-black text-slate-800 uppercase mb-2">Operativa Inteligente Limpia</h4>
             <p className="text-xs text-slate-500 font-bold leading-relaxed uppercase max-w-lg">El motor de alertas no ha detectado riesgos operativos ni anomalías que requieran atención inmediata. Todos los indicadores están dentro de los márgenes estables.</p>
          </div>
        )}
      </div>
    </article>

    <article className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm mt-6 overflow-hidden">
      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight mb-2">Registro de alertas</h3>
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full text-left">
          <thead><tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100"><th className="pb-4 px-4">Alerta</th><th className="pb-4 px-4">Area</th><th className="pb-4 px-4 text-center">Prioridad</th><th className="pb-4 px-4 text-right">Accion</th></tr></thead>
          <tbody className="divide-y divide-slate-50">
            {alertItems && alertItems.length > 0 ? (
              alertItems.map((row: any, i: number) => (
                <tr key={i} className="group hover:bg-slate-50/50 transition-colors"><td className="py-5 px-4"><p className="text-sm font-black text-slate-800 uppercase">{row.a || row.alerta}</p></td><td className="py-5 px-4 text-[11px] font-bold text-slate-500 uppercase">{row.ar || row.area}</td><td className="py-5 px-4 text-center"><span className={`${row.pc || row.prioridadColor || 'bg-slate-500'} text-white text-[9px] font-black px-2 py-0.5 rounded`}>{row.p || row.prioridad}</span></td><td className="py-5 px-4 text-right"><Link to={row.url || "/"} className="text-[10px] font-black text-[#0b5156] uppercase hover:underline">{row.ac || row.accion}</Link></td></tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="py-10 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  No hay alertas registradas en este momento
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </article>

    {/* Toast Notification Portal */}
    {toast && (
      <Toast 
        message={toast.message} 
        type={toast.type} 
        onClose={() => setToast(null)} 
      />
    )}
    {/* Manual de Alertas Modal */}
    {showManual && createPortal(
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
         <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowManual(false)} />
         <div className="relative bg-white w-full max-w-lg bg-white shadow-2xl rounded-3xl overflow-hidden border border-slate-200 animate-in zoom-in duration-300 flex flex-col max-h-[85vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 shrink-0">
               <div className="space-y-1">
                  <h2 className="text-xl font-black text-[#0b5156] uppercase tracking-tighter leading-none">Manual de Alertas Inteligentes</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">Guía de Operaciones y Prioridades de Riesgo</p>
               </div>
               <button onClick={() => setShowManual(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                  <X size={20} />
               </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-600 uppercase font-bold tracking-tight">
               <div className="space-y-2">
                  <h4 className="text-sm font-black text-[#0b5156] border-b pb-1">1. ¿Qué es el Centro de Alertas?</h4>
                  <p className="leading-relaxed normal-case text-slate-500 font-medium">El módulo de Alertas Inteligentes monitorea continuamente el estado de la base de datos para alertar en tiempo real sobre riesgos de caja, cumplimiento tributario, stock crítico de inventario y tareas pendientes.</p>
               </div>

               <div className="space-y-3">
                  <h4 className="text-sm font-black text-[#0b5156] border-b pb-1">2. Clasificación de Criticidades</h4>
                  <div className="space-y-2">
                     <div className="p-3 bg-red-50 rounded-xl border border-red-100 flex items-start gap-3">
                        <span className="w-4 h-4 rounded-full bg-red-600 shrink-0 mt-0.5" />
                        <div>
                           <strong className="text-red-900 block mb-0.5">Alertas Críticas (Rojo)</strong>
                           <span className="normal-case text-red-700/80 font-medium">Acciones urgentes que comprometen la continuidad operativa o conllevan sanciones legales (ej: facturas vencidas por pagar, cumplimiento fiscal pendiente, caja chica agotada).</span>
                        </div>
                     </div>
                     <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-3">
                        <span className="w-4 h-4 rounded-full bg-amber-500 shrink-0 mt-0.5" />
                        <div>
                           <strong className="text-amber-900 block mb-0.5">Alertas Financieras (Naranja)</strong>
                           <span className="normal-case text-amber-700/80 font-medium">Control de presupuestos y diferencias en el flujo de caja (ej: centros de costo sobre el 80% de su límite mensual, cuentas vencidas por cobrar).</span>
                        </div>
                     </div>
                     <div className="p-3 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-3">
                        <span className="w-4 h-4 rounded-full bg-[#0b5156] shrink-0 mt-0.5" />
                        <div>
                           <strong className="text-[#0b5156] block mb-0.5">Alertas Operativas (Azul)</strong>
                           <span className="normal-case text-slate-600/80 font-medium">Sincronización del día a día (ej: productos en stock crítico, despachos sin chofer asignado, requisiciones pendientes).</span>
                        </div>
                     </div>
                  </div>
               </div>

               <div className="space-y-2">
                  <h4 className="text-sm font-black text-[#0b5156] border-b pb-1">3. Recomendación de Decisiones</h4>
                  <p className="leading-relaxed normal-case text-slate-500 font-medium">El panel derecho sugiere un listado ordenado de acciones recomendadas. Es altamente recomendable ejecutarlas al inicio de la jornada laboral para asegurar la estabilidad del ERP.</p>
               </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
               <button onClick={() => setShowManual(false)} className="px-8 py-2.5 bg-[#0b5156] text-white rounded-xl text-[10px] font-black uppercase shadow-lg hover:bg-[#083a3d] transition-all">Entendido</button>
            </div>
         </div>
      </div>,
      document.body
    )}
  </div>
  );
};



const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, licenseError, userRole, checkLicense, logout } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<'success' | 'failed' | null>(null);

  const handleRetry = async () => {
    setIsChecking(true);
    setCheckResult(null);
    const isActive = await checkLicense();
    setIsChecking(false);
    if (!isActive) {
      setCheckResult('failed');
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#f4f6f8]">
        <div className="text-center p-12 bg-white rounded-3xl shadow-sm border border-slate-200">
          <h2 className="text-2xl font-black text-slate-800 uppercase mb-2">Acceso Restringido</h2>
          <p className="text-sm font-bold text-slate-500 uppercase mb-6">Esta aplicación debe ser accedida a través de KODA Remaster.</p>
          <Link to="/login" className="px-6 py-2 bg-[#0b5156] text-white text-xs font-black uppercase rounded-xl hover:bg-[#083a3d] transition-colors">
            Iniciar Sesión Manual
          </Link>
        </div>
      </div>
    );
  }

  const isDev = userRole?.toLowerCase() === 'desarrollador' || userRole?.toLowerCase() === 'dev' || userRole?.toLowerCase() === 'developer';

  if (licenseError && !isDev) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 p-6 relative overflow-hidden select-none">
        {/* Background blobs for premium depth */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-900/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-rose-900/10 rounded-full blur-3xl animate-pulse delay-700"></div>
        
        {/* Premium Glassmorphism Card */}
        <div className="bg-slate-900/70 backdrop-blur-xl border border-red-500/20 max-w-lg w-full p-8 rounded-3xl shadow-[0_0_50px_rgba(239,68,68,0.15)] text-center relative z-10 animate-in fade-in zoom-in-95 duration-500">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner animate-pulse">
            <ShieldAlert size={32} />
          </div>
          
          <h2 className="text-3xl font-black text-white tracking-tighter uppercase mb-2">Licencia Requerida</h2>
          <p className="text-slate-400 text-sm font-bold uppercase tracking-wider mb-6">Acceso Restringido por Suscripción</p>
          
          <div className="bg-red-950/40 border border-red-900/50 rounded-2xl p-5 mb-8 text-left">
            <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1.5">Detalle del Error:</p>
            <p className="text-slate-200 text-xs font-bold font-mono leading-relaxed">{licenseError}</p>
          </div>
          
          {checkResult === 'failed' && (
            <div className="bg-rose-950/20 border border-rose-900/30 text-rose-400 px-4 py-3 rounded-xl text-[10px] font-bold uppercase tracking-wider mb-6">
              La licencia sigue inactiva. Por favor contáctese con soporte o intente más tarde.
            </div>
          )}
          
          <div className="flex flex-col sm:flex-row gap-4">
            <button
              onClick={handleRetry}
              disabled={isChecking}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-xl uppercase text-[11px] tracking-widest transition-all shadow-lg shadow-red-950/30 flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95"
            >
              <RefreshCw size={14} className={isChecking ? 'animate-spin' : ''} />
              {isChecking ? 'Verificando...' : 'Reintentar Conexión'}
            </button>
            
            <button
              onClick={logout}
              className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-black py-4 rounded-xl uppercase text-[11px] tracking-widest transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <LogOut size={14} />
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <SecurityProtector>
        <SystemProvider>
        <Router basename="/facturacion" future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <Routes>
          <Route path="/auditoria/ledger" element={
            <Suspense fallback={<PageLoader />}>
              <AuditorLedger />
            </Suspense>
          } />
          <Route path="/login" element={<Login />} />
          <Route path="*" element={
            <ProtectedRoute>
            <MainLayout>
              <Suspense fallback={<PageLoader />}>
              <Routes>
          <Route path="/index.html" element={<Navigate to="/" replace />} />
          <Route path="/" element={<DashboardHome />} />
          <Route path="/facturacion" element={<Navigate to="/" replace />} />
          <Route path="/alertas" element={<AlertsCenter />} />
          <Route path="/ventas" element={<SalesDashboard />} />
          <Route path="/ventas/cotizaciones" element={<Quotations />} />
          <Route path="/ventas/ordenes" element={<SalesOrders />} />
          <Route path="/ventas/entregas" element={<DeliveryNotes />} />
          <Route path="/ventas/precios" element={<PriceLists />} />
          <Route path="/historial" element={<BillingDashboard />} />
          <Route path="/nueva" element={<InvoiceForm />} />
          <Route path="/nueva-fiscal" element={<NuevaFactura />} />
          <Route path="/clientes" element={<Customers />} />
          <Route path="/notas" element={<CreditNotes />} />
          <Route path="/pos" element={<POS />} />

          {/* COMPRAS */}
          <Route path="/compras" element={<PurchasingDashboard />} />
          <Route path="/compras/proveedores" element={<Suppliers />} />
          <Route path="/compras/ordenes" element={<PurchaseOrders />} />
          <Route path="/compras/ordenes/nueva" element={<NewPurchaseOrder />} />
          <Route path="/compras/anteproyecto" element={<CostProject />} />
          <Route path="/compras/requisiciones" element={<Requisitions />} />
          <Route path="/compras/requisiciones/nueva" element={<NewRequisition />} />
          <Route path="/compras/aprobaciones" element={<Approvals />} />
          <Route path="/compras/recepcion" element={<StockReception />} />
          <Route path="/compras/facturas" element={<SupplierInvoices />} />
          <Route path="/compras/devoluciones" element={<Returns />} />
          <Route path="/compras/historial" element={<PurchasingHistory />} />
          {/* INVENTARIO */}
          <Route path="/inventario" element={<InventoryDashboard />} />
          <Route path="/inventario/productos" element={<Products />} />
          <Route path="/inventario/kardex" element={<Kardex />} />
          <Route path="/inventario/ajustes" element={<InventoryAdjustments />} />
          <Route path="/inventario/existencias" element={<InventoryExists />} />
          <Route path="/inventario/almacenes" element={<InventoryWarehouses />} />
          <Route path="/inventario/transferencias" element={<InventoryTransfer />} />
          <Route path="/inventario/fisico" element={<StockInventory />} />
          <Route path="/inventario/critico" element={<InventoryCritical />} />
          <Route path="/inventario/lotes" element={<LotExpiry />} />
          {/* LOGÍSTICA */}
          <Route path="/logistica" element={<Logistics />} />
          <Route path="/logistica/vehiculos" element={<FleetVehicles />} />
          <Route path="/logistica/choferes" element={<FleetDrivers />} />
          <Route path="/logistica/mantenimiento" element={<FleetMaintenance />} />
          <Route path="/logistica/planificacion" element={<GanttPlanning />} />
          <Route path="/logistica/personal" element={<PersonnelEngine />} />
          <Route path="/cobranzas" element={<CollectionsDashboard />} />
          <Route path="/cobranzas/cartera" element={<AccountsReceivable />} />
          <Route path="/cobranzas/aplicar" element={<PaymentApplication />} />
          <Route path="/cobranzas/antiguedad" element={<AgingAnalysis />} />
          <Route path="/cobranzas/estado-cuenta" element={<CustomerStatement />} />
          <Route path="/cobranzas/flujo" element={<ProjectedCashFlow />} />
          <Route path="/cobranzas/anticipos" element={<CustomerAdvances />} />
          <Route path="/pagos" element={<PaymentsDashboard />} />
          <Route path="/pagos/cuentas-por-pagar" element={<AccountsPayable />} />
          <Route path="/pagos/ordenes" element={<PaymentOrders />} />
          <Route path="/pagos/lotes" element={<PaymentBatches />} />
          <Route path="/pagos/programacion" element={<PaymentScheduling />} />
          <Route path="/pagos/voucher" element={<PaymentVoucher />} />

          {/* TESORERÍA */}
          <Route path="/tesoreria" element={<TreasuryDashboard />} />
          <Route path="/tesoreria/bancos" element={<BankAccounts />} />
          <Route path="/tesoreria/movimientos-bancarios" element={<BankMovements />} />
          <Route path="/tesoreria/conciliacion" element={<BankReconciliation />} />
          <Route path="/tesoreria/tasas" element={<ExchangeRates />} />
          <Route path="/tesoreria/transferencias" element={<InternalTransfers />} />
          <Route path="/tesoreria/caja-chica" element={<PettyCash />} />
          <Route path="/tesoreria/arqueo" element={<CashAudit />} />
          <Route path="/tesoreria/movimientos-caja" element={<CashMovements />} />
          <Route path="/tesoreria/flujo" element={<CashFlowTreasury />} />
          <Route path="/tesoreria/prestamos" element={<LoansUVC />} />
          <Route path="/tesoreria/presupuesto" element={<BudgetVariance />} />
          <Route path="/tesoreria/inversiones" element={<InvestmentYield />} />
          <Route path="/tesoreria/turnos" element={<ShiftIntegrity />} />
          <Route path="/tesoreria/importar" element={<ImportStatement />} />

          <Route path="/fiscal" element={<FiscalDashboard />} />
          <Route path="/fiscal/libro-ventas" element={<SalesBook />} />
          <Route path="/fiscal/libro-compras" element={<PurchasesBook />} />
          <Route path="/fiscal/declaracion-iva" element={<IVADeclaration />} />
          <Route path="/fiscal/retenciones-iva" element={<IVARetentions />} />
          <Route path="/fiscal/retenciones-islr" element={<ISLRRetentions />} />
          <Route path="/fiscal/igtf" element={<IGTF />} />
          <Route path="/fiscal/calendario" element={<FiscalCalendar />} />
          <Route path="/fiscal/obligaciones" element={<FiscalObligations />} />
          <Route path="/fiscal/declaracion-islr" element={<ISLRDeclaration />} />
          <Route path="/fiscal/conceptos-islr" element={<ISLRConcepts />} />
          <Route path="/fiscal/arc" element={<ARCGenerator />} />
          <Route path="/fiscal/comprobantes" element={<RetentionVoucher />} />
          {/* CONTABILIDAD */}
          <Route path="/contabilidad" element={<AccountingDashboard />} />
          <Route path="/contabilidad/diario" element={<JournalBook />} />
          <Route path="/contabilidad/mayor" element={<GeneralLedger />} />
          <Route path="/contabilidad/balance-comprobacion" element={<TrialBalance />} />
          <Route path="/contabilidad/balance-general" element={<BalanceSheet />} />
          <Route path="/contabilidad/estado-resultados" element={<IncomeStatement />} />
          <Route path="/contabilidad/flujo-caja" element={<CashFlow />} />
          <Route path="/contabilidad/catalogo" element={<ChartOfAccounts />} />
          <Route path="/contabilidad/asiento-manual" element={<ManualJournalEntry />} />
          <Route path="/contabilidad/asiento/:id" element={<JournalEntryDetail />} />
          <Route path="/contabilidad/cierre" element={<PeriodClosing />} />
          <Route path="/contabilidad/centros-costo" element={<CostCenters />} />
          <Route path="/contabilidad/ajuste-cambiario" element={<ExchangeAdjustment />} />
          <Route path="/contabilidad/ajuste-inflacion" element={<InflationAdjustment />} />
          <Route path="/contabilidad/mapeo-flujo" element={<CashFlowMapping />} />
          <Route path="/contabilidad/auditoria-diario" element={<JournalAudit />} />
          <Route path="/contabilidad/consolidacion" element={<FinancialConsolidation />} />
          <Route path="/contabilidad/admin" element={<AdminInterface />} />
          <Route path="/reportes" element={<ReportsDashboard />} />
          <Route path="/reportes/antiguedad-cartera" element={<AccountsReceivableAging />} />
          <Route path="/reportes/diferencial-cambiario" element={<ExchangeDifferenceReport />} />
          <Route path="/reportes/ventas" element={<SalesReport />} />
          <Route path="/reportes/compras" element={<PurchasingReport />} />
          <Route path="/reportes/eficiencia" element={<OperationalEfficiencyReport />} />
          <Route path="/reportes/matriz-abc" element={<ABCMatrixReport />} />
          <Route path="/reportes/rentabilidad" element={<ProductProfitabilityReport />} />
          <Route path="/reportes/vendedores" element={<SalesForceManagementReport />} />
          <Route path="/reportes/excepciones" element={<ControlExceptionsReport />} />
          <Route path="/reportes/libro-fiscal" element={<FiscalBookReport />} />
          <Route path="/reportes/query-builder" element={<QueryBuilderReport />} />
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/empresa" element={<AdminDashboard defaultTab="compania" />} />
          <Route path="/admin/numeracion" element={<NumberingControl />} />
          <Route path="/admin/monedas" element={<AdminDashboard defaultTab="monedas" />} />
          <Route path="/admin/sucursales" element={<AdminDashboard defaultTab="sucursales" />} />
          <Route path="/admin/notificaciones" element={<AutomatedNotifications />} />
          <Route path="/admin/usuarios" element={<UsersPermissions />} />
          <Route path="/admin/telegram" element={<AdminDashboard defaultTab="telegram" />} />
          <Route path="/admin/auditoria" element={<SystemAuditLogs />} />
          <Route path="/admin/importacion" element={<DataImportPanel />} />
          <Route path="/admin/respaldos" element={<CloudBackups />} />
          <Route path="/admin/salud" element={<SystemHealth />} />
          <Route path="/admin/omniscience" element={<OmniscienceDashboard />} />
          <Route path="/admin/importacion/historial" element={<ImportHistory />} />
          <Route path="/admin/importacion/rapida" element={<QuickImport />} />
          <Route path="/nomina" element={<PayrollDashboard />} />


          <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
              </Suspense>
        </MainLayout>
            </ProtectedRoute>
        } />
      </Routes>
    </Router>
    </SystemProvider>
    </SecurityProtector>
    </AuthProvider>
  );
}

export default App;
