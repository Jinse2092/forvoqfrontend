import React, { useState, useEffect } from 'react';
import { useInventory } from '../../context/inventory-context.jsx';
import { Card, CardContent, CardHeader } from '../../components/ui/card.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx';
import * as XLSX from 'xlsx';

const AdminPayments = () => {
  // Demo variables for testing
  const demoUsers = [
    { id: 'merchant-1', companyName: 'Merchant One', role: 'merchant' },
    { id: 'merchant-2', companyName: 'Merchant Two', role: 'merchant' },
  ];
  const demoTransactions = [
    { id: 'txn-1', merchantId: 'merchant-1', amount: 100, type: 'sale', date: '2024-06-01' },
    { id: 'txn-2', merchantId: 'merchant-2', amount: 200, type: 'sale', date: '2024-06-02' },
  ];
  const demoCurrentUser = { id: 'admin-1', role: 'admin' };

  const { transactions = demoTransactions, users = demoUsers, currentUser = demoCurrentUser } = useInventory();
  const [formData, setFormData] = useState({
    merchantId: '',
    amount: '',
    notes: '',
    merchantSearch: ''
  });

  // New state to track received payments separately
  const [receivedPayments, setReceivedPayments] = useState([]);

  // New state to control dropdown visibility
  const [isDropdownVisible, setIsDropdownVisible] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === 'merchantSearch') {
      setIsDropdownVisible(true);
    }
  };

  // Fetch received payments from backend on mount
  useEffect(() => {
    fetch('https://forwokbackend-1.onrender.com/api/received-payments')
      .then(res => res.json())
      .then(data => setReceivedPayments(data))
      .catch(err => console.error('Error fetching received payments:', err));
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();

    // If merchantId is empty but merchantSearch is filled, try to find matching merchant
    let merchantIdToUse = formData.merchantId;
    if (!merchantIdToUse && formData.merchantSearch) {
      const matchedUser = users.find(
        (u) =>
          u.role === 'merchant' &&
          (u.companyName.toLowerCase() === formData.merchantSearch.toLowerCase() ||
           u.id.toLowerCase() === formData.merchantSearch.toLowerCase())
      );
      if (matchedUser) {
        merchantIdToUse = matchedUser.id;
      }
    }

    if (!merchantIdToUse || !formData.amount) {
      alert('Please fill in all required fields.');
      return;
    }
    const amountNum = parseFloat(formData.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Please enter a valid positive amount.');
      return;
    }

    // Post new received payment to backend
    const newReceivedPayment = {
      merchantId: merchantIdToUse,
      amount: amountNum,
      notes: formData.notes,
      date: new Date().toISOString().split('T')[0], // current date YYYY-MM-DD
      type: 'received_payment'
    };

    fetch('https://forwokbackend-1.onrender.com/api/received-payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newReceivedPayment),
    })
      .then(res => {
        if (!res.ok) throw new Error('Failed to add received payment');
        return res.json();
      })
      .then(addedPayment => {
        setReceivedPayments(prev => [addedPayment, ...prev]);
        setFormData({ merchantId: '', merchantSearch: '', amount: '', notes: '' });
      })
      .catch(err => {
        console.error(err);
        alert('Error adding received payment');
      });
  };

  // Combine transactions and receivedPayments for display in payments table
  const combinedTransactions = [...transactions, ...receivedPayments];

  // Filter combined transactions to only include inbound_fee, outbound_fee, and dispatch_fee types
  const filteredTransactions = combinedTransactions.filter(txn =>
    txn.type === 'inbound_fee' || txn.type === 'outbound_fee' || txn.type === 'dispatch_fee'
  );

  // Group filtered transactions by merchantId
  const paymentsByMerchant = filteredTransactions.reduce((acc, txn) => {
    if (!txn.merchantId) return acc;
    if (!acc[txn.merchantId]) acc[txn.merchantId] = [];
    acc[txn.merchantId].push(txn);
    return acc;
  }, {});

  // Get merchant name by ID
  const getMerchantName = (merchantId) => {
    const user = users.find(u => u.id === merchantId);
    return user ? user.companyName : merchantId;
  };

  // Helper to calculate total amount for given transactions, treat missing amount as 0
  // Deduct amounts for received_payment type transactions
  const calculateTotal = (txns) => txns.reduce((sum, txn) => {
    if (txn.type === 'received_payment') {
      return sum - (txn.amount || 0);
    }
    return sum + (txn.amount || 0);
  }, 0);

  // Helper to filter settlement fee transactions (types ending with '_fee')
  const isSettlementFee = (txn) => txn.type && txn.type.endsWith('_fee');

  const downloadExcel = (merchantId, txns) => {
    const worksheetData = txns.map(txn => ({
      Date: txn.date || '',
      Type: txn.type || '',
      Amount: txn.amount != null ? txn.amount.toFixed(2) : '',
      Quantity: txn.type === 'dispatch_fee' ? txn.quantity : '',
      'Price per Unit': txn.type === 'dispatch_fee' && txn.quantity > 0 ? (txn.amount / txn.quantity).toFixed(2) : '',
      Notes: txn.notes || ''
    }));
    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Payments');
    XLSX.writeFile(workbook, `payments_${merchantId}.xlsx`);
  };

  // Filter received payments for display
  const receivedPaymentsByMerchant = receivedPayments.reduce((acc, rp) => {
    if (!rp.merchantId) return acc;
    if (!acc[rp.merchantId]) acc[rp.merchantId] = [];
    acc[rp.merchantId].push(rp);
    return acc;
  }, {});

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <h1 className="text-4xl font-extrabold mb-8 text-center text-gray-900 dark:text-gray-100">Merchant Payments</h1>

      <Card className="max-w-4xl mx-auto p-6 shadow-lg bg-white dark:bg-gray-800 rounded-lg">
        <form onSubmit={handleSubmit} className="flex flex-wrap gap-4 justify-center items-center">
          {/* Searchable merchant select */}
          <div className="relative w-64">
              <input
              type="text"
              placeholder="Search merchant by name or paste ID..."
              value={formData.merchantSearch || ''}
              onChange={(e) => {
                const inputValue = e.target.value;
                // While typing, update merchantSearch but do not clear merchantId immediately
                setFormData((prev) => ({
                  ...prev,
                  merchantSearch: inputValue,
                }));
                setIsDropdownVisible(true);
              }}
              className="w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
            />
            {isDropdownVisible && formData.merchantSearch && (
              <ul className="absolute z-10 max-h-48 w-full overflow-auto rounded border border-gray-300 bg-white dark:bg-gray-800 dark:border-gray-600">
                {users
                  .filter((user) =>
                    user.role === 'merchant' &&
                    (user.companyName.toLowerCase().includes(formData.merchantSearch.toLowerCase()) ||
                    user.id.toLowerCase().includes(formData.merchantSearch.toLowerCase()))
                  )
                  .map((user) => (
                    <li
                      key={user.id}
                      className="cursor-pointer px-3 py-2 hover:bg-blue-500 hover:text-white dark:hover:bg-blue-600"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          merchantId: user.id,
                          merchantSearch: user.companyName,
                        }));
                        setIsDropdownVisible(false);
                      }}
                    >
                      <span>{user.companyName}</span> <span className="text-sm text-gray-500 dark:text-gray-400">({user.id})</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!formData.merchantId) {
                if (window.confirm('Download report for all merchants?')) {
                  downloadExcel('all_merchants', combinedTransactions);
                }
              } else {
                if (window.confirm('Download report for selected merchant only?')) {
                  const merchantTxns = combinedTransactions.filter(txn => txn.merchantId === formData.merchantId);
                  downloadExcel(formData.merchantId, merchantTxns);
                }
              }
            }}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            Download Report
          </button>
          <input
            type="number"
            id="amount"
            name="amount"
            placeholder="Amount (₹)"
            value={formData.amount}
            onChange={handleInputChange}
            className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
          />
          <input
            type="text"
            id="notes"
            name="notes"
            placeholder="Notes (optional)"
            value={formData.notes}
            onChange={handleInputChange}
            className="border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Add Received Payment
          </button>
        </form>
      </Card>

      {/* Received Payments Table */}
      {receivedPayments.length > 0 && (
        <div className="max-w-6xl mx-auto space-y-6">
          <Card className="shadow-lg bg-white dark:bg-gray-800 rounded-lg">
            <CardHeader className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Received Payments</h2>
              <button
                onClick={() => downloadExcel('all_received_payments', receivedPayments)}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
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
                {receivedPayments.map(rp => (
                  <TableRow key={rp.id}>
                    <TableCell>{rp.date}</TableCell>
                    <TableCell>{rp.merchantId}</TableCell>
                    <TableCell>{getMerchantName(rp.merchantId)}</TableCell>
                    <TableCell>{rp.amount.toFixed(2)}</TableCell>
                    <TableCell>{rp.notes || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Payments Table */}
      {Object.keys(paymentsByMerchant).length === 0 ? (
        <p className="text-center text-gray-600 dark:text-gray-400">No payments found.</p>
      ) : (
        <div className="max-w-6xl mx-auto space-y-6">
          {Object.entries(paymentsByMerchant).map(([merchantId, txns]) => {
            const totalAmount = calculateTotal(txns);
            const settlementFees = calculateTotal(txns.filter(isSettlementFee));
            return (
              <Card key={merchantId} className="shadow-lg bg-white dark:bg-gray-800 rounded-lg">
                <CardHeader className="flex justify-between items-start">
                  <div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{getMerchantName(merchantId)}</h2>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{merchantId}</p>
                    </div>
            {/* Calculate total payments excluding received payments */}
            <p>Total Payments: ₹{calculateTotal(txns.filter(txn => txn.type !== 'received_payment')).toFixed(2)}</p>
            <p className="font-medium">
              Due Payments: ₹{(settlementFees - (receivedPaymentsByMerchant[merchantId]?.reduce((sum, rp) => sum + rp.amount, 0) || 0)).toFixed(2)}
            </p>
                  </div>
                  <div>
                    <button
                      onClick={() => downloadExcel(merchantId, txns)}
                      className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                    >
                      Download Excel
                    </button>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right align-middle">Amount (₹)</TableHead>
                    <TableHead className="text-right align-middle">Quantity</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {txns.map(txn => {
                        const isDispatchFee = txn.type === 'dispatch_fee';
                        const quantity = isDispatchFee ? txn.quantity : '-';
                        const pricePerUnit = isDispatchFee && txn.quantity > 0 ? (txn.amount / txn.quantity).toFixed(2) : '-';
                        return (
                          <TableRow key={txn.id}>
                            <TableCell>{txn.date || '-'}</TableCell>
                            <TableCell>{txn.type}</TableCell>
                            <TableCell className="text-right align-middle">{txn.amount?.toFixed(2) || '-'}</TableCell>
                            <TableCell className="text-right align-middle">{quantity}</TableCell>
                            <TableCell>{txn.notes || '-'}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AdminPayments;
