import React, { useState, useEffect } from 'react';
import { useInventory } from '../context/inventory-context.jsx';
import { Card, CardContent, CardHeader } from '../components/ui/card.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table.jsx';
import * as XLSX from 'xlsx';

// Helper to remove duplicate dispatch_fee rows by order id (from notes)
const filterDuplicateDispatchFees = (txns) => {
  const seenOrderIds = new Set();
  return txns.filter(txn => {
    if (txn.type !== 'dispatch_fee') return true;
    // Extract order id from notes (e.g., 'Packing & Dispatch fee for order ord-1748019804350')
    const match = txn.notes && txn.notes.match(/order (\w+-\d+)/);
    const orderId = match ? match[1] : null;
    if (!orderId) return true;
    if (seenOrderIds.has(orderId)) return false;
    seenOrderIds.add(orderId);
    return true;
  });
};

const PaymentsPanel = () => {
  const { transactions, users, currentUser } = useInventory();
  const [receivedPayments, setReceivedPayments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const t = new Date();
    return t.toISOString().slice(0,7); // YYYY-MM
  });
  const [showDebug, setShowDebug] = useState(false);

  // Map of orderId -> packingFee document
  const [packingFeesMap, setPackingFeesMap] = useState({});

  useEffect(() => {
    if (currentUser?.role === 'merchant' && currentUser?.id) {
      fetch(`https://forwokbackend-1.onrender.com/api/received-payments?merchantId=${currentUser.id}`)
        .then(res => res.json())
        .then(data => setReceivedPayments(data));
    } else if (currentUser?.role === 'admin') {
      fetch('https://forwokbackend-1.onrender.com/api/received-payments')
        .then(res => res.json())
        .then(data => setReceivedPayments(data.sort((a, b) => new Date(b.date) - new Date(a.date))));
    }
    // Fetch orders so we can show order details for dispatch_fee rows
    fetch('https://forwokbackend-1.onrender.com/api/orders')
      .then(res => res.json())
      .then(data => setOrders(data || []))
      .catch(() => setOrders([]));
  }, [currentUser]);

  
  

  const getMerchantName = (merchantId) => {
    if (!users) return merchantId;
    const user = users.find(u => u.id === merchantId);
    return user ? user.companyName : merchantId;
  };

  // Main payments table: combine transactions and received payments as rows
  // Helper to detect return orders
  const isReturnOrder = (o) => {
    if (!o) return false;
    if ((o.status || '').toString().toLowerCase() === 'return') return true;
    if (o.id && String(o.id).toLowerCase().startsWith('ret-')) return true;
    if (o.return === true) return true;
    if ((o.customerName || '').toString().toLowerCase() === 'return') return true;
    return false;
  };

  // Set of order ids that are returns so we can exclude related transactions
  const returnOrderIds = new Set((orders || []).filter(isReturnOrder).map(o => o.id).filter(Boolean));

  // Helper: parse order id from notes (e.g., 'Packing & Dispatch fee for order ord-1748019804350')
  const parseOrderId = (notes = '') => {
    const match = String(notes).match(/order\s+(\w+-\d+)/i);
    return match ? match[1] : null;
  };

  const combinedTransactions = [
    ...transactions,
    ...receivedPayments.map(p => ({
      ...p,
      type: 'received_payment',
      notes: p.notes || '-',
      quantity: '-',
      productId: null
    }))
  ];

  // Exclude transactions that reference return orders (by parsing order id from notes)
  const combinedTransactionsExcludingReturns = combinedTransactions.filter(txn => {
    const oid = parseOrderId(txn.notes);
    if (oid && returnOrderIds.has(oid)) return false;
    return true;
  });

  const filteredTransactions = currentUser?.role === 'merchant'
    ? combinedTransactionsExcludingReturns.filter(txn => txn.merchantId === currentUser.id)
    : combinedTransactionsExcludingReturns;

  // Calculate total and pending payments for the current merchant
  const isMerchant = currentUser?.role === 'merchant' && currentUser?.id;
  // Only consider this merchant's transactions if merchant, else all
  const relevantTransactions = isMerchant
    ? combinedTransactionsExcludingReturns.filter(txn => txn.merchantId === currentUser.id)
    : combinedTransactionsExcludingReturns;

  // Total Payment: sum of all fee and dispatch rows (exclude received_payment)
  const totalPayment = relevantTransactions
    .filter(txn => txn.type !== 'received_payment')
    .reduce((sum, txn) => sum + (Number(txn.amount) || 0), 0);

  // Total received payments
  const totalReceived = relevantTransactions
    .filter(txn => txn.type === 'received_payment')
    .reduce((sum, txn) => sum + (Number(txn.amount) || 0), 0);

  // Pending Payment: totalPayment - totalReceived
  const pendingPayment = totalPayment - totalReceived;


  // Robust number parser: strip non-numeric (except dot and minus) and parse
  const parseNumber = (v) => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    const cleaned = String(v).replace(/[^0-9.-]+/g, '');
    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
  };

  // Filter out return orders from orders list used for payments/tables
  const filteredOrders = (orders || []).filter(o => !isReturnOrder(o));

  // Build a map of orders by id for quick lookup (excluding returns)
  const ordersMap = filteredOrders.reduce((acc, o) => {
    if (o.id) acc[o.id] = o;
    return acc;
  }, {});

  // Build table rows directly from the `orders` collection. The backend `/api/orders`
  // aggregates the packingFees document into each order (field `packingFee` and `packingDetails`).
  const visibleOrders = currentUser?.role === 'merchant' && currentUser?.id
    ? filteredOrders.filter(o => o.merchantId === currentUser.id)
    : filteredOrders;

  const tableRows = (visibleOrders || []).map(o => {
    const pd = o.packingDetails || o.packingdetails || o.packing_details;
    const odItems = o.items || o.orderItems;
    const itemsSource = pd || odItems;
    const itemsSummary = itemsSource
      ? (Array.isArray(itemsSource) ? itemsSource.map(i => {
          const name = i.name || i.productName || i.title || i.productId || 'Item';
          const qty = (i.quantity || i.qty || i.count || 1);
          return `${name} x${qty}`;
        }).join(', ') : String(itemsSource))
      : '-';
    // Prefer per-item breakdown attached to the order (server populates `packingDetails`),
    // fallback to packingFeesMap for top-level fields. The packing-fees single endpoint
    // does not return `items[]`, so computing per-item components from `o.packingDetails`
    // avoids zeros when the endpoint returns a minimal payload.
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
    const trackingFee = parseNumber(pfDoc?.trackingFee ?? o.trackingFee ?? 0);
    const totalPackingFee = parseNumber(pfDoc?.totalPackingFee ?? o.packingFee ?? 0);

    return {
      id: o.id,
      date: o.date || '-',
      orderId: o.id,
      customerName: o.customerName || 'Unknown',
      items: itemsSummary,
      amount: totalPackingFee,
      transportationTotal,
      warehousingTotal,
      itemPackingTotal,
      boxFee,
      boxCuttingCharge,
      trackingFee,
      notes: ''
    };
  });

  // Helper to get YYYY-MM from a date string
  const getYYYYMM = (dateStr) => {
    if (!dateStr) return null;
    // try ISO-like prefix
    const prefix = String(dateStr).slice(0,7);
    if (/^\d{4}-\d{2}$/.test(prefix)) return prefix;
    const d = new Date(dateStr);
    if (!isNaN(d)) return d.toISOString().slice(0,7);
    return null;
  };

  // Filter rows for selected month
  const monthlyRows = tableRows.filter(r => getYYYYMM(r.date) === selectedMonth);

  // Sort monthly rows by date (ascending)
  const sortedMonthlyRows = monthlyRows.slice().sort((a, b) => {
    const da = new Date(a.date || 0);
    const db = new Date(b.date || 0);
    return da - db;
  });

  // Group monthly rows by customer for monthly billing summary
  const monthlyCustomerMap = {};
  sortedMonthlyRows.forEach(r => {
    const name = r.customerName || '-';
    if (!monthlyCustomerMap[name]) monthlyCustomerMap[name] = { customerName: name, orders: 0, totalFees: 0 };
    monthlyCustomerMap[name].orders += 1;
    monthlyCustomerMap[name].totalFees += Number(r.amount) || 0;
  });
  const monthlyCustomerRows = Object.values(monthlyCustomerMap);

  // Monthly component totals (transportation, warehousing, itemPacking, boxFee, boxCutting, tracking)
  const monthlyComponentTotals = sortedMonthlyRows.reduce((acc, r) => {
    acc.transportation += Number(r.transportationTotal || 0);
    acc.warehousing += Number(r.warehousingTotal || 0);
    acc.itemPacking += Number(r.itemPackingTotal || 0);
    acc.boxFee += Number(r.boxFee || 0);
    acc.boxCutting += Number(r.boxCuttingCharge || 0);
    acc.tracking += Number(r.trackingFee || 0);
    acc.totalPacking += Number(r.amount || 0);
    return acc;
  }, { transportation: 0, warehousing: 0, itemPacking: 0, boxFee: 0, boxCutting: 0, tracking: 0, totalPacking: 0 });

  // Count total product units in the selected month's orders (sum of item quantities)
  let totalProductsCount = 0;
  sortedMonthlyRows.forEach(r => {
    const order = ordersMap[r.orderId];
    if (order) {
      const items = order.items || order.orderItems || order.order_items || [];
      if (Array.isArray(items)) {
        items.forEach(it => {
          const qty = Number(it.quantity || it.qty || it.count || 0) || 0;
          totalProductsCount += qty;
        });
      }
    } else if (r.items && typeof r.items === 'string') {
      // items summary like 'Name x2, Name2 x1' -> extract quantities
      r.items.split(',').forEach(part => {
        const match = String(part || '').trim().match(/x\s*(\d+)$/i);
        const qty = match ? Number(match[1]) : 1;
        totalProductsCount += qty || 0;
      });
    }
  });

  // Monthly received payments (to compute pending)
  const monthlyReceivedTotal = receivedPayments
    .filter(p => getYYYYMM(p.date) === selectedMonth)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  const monthlyPending = monthlyComponentTotals.totalPacking - monthlyReceivedTotal;

  const downloadMainExcel = () => {
    const worksheetData = sortedMonthlyRows.map(row => ({
      Date: row.date || '',
      'Order ID': row.orderId || row.id || '',
      'Customer Name': row.customerName || 'Unknown',
      Items: row.items || '-',
      'Total Packing Fees (₹)': row.amount != null ? Number(row.amount).toFixed(2) : '0.00',
      'Transportation (₹)': Number(row.transportationTotal || 0).toFixed(2),
      'Warehousing (₹)': Number(row.warehousingTotal || 0).toFixed(2),
      'Itemwise Packing (₹)': Number(row.itemPackingTotal || 0).toFixed(2),
      'Box Fee (₹)': Number(row.boxFee || 0).toFixed(2),
      'Box Cutting (₹)': Number(row.boxCuttingCharge || 0).toFixed(2),
      'Tracking Fee (₹)': Number(row.trackingFee || 0).toFixed(2)
    }));
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payments');
    XLSX.writeFile(workbook, `packing_fees_${selectedMonth || 'all'}.xlsx`);
  };

  const downloadReceivedExcel = () => {
    const worksheetData = receivedPayments.map(p => ({
      Date: p.date || '',
      'Merchant ID': p.merchantId || '',
      Merchant: getMerchantName(p.merchantId),
      'Amount (₹)': p.amount != null ? p.amount.toFixed(2) : '',
      Notes: p.notes || '-'
    }));
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Received Payments');
    XLSX.writeFile(workbook, `received_payments.xlsx`);
  };

  // Fetch packingFees docs for visible orders so we can display detailed breakdowns
  useEffect(() => {
    const ids = (visibleOrders || []).map(o => o.id).filter(Boolean);
    if (ids.length === 0) {
      setPackingFeesMap({});
      return;
    }
    Promise.all(ids.map(id =>
      fetch(`https://forwokbackend-1.onrender.com/api/packingfees/${id}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => ({ id, data }))
        .catch(() => ({ id, data: null }))
    )).then(results => {
      const map = {};
      results.forEach(r => { if (r && r.id && r.data) map[r.id] = r.data; });
      setPackingFeesMap(map);
    }).catch(() => setPackingFeesMap({}));
  }, [visibleOrders]);

  return (
    <div className="p-2 sm:p-6 space-y-6">
      {/* Top summary removed — showing month-level totals inside Transactions card */}

      {/* Main Payments Table */}
      {/* Monthly Summary Card */}
      <Card className="mb-6">
              <CardHeader className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Monthly Billing Summary — {selectedMonth}</h3>
                              <div className="text-sm text-gray-600">Orders: {sortedMonthlyRows.length} • Products: {totalProductsCount} • Total Fees: ₹{monthlyComponentTotals.totalPacking.toFixed(2)}</div>
              </CardHeader>
        {/* client-by-client breakdown removed per request - only show totals below */}
        <div className="p-4">
          <h4 className="font-semibold">Monthly Component Totals</h4>
          <div className="grid grid-cols-2 gap-2 mt-2 text-sm">
            <div>Transportation:</div><div>₹{monthlyComponentTotals.transportation.toFixed(2)}</div>
            <div>Warehousing:</div><div>₹{monthlyComponentTotals.warehousing.toFixed(2)}</div>
            <div>Itemwise Packing:</div><div>₹{monthlyComponentTotals.itemPacking.toFixed(2)}</div>
            <div>Box Fee:</div><div>₹{monthlyComponentTotals.boxFee.toFixed(2)}</div>
            <div>Box Cutting:</div><div>₹{monthlyComponentTotals.boxCutting.toFixed(2)}</div>
            <div>Tracking Fee:</div><div>₹{monthlyComponentTotals.tracking.toFixed(2)}</div>
            <div className="font-semibold">Total Packing Fees:</div><div className="font-semibold">₹{monthlyComponentTotals.totalPacking.toFixed(2)}</div>
            <div className="font-semibold">Received (selected month):</div><div className="font-semibold">₹{monthlyReceivedTotal.toFixed(2)}</div>
            <div className="font-semibold">Pending (selected month):</div><div className="font-semibold">₹{monthlyPending.toFixed(2)}</div>
          </div>
        </div>
      </Card>
      <Card className="mb-10">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-semibold">Transactions</h2>
              <label className="text-sm text-gray-600">Month:</label>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="border rounded px-2 py-1"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={downloadMainExcel}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 mt-2 md:mt-0"
              >
                Download Excel
              </button>
              <button
                onClick={() => setShowDebug(s => !s)}
                className={`px-3 py-2 border rounded ${showDebug ? 'bg-yellow-200' : 'bg-white'}`}
              >
                {showDebug ? 'Hide Debug' : 'Show Debug'}
              </button>
              <div className="ml-4 text-sm text-gray-700">
                <div>Month Total: <span className="font-semibold">₹{monthlyComponentTotals.totalPacking.toFixed(2)}</span></div>
                <div>Month Pending: <span className="font-semibold">₹{monthlyPending.toFixed(2)}</span></div>
              </div>
            </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer Name</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Total Packing Fees (₹)</TableHead>
                {showDebug && (
                  <>
                    <TableHead>Transportation (₹)</TableHead>
                    <TableHead>Warehousing (₹)</TableHead>
                    <TableHead>Itemwise Packing (₹)</TableHead>
                    <TableHead>Box Fee (₹)</TableHead>
                    <TableHead>Box Cutting (₹)</TableHead>
                    <TableHead>Tracking Fee (₹)</TableHead>
                  </>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedMonthlyRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">No packing fees found for selected month.</TableCell>
                </TableRow>
              ) : (
                sortedMonthlyRows.map((row, idx) => (
                  <TableRow key={row.id || idx}>
                    <TableCell>{row.date || '-'}</TableCell>
                    <TableCell>{row.orderId || row.id || '-'}</TableCell>
                    <TableCell>{row.customerName || '-'}</TableCell>
                    <TableCell className="max-w-xs truncate">{row.items || '-'}</TableCell>
                    <TableCell>{row.amount != null ? Number(row.amount).toFixed(2) : '0.00'}</TableCell>
                    {showDebug && (
                      <>
                        <TableCell>{Number(row.transportationTotal || 0).toFixed(2)}</TableCell>
                        <TableCell>{Number(row.warehousingTotal || 0).toFixed(2)}</TableCell>
                        <TableCell>{Number(row.itemPackingTotal || 0).toFixed(2)}</TableCell>
                        <TableCell>{Number(row.boxFee || 0).toFixed(2)}</TableCell>
                        <TableCell>{Number(row.boxCuttingCharge || 0).toFixed(2)}</TableCell>
                        <TableCell>{Number(row.trackingFee || 0).toFixed(2)}</TableCell>
                      </>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Received Payments Table */}
      <Card>
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between">
          <h2 className="text-2xl font-semibold">Payments</h2>
          <button
            onClick={downloadReceivedExcel}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 mt-2 md:mt-0"
          >
            Download Excel
          </button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Merchant ID</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Amount (₹)</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receivedPayments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">No received payments found.</TableCell>
                </TableRow>
              ) : (
                receivedPayments.map((p, idx) => (
                  <TableRow key={p.id || idx}>
                    <TableCell>{p.date || '-'}</TableCell>
                    <TableCell>{p.merchantId || '-'}</TableCell>
                    <TableCell>{getMerchantName(p.merchantId)}</TableCell>
                    <TableCell>{p.amount != null ? p.amount.toFixed(2) : '-'}</TableCell>
                    <TableCell>{p.notes || '-'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default PaymentsPanel;
