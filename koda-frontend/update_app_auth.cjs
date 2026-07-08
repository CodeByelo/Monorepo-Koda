const fs = require('fs');

const path = './src/App.tsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add imports
if (!content.includes('import { AuthProvider, useAuth }')) {
  content = content.replace(
    "import MainLayout from '@/layouts/MainLayout';",
    "import MainLayout from '@/layouts/MainLayout';\nimport { AuthProvider, useAuth } from '@/providers/AuthProvider';\nimport Login from '@/pages/Auth/Login';"
  );
}

// 2. Add ProtectedRoute component
if (!content.includes('const ProtectedRoute')) {
  const protectedRouteCode = `

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function App() {`;
  content = content.replace('function App() {', protectedRouteCode);
}

// 3. Wrap routes in AuthProvider and add /login
if (!content.includes('<AuthProvider>')) {
  content = content.replace('<SystemProvider>', '<AuthProvider>\n      <SystemProvider>');
  content = content.replace('</SystemProvider>', '</SystemProvider>\n    </AuthProvider>');
  
  // Replace the catch-all with protected layout
  content = content.replace(
    '<Route path="*" element=',
    '<Route path="/login" element={<Login />} />\n          <Route path="*" element='
  );

  content = content.replace(
    '<MainLayout>',
    '<ProtectedRoute>\n            <MainLayout>'
  );

  content = content.replace(
    '</MainLayout>',
    '</MainLayout>\n            </ProtectedRoute>'
  );
}

fs.writeFileSync(path, content, 'utf8');
console.log('App.tsx updated for Auth successfully.');
