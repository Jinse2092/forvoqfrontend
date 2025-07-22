import React, { useState } from 'react';
import { useInventory } from '../../context/inventory-context.jsx';
import { Button } from '../../components/ui/button.jsx';
import { useToast } from '../../components/ui/use-toast.js';
import jsPDF from 'jspdf';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../../components/ui/select.jsx';
import { Card, CardContent, CardHeader } from '../../components/ui/card.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx';
import { AnimatePresence, motion } from 'framer-motion';
import { generateShippingLabelPDF } from '../../lib/pdfGenerator.js';

const AdminOrders = () => {
  const { orders, markOrderPacked, dispatchOrder, products, updateOrder, addOrder, removeOrder, inventory, currentUser, users } = useInventory();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedOrderIds, setExpandedOrderIds] = useState(new Set());

  // New state for Add Order manual entry dialog
  const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);
  const [addOrderTab, setAddOrderTab] = useState('manual'); // 'manual' or 'upload'
  const [selectedMerchantId, setSelectedMerchantId] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');
  const [newPincode, setNewPincode] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newItems, setNewItems] = useState([{ productId: '', quantity: 1 }]);
  const [newItemCount, setNewItemCount] = useState(1);
  const [uploadFile, setUploadFile] = useState(null);

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'superadmin')) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
        <p>You must be an admin to view this page.</p>
      </div>
    );
  }

  const filteredOrders = orders
    .filter(order => {
      // Exclude return orders from admin orders panel
      if (order.status === 'return') {
        return false;
      }
      const lowerSearch = searchTerm.toLowerCase();
      const productDetails = order.items.map(item => item.name).join(', ').toLowerCase();
      return (
        order.id.toLowerCase().includes(lowerSearch) ||
        order.merchantId.toLowerCase().includes(lowerSearch) ||
        order.customerName.toLowerCase().includes(lowerSearch) ||
        productDetails.includes(lowerSearch)
      );
    })
    .sort((a, b) => {
      // Sort by date descending (newest first)
      const dateA = new Date(a.date);
      const dateB = new Date(b.date);
      return dateB - dateA;
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
    } else if (order.shippingLabelBase64) {
      // Convert base64 to Blob and download
      const base64Data = order.shippingLabelBase64.split(',')[1];
      const contentType = order.shippingLabelBase64.split(',')[0].split(':')[1].split(';')[0];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'shipping-label.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      // Use external PDF generator for manual entry orders
      const merchant = users.find(u => u.id === order.merchantId) || { companyName: '', id: '' };
      // Augment order with city and state if missing
      const augmentedOrder = {
        ...order,
        city: order.city || '',
        state: order.state || '',
      };
      console.log('Download shipping label for order:', augmentedOrder);
      generateShippingLabelPDF(augmentedOrder, { companyName: merchant.companyName, id: merchant.id });
    }
  };

