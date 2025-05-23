
import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const InventoryValueTable = ({ data }) => {
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
             {data[0]?.merchantId && <TableHead>Merchant</TableHead>}
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Unit Price</TableHead>
            <TableHead className="text-right">Total Value</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, index) => (
            <TableRow key={index}>
              <TableCell className="font-medium">{item.name}</TableCell>
               {item.merchantId && <TableCell className="text-xs text-muted-foreground">{item.merchantId}</TableCell>}
              <TableCell className="text-right">{item.quantity}</TableCell>
              <TableCell className="text-right">₹{item.unitPrice.toFixed(2)}</TableCell>
              <TableCell className="text-right">₹{item.totalValue.toFixed(2)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {data.length === 0 && (
        <p className="text-center text-muted-foreground py-4">No inventory value data available.</p>
      )}
    </>
  );
};

export default InventoryValueTable;
  