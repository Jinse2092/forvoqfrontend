import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { LayoutDashboard, Package, BarChart3, Settings, Menu, X, Sun, Moon, Warehouse, LogOut, ShoppingCart, Truck, DollarSign, Users, UserCog, ShieldCheck, UserPlus, BookMarked } from 'lucide-react';
import { Button } from './ui/button.jsx';
import { useTheme } from './theme-provider.jsx';
import { useInventory } from '../context/inventory-context.jsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select.jsx';
import { Label } from './ui/label.jsx';

const merchantSidebarItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: ShoppingCart, label: 'Orders', path: '/orders' },
  { icon: Truck, label: 'Inbound / Outbound Inventory', path: '/inbound' },
  { icon: Package, label: 'Products', path: '/products' },
  { icon: Warehouse, label: 'Inventory', path: '/inventory' },
  { icon: DollarSign, label: 'Payments', path: '/payments' },
  { icon: BarChart3, label: 'Reports', path: '/reports' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

const adminSidebarItems = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Users, label: 'Merchants', path: '/admin/merchants' },
  { icon: ShoppingCart, label: 'All Orders', path: '/admin/orders' },
  { icon: Truck, label: 'All Inbounds', path: '/admin/inbounds' },
  { icon: Package, label: 'All Products', path: '/products' },
  { icon: Warehouse, label: 'All Inventory', path: '/inventory' },
  { icon: DollarSign, label: 'All Payments', path: '/admin/payments' },
  { icon: BarChart3, label: 'All Reports', path: '/reports' },
  { icon: BookMarked, label: 'Returns', path: '/admin/returns' },
  { icon: Settings, label: 'Settings', path: '/settings' },
];

const superAdminSidebarItems = [
  ...adminSidebarItems,
  { icon: UserCog, label: 'Admin Mgmt', path: '/admin/management' },
];

const Layout = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();
  const { currentUser, setCurrentUser, users, logout } = useInventory();

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const toggleTheme = () => setTheme(theme === 'light' ? 'dark' : 'light');

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  let sidebarItems = [];
  if (currentUser?.role === 'superadmin') {
    sidebarItems = superAdminSidebarItems;
  } else if (currentUser?.role === 'admin') {
    sidebarItems = adminSidebarItems;
  } else if (currentUser?.role === 'merchant') {
    sidebarItems = merchantSidebarItems;
  }

  const handleRoleChange = (userId) => {
    const selectedUser = users.find(u => u.id === userId);
    if (selectedUser) {
      setCurrentUser(selectedUser);
      navigate('/');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden">
      <div className="fixed top-4 left-4 z-50 md:hidden">
        <Button
          variant="outline"
          size="icon"
          onClick={toggleSidebar}
          className="rounded-full shadow-md"
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </Button>
      </div>

      <motion.div
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-card text-foreground shadow-lg transform md:translate-x-0 transition-transform duration-300 ease-in-out ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        initial={false}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between h-16 px-4 border-b border-border">
            <h1 className="text-xl font-bold text-primary">FORVOQ</h1>
            {currentUser && (
              <span className="text-xs px-2 py-1 rounded bg-primary/10 text-primary font-medium">
                {currentUser.role.toUpperCase()}
              </span>
            )}
          </div>

          <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto">
            {sidebarItems.map((item) => {
              const isActive =
                location.pathname === item.path ||
                (item.path !== '/' && location.pathname.startsWith(item.path));
              const Icon = item.icon;

              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`relative flex items-center px-4 py-3 text-sm rounded-md transition-colors font-medium gap-2
                    ${isActive
                      ? 'bg-primary/10 text-primary font-semibold'
                      : 'text-secondary-foreground hover:bg-accent/10 hover:text-accent'}
                  `}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon size={20} className="mr-3 flex-shrink-0" />
                  <span className="flex-grow">{item.label}</span>
                  {isActive && (
                    <motion.div
                      className="absolute inset-y-0 left-0 w-1 bg-primary rounded-r-full"
                      layoutId="sidebar-indicator"
                      initial={false}
                      animate={{ opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    />
                  )}
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t dark:border-gray-800">
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleTheme}
                className="rounded-full"
                aria-label="Toggle theme"
              >
                {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="flex items-center"
                onClick={handleLogout}
              >
                <LogOut size={16} className="mr-2" />
                <span>Logout</span>
              </Button>
            </div>
            {currentUser && (
              <p className="text-xs text-muted-foreground mt-2 text-center truncate">
                Logged in as: {currentUser.companyName}
              </p>
            )}
          </div>
        </div>
      </motion.div>

      <div className="flex-1 overflow-y-auto md:ml-64">
        <main className="p-6 md:p-8">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
