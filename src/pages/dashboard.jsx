import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card.jsx';
import { Package, Warehouse, TrendingUp, AlertTriangle } from 'lucide-react';
import { useInventory } from '../context/inventory-context.jsx';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

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
    const date = new Date(order.date || order.createdAt || '').toLocaleDateString();
    if (!date) return acc;
    const quantity = order.items ? order.items.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;
    acc[date] = (acc[date] || 0) + quantity;
    return acc;
  }, {});

  const returnDataByDate = returnOrders.reduce((acc, order) => {
    const date = new Date(order.date || order.createdAt || '').toLocaleDateString();
    if (!date) return acc;
    const quantity = order.items ? order.items.reduce((sum, item) => sum + (item.quantity || 0), 0) : 0;
    acc[date] = (acc[date] || 0) + quantity;
    return acc;
  }, {});

  const allDatesSet = new Set([...Object.keys(salesDataByDate), ...Object.keys(returnDataByDate)]);
  const combinedData = Array.from(allDatesSet).map(date => {
    const salesQty = salesDataByDate[date] || 0;
    const returnQty = returnDataByDate[date] || 0;
    return {
      date,
      quantity: salesQty - returnQty,
    };
  }).sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 dashboard-grid">
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

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent Sales Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={combinedData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="quantity" fill="var(--primary)" name="Units Sold" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {recentTransactions.map(t => {
                const product = products.find(p => p.id === t.productId);
                return (
                  <li key={t.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0">
                    <div>
                      <span className={`font-medium ${t.type === 'sale' ? 'text-red-600' : 'text-green-600'}`}>
                        {t.type.charAt(0).toUpperCase() + t.type.slice(1)} ({t.quantity})
                      </span>
                      <span className="text-muted-foreground ml-2">- {product?.name || 'Unknown Product'}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(t.date).toLocaleDateString()}</span>
                  </li>
                );
              })}
               {recentTransactions.length === 0 && (
                 <p className="text-sm text-muted-foreground text-center py-4">No recent transactions.</p>
               )}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Dashboard;

