import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.jsx';
import { Badge } from '../ui/badge.jsx';
import { motion, AnimatePresence } from 'framer-motion';

const formatLocation = (location) => {
  if (!location) return '';
  const { buildingNumber, location: loc, pincode, phone } = location;
  return `${buildingNumber ? buildingNumber + ', ' : ''}${loc ? loc + ', ' : ''}${pincode ? pincode + ', ' : ''}${phone ? 'Phone: ' + phone : ''}`.replace(/, $/, '');
};

const InventoryRequestsList = ({ requests, products }) => {
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Products</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Weight (kg)</TableHead>
            <TableHead>Pickup/Delivery Location</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence>
            {requests.map(request => {
              const totalQuantity = request.items.reduce((sum, item) => sum + item.quantity, 0);
              const isCompleted = request.status === 'completed';
              return (
                <motion.tr
                  key={request.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  layout
                >
                  <TableCell>{request.id}</TableCell>
                  <TableCell>{request.type}</TableCell>
                  <TableCell>
                    {request.items.map(item => {
                      const product = products.find(p => p.id === item.productId);
                      return product ? `${product.name} (x${item.quantity})` : 'Unknown product';
                    }).join(', ')}
                  </TableCell>
                  <TableCell className="text-right">{totalQuantity}</TableCell>
                  <TableCell className="text-right">{request.totalWeightKg !== undefined && request.totalWeightKg !== null ? request.totalWeightKg.toFixed(2) : ''}</TableCell>
                  <TableCell>{formatLocation(request.type === 'inbound' ? request.pickupLocation : request.deliveryLocation)}</TableCell>
                  <TableCell>
                    <Badge variant={isCompleted ? 'success' : 'default'} className="text-xs">
                      {request.status}
                    </Badge>
                  </TableCell>
                  {/* Fee column removed */}
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </TableBody>
      </Table>
      {requests.length === 0 && (
        <p className="text-center text-muted-foreground py-4">No inventory requests found.</p>
      )}
    </>
  );
};

export default InventoryRequestsList;
