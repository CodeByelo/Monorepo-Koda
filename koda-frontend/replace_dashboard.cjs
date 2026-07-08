const fs = require('fs');

const path = './src/App.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add import
if (!content.includes('import MainDashboard from')) {
  content = content.replace(
    "import MainLayout from '@/layouts/MainLayout';",
    "import MainLayout from '@/layouts/MainLayout';\nimport MainDashboard from '@/pages/Dashboard/MainDashboard';"
  );
}

// 2. Replace DashboardHome
const startToken = "const DashboardHome = () => {";
const endToken = "// --- VISTA: CENTRO DE ALERTAS ---";

const startIndex = content.indexOf(startToken);
const endIndex = content.indexOf(endToken);

if (startIndex !== -1 && endIndex !== -1) {
  const newDashboardHome = `const DashboardHome = () => {
  const { activeSystem } = useSystem();
  if (activeSystem === 'administrativo') return <SalesDashboard />;
  if (activeSystem === 'financiero') return <TreasuryDashboard />;
  if (activeSystem === 'contable') return <AccountingDashboard />;
  if (activeSystem === 'fiscal') return <FiscalDashboard />;
  if (activeSystem === 'nomina') return <PayrollDashboard />;

  return <MainDashboard />;
};

`;
  
  content = content.slice(0, startIndex) + newDashboardHome + content.slice(endIndex);
  fs.writeFileSync(path, content, 'utf8');
  console.log('App.tsx updated successfully.');
} else {
  console.log('Could not find tokens.');
}
