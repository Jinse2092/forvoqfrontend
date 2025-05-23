import React from 'react';
import { useInventory } from '@/context/inventory-context.jsx';

const ReceivedPayments = () => {
  const { users, transactions, currentUser } = useInventory();

  if (currentUser.role !== 'admin') {
    return <p>Access Denied: This page is only accessible by admins.</p>;
  }

  // Calculate the amount owed by each merchant grouped by months
  const paymentsByMerchant = transactions.reduce((acc, txn) => {
    if (!txn.merchantId || !txn.amount) return acc;
    const merchant = users.find(user => user.id === txn.merchantId);
    if (!merchant) return acc;

    const month = new Date(txn.date).toLocaleString('default', { month: 'long', year: 'numeric' });
    if (!acc[merchant.companyName]) acc[merchant.companyName] = {};
    if (!acc[merchant.companyName][month]) acc[merchant.companyName][month] = 0;

    acc[merchant.companyName][month] += txn.amount;
    return acc;
  }, {});

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-4">Received Payments</h1>
      <table className="min-w-full bg-white border border-gray-200">
        <thead>
          <tr>
            <th className="px-4 py-2 border-b">Merchant Name</th>
            <th className="px-4 py-2 border-b">Month</th>
            <th className="px-4 py-2 border-b">Amount Owed (₹)</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(paymentsByMerchant).map(([merchantName, months]) => (
            Object.entries(months).map(([month, amount]) => (
              <tr key={`${merchantName}-${month}`}>
                <td className="px-4 py-2 border-b">{merchantName}</td>
                <td className="px-4 py-2 border-b">{month}</td>
                <td className="px-4 py-2 border-b">₹{amount.toFixed(2)}</td>
              </tr>
            ))
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default ReceivedPayments;