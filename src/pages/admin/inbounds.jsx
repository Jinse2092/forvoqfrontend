import React, { useEffect, useState } from 'react';
import { useInventory } from '../../context/inventory-context.jsx';
import { Button } from '../../components/ui/button.jsx';
import { useToast } from '../../components/ui/use-toast.js';
import { Card, CardContent, CardHeader } from '../../components/ui/card.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx';
import { AnimatePresence, motion } from 'framer-motion';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://https://forwokbackend-1.onrender.com';

const formatLocation = (location) => {
  if (!location) return '';
  if (typeof location === 'string') {
    return location;
  }
  const { buildingNumber, location: loc, pincode, phone } = location;
  return (buildingNumber ? buildingNumber + ', ' : '') +
         (loc ? loc + ', ' : '') +
         (pincode ? pincode + ', ' : '') +
         (phone ? 'Phone: ' + phone : '');
};

const TestAdminInbounds = () => {
  const { inbounds, setInbounds, receiveInbound, products, users, savedPickupLocations } = useInventory();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    console.log('inbounds state changed:', inbounds);
  }, [inbounds]);

  const handleInitiatePickup = (inboundId) => {
    setInbounds(prev => {
      const updated = prev.map(inb =>
        inb.id === inboundId ? { ...inb, status: 'initiated pickup' } : inb
      );
      return updated;
    });
    toast({ title: 'Inbound Updated', description: `Inbound ${inboundId} marked as initiated pickup.` });
  };

  const handleConfirmPickup = async (inboundId) => {
    await receiveInbound(inboundId);
    toast({ title: 'Inbound Received', description: `Inbound ${inboundId} marked as confirmed pickup and inventory updated.` });

    // If outbound, update inventory in backend
    const inbound = inbounds.find(i => i.id === inboundId);
    if (inbound && inbound.type === 'outbound') {
      for (const item of inbound.items) {
        // Find inventory item for this product and merchant
        const inventoryItem = products.find(p => p.id === item.productId && p.merchantId === inbound.merchantId);
        if (inventoryItem) {
          const newQuantity = inventoryItem.quantity - item.quantity;
          // PATCH request to update inventory in backend (was PUT)
          let patchRes = await fetch(`${API_BASE_URL}/api/inventory/${inventoryItem.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...inventoryItem, quantity: newQuantity, id: inventoryItem.id, lastAdjustment: {
              type: 'outbound',
              quantity: -Math.abs(item.quantity),
              date: new Date().toISOString(),
              notes: 'Outbound inventory adjustment'
            } })
          });
          if (patchRes.status === 404) {
            // Item not found, create it then retry PATCH
            await fetch(`${API_BASE_URL}/api/inventory/${inventoryItem.id}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...inventoryItem, id: inventoryItem.id, quantity: newQuantity })
            });
            // Retry PATCH
            patchRes = await fetch(`${API_BASE_URL}/api/inventory/${inventoryItem.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...inventoryItem, quantity: newQuantity, id: inventoryItem.id, lastAdjustment: {
                type: 'outbound',
                quantity: -Math.abs(item.quantity),
                date: new Date().toISOString(),
                notes: 'Outbound inventory adjustment'
              } })
            });
          }
        }
      }
    }
  };

  const handleReceiveInbound = (inboundId) => {
    receiveInbound(inboundId);
    toast({ title: 'Inbound Received', description: `Inbound ${inboundId} marked as completed and inventory updated.` });
  };

  const getProductDetails = (items) => {
    return items.map(item => {
      const product = products.find(p => p.id === item.productId);
      return product ? product.name : 'Unknown product';
    }).join(', ');
  };

  const filteredInbounds = inbounds.filter(inb => {
    const lowerSearch = searchTerm.toLowerCase();
    const productDetails = getProductDetails(inb.items).toLowerCase();
    return (
      inb.id.toLowerCase().includes(lowerSearch) ||
      inb.merchantId.toLowerCase().includes(lowerSearch) ||
      productDetails.includes(lowerSearch)
    );
  });

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <h1 className="text-3xl font-bold mb-4"> Inbound / Outbound Inventory</h1>
      <Card>
        <CardHeader>
          <input
            type="text"
            placeholder="Search inventory requests..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-sm border border-gray-300 rounded px-3 py-2"
          />
        </CardHeader>
        <CardContent>
          {filteredInbounds.length === 0 ? (
            <p>No inbound/outbound inventory requests found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Merchant ID</TableHead>
                  <TableHead>Merchant Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Weight (kg)</TableHead>
                  <TableHead>Pickup Location</TableHead>
                  <TableHead>Phone Number</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Fee (₹)</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredInbounds.map(inb => (
                    <motion.tr
                      key={inb.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      layout
                    >
                      <TableCell>{inb.id}</TableCell>
                      <TableCell>{inb.merchantId}</TableCell>
                      <TableCell>{users.find(u => u.id === inb.merchantId)?.companyName || 'Unknown'}</TableCell>
                      <TableCell>{inb.type}</TableCell>
                      <TableCell>{getProductDetails(inb.items)}</TableCell>
                      <TableCell>{inb.items.reduce((sum, item) => sum + item.quantity, 0)}</TableCell>
                      <TableCell>{inb.totalWeightKg !== undefined && inb.totalWeightKg !== null ? inb.totalWeightKg.toFixed(2) : ''}</TableCell>
                      <TableCell>{formatLocation(inb.pickupLocation)}</TableCell>
                      <TableCell>{inb.pickupLocation && inb.pickupLocation.phone ? inb.pickupLocation.phone : 'N/A'}</TableCell>
                      <TableCell>{inb.status}</TableCell>
                      <TableCell>{inb.fee}</TableCell>
                      <TableCell className="space-x-2">
                        {inb.status === 'pending' && (
                          <Button onClick={() => handleInitiatePickup(inb.id)} variant="primary" size="sm">Initiate Pickup</Button>
                        )}
                        {inb.status === 'initiated pickup' && (
                          <Button onClick={() => handleConfirmPickup(inb.id)} variant="secondary" size="sm">Confirm Pickup</Button>
                        )}
                        {inb.status === 'picked up' && (
                          <Button onClick={() => handleReceiveInbound(inb.id)} variant="success" size="sm">Receive Inbound</Button>
                        )}
                      </TableCell>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default TestAdminInbounds;
