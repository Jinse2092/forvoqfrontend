import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.jsx';
import { Badge } from '../ui/badge.jsx';
import { AlertTriangle } from 'lucide-react';

const StockLevelTable = ({ data }) => {
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Product</TableHead>
            {data[0]?.merchantId && <TableHead>Merchant</TableHead>}
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Min Stock</TableHead>
            <TableHead className="text-right">Max Stock</TableHead>
            <TableHead className="text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((item, index) => {
             const isLowStock = item.minStock > 0 && item.quantity <= item.minStock;
             const isOverStock = item.maxStock > 0 && item.quantity > item.maxStock;
             let statusVariant = 'default';
             let statusText = 'OK';
             if (isLowStock) {
                statusVariant = 'destructive';
                statusText = 'Low';
             } else if (isOverStock) {
                statusVariant = 'warning';
                statusText = 'Over';
             }

             return (
              <TableRow key={index} className={isLowStock ? 'bg-red-50 dark:bg-red-900/20' : isOverStock ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}>
                <TableCell className="font-medium">{item.productName}</TableCell>
                 {item.merchantId && <TableCell className="text-xs text-muted-foreground">{item.merchantId}</TableCell>}
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell className="text-right">{item.minStock > 0 ? item.minStock : '-'}</TableCell>
                <TableCell className="text-right">{item.maxStock > 0 ? item.maxStock : '-'}</TableCell>
                <TableCell className="text-center">
                   <Badge variant={statusVariant} className="text-xs">
                     {(isLowStock || isOverStock) && <AlertTriangle className="h-3 w-3 mr-1 inline-block" />}
                     {statusText}
                   </Badge>
                </TableCell>
              </TableRow>
             )
          })}
        </TableBody>
      </Table>
      {data.length === 0 && (
        <p className="text-center text-muted-foreground py-4">No stock level data available.</p>
      )}
    </>
  );
};

export default StockLevelTable;
