import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { Package, Warehouse, TrendingUp, AlertTriangle } from 'lucide-react';
import { useInventory } from '../context/inventory-context.jsx';
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Line, Area, Brush } from 'recharts';
import PaymentsPanel from './payments.jsx';

const Dashboard = () => {
  const { products, inventory, transactions, orders, currentUser } = useInventory();

  const isMerchant = currentUser?.role === 'merchant' && currentUser?.id;
  const merchantInventory = isMerchant
    ? inventory.filter(item => item.merchantId === currentUser.id)
    : inventory;

  const totalProducts = products.length;
  const totalInventoryItems = merchantInventory.length;
  const totalStockValue = merchantInventory.reduce((sum, item) => {
    const product = products.find(p => p.id === item.productId);
    return sum + (item.quantity * (product?.price || 0));
  }, 0);

  const lowStockItems = merchantInventory.filter(item => item.quantity <= item.minStockLevel).length;

  const recentTransactions = transactions
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 5);

  // Calculate units sold as number of orders minus number of returns per date
  const salesOrders = orders.filter(order => order.status !== 'return');
  const returnOrders = orders.filter(order => order.status === 'return');

  const salesDataByDate = salesOrders.reduce((acc, order) => {
    const d = new Date(order.date || order.createdAt || '');
    if (isNaN(d)) return acc;
    const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
    const quantity = order.items ? order.items.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;
    const amount = order.total ?? (order.items ? order.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.price ?? item.unitPrice ?? 0)), 0) : 0);
    acc[iso] = acc[iso] || { qty: 0, amount: 0 };
    acc[iso].qty += quantity;
    acc[iso].amount += amount;
    return acc;
  }, {});

  const returnDataByDate = returnOrders.reduce((acc, order) => {
    const d = new Date(order.date || order.createdAt || '');
    if (isNaN(d)) return acc;
    const iso = d.toISOString().slice(0, 10);
    const quantity = order.items ? order.items.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;
    const amount = order.total ?? (order.items ? order.items.reduce((sum, item) => sum + ((item.quantity || 0) * (item.price ?? item.unitPrice ?? 0)), 0) : 0);
    acc[iso] = acc[iso] || { qty: 0, amount: 0 };
    acc[iso].qty += quantity;
    acc[iso].amount += amount;
    return acc;
  }, {});

  const allDates = Array.from(new Set([...Object.keys(salesDataByDate), ...Object.keys(returnDataByDate)])).sort((a, b) => new Date(a) - new Date(b));

  // Build richer dataset (ascending by date): sales qty/amount, returns qty/amount, net amount, cumulative amount and 7-day moving average (amount)
  let cumulativeAmount = 0;
  const combinedDataAsc = allDates.map((iso, idx, arr) => {
    const salesEntryActual = salesDataByDate[iso] || { qty: 0, amount: 0 };
    const returnEntryActual = returnDataByDate[iso] || { qty: 0, amount: 0 };
    const salesQty = salesEntryActual.qty;
    const returnQty = returnEntryActual.qty;
    const salesAmount = salesEntryActual.amount || 0;
    const returnAmount = returnEntryActual.amount || 0;
    const netAmount = salesAmount - returnAmount;
    cumulativeAmount += netAmount;

    const windowSize = 7;
    const start = Math.max(0, idx - windowSize + 1);
    const windowDates = arr.slice(start, idx + 1);
    const movingAvgAmount = windowDates.reduce((sum, d) => {
      const s = (salesDataByDate[d] && salesDataByDate[d].amount) || 0;
      const r = (returnDataByDate[d] && returnDataByDate[d].amount) || 0;
      return sum + (s - r);
    }, 0) / windowDates.length;

    const displayDate = new Date(iso).toLocaleDateString();
    return {
      iso,
      date: displayDate,
      salesQty,
      returnQty,
      salesAmount: Number(salesAmount.toFixed(2)),
      returnsAmount: Number(returnAmount.toFixed(2)),
      netAmount: Number(netAmount.toFixed(2)),
      cumulativeAmount: Number(cumulativeAmount.toFixed(2)),
      movingAvgAmount: Number(movingAvgAmount.toFixed(2)),
    };
  });

  // UI state: allow toggling date sort order and a time range filter for display
  const [sortAsc, setSortAsc] = useState(true);
  const [rangeDays, setRangeDays] = useState('month'); // presets: 7,30,90,'month' or 'all'

  const startOfMonthISO = (() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  })();

  const filteredAsc =
    rangeDays === 'all'
      ? combinedDataAsc
      : rangeDays === 'month'
      ? combinedDataAsc.filter(d => d.iso >= startOfMonthISO)
      : combinedDataAsc.slice(Math.max(0, combinedDataAsc.length - Number(rangeDays)));
  const displayedData = sortAsc ? filteredAsc : [...filteredAsc].slice().reverse();

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <div className="dashboard-grid gap-4 sm:gap-6">
        <Card className="card-hover gradient-bg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalProducts}</div>
            <p className="text-xs text-muted-foreground">Different product types</p>
          </CardContent>
        </Card>
        <Card className="card-hover gradient-bg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
            <Warehouse className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">₹{totalStockValue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Estimated value of stock</p>
          </CardContent>
        </Card>
        <Card className="card-hover gradient-bg">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Inventory Items</CardTitle>
            <TrendingUp className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalInventoryItems}</div>
            <p className="text-xs text-muted-foreground">Tracked inventory lines</p>
          </CardContent>
        </Card>
        <Card className={`card-hover ${lowStockItems > 0 ? 'border-destructive bg-destructive/10' : 'gradient-bg'}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <AlertTriangle className={`h-5 w-5 ${lowStockItems > 0 ? 'text-destructive' : 'text-primary'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${lowStockItems > 0 ? 'text-destructive' : ''}`}>{lowStockItems}</div>
            <p className="text-xs text-muted-foreground">Items needing reorder</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2">
        {/* Recent Sales Trend removed per request */}

        {/* Monthly Billing Summary removed per request */}
      </div>
    </div>
  );
};

export default Dashboard;

