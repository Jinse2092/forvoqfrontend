
import React from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlusCircle, MinusCircle, Edit, Trash2, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge.jsx'; // Corrected import path

const InventoryList = ({ inventory, openEditModal, openAdjustModal, getProductName, isAdminView, users }) => {
  // Deletion might be handled differently or disabled
  // const handleDelete = (id) => {
  //   if (window.confirm('Are you sure you want to delete this inventory item?')) {
  //     deleteInventoryItem(id);
  //   }
  // };

  const getMerchantName = (merchantId) => {
    const user = users.find(u => u.id === merchantId);
    return user ? user.companyName : merchantId;
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            {isAdminView && <TableHead>Merchant ID</TableHead>}
            {isAdminView && <TableHead>Merchant Name</TableHead>}
            <TableHead>Product</TableHead>
            <TableHead>Location</TableHead>
            <TableHead className="text-right">Quantity</TableHead>
            <TableHead className="text-right">Min Stock</TableHead>
            <TableHead className="text-right">Max Stock</TableHead>
            <TableHead className="text-center">Status</TableHead>
            {isAdminView && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          <AnimatePresence>
            {inventory.map((item, index) => {
              const isLowStock = item.minStockLevel > 0 && item.quantity <= item.minStockLevel; // Check minStockLevel > 0
              const isOverStock = item.maxStockLevel > 0 && item.quantity > item.maxStockLevel; // Check maxStockLevel > 0
              let statusVariant = 'default';
              let statusText = 'OK';
              if (isLowStock) {
                 statusVariant = 'destructive';
                 statusText = 'Low';
              } else if (isOverStock) {
                 statusVariant = 'warning'; // Use a warning variant
                 statusText = 'Over';
              }


              return (
                <motion.tr
                  key={item.id || index}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  layout
                  className={isLowStock ? 'bg-red-50 dark:bg-red-900/20' : isOverStock ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}
                >
                  {isAdminView && <TableCell className="text-xs text-muted-foreground">{item.merchantId}</TableCell>}
                  {isAdminView && <TableCell className="text-xs text-muted-foreground">{getMerchantName(item.merchantId)}</TableCell>}
                  <TableCell className="font-medium">{getProductName(item.productId)}</TableCell>
                  <TableCell>{item.location}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">{item.minStockLevel > 0 ? item.minStockLevel : '-'}</TableCell>
                  <TableCell className="text-right">{item.maxStockLevel > 0 ? item.maxStockLevel : '-'}</TableCell>
                  <TableCell className="text-center">
                     <Badge variant={statusVariant} className="text-xs">
                       {isLowStock && <AlertTriangle className="h-3 w-3 mr-1 inline-block" />}
                       {isOverStock && <AlertTriangle className="h-3 w-3 mr-1 inline-block" />}
                       {statusText}
                     </Badge>
                  </TableCell>
                  {isAdminView && (
                    <TableCell className="text-right space-x-1">
                      {/* Adjust stock is likely an admin action */}
                      <Button variant="ghost" size="icon" onClick={() => openAdjustModal(item)} title="Adjust Stock">
                        <PlusCircle className="h-4 w-4 mr-0.5 text-green-600" />
                        <MinusCircle className="h-4 w-4 text-red-600" />
                      </Button>
                      {/* Edit might be for min/max levels */}
                      <Button variant="ghost" size="icon" onClick={() => openEditModal(item)} title="Edit Details">
                        <Edit className="h-4 w-4" />
                      </Button>
                      {/* Deletion is restricted */}
                      {/*
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(item.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      */}
                    </TableCell>
                  )}
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </TableBody>
      </Table>
      {inventory.length === 0 && (
        <p className="text-center text-muted-foreground py-4">No inventory items found.</p>
      )}
    </>
  );
};

export default InventoryList;
  