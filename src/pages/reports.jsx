import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.jsx';
import { Download } from 'lucide-react';
import { Button } from '../components/ui/button.jsx';
import { downloadCSV } from '../lib/utils.js';
import StockLevelTable from '../components/reports/StockLevelTable.jsx';
import InventoryValueTable from '../components/reports/InventoryValueTable.jsx';
import SalesTable from '../components/reports/SalesTable.jsx';
import CategoryValueChart from '../components/reports/CategoryValueChart.jsx';
import TopSellingChart from '../components/reports/TopSellingChart.jsx';
import { useInventory } from '../context/inventory-context.jsx';

const Reports = () => {
  const [activeTab, setActiveTab] = useState('stock');
  const { inventory: enhancedInventory, products, orders, currentUser } = useInventory();

  // Filter inventory for merchant role
  const filteredInventory = useMemo(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'merchant') {
      return enhancedInventory.filter(item => item.merchantId === currentUser.id);
    }
    return enhancedInventory;
  }, [enhancedInventory, currentUser]);

  // Build salesReport from filtered orders and products
  const salesReport = useMemo(() => {
    if (!orders || !products || !currentUser) return [];
    const report = [];
    orders.forEach(order => {
      if (currentUser.role === 'merchant' && order.merchantId !== currentUser.id) return;
      order.items.forEach(item => {
        const product = products.find(p => p.id === item.productId) || {};
        const price = product.price || 0;
        report.push({
          date: order.date,
          merchantId: order.merchantId,
          orderId: order.id,
          productName: item.name,
          quantity: item.quantity,
          revenue: item.quantity * price,
          notes: ''
        });
      });
    });
    return report;
  }, [orders, products, currentUser]);

  // Calculate inventory value dynamically
  const inventoryValueData = useMemo(() => {
    if (!currentUser) return [];
    return filteredInventory
      .map(item => {
        const product = products.find(p => p.id === item.productId) || {};
        const unitPrice = product.price || 0;
        const totalValue = unitPrice * (item.quantity || 0);
        return {
          name: item.productName || product.name || 'Unknown',
          quantity: item.quantity || 0,
          unitPrice,
          totalValue,
          merchantId: item.merchantId || ''
        };
      })
      .filter(item => item.quantity > 0);
  }, [filteredInventory, products, currentUser]);

  // Calculate total inventory value
  const totalInventoryValue = useMemo(() => {
    return inventoryValueData.reduce((sum, item) => sum + item.totalValue, 0);
  }, [inventoryValueData]);

  // Prepare data for category value chart (enhanced to use product categories)
  const pieChartData = useMemo(() => {
    const categoryTotals = {};
    inventoryValueData.forEach(item => {
      const product = products.find(p => p.name === item.name);
      const category = product?.category || 'Uncategorized';
      categoryTotals[category] = (categoryTotals[category] || 0) + item.totalValue;
    });
    return Object.entries(categoryTotals).map(([name, value]) => ({ name, value }));
  }, [inventoryValueData, products]);

  // Helper to get product price by product name
  const getProductPrice = (productName) => {
    const product = products.find(p => p.name === productName);
    return product ? product.price || 0 : 0;
  };

  // Calculate total sales revenue using product prices
  const totalRevenue = salesReport.reduce((sum, item) => {
    const price = getProductPrice(item.productName);
    return sum + (item.quantity || 0) * price;
  }, 0);

  // Prepare data for top selling chart (top 10 by quantity)
  const topSellingChartData = salesReport
    .sort((a, b) => b.quantity - a.quantity)
    .slice(0, 10)
    .map(item => ({
      name: item.productName,
      quantity: item.quantity
    }));

  // CSV Download handler
  const handleDownload = () => {
    let dataToDownload;
    let filename;
    switch (activeTab) {
      case 'stock':
        dataToDownload = filteredInventory.map(({ productName, merchantName, quantity, minStock, maxStock, status }) => ({
          Product: productName,
          Merchant: merchantName,
          Quantity: quantity,
          MinStock: minStock,
          MaxStock: maxStock,
          Status: status
        }));
        filename = 'stock_level_report';
        break;
      case 'value':
        dataToDownload = inventoryValueData.map(({ name, merchantId, quantity, unitPrice, totalValue }) => ({
          Product: name,
          Merchant: merchantId,
          Quantity: quantity,
          UnitPrice: unitPrice,
          TotalValue: totalValue
        }));
        filename = 'inventory_value_report';
        break;
      case 'sales':
        dataToDownload = salesReport.map(({ productName, merchantId, quantity }) => ({
          Product: productName,
          Merchant: merchantId,
          Sales: quantity
        }));
        filename = 'sales_report';
        break;
      default:
        return;
    }
    downloadCSV(dataToDownload, filename);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Reports</h1>
        <Button onClick={handleDownload} variant="outline" size="sm">
          <Download className="mr-2 h-4 w-4" />
          Download CSV
        </Button>
      </div>

      <Tabs defaultValue="stock" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="stock">Stock Levels</TabsTrigger>
          <TabsTrigger value="value">Inventory Value</TabsTrigger>
          <TabsTrigger value="sales">Sales Report</TabsTrigger>
        </TabsList>

        <TabsContent value="stock" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Current Stock Levels</CardTitle>
                          </CardHeader>
            <CardContent>
              <StockLevelTable data={filteredInventory} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="value" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Inventory Value Breakdown</CardTitle>
              <p className="text-sm text-muted-foreground">Total Inventory Value: ₹{totalInventoryValue.toFixed(2)}</p>
            </CardHeader>
            <CardContent>
              <InventoryValueTable data={inventoryValueData} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Inventory Value by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryValueChart data={pieChartData} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sales" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sales & Dispatch Fees</CardTitle>
              <p className="text-sm text-muted-foreground">Total Revenue: ₹{totalRevenue.toFixed(2)}</p>
            </CardHeader>
            <CardContent>
              <SalesTable data={salesReport} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Top Selling Products (by Quantity)</CardTitle>
              <p className="text-sm text-muted-foreground">Based on sales data.</p>
            </CardHeader>
            <CardContent>
              <TopSellingChart data={topSellingChartData} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;
