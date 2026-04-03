import React, { useState, useEffect } from 'react';
import { useInventory } from '../../context/inventory-context.jsx';
import { Card, CardContent, CardHeader } from '../../components/ui/card.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx';
import * as XLSX from 'xlsx';

const AdminPayments = () => {
  const { orders: contextOrders = [], users = [] } = useInventory();
  const [receivedPayments, setReceivedPayments] = useState([]);
  const [packingFeesMap, setPackingFeesMap] = useState({});
  
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // Ensure orders is always an array
  const orders = Array.isArray(contextOrders) ? contextOrders : [];
  console.log('Admin payments - using context orders:', orders.length, 'total orders');

  // Fetch received payments on mount
  useEffect(() => {
    fetch('https://api.forvoq.com/api/received-payments')
      .then(res => res.json())
      .then(data => {
        setReceivedPayments(Array.isArray(data) ? data : []);
      })
      .catch(err => console.error('Error fetching received payments:', err));
  }, []);

  // Helper: Get merchant name by ID
  const getMerchantName = (merchantId) => {
    if (!merchantId) return 'Unknown';
    const merchant = users?.find(u => u.id === merchantId);
    return merchant?.companyName || merchantId;
  };

  // Helper: Check if order is a return
  const isReturnOrder = (order) => {
    return order?.customerName?.toLowerCase().includes('return') ||
           order?.notes?.toLowerCase().includes('return') ||
           order?.orderType === 'return';
  };

  // Robust number parser
  const parseNumber = (v) => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    const cleaned = String(v).replace(/[^0-9.-]+/g, '');
    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
  };

  // Filter out return orders
  const filteredOrders = orders.filter(o => !isReturnOrder(o));

  // Helper: Filter orders by month
  const getOrdersByMonth = (monthStr) => {
    return filteredOrders.filter(order => {
      if (!order?.date) return false;
      const orderDate = new Date(order.date);
      const orderMonth = `${orderDate.getFullYear()}-${String(orderDate.getMonth() + 1).padStart(2, '0')}`;
      return orderMonth === monthStr;
    });
  };

  // Helper: Get distinct months from orders
  const getDistinctMonths = () => {
    const months = new Set();
    filteredOrders.forEach(order => {
      if (order?.date) {
        const date = new Date(order.date);
        const monthStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        months.add(monthStr);
      }
    });
    return Array.from(months).sort().reverse();
  };

  // Fetch packing fees for orders that don't have detailed breakdowns
  useEffect(() => {
    const idsNeedingFetch = filteredOrders
      .filter(o => {
        const pd = o.packingDetails || o.packingdetails || o.packing_details;
        return o.id && !pd;
      })
      .map(o => o.id);

    if (idsNeedingFetch.length === 0) {
      setPackingFeesMap({});
      return;
    }

    console.log('Admin: fetching packing fees for', idsNeedingFetch.length, 'orders');
    Promise.all(idsNeedingFetch.map(id =>
      fetch(`https://api.forvoq.com/api/packingfees/${id}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => ({ id, data }))
        .catch(() => ({ id, data: null }))
    )).then(results => {
      const map = {};
      results.forEach(r => {
        if (r && r.id && r.data) map[r.id] = r.data;
      });
      setPackingFeesMap(map);
    }).catch(() => setPackingFeesMap({}));
  }, [filteredOrders.length]);

  // Build table rows using same logic as merchant payments
  const monthlyOrders = getOrdersByMonth(selectedMonth);

  const tableRows = monthlyOrders.map(o => {
    const pd = o.packingDetails || o.packingdetails || o.packing_details;
    const pfDoc = packingFeesMap[o.id] || null;
    const pdItems = Array.isArray(pd) ? pd : (pfDoc && Array.isArray(pfDoc.items) ? pfDoc.items : null);

    let transportationTotal = 0;
    let warehousingTotal = 0;
    let itemPackingTotal = 0;

    if (pdItems) {
      pdItems.forEach(it => {
        const qty = Number(it.quantity || 0) || 0;
        const transportationPerItem = Number(it.transportationPerItem ?? it.transportation ?? 0) || 0;
        const warehousingPerItem = Number(it.warehousingPerItem ?? it.warehousing ?? 0) || 0;
        const itemPackingPerItem = Number(it.itemPackingPerItem ?? it.itemPackingFee ?? it.itemPacking ?? 0) || 0;
        transportationTotal += transportationPerItem * qty;
        warehousingTotal += warehousingPerItem * qty;
        itemPackingTotal += itemPackingPerItem * qty;
      });
    }

    const boxFee = parseNumber(pfDoc?.boxFee ?? o.boxFee ?? 0);
    const boxCuttingCharge = (pfDoc && pfDoc.boxCutting !== undefined)
      ? (pfDoc.boxCutting ? 1 : 0)
      : (o.boxCutting ? 1 : 0);
    const trackingFee = parseNumber(pfDoc?.trackingFee ?? o.trackingFee ?? 2);
    const totalPackingFee = parseNumber(pfDoc?.totalPackingFee ?? o.packingFee ?? 0);

    return {
      id: o.id,
      date: o.date ? new Date(o.date).toLocaleDateString('en-IN') : '',
      merchantId: o.merchantId || '',
      merchantName: getMerchantName(o.merchantId),
      customerName: o.customerName || 'Unknown',
      transportation: transportationTotal,
      warehousing: warehousingTotal,
      itemPacking: itemPackingTotal,
      boxFee,
      boxCutting: boxCuttingCharge,
      tracking: trackingFee,
      totalFees: totalPackingFee
    };
  });

  // Generate summary by component type
  const componentSummary = {
    transportation: tableRows.reduce((sum, r) => sum + r.transportation, 0),
    warehousing: tableRows.reduce((sum, r) => sum + r.warehousing, 0),
    itemPacking: tableRows.reduce((sum, r) => sum + r.itemPacking, 0),
    boxFee: tableRows.reduce((sum, r) => sum + r.boxFee, 0),
    boxCutting: tableRows.reduce((sum, r) => sum + r.boxCutting, 0),
    tracking: tableRows.reduce((sum, r) => sum + r.tracking, 0),
    total: tableRows.reduce((sum, r) => sum + r.totalFees, 0)
  };

  // Generate summary by merchant
  const merchantSummary = tableRows.reduce((acc, row) => {
    if (!acc[row.merchantId]) {
      acc[row.merchantId] = {
        merchantName: row.merchantName,
        orders: 0,
        transportation: 0,
        warehousing: 0,
        itemPacking: 0,
        boxFee: 0,
        boxCutting: 0,
        tracking: 0,
        total: 0
      };
    }
    acc[row.merchantId].orders += 1;
    acc[row.merchantId].transportation += row.transportation;
    acc[row.merchantId].warehousing += row.warehousing;
    acc[row.merchantId].itemPacking += row.itemPacking;
    acc[row.merchantId].boxFee += row.boxFee;
    acc[row.merchantId].boxCutting += row.boxCutting;
    acc[row.merchantId].tracking += row.tracking;
    acc[row.merchantId].total += row.totalFees;
    return acc;
  }, {});

  // Download Excel helper
  const downloadExcel = (filename, data, sheetName = 'Sheet1') => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    XLSX.writeFile(workbook, filename);
  };

  const handleDownloadDetailedFees = () => {
    const data = tableRows.map(row => ({
      Date: row.date,
      'Order ID': row.id,
      'Merchant ID': row.merchantId,
      'Merchant Name': row.merchantName,
      'Customer Name': row.customerName,
      'Transportation (₹)': row.transportation.toFixed(2),
      'Warehousing (₹)': row.warehousing.toFixed(2),
      'Item Packing (₹)': row.itemPacking.toFixed(2),
      'Box Fee (₹)': row.boxFee.toFixed(2),
      'Box Cutting (₹)': row.boxCutting.toFixed(2),
      'Tracking Fee (₹)': row.tracking.toFixed(2),
      'Total Packing Fee (₹)': row.totalFees.toFixed(2)
    }));
    downloadExcel(`admin_packing_fees_${selectedMonth}.xlsx`, data, 'Packing Fees');
  };

  const handleDownloadMerchantSummary = () => {
    const data = Object.entries(merchantSummary).map(([merchantId, summary]) => ({
      'Merchant ID': merchantId,
      'Merchant Name': summary.merchantName,
      'Orders': summary.orders,
      'Transportation (₹)': summary.transportation.toFixed(2),
      'Warehousing (₹)': summary.warehousing.toFixed(2),
      'Item Packing (₹)': summary.itemPacking.toFixed(2),
      'Box Fee (₹)': summary.boxFee.toFixed(2),
      'Box Cutting (₹)': summary.boxCutting.toFixed(2),
      'Tracking Fee (₹)': summary.tracking.toFixed(2),
      'Total Packing Fees (₹)': summary.total.toFixed(2)
    }));
    downloadExcel(`admin_merchant_summary_${selectedMonth}.xlsx`, data, 'Merchant Summary');
  };

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <h1 className="text-4xl font-extrabold mb-8 text-center text-gray-900 dark:text-gray-100">
        Admin Payments Dashboard
      </h1>

      {/* Month Selector */}
      <div className="max-w-6xl mx-auto mb-4 flex items-center gap-4">
        <label className="text-sm font-medium">Select Month:</label>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="border rounded px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
        >
          {getDistinctMonths().map(month => (
            <option key={month} value={month}>{month}</option>
          ))}
        </select>
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Orders: {tableRows.length} | Total Fees: ₹{componentSummary.total.toFixed(2)}
        </span>
      </div>

      {/* Component-wise Summary */}
      {tableRows.length > 0 && (
        <div className="max-w-6xl mx-auto">
          <Card className="shadow-lg bg-white dark:bg-gray-800 rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-4 text-gray-900 dark:text-gray-100">
              Component-wise Summary
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-blue-50 dark:bg-blue-900 rounded">
                <p className="text-sm text-gray-600 dark:text-gray-400">Transportation</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-300">₹{componentSummary.transportation.toFixed(2)}</p>
              </div>
              <div className="p-4 bg-green-50 dark:bg-green-900 rounded">
                <p className="text-sm text-gray-600 dark:text-gray-400">Box Fees</p>
                <p className="text-2xl font-bold text-green-600 dark:text-green-300">₹{componentSummary.boxFee.toFixed(2)}</p>
              </div>
              <div className="p-4 bg-purple-50 dark:bg-purple-900 rounded">
                <p className="text-sm text-gray-600 dark:text-gray-400">Tracking Fees</p>
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-300">₹{componentSummary.tracking.toFixed(2)}</p>
              </div>
              <div className="p-4 bg-red-50 dark:bg-red-900 rounded">
                <p className="text-sm text-gray-600 dark:text-gray-400">Total Owed</p>
                <p className="text-2xl font-bold text-red-600 dark:text-red-300">₹{componentSummary.total.toFixed(2)}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Merchant Summary Table */}
      {Object.keys(merchantSummary).length > 0 && (
        <div className="max-w-6xl mx-auto">
          <Card className="shadow-lg bg-white dark:bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                Merchant Summary
              </h2>
              <button
                onClick={handleDownloadMerchantSummary}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Download Excel
              </button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Merchant ID</TableHead>
                    <TableHead>Merchant Name</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Transportation (₹)</TableHead>
                    <TableHead>Box Fee (₹)</TableHead>
                    <TableHead>Tracking Fee (₹)</TableHead>
                    <TableHead>Total (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(merchantSummary).map(([merchantId, summary]) => (
                    <TableRow key={merchantId}>
                      <TableCell>{merchantId}</TableCell>
                      <TableCell>{summary.merchantName}</TableCell>
                      <TableCell>{summary.orders}</TableCell>
                      <TableCell>{summary.transportation.toFixed(2)}</TableCell>
                      <TableCell>{summary.boxFee.toFixed(2)}</TableCell>
                      <TableCell>{summary.tracking.toFixed(2)}</TableCell>
                      <TableCell className="font-semibold">{summary.total.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}

      {/* Detailed Fees Table */}
      {tableRows.length > 0 && (
        <div className="max-w-6xl mx-auto">
          <Card className="shadow-lg bg-white dark:bg-gray-800 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
                Detailed Packing Fees
              </h2>
              <button
                onClick={handleDownloadDetailedFees}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Download Excel
              </button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Transportation (₹)</TableHead>
                    <TableHead>Box Fee (₹)</TableHead>
                    <TableHead>Tracking Fee (₹)</TableHead>
                    <TableHead>Total (₹)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tableRows.map(row => (
                    <TableRow key={row.id}>
                      <TableCell>{row.date}</TableCell>
                      <TableCell className="text-sm">{row.id}</TableCell>
                      <TableCell>{row.merchantName}</TableCell>
                      <TableCell>{row.customerName}</TableCell>
                      <TableCell>{row.transportation.toFixed(2)}</TableCell>
                      <TableCell>{row.boxFee.toFixed(2)}</TableCell>
                      <TableCell>{row.tracking.toFixed(2)}</TableCell>
                      <TableCell className="font-semibold">{row.totalFees.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      )}

      {tableRows.length === 0 && (
        <div className="max-w-6xl mx-auto text-center py-8">
          <p className="text-gray-600 dark:text-gray-400">No orders found for the selected month.</p>
        </div>
      )}
    </div>
  );
};

export default AdminPayments;