const openMarkItemsDialog = (order) => {
  if (!order || !order.id) {
    alert('Invalid order selected. Cannot mark items.');
    return;
  }
  setSelectedOrder(order);
  if (order.items && order.items.length > 0) {
    setSelectedItems(order.items.map(item => ({ productId: item.productId, quantity: item.quantity || 1 })));
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
    // Remove restriction to only one product
    // Validate unique productIds
    const productIds = selectedItems.map(item => item.productId);
    const uniqueProductIds = new Set(productIds);
    if (uniqueProductIds.size !== productIds.length) {
      toast({ title: 'Error', description: 'Duplicate products are not allowed.', variant: 'destructive' });
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
    // Update the existing order with selected items
    const updatedItems = selectedItems.map(item => {
      const product = products.find(p => p.id === item.productId);
      return {
        productId: item.productId,
        name: product ? product.name : 'Unknown',
        quantity: item.quantity,
      };
    });
    updateOrder(selectedOrder.id, { items: updatedItems });
    toast({ title: 'Success', description: 'Order items updated successfully.' });
    setIsDialogOpen(false);
    setSelectedOrder(null);
    setSelectedItems([]);
  };

  // New handlers for Add Order manual entry form
  const handleNewItemChange = (index, field, value) => {
    setNewItems(prev => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: field === 'quantity' ? parseInt(value, 10) || 1 : value };
      return newItems;
    });
  };

  const handleAddNewItem = () => {
    setNewItems(prev => [...prev, { name: '', quantity: 1 }]);
    setNewItemCount(prev => prev + 1);
  };

  const handleRemoveNewItem = (index) => {
    setNewItems(prev => prev.filter((_, i) => i !== index));
    setNewItemCount(prev => Math.max(1, prev - 1));
  };

  const handleSubmitNewOrder = () => {
    const fileToBase64 = (file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
      });
    };

    if (addOrderTab === 'manual') {
      if (!selectedMerchantId) {
        toast({ title: 'Error', description: 'Please select a merchant.', variant: 'destructive' });
        return;
      }
      if (!newCustomerName.trim()) {
        toast({ title: 'Error', description: 'Customer Name is required.', variant: 'destructive' });
        return;
      }
      if (!newAddress.trim()) {
        toast({ title: 'Error', description: 'Address is required.', variant: 'destructive' });
        return;
      }
      if (!newCity.trim()) {
        toast({ title: 'Error', description: 'City is required.', variant: 'destructive' });
        return;
      }
      if (!newState.trim()) {
        toast({ title: 'Error', description: 'State is required.', variant: 'destructive' });
        return;
      }
      if (!newPincode.trim()) {
        toast({ title: 'Error', description: 'Pincode is required.', variant: 'destructive' });
        return;
      }
      if (newItems.length === 0 || newItems.some(item => !item.productId || item.quantity <= 0)) {
        toast({ title: 'Error', description: 'Please add at least one valid item with quantity.', variant: 'destructive' });
        return;
      }
      // Construct order object
      const orderItems = newItems.map(item => {
        const product = products.find(p => p.id === item.productId);
        return {
          productId: item.productId,
          name: product ? product.name : 'Unknown',
          quantity: item.quantity,
        };
      });
      const newOrder = {
        id: `order_${Date.now()}`,
        customerName: newCustomerName.trim(),
        address: newAddress.trim(),
        city: newCity.trim(),
        state: newState.trim(),
        pincode: newPincode.trim(),
        phone: newPhone.trim(),
        items: orderItems,
        status: 'pending',
        merchantId: selectedMerchantId,
        date: new Date(new Date().getTime() + 5.5 * 60 * 60000).toISOString().replace('T', ' ').substring(0, 19), // Set date and time in IST
      };
      addOrder(newOrder);
      toast({ title: 'Success', description: 'Order added successfully.' });
      // Reset form and close dialog
      setSelectedMerchantId('');
      setNewCustomerName('');
      setNewAddress('');
      setNewCity('');
      setNewState('');
      setNewPincode('');
      setNewPhone('');
      setNewItems([{ productId: '', quantity: 1 }]);
      setIsAddOrderOpen(false);
    } else if (addOrderTab === 'upload') {
      if (!selectedMerchantId) {
        toast({ title: 'Error', description: 'Please select a merchant.', variant: 'destructive' });
        return;
      }
      if (!uploadFile) {
        toast({ title: 'Error', description: 'Please upload a shipping label file.', variant: 'destructive' });
        return;
      }
      fileToBase64(uploadFile).then(base64String => {
        const newOrder = {
          id: `order_${Date.now()}`,
          customerName: '',
          address: '',
          pincode: '',
          phone: '',
          items: [],
          status: 'pending',
          merchantId: selectedMerchantId,
          shippingLabelBase64: base64String,
        };
        addOrder(newOrder);
        toast({ title: 'Success', description: 'Order with shipping label uploaded successfully.' });
        setUploadFile(null);
        setSelectedMerchantId('');
        setIsAddOrderOpen(false);
      }).catch(error => {
        toast({ title: 'Error', description: 'Failed to process the uploaded file.', variant: 'destructive' });
      });
    }
  };

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <h1 className="text-3xl font-bold mb-4">All Orders</h1>
      <Button onClick={() => setIsAddOrderOpen(true)} className="mb-4">Add Order</Button>
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
              <TableHead>Merchant</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Date &amp; Time</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Actions</TableHead>
              </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredOrders.map(order => {
                    const hasUploadedPDF = (order.shippingLabelFile || order.shippingLabelBase64) && !order.generatedPDF;
                    const hasNoItems = !order.items || order.items.length === 0;
                    return (
                    <motion.tr
                      key={order.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      layout
                    >
                      <TableCell>{order.id}</TableCell>
                      <TableCell>{users.find(user => user.id === order.merchantId)?.companyName || users.find(user => user.id === order.merchantId)?.name || order.merchantId}</TableCell>
                      <TableCell>{order.customerName || (order.shippingLabelBase64 ? 'bulk order' : <span className="italic text-muted-foreground">No customer name</span>)}</TableCell>
                      <TableCell>{order.date}{order.time ? ` ${order.time}` : ''}</TableCell>
                      <TableCell>
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            className="inline-flex justify-center w-full rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                            id={`menu-button-${order.id}`}
                            aria-expanded="true"
                            aria-haspopup="true"
                            onClick={() => toggleExpandOrder(order.id)}
                          >
                            Items
                            <svg
                              className="ml-2 -mr-1 h-5 w-5"
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              aria-hidden="true"
                            >
                              <path
                                fillRule="evenodd"
                                d={expandedOrderIds.has(order.id) ? "M5.23 7.21a.75.75 0 011.06.02L10 11.293l3.71-4.06a.75.75 0 111.08 1.04l-4.25 4.65a.75.75 0 01-1.08 0l-4.25-4.65a.75.75 0 01.02-1.06z" : "M14.77 12.79a.75.75 0 01-1.06-.02L10 8.707l-3.71 4.06a.75.75 0 11-1.08-1.04l4.25-4.65a.75.75 0 011.08 0l4.25 4.65a.75.75 0 01-.02 1.06z"}
                                clipRule="evenodd"
                              />
                            </svg>
                          </button>
                          {expandedOrderIds.has(order.id) && (
                            <div
                              className="origin-top-left absolute left-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10"
                              role="menu"
                              aria-orientation="vertical"
                              aria-labelledby={`menu-button-${order.id}`}
                              tabIndex="-1"
                            >
                              <div className="py-1" role="none">
                                {order.items && order.items.length > 0 ? (
                                  order.items.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="text-gray-700 block px-4 py-2 text-sm"
                                      role="menuitem"
                                      tabIndex="-1"
                                      id={`menu-item-${idx}`}
                                    >
                                      {item.name} (x{item.quantity})
                                    </div>
                                  ))
                                ) : (
                                  <div className="text-gray-700 block px-4 py-2 text-sm italic text-muted-foreground">No items marked</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
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
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add Order Manual Entry Dialog */}
      <Dialog open={isAddOrderOpen} onOpenChange={setIsAddOrderOpen}>
        <DialogContent className="max-w-lg" aria-describedby="add-order-manual-desc">
          <DialogTitle>Add Order - Manual Entry</DialogTitle>
          <DialogDescription id="add-order-manual-desc">
            Add order manually by filling the form below or upload a shipping label.
          </DialogDescription>
          <div className="mt-4">
            <div className="flex space-x-4 border-b border-gray-300">
              <button
                className={`px-4 py-2 font-semibold ${addOrderTab === 'manual' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
                onClick={() => setAddOrderTab('manual')}
              >
                Manual Entry
              </button>
              <button
                className={`px-4 py-2 font-semibold ${addOrderTab === 'upload' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
                onClick={() => setAddOrderTab('upload')}
              >
                Upload Shipping Label
              </button>
            </div>
                  {addOrderTab === 'manual' && (
                    <div className="space-y-4 mt-4">
                      <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
                        <div className="flex-1">
                          <Label htmlFor="merchant">Select Merchant</Label>
                          <Select value={selectedMerchantId} onValueChange={setSelectedMerchantId}>
                            <SelectTrigger className="w-full">
                              <SelectValue>
                                {selectedMerchantId
                                  ? (users.find(user => user.id === selectedMerchantId)?.companyName || users.find(user => user.id === selectedMerchantId)?.name || selectedMerchantId)
                                  : "Select merchant"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {users
                                .filter(user => user.role === 'merchant')
                                .map(user => (
                                  <SelectItem key={user.id} value={user.id}>
                                    {user.companyName || user.name || user.id}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex-1">
                          <Label htmlFor="customerName">Customer Name</Label>
                          <Input
                            id="customerName"
                            value={newCustomerName}
                            onChange={(e) => setNewCustomerName(e.target.value)}
                            placeholder="Customer Name"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
                        <div className="flex-1">
                          <Label htmlFor="address">Address</Label>
                          <Input
                            id="address"
                            value={newAddress}
                            onChange={(e) => setNewAddress(e.target.value)}
                            placeholder="Full Address"
                          />
                        </div>
                        <div className="flex-1">
                          <Label htmlFor="city">City</Label>
                          <Input
                            id="city"
                            value={newCity}
                            onChange={(e) => setNewCity(e.target.value)}
                            placeholder="City"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
                        <div className="flex-1">
                          <Label htmlFor="state">State</Label>
                          <Input
                            id="state"
                            value={newState}
                            onChange={(e) => setNewState(e.target.value)}
                            placeholder="State"
                          />
                        </div>
                        <div className="flex-1">
                          <Label htmlFor="pincode">Pincode</Label>
                          <Input
                            id="pincode"
                            value={newPincode}
                            onChange={(e) => setNewPincode(e.target.value)}
                            placeholder="Pincode"
                          />
                        </div>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
                        <div className="flex-1">
                          <Label htmlFor="phone" className="block mb-1 font-medium text-gray-700">Phone Number</Label>
                          <Input
                            id="phone"
                            value={newPhone}
                            onChange={(e) => setNewPhone(e.target.value)}
                            placeholder="Phone Number"
                            className="block w-full"
                          />
                        </div>
                      </div>
                      <div>
                        <Label>Items</Label>
                        {newItems.slice(0, newItemCount).map((item, index) => (
                          <div key={index} className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 mb-2 space-y-2 sm:space-y-0">
                            <Select
                              value={item.productId}
                              onValueChange={(value) => handleNewItemChange(index, 'productId', value)}
                              className="flex-grow"
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select product" />
                              </SelectTrigger>
                              <SelectContent>
                                {products
                                  .filter(product => product.merchantId === selectedMerchantId)
                                  .map(product => (
                                    <SelectItem key={product.id} value={product.id}>
                                      {product.name}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                            <Input
                              type="number"
                              min="1"
                              placeholder="Quantity"
                              value={item.quantity}
                              onChange={(e) => handleNewItemChange(index, 'quantity', e.target.value)}
                              className="w-20"
                            />
                            <Button variant="outline" onClick={() => handleRemoveNewItem(index)}>Remove</Button>
                          </div>
                        ))}
                        <Button variant="outline" onClick={handleAddNewItem}>Add Item</Button>
                      </div>
                      <div className="mt-4 p-2 border rounded bg-gray-50 dark:bg-gray-800">
                        <p className="text-gray-900 dark:text-gray-100">
                          <strong>Address Summary:</strong> {newAddress}, {newCity}, {newState}, PIN: {newPincode}, Phone: {newPhone}
                        </p>
                      </div>
                    </div>
                  )}
            {addOrderTab === 'upload' && (
              <div className="mt-4 space-y-4">
                <div>
                  <Label htmlFor="merchantUpload">Select Merchant</Label>
                  <Select value={selectedMerchantId} onValueChange={setSelectedMerchantId}>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {selectedMerchantId
                          ? (users.find(user => user.id === selectedMerchantId)?.companyName || users.find(user => user.id === selectedMerchantId)?.name || selectedMerchantId)
                          : "Select merchant"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {users
                        .filter(user => user.role === 'merchant')
                        .map(user => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.companyName || user.name || user.id}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="shippingLabelFile">Upload Shipping Label</Label>
                  <Input
                    id="shippingLabelFile"
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                  />
                </div>
              </div>
            )}
            <div className="mt-4 flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsAddOrderOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmitNewOrder}>Submit</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Existing Mark Products Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md" aria-describedby="mark-products-desc">
          <DialogTitle>Mark Products and Quantity</DialogTitle>
          <DialogDescription id="mark-products-desc">
            Select products and specify quantities for the uploaded order.
          </DialogDescription>
          <div className="space-y-4 mt-4">
            {selectedItems.map((item, index) => (
              <div key={index} className="flex items-center space-x-2">
                <Select
                  value={item.productId}
                  onValueChange={(value) => {
                    const newItems = [...selectedItems];
                    newItems[index].productId = value;
                    setSelectedItems(newItems);
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
                <Input
                  type="number"
                  min="1"
                  value={item.quantity}
                  onChange={(e) => {
                    const qty = parseInt(e.target.value, 10);
                    handleItemChange(item.productId, qty);
                  }}
                  className="w-20"
                />
                <Button variant="outline" onClick={() => {
                  // Remove this item
                  setSelectedItems(prev => prev.filter((_, i) => i !== index));
                }}>Remove</Button>
              </div>
            ))}
            <Button variant="outline" onClick={() => {
              // Add new empty item
              setSelectedItems(prev => [...prev, { productId: '', quantity: 1 }]);
            }}>Add Item</Button>
          </div>
          <div className="mt-4 flex justify-between">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitMarkedItems}>Submit</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminOrders;
