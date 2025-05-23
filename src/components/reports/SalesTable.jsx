
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const SalesTable = ({ data }) => {
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
             {data[0]?.merchantId && <TableHead>Merchant</TableHead>}
            <TableHead>Order ID</TableHead>
            <TableHead>Product</TableHead>
            <TableHead className="text-right">Quantity Sold</TableHead>
            <TableHead className="text-right">Revenue</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{new Date(item.date).toLocaleDateString()}</TableCell>
               {item.merchantId && <TableCell className="text-xs text-muted-foreground">{item.merchantId}</TableCell>}
               <TableCell className="text-xs text-muted-foreground">{item.orderId || '-'}</TableCell>
              <TableCell className="font-medium">{item.productName}</TableCell>
              <TableCell className="text-right">{item.quantity}</TableCell>
              <TableCell className="text-right">₹{item.revenue.toFixed(2)}</TableCell>
              <TableCell>{item.notes}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
       {data.length === 0 && (
         <p className="text-center text-muted-foreground py-4">No sales data available.</p>
       )}
    </>
  );
};

export default SalesTable;
  