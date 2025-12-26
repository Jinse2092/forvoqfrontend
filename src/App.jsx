import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/toaster.jsx';
import { ThemeProvider } from './components/theme-provider.jsx';
import Layout from './components/layout.jsx';
import Dashboard from './pages/dashboard.jsx';
import Products from './pages/products.jsx';
import Inventory from './pages/inventory.jsx';
import Reports from './pages/reports.jsx';
import Settings from './pages/settings.jsx';
import Orders from './pages/orders.jsx';
import Inbound from './pages/inbound.jsx';
import Payments from './pages/payments.jsx';
import Login from './pages/login.jsx';
import Register from './pages/register.jsx';
import ForgotPassword from './pages/forgot-password.jsx';
import AdminMerchants from './pages/admin/merchants.jsx';
import AdminOrders from './pages/admin/orders.jsx';
import AdminMerchantManagement from './pages/admin/merchant-management.jsx';
import AdminInbounds from './pages/admin/inbounds.jsx';
import AdminManagement from './pages/admin/management.jsx';
import AdminPayments from './pages/admin/payments.jsx';
import AdminMerchantPayments from './pages/admin/merchant-payments.jsx';
import AdminReturns from './pages/admin/returns.jsx';
import AdminSettings from './pages/admin/settings.jsx';
import Webhooks from './pages/admin/webhooks.jsx';
import { InventoryProvider, useInventory } from './context/inventory-context.jsx';

// Simulated Auth Guard
const ProtectedRoute = ({ children, allowedRoles }) => {
  const { currentUser } = useInventory(); // Using context for simulated auth

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(currentUser.role)) {
    // Redirect to dashboard or an unauthorized page if role doesn't match
    return <Navigate to="/" replace />;
  }

  return children;
};

function App() {
  return (
    <ThemeProvider defaultTheme="light">
      <InventoryProvider>
        <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute allowedRoles={['merchant', 'admin', 'superadmin']}>
                  <Layout>
                    <Routes>
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/products" element={<Products />} />
                      <Route path="/inventory" element={<Inventory />} />
                      <Route path="/orders" element={<Orders />} />
                      <Route path="/inbound" element={<Inbound />} />
                      <Route path="/payments" element={<Payments />} />
                      <Route path="/reports" element={<Reports />} />
                      <Route path="/admin/webhooks" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><Webhooks /></ProtectedRoute>} />
                      <Route path="/settings" element={<Settings />} />

                      {/* Admin Routes */}
                      <Route path="/admin/merchants" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminMerchants /></ProtectedRoute>} />
                      <Route path="/admin/merchant/:id" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminMerchantManagement /></ProtectedRoute>} />
                      <Route path="/admin/orders" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminOrders /></ProtectedRoute>} />
                      <Route path="/admin/inbounds" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminInbounds /></ProtectedRoute>} />
                      <Route path="/admin/payments" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminPayments /></ProtectedRoute>} />
                      <Route path="/admin/merchant-payments/:id" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminMerchantPayments /></ProtectedRoute>} />
                      <Route path="/admin/returns" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><AdminReturns /></ProtectedRoute>} />
                      <Route path="/admin/management" element={<ProtectedRoute allowedRoles={['superadmin']}><AdminManagement /></ProtectedRoute>} />
                      <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['superadmin']}><AdminSettings /></ProtectedRoute>} />

                      {/* Catch-all for logged-in users */}
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </Layout>
                </ProtectedRoute>
              }
            />
          </Routes>
        </Router>
        <Toaster />
      </InventoryProvider>
    </ThemeProvider>
  );
}

export default App;
