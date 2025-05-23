import React, { useState } from 'react';
import { useInventory } from '../../context/inventory-context.jsx';
import { Button } from '../../components/ui/button.jsx';
import { useToast } from '../../components/ui/use-toast.js';
import jsPDF from 'jspdf';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../../components/ui/select.jsx';
import { Card, CardContent, CardHeader } from '../../components/ui/card.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx';
import { AnimatePresence, motion } from 'framer-motion';

const AdminOrders = () => {
  const { orders, markOrderPacked, dispatchOrder, products, addOrder, removeOrder, inventory } = useInventory();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [expandedOrderIds, setExpandedOrderIds] = useState(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const filteredOrders = orders.filter(order => {
    const lowerSearch = searchTerm.toLowerCase();
    const productDetails = order.items.map(item => item.name).join(', ').toLowerCase();
    return (
      order.id.toLowerCase().includes(lowerSearch) ||
      order.merchantId.toLowerCase().includes(lowerSearch) ||
      order.customerName.toLowerCase().includes(lowerSearch) ||
      productDetails.includes(lowerSearch)
    );
  });

  const toggleExpandOrder = (orderId) => {
    setExpandedOrderIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const handleMarkPacked = (orderId) => {
    markOrderPacked(orderId);
  };

  const handleMarkPickedUp = (orderId) => {
    dispatchOrder(orderId);
  };

  const downloadShippingLabel = (order) => {
    if (order.shippingLabelFile) {
      const url = URL.createObjectURL(order.shippingLabelFile);
      const link = document.createElement('a');
      link.href = url;
      link.download = order.shippingLabelFile.name || 'shipping-label';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Shipping Label', 20, 20);
      doc.setFontSize(12);
      doc.text(`Order ID: ${order.id}`, 20, 40);
      doc.text(`Customer: ${order.customerName}`, 20, 50);
      doc.text(`Address: ${order.address}`, 20, 60);
      let y = 70;
      order.items.forEach(item => {
        const price = item.price || 0;
        doc.text(`${item.name} (x${item.quantity}) - ₹${price * item.quantity}`, 20, y);
        y += 10;
      });
      const totalPrice = order.items.reduce((sum, item) => sum + ((item.price || 0) * item.quantity), 0);
      doc.text(`Total Price: ₹${totalPrice}`, 20, y + 10);
      doc.save(`shipping-label-${order.id}.pdf`);
    }
  };

  const openMarkItemsDialog = (order) => {
    setSelectedOrder(order);
    if (order.items && order.items.length > 0) {
      setSelectedItems(order.items.map(item => ({ productId: item.name, quantity: item.quantity || 1 })));
    } else {
      setSelectedItems([]);
    }
    setIsDialogOpen(true);
  };

  const handleItemChange = (productId, quantity) => {
    setSelectedItems(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing) {
        if (quantity <= 0) {
          return prev.filter(item => item.productId !== productId);
        } else {
          return prev.map(item => item.productId === productId ? { ...item, quantity } : item);
        }
      } else {
        if (quantity > 0) {
          return [...prev, { productId, quantity }];
        }
        return prev;
      }
    });
  };

  const handleSubmitMarkedItems = () => {
    if (!selectedOrder) {
      return;
    }
    if (selectedItems.length === 0) {
      toast({ title: 'Error', description: 'Please select at least one product with quantity.', variant: 'destructive' });
      return;
    }
    if (selectedItems.length > 1) {
      toast({ title: 'Error', description: 'Only one product can be added at a time.', variant: 'destructive' });
      return;
    }
    for (const item of selectedItems) {
      if (!item.productId) {
        toast({ title: 'Error', description: 'Please select a product for all rows.', variant: 'destructive' });
        return;
      }
      const inventoryQuantity = inventory.find(inv => inv.productId === item.productId && inv.merchantId === selectedOrder?.merchantId)?.quantity || 0;
      if (item.quantity > inventoryQuantity) {
        toast({ title: 'Error', description: `Quantity cannot exceed available inventory (${inventoryQuantity}).`, variant: 'destructive' });
        return;
      }
    }
    removeOrder(selectedOrder.id);
    selectedItems.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      for (let i = 0; i < item.quantity; i++) {
        const newOrder = {
          id: `ord-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          merchantId: selectedOrder.merchantId,
          customerName: selectedOrder.customerName,
          address: selectedOrder.address,
          items: [{ productId: item.productId, name: product ? product.name : 'Unknown', quantity: 1 }],
          shippingLabelFile: selectedOrder.shippingLabelFile,
          status: 'pending',
          packingCost: selectedOrder.packingCost || 7,
          date: new Date().toISOString().split('T')[0],
        };
        addOrder(newOrder);
      }
    });
    toast({ title: 'Success', description: 'Order split into individual orders successfully.' });
    setIsDialogOpen(false);
    setSelectedOrder(null);
    setSelectedItems([]);
  };

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <h1 className="text-3xl font-bold mb-4">Admin: All Orders</h1>
      <Card>
        <CardHeader>
          <input
            type="text"
            placeholder="Search orders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-sm border border-gray-300 rounded px-3 py-2"
          />
        </CardHeader>
        <CardContent>
          {filteredOrders.length === 0 ? (
            <p>No orders found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Merchant ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredOrders.map(order => {
                    const hasUploadedPDF = order.shippingLabelFile && !order.generatedPDF;
                    const hasNoItems = !order.items || order.items.length === 0;
                    const isExpanded = expandedOrderIds.has(order.id);
                    return (
                      <React.Fragment key={order.id}>
                        <motion.tr
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          layout
                        >
                          <TableCell>
                            {hasUploadedPDF && (
                              <Button variant="outline" size="sm" onClick={() => toggleExpandOrder(order.id)}>
                                {isExpanded ? '▼' : '▶'}
                              </Button>
                            )}{' '}
                            {order.id}
                          </TableCell>
                          <TableCell>{order.merchantId}</TableCell>
                          <TableCell>{order.customerName}</TableCell>
                          <TableCell>
                            {order.items && order.items.length > 0
                              ? order.items.map(item => item.name).join(', ')
                              : 'No items marked'}
                          </TableCell>
                          <TableCell>
                            {order.items && order.items.length > 0
                              ? order.items.reduce((sum, item) => sum + item.quantity, 0)
                              : 0}
                          </TableCell>
                          <TableCell>{order.status}</TableCell>
                          <TableCell className="space-x-2">
                            {order.status === 'pending' && (
                              <Button onClick={() => handleMarkPacked(order.id)}>Mark as Packed</Button>
                            )}
                            {order.status === 'packed' && (
                              <Button onClick={() => handleMarkPickedUp(order.id)}>Mark as Picked Up</Button>
                            )}
                            {order.status === 'dispatched' && (
                              <span className="text-green-600 font-semibold">Dispatched</span>
                            )}
                            <Button onClick={() => downloadShippingLabel(order)}>Download Shipping Label</Button>
                            {hasUploadedPDF && hasNoItems && (
                              <Button variant="outline" onClick={() => openMarkItemsDialog(order)}>
                                Mark Products & Quantity
                              </Button>
                            )}
                          </TableCell>
                        </motion.tr>
                        {isExpanded && hasUploadedPDF && (
                          <motion.tr
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            layout
                          >
                            <TableCell colSpan={7}>
                              <div className="p-2 bg-gray-50 rounded">
                                <strong>Sub-orders from shipping label:</strong>
                                <ul className="list-disc list-inside">
                                  {orders
                                    .filter(o => o.id.startsWith(order.id))
                                    .map(subOrder => (
                                      <li key={subOrder.id}>
                                        {subOrder.items.map(item => `${item.name} (x${item.quantity})`).join(', ')} - Status: {subOrder.status}
                                      </li>
                                    ))}
                                </ul>
                              </div>
                            </TableCell>
                          </motion.tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md" aria-describedby="mark-products-fixed-desc">
          <DialogTitle>Mark Products and Quantity</DialogTitle>
          <DialogDescription id="mark-products-fixed-desc">
            Select products and specify quantities for the uploaded order.
          </DialogDescription>
          <div className="space-y-4 mt-4">
            {selectedItems.map((item, index) => {
              const product = products.find(p => p.id === item.productId);
              return (
                <div key={index} className="flex items-center space-x-2">
                  {item.productId ? (
                    <div className="w-48 p-2 border border-gray-300 rounded">
                      {product ? product.name : 'No product selected'}
                    </div>
                  ) : (
                    <Select
                      value={item.productId}
                      onValueChange={(value) => {
                        const newProductId = value;
                        setSelectedItems(prev => {
                          const newItems = [...prev];
                          newItems[index].productId = newProductId;
                          return newItems;
                        });
                      }}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {products
                          .filter(product => product.merchantId === selectedOrder?.merchantId)
                          .map(product => (
                            <SelectItem key={product.id} value={product.id}>
                              {product.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => {
                      const newQuantity = parseInt(e.target.value) || 1;
                      const productId = item.productId;
                      const inventoryItem = products.find(p => p.id === productId);
                      const inventoryQuantity = inventory.find(inv => inv.productId === productId && inv.merchantId === selectedOrder?.merchantId)?.quantity || 0;
                      if (newQuantity > inventoryQuantity) {
                        toast({ title: "Quantity Exceeded", description: `Quantity cannot exceed available inventory (${inventoryQuantity}).`, variant: "destructive" });
                        return;
                      }
                      setSelectedItems(prev => {
                        const newItems = [...prev];
                        newItems[index].quantity = newQuantity;
                        return newItems;
                      });
                    }}
                    className="w-20"
                  />
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelectedItems(prev => prev.filter((_, i) => i !== index));
                    }}
                  >
                    Remove
                  </Button>
                </div>
              );
            })}
            <Button
              variant="outline"
              onClick={() => {
                setSelectedItems(prev => [...prev, { productId: '', quantity: 1 }]);
              }}
              disabled={selectedItems.length >= 1}
              title={selectedItems.length >= 1 ? "Only one product can be added at a time" : ""}
            >
              Add Product
            </Button>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmitMarkedItems}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminOrders;
