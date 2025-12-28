import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInventory } from '../../context/inventory-context.jsx';
import { Card, CardContent, CardHeader } from '../../components/ui/card.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx';
import * as XLSX from 'xlsx';

const MerchantPaymentsPage = () => {
  const { id: merchantId } = useParams();
  const navigate = useNavigate();
  const { users = [] } = useInventory();

  const [orders, setOrders] = useState([]);
  const [receivedPayments, setReceivedPayments] = useState([]);
  const [packingFeesMap, setPackingFeesMap] = useState({});
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0,7));
  const [showDebug, setShowDebug] = useState(false);

  useEffect(() => {
    if (!merchantId) return;
    fetch('http://localhost:4000/api/orders')
      .then(res => res.json())
      .then(data => setOrders(Array.isArray(data) ? data.filter(o => o.merchantId === merchantId) : []))
      .catch(() => setOrders([]));

    fetch(`http://localhost:4000/api/received-payments?merchantId=${merchantId}`)
      .then(res => res.json())
      .then(data => setReceivedPayments(Array.isArray(data) ? data : []))
      .catch(() => setReceivedPayments([]));
  }, [merchantId]);

  const visibleOrders = orders || [];

  useEffect(() => {
    const ids = visibleOrders.map(o => o.id).filter(Boolean);
    if (ids.length === 0) { setPackingFeesMap({}); return; }
    const q = ids.join(',');
    fetch(`http://localhost:4000/api/packingfees?orderIds=${encodeURIComponent(q)}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.map) setPackingFeesMap(data.map || {});
        else setPackingFeesMap({});
      }).catch(() => setPackingFeesMap({}));
  }, [visibleOrders]);

  const getMerchantName = (id) => { const u = users.find(x => x.id === id); return u ? u.companyName : id; };

  const parseNumber = (v) => { if (v == null) return 0; if (typeof v === 'number') return v; const cleaned = String(v).replace(/[^0-9.-]+/g, ''); const n = Number(cleaned); return isNaN(n) ? 0 : n; };

  const tableRows = (visibleOrders || []).map(o => {
    const pd = o.packingDetails || o.packingdetails || o.packing_details;
    const odItems = o.items || o.orderItems || [];
    const itemsSource = pd || odItems;
    const itemsSummary = itemsSource && Array.isArray(itemsSource) ? itemsSource.map(i => `${i.name || i.productName || i.productId || 'Item'} x${i.quantity||i.qty||1}`).join(', ') : '-';
    const pfDoc = packingFeesMap[o.id] || null;
    const pdItems = Array.isArray(pd) ? pd : (pfDoc && Array.isArray(pfDoc.items) ? pfDoc.items : null);
    let transportationTotal = 0, warehousingTotal = 0, itemPackingTotal = 0;
    if (pdItems) pdItems.forEach(it => { const q = Number(it.quantity||0)||0; transportationTotal += (Number(it.transportationPerItem ?? it.transportation ?? 0)||0)*q; warehousingTotal += (Number(it.warehousingPerItem ?? it.warehousing ?? 0)||0)*q; itemPackingTotal += (Number(it.itemPackingPerItem ?? it.itemPackingFee ?? it.itemPacking ?? 0)||0)*q; });
    const boxFee = parseNumber(pfDoc?.boxFee ?? o.boxFee ?? 0);
    const boxCuttingCharge = (pfDoc && pfDoc.boxCutting !== undefined) ? (pfDoc.boxCutting ? 1 : 0) : (o.boxCutting ? 1 : 0);
    const trackingFee = parseNumber(pfDoc?.trackingFee ?? o.trackingFee ?? 0);
    const totalPackingFee = parseNumber(pfDoc?.totalPackingFee ?? o.packingFee ?? 0);
    return { id: o.id, date: o.date || o.createdAt || '-', orderId: o.id, customerName: o.customerName || o.customer || 'Unknown', items: itemsSummary, amount: totalPackingFee, transportationTotal, warehousingTotal, itemPackingTotal, boxFee, boxCuttingCharge, trackingFee };
  });

  const getYYYYMM = (dateStr) => { if (!dateStr) return null; const prefix = String(dateStr).slice(0,7); if (/^\d{4}-\d{2}$/.test(prefix)) return prefix; const d = new Date(dateStr); if (!isNaN(d)) return d.toISOString().slice(0,7); return null; };

  const monthlyRows = tableRows.filter(r => getYYYYMM(r.date) === selectedMonth);
  const sortedMonthlyRows = monthlyRows.slice().sort((a,b)=> new Date(a.date||0)-new Date(b.date||0));

  const monthlyComponentTotals = sortedMonthlyRows.reduce((acc,r)=>{ acc.transportation+=Number(r.transportationTotal||0); acc.warehousing+=Number(r.warehousingTotal||0); acc.itemPacking+=Number(r.itemPackingTotal||0); acc.boxFee+=Number(r.boxFee||0); acc.boxCutting+=Number(r.boxCuttingCharge||0); acc.tracking+=Number(r.trackingFee||0); acc.totalPacking+=Number(r.amount||0); return acc; }, {transportation:0, warehousing:0, itemPacking:0, boxFee:0, boxCutting:0, tracking:0, totalPacking:0});

  const monthlyReceivedTotal = (receivedPayments||[]).filter(p=>getYYYYMM(p.date)===selectedMonth).reduce((s,p)=>s+ (Number(p.amount)||0),0);
  const monthlyPending = monthlyComponentTotals.totalPacking - monthlyReceivedTotal;

  const downloadMainExcel = () => {
    const data = sortedMonthlyRows.map(r=>({ Date: r.date||'', 'Order ID': r.orderId, 'Customer Name': r.customerName, Items: r.items, 'Total Packing Fees (₹)': Number(r.amount||0).toFixed(2), 'Transportation (₹)': Number(r.transportationTotal||0).toFixed(2), 'Warehousing (₹)': Number(r.warehousingTotal||0).toFixed(2), 'Itemwise Packing (₹)': Number(r.itemPackingTotal||0).toFixed(2), 'Box Fee (₹)': Number(r.boxFee||0).toFixed(2), 'Box Cutting (₹)': Number(r.boxCuttingCharge||0).toFixed(2), 'Tracking Fee (₹)': Number(r.trackingFee||0).toFixed(2) }));
    const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Payments'); XLSX.writeFile(wb, `merchant_${merchantId}_packing_fees_${selectedMonth||'all'}.xlsx`);
  };

  const downloadReceivedExcel = () => { const data = (receivedPayments||[]).map(p=>({ Date: p.date||'', 'Merchant ID': p.merchantId, Merchant: getMerchantName(p.merchantId), 'Amount (₹)': p.amount!=null?Number(p.amount).toFixed(2):'', Notes: p.notes||'' })); const ws = XLSX.utils.json_to_sheet(data); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Received Payments'); XLSX.writeFile(wb, `merchant_${merchantId}_received_payments.xlsx`); };

  const merchant = users.find(u=>u.id===merchantId) || { companyName: merchantId };

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Merchant Payments — {merchant.companyName}</h1>
          <div className="space-x-2">
            <button onClick={() => navigate(-1)} className="px-3 py-2 border rounded">Back</button>
            <button onClick={downloadMainExcel} className="px-3 py-2 bg-green-600 text-white rounded">Download Excel</button>
          </div>
        </div>

        <Card className="mt-4 mb-4">
          <CardHeader className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Monthly Billing Summary — {selectedMonth}</h3>
            <div className="text-sm text-gray-600">Orders: {sortedMonthlyRows.length} • Total Fees: ₹{monthlyComponentTotals.totalPacking.toFixed(2)}</div>
          </CardHeader>
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

        <Card className="mb-6">
          <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-2xl font-semibold">Transactions</h2>
              <label className="text-sm text-gray-600">Month:</label>
              <input type="month" value={selectedMonth} onChange={(e)=>setSelectedMonth(e.target.value)} className="border rounded px-2 py-1" />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={downloadMainExcel} className="px-4 py-2 bg-green-600 text-white rounded">Download Excel</button>
              <button onClick={() => setShowDebug(s=>!s)} className={`px-3 py-2 border rounded ${showDebug? 'bg-yellow-200':'bg-white'}`}>{showDebug? 'Hide Debug':'Show Debug'}</button>
              <div className="ml-4 text-sm text-gray-700"><div>Month Total: <span className="font-semibold">₹{monthlyComponentTotals.totalPacking.toFixed(2)}</span></div><div>Month Pending: <span className="font-semibold">₹{monthlyPending.toFixed(2)}</span></div></div>
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
                  {showDebug && (<><TableHead>Transportation (₹)</TableHead><TableHead>Warehousing (₹)</TableHead><TableHead>Itemwise Packing (₹)</TableHead><TableHead>Box Fee (₹)</TableHead><TableHead>Box Cutting (₹)</TableHead><TableHead>Tracking Fee (₹)</TableHead></>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedMonthlyRows.length===0? (<TableRow><TableCell colSpan={5} className="text-center">No packing fees found for selected month.</TableCell></TableRow>) : (
                  sortedMonthlyRows.map((row, idx)=>(
                    <TableRow key={row.id||idx}>
                      <TableCell>{row.date||'-'}</TableCell>
                      <TableCell>{row.orderId||'-'}</TableCell>
                      <TableCell>{row.customerName||'-'}</TableCell>
                      <TableCell className="max-w-xs truncate">{row.items||'-'}</TableCell>
                      <TableCell>{Number(row.amount||0).toFixed(2)}</TableCell>
                      {showDebug && (<><TableCell>{Number(row.transportationTotal||0).toFixed(2)}</TableCell><TableCell>{Number(row.warehousingTotal||0).toFixed(2)}</TableCell><TableCell>{Number(row.itemPackingTotal||0).toFixed(2)}</TableCell><TableCell>{Number(row.boxFee||0).toFixed(2)}</TableCell><TableCell>{Number(row.boxCuttingCharge||0).toFixed(2)}</TableCell><TableCell>{Number(row.trackingFee||0).toFixed(2)}</TableCell></>)}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex items-center justify-between"><h2 className="text-2xl font-semibold">Payments</h2><button onClick={downloadReceivedExcel} className="px-4 py-2 bg-green-600 text-white rounded">Download Excel</button></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow><TableHead>Date</TableHead><TableHead>Merchant ID</TableHead><TableHead>Merchant</TableHead><TableHead>Amount (₹)</TableHead><TableHead>Notes</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {receivedPayments.length===0? (<TableRow><TableCell colSpan={5} className="text-center">No received payments found.</TableCell></TableRow>) : (receivedPayments.map((p,idx)=>(<TableRow key={p.id||idx}><TableCell>{p.date||'-'}</TableCell><TableCell>{p.merchantId||'-'}</TableCell><TableCell>{getMerchantName(p.merchantId)}</TableCell><TableCell>{p.amount!=null?Number(p.amount).toFixed(2):'-'}</TableCell><TableCell>{p.notes||'-'}</TableCell></TableRow>)))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MerchantPaymentsPage;
