import React, { useState, useEffect } from 'react';
import { useInventory } from '../context/inventory-context.jsx';
import { Card, CardContent, CardHeader } from '../components/ui/card.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table.jsx';
import * as XLSX from 'xlsx';

const PaymentsPanel = () => {
  const { transactions, users, currentUser } = useInventory();
  const [receivedPayments, setReceivedPayments] = useState([]);

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
  }, [currentUser]);

  const getMerchantName = (merchantId) => {
    if (!users) return merchantId;
    const user = users.find(u => u.id === merchantId);
    return user ? user.companyName : merchantId;
  };

  // Main payments table: combine transactions and received payments as rows
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
  const filteredTransactions = currentUser?.role === 'merchant'
    ? combinedTransactions.filter(txn => txn.merchantId === currentUser.id)
    : combinedTransactions;

  // Calculate total and pending payments for the current merchant
  const isMerchant = currentUser?.role === 'merchant' && currentUser?.id;
  // Only consider this merchant's transactions if merchant, else all
  const relevantTransactions = isMerchant
    ? combinedTransactions.filter(txn => txn.merchantId === currentUser.id)
    : combinedTransactions;

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

  const downloadMainExcel = () => {
    const worksheetData = filteredTransactions.map(txn => ({
      Date: txn.date || '',
      'Merchant ID': txn.merchantId || '',
      Merchant: getMerchantName(txn.merchantId),
      Type: txn.type || '',
      Amount: txn.amount != null ? txn.amount.toFixed(2) : '',
      Quantity: txn.type === 'dispatch_fee' ? txn.quantity : '',
      'Price per Unit': txn.type === 'dispatch_fee' && txn.quantity > 0 ? (txn.amount / txn.quantity).toFixed(2) : '',
      Notes: txn.notes || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payments');
    XLSX.writeFile(workbook, `payments_full.xlsx`);
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

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-start gap-8 mb-4">
        <div>
          <div className="text-lg font-semibold text-gray-700">Total Payment</div>
          <div className="text-2xl font-bold text-green-700">₹{totalPayment.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-gray-700">Pending Payment</div>
          <div className="text-2xl font-bold text-red-700">₹{pendingPayment.toFixed(2)}</div>
        </div>
      </div>

      {/* Main Payments Table */}
      <Card className="mb-10">
        <CardHeader className="flex flex-col md:flex-row md:items-center md:justify-between">
          <h2 className="text-2xl font-semibold">Transactions</h2>
          <button
            onClick={downloadMainExcel}
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
                <TableHead>Type</TableHead>
                <TableHead>Amount (₹)</TableHead>
                <TableHead>Quantity</TableHead>
                <TableHead>Price per Unit (₹)</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">No payments found.</TableCell>
                </TableRow>
              ) : (
                filteredTransactions.map((txn, idx) => {
                  const isDispatchFee = txn.type === 'dispatch_fee';
                  const quantity = isDispatchFee ? txn.quantity : '-';
                  const pricePerUnit = isDispatchFee && txn.quantity > 0 ? (txn.amount / txn.quantity).toFixed(2) : '-';
                  return (
                    <TableRow key={txn.id || idx}>
                      <TableCell>{txn.date || '-'}</TableCell>
                      <TableCell>{txn.merchantId || '-'}</TableCell>
                      <TableCell>{getMerchantName(txn.merchantId)}</TableCell>
                      <TableCell>{txn.type || '-'}</TableCell>
                      <TableCell>{txn.amount != null ? txn.amount.toFixed(2) : '-'}</TableCell>
                      <TableCell>{quantity}</TableCell>
                      <TableCell>{pricePerUnit}</TableCell>
                      <TableCell>{txn.notes || '-'}</TableCell>
                    </TableRow>
                  );
                })
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
