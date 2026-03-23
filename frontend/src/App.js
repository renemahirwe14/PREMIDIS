import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { Toaster } from './components/ui/sonner';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import Communication from './pages/Communication';
import Administration from './pages/Administration';
import TimeManagement from './pages/TimeManagement';
import Behavior from './pages/Behavior';
import Settings from './pages/Settings';
import EmployeeProfile from './pages/EmployeeProfile';
import PermissionsManagement from './pages/PermissionsManagement';
import SitesManagement from './pages/SitesManagement';
import DepartmentsManagement from './pages/DepartmentsManagement';
import DocumentsModule from './pages/DocumentsModuleV2';
import DocumentsRHHistory from './pages/DocumentsRHHistory';
import NotificationsModule from './pages/NotificationsModule';

// Protected Route Component
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { isAuthenticated, loading, user } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-secondary animate-pulse" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

// Public Route (redirect if authenticated)
const PublicRoute = ({ children }) => {
  const { isAuthenticated, loading } = useAuth();
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-secondary animate-pulse" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return children;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
      <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
      <Route path="/reset-password" element={<ResetPassword />} />
      
      {/* Protected Routes */}
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/communication" element={<ProtectedRoute><Communication /></ProtectedRoute>} />
      <Route path="/time-management" element={<ProtectedRoute><TimeManagement /></ProtectedRoute>} />
      <Route path="/behavior" element={<ProtectedRoute><Behavior /></ProtectedRoute>} />
      <Route path="/permissions" element={<ProtectedRoute><PermissionsManagement /></ProtectedRoute>} />
      <Route path="/documents" element={<ProtectedRoute><DocumentsModule /></ProtectedRoute>} />
      <Route path="/documents-rh" element={<ProtectedRoute allowedRoles={['super_admin', 'admin']}><DocumentsRHHistory /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><NotificationsModule /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      
      {/* Admin Only Routes */}
      <Route 
        path="/administration" 
        element={
          <ProtectedRoute allowedRoles={['super_admin', 'admin', 'secretary']}>
            <Administration />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/sites" 
        element={
          <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
            <SitesManagement />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/departments" 
        element={
          <ProtectedRoute allowedRoles={['super_admin', 'admin']}>
            <DepartmentsManagement />
          </ProtectedRoute>
        } 
      />
      
      {/* Employee Profile Routes */}
      <Route path="/my-profile" element={<ProtectedRoute><EmployeeProfile /></ProtectedRoute>} />
      <Route path="/employee/:id" element={<ProtectedRoute><EmployeeProfile /></ProtectedRoute>} />
      <Route path="/employees/:id" element={<ProtectedRoute><EmployeeProfile /></ProtectedRoute>} />
      
      {/* Default Redirect */}
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <AppRoutes />
            <Toaster position="top-right" richColors />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
