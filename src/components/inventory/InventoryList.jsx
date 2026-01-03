
import React, { useState } from 'react';
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

  const [expanded, setExpanded] = useState({});

  // Group inventory by productId
  const groups = inventory.reduce((acc, item) => {
    const key = item.productId || 'unknown';
    if (!acc[key]) acc[key] = { productId: key, batches: [] };
    acc[key].batches.push(item);
    return acc;
  }, {});
  const groupList = Object.values(groups);

  return (
    <>
      <Table>
        <TableHeader>
            <TableRow>
            {isAdminView && <TableHead>Merchant ID</TableHead>}
            {isAdminView && <TableHead>Merchant Name</TableHead>}
            <TableHead>Product</TableHead>
            <TableHead>Expiry</TableHead>
            <TableHead>Inbound Date</TableHead>
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
            {groupList.map((group) => {
              const batches = group.batches || [];
              const totalQty = batches.reduce((s, it) => s + (Number(it.quantity || 0)), 0);
              const merchantIds = Array.from(new Set(batches.map(b => b.merchantId).filter(Boolean)));
              const singleMerchant = merchantIds.length === 1 ? merchantIds[0] : null;

              return (
                <React.Fragment key={group.productId}>
                  <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} layout className="bg-surface">
                    {isAdminView && <TableCell className="text-xs text-muted-foreground">{singleMerchant || (merchantIds.length > 1 ? 'Multiple' : '')}</TableCell>}
                    {isAdminView && <TableCell className="text-xs text-muted-foreground">{singleMerchant ? getMerchantName(singleMerchant) : (merchantIds.length > 1 ? 'Multiple Merchants' : '')}</TableCell>}
                    <TableCell className="font-medium">
                      <button onClick={() => setExpanded(prev => ({ ...prev, [group.productId]: !prev[group.productId] }))} className="mr-2">
                        {expanded[group.productId] ? <MinusCircle className="inline-block mr-2" /> : <PlusCircle className="inline-block mr-2" />}
                      </button>
                      {getProductName(group.productId)}
                    </TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell className="text-right">{totalQty}</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-center">-</TableCell>
                    {isAdminView && <TableCell />}
                  </motion.tr>

                  {expanded[group.productId] && batches.map((item, index) => {
                    const qty = typeof item.quantity === 'number' ? item.quantity : (item.quantity ? Number(item.quantity) : 0);
                    const min = typeof item.minStockLevel === 'number' ? item.minStockLevel : (item.minStockLevel ? Number(item.minStockLevel) : 0);
                    const max = typeof item.maxStockLevel === 'number' ? item.maxStockLevel : (item.maxStockLevel ? Number(item.maxStockLevel) : 0);
                    const isLowStock = min > 0 && qty <= min;
                    const isOverStock = max > 0 && qty > max;
                    const expiryDateStr = item.expiryDate || null;
                    let expiryLabel = '-';
                    let expiryStatus = item.expiryStatus || item.status || 'normal';
                    if (expiryDateStr) {
                      try { const d = new Date(expiryDateStr); expiryLabel = isNaN(d.getTime()) ? expiryDateStr : d.toISOString().slice(0,10); } catch (e) { expiryLabel = expiryDateStr; }
                    }
                    let statusVariant = 'default'; let statusText = 'OK';
                    if (isLowStock) { statusVariant = 'destructive'; statusText = 'Low'; } else if (isOverStock) { statusVariant = 'warning'; statusText = 'Over'; }
                    if (expiryStatus === 'expired') { statusVariant = 'destructive'; statusText = 'Expired'; } else if (expiryStatus === 'about_to_expire') { statusVariant = 'warning'; statusText = 'Expiring Soon'; }

                    return (
                      <motion.tr key={item.id || `${group.productId}-${index}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} layout className={isLowStock ? 'bg-red-50 dark:bg-red-900/20' : isOverStock ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}>
                        {isAdminView && <TableCell className="text-xs text-muted-foreground">{item.merchantId}</TableCell>}
                        {isAdminView && <TableCell className="text-xs text-muted-foreground">{getMerchantName(item.merchantId)}</TableCell>}
                        <TableCell className="font-medium pl-6">{getProductName(item.productId)}</TableCell>
                        <TableCell>{expiryLabel}</TableCell>
                        <TableCell>{item.sourceInboundDate || item.createdAt ? (new Date(item.sourceInboundDate || item.createdAt)).toISOString().slice(0,10) : '-'}</TableCell>
                        <TableCell>{item.location}</TableCell>
                        <TableCell className="text-right">{qty}</TableCell>
                        <TableCell className="text-right">{min > 0 ? min : '-'}</TableCell>
                        <TableCell className="text-right">{max > 0 ? max : '-'}</TableCell>
                        <TableCell className="text-center">
                           <Badge variant={statusVariant} className="text-xs">
                             {(expiryStatus === 'expired' || expiryStatus === 'about_to_expire') && <AlertTriangle className="h-3 w-3 mr-1 inline-block" />}
                             {statusText}
                           </Badge>
                        </TableCell>
                        {isAdminView && (
                          <TableCell className="text-right space-x-1">
                            <Button variant="ghost" size="icon" onClick={() => openAdjustModal(item)} title="Adjust Stock">
                              <PlusCircle className="h-4 w-4 mr-0.5 text-green-600" />
                              <MinusCircle className="h-4 w-4 text-red-600" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => openEditModal(item)} title="Edit Details">
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </motion.tr>
                    );
                  })}
                </React.Fragment>
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
  