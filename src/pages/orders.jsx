import React, { useState } from 'react';
import { useInventory } from '../context/inventory-context.jsx';
import { Button } from '../components/ui/button.jsx';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog.jsx';
import { Input } from '../components/ui/input.jsx';
import { Label } from '../components/ui/label.jsx';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../components/ui/select.jsx';
import { Card, CardContent, CardHeader } from '../components/ui/card.jsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table.jsx';

const MerchantOrders = () => {
  const { orders, addOrder, removeOrder, products, currentUser, inventory, addReturnOrder } = useInventory();

  const [activeTab, setActiveTab] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);

  // Function to download shipping label PDF from base64 string
  const downloadShippingLabel = (base64String, orderId) => {
    if (!base64String) {
      alert('No shipping label available for this order.');
      return;
    }
    // Remove the data URL prefix if present
    const base64Data = base64String.split(',')[1] || base64String;
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${base64Data}`;
    link.download = `shipping_label_${orderId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // States for Add Order dialog
  const [mode, setMode] = useState('manual'); // 'manual' or 'upload'
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [phone, setPhone] = useState('');
  const [items, setItems] = useState([{ productId: '', quantity: 1 }]);
  const [shippingLabelFile, setShippingLabelFile] = useState(null);

  // States for Return tab dialog
  const [returnItems, setReturnItems] = useState([{ productId: '', quantity: 1 }]);
  const [returnType, setReturnType] = useState('RTO'); // 'RTO' or 'Damaged'

  const merchantOrders = orders.filter(o => o.merchantId === currentUser?.id);

  // Filter orders based on active tab
  const filteredOrders = activeTab === 'all' ? merchantOrders : merchantOrders.filter(o => {
    if (activeTab === 'return') return o.status === 'return';
    return o.status === activeTab;
  });

  // Handlers for Add Order dialog
  const handleAddItem = () => {
    setItems(prev => [...prev, { productId: '', quantity: 1 }]);
  };

  const handleRemoveItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    if (field === 'quantity') {
      const qty = parseInt(value) || 1;
      const productId = items[index].productId;
      if (productId) {
        const inventoryItem = inventory.find(inv => inv.productId === productId && inv.merchantId === currentUser?.id);
        const inventoryQty = inventoryItem ? inventoryItem.quantity : 0;
        const pendingQty = orders
          .filter(o => o.status === 'pending' && o.merchantId === currentUser?.id)
          .reduce((sum, order) => {
            const item = order.items.find(i => i.productId === productId);
            return sum + (item ? item.quantity : 0);
          }, 0);
        const availableQty = inventoryQty - pendingQty;
        if (qty > availableQty) {
          alert(`Quantity cannot exceed available inventory minus pending orders (${availableQty}).`);
          return;
        }
      }
      setItems(prev => {
        const newItems = [...prev];
        newItems[index][field] = qty;
        return newItems;
      });
    } else {
      setItems(prev => {
        const newItems = [...prev];
        newItems[index][field] = value;
        return newItems;
      });
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setShippingLabelFile(e.target.files[0]);
    } else {
      setShippingLabelFile(null);
    }
  };

  const handleSubmit = () => {
    const fileToBase64 = (file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
      });
    };

    if (mode === 'manual') {
      console.log('Submitting order with city:', city, 'state:', state);
      if (!customerName || !address || !pincode || items.some(item => !item.productId || item.quantity <= 0)) {
        alert('Please fill all fields including pincode and add one product with quantity.');
        return;
      }
      const productId = items[0].productId;
      const qty = items[0].quantity;
      const inventoryItem = inventory.find(inv => inv.productId === productId && inv.merchantId === currentUser?.id);
      const inventoryQty = inventoryItem ? inventoryItem.quantity : 0;
      const pendingQty = orders
        .filter(o => o.status === 'pending' && o.merchantId === currentUser?.id)
        .reduce((sum, order) => {
          const item = order.items.find(i => i.productId === productId);
          return sum + (item ? item.quantity : 0);
        }, 0);
      const availableQty = inventoryQty - pendingQty;
      if (qty > availableQty) {
        alert(`Quantity cannot exceed available inventory minus pending orders (${availableQty}).`);
        return;
      }
      const newOrder = {
        merchantId: currentUser.id,
        customerName,
        address,
        city,
        state,
        pincode,
        phone,
        items: items.map(item => ({
          productId: item.productId,
          name: products.find(p => p.id === item.productId)?.name || 'Unknown',
          quantity: item.quantity,
        })),
        status: 'pending',
        date: new Date().toISOString().split('T')[0],
      };
      console.log('Closing dialog before adding order');
      setIsDialogOpen(false);
      addOrder(newOrder);
      generateShippingLabelPDF(newOrder, { companyName: currentUser.companyName || '', id: currentUser.id || '' });
      // Ensure dialog close runs after other code
      setTimeout(() => {
        console.log('Closing dialog after adding order');
        setIsDialogOpen(false);
      }, 0);
      setCustomerName('');
      setAddress('');
      setCity('');
      setState('');
      setPincode('');
      setPhone('');
      setItems([{ productId: '', quantity: 1 }]);
      // Remove redundant setTimeout for closing dialog
    } else if (mode === 'upload') {
      if (!shippingLabelFile) {
        alert('Please upload a shipping label file.');
        return;
      }
      fileToBase64(shippingLabelFile).then(base64String => {
        const newOrder = {
          merchantId: currentUser.id,
          customerName: 'Unknown',
          address: 'Unknown',
          items: [],
          shippingLabelBase64: base64String,
          status: 'shipping_label_pending',
          date: new Date().toISOString().split('T')[0],
        };
        addOrder(newOrder);
        setIsDialogOpen(false);
        setShippingLabelFile(null);
        // Force close dialog after a short delay to ensure state updates
        setTimeout(() => setIsDialogOpen(false), 100);
      }).catch(error => {
        alert('Failed to process the uploaded file.');
      });
    }
  };

  // Handlers for Return tab
  const handleReturnItemChange = (index, field, value) => {
    if (field === 'quantity') {
      const qty = parseInt(value) || 1;
      setReturnItems(prev => {
        const newItems = [...prev];
        newItems[index][field] = qty;
        return newItems;
      });
    } else {
      setReturnItems(prev => {
        const newItems = [...prev];
        newItems[index][field] = value;
        return newItems;
      });
    }
  };

  const handleAddReturnItem = () => {
    setReturnItems(prev => [...prev, { productId: '', quantity: 1 }]);
  };

  const handleRemoveReturnItem = (index) => {
    setReturnItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleReturnSubmit = () => {
    if (returnItems.some(item => !item.productId || item.quantity <= 0)) {
      alert('Please add at least one return item with valid product and quantity.');
      return;
    }
    const returnOrder = {
      merchantId: currentUser.id,
      customerName: 'Return',
      address: 'Return',
      pincode: '000000',
      items: returnItems.map(item => ({
        productId: item.productId,
        name: products.find(p => p.id === item.productId)?.name || 'Unknown',
        quantity: item.quantity,
      })),
      status: 'return',
      date: new Date().toISOString().split('T')[0],
    };
    addReturnOrder(returnOrder, returnType);
    setIsReturnDialogOpen(false);
    setReturnItems([{ productId: '', quantity: 1 }]);
    setReturnType('RTO');
  };

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-4">Merchant: My Orders</h1>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="packed">Packed</TabsTrigger>
          <TabsTrigger value="dispatched">Dispatched</TabsTrigger>
          <TabsTrigger value="return">Return</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card className="mt-6">
            <CardHeader>
              <h2 className="text-xl font-semibold">All Orders</h2>
            </CardHeader>
            <CardContent>
              {filteredOrders.length === 0 ? (
                <p>No orders found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map(order => (
                      <TableRow key={order.id}>
                        <TableCell>{order.id}</TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell>{order.items.map(item => item.name).join(', ')}</TableCell>
                        <TableCell>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</TableCell>
                  <TableCell>{order.status}</TableCell>
                  <TableCell>
                    {order.status === 'pending' && (
                      <Button variant="outline" size="sm" onClick={() => removeOrder(order.id)}>
                        Delete
                      </Button>
                    )}
                    {order.shippingLabelBase64 && (
                      <Button variant="outline" size="sm" onClick={() => downloadShippingLabel(order.shippingLabelBase64, order.id)}>
                        Download Shipping Label
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  </TabsContent>

        <TabsContent value="pending">
          <Card className="mt-6">
            <CardHeader>
              <h2 className="text-xl font-semibold">Pending Orders</h2>
            </CardHeader>
            <CardContent>
              {filteredOrders.length === 0 ? (
                <p>No pending orders found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map(order => (
                      <TableRow key={order.id}>
                        <TableCell>{order.id}</TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell>{order.items.map(item => item.name).join(', ')}</TableCell>
                        <TableCell>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</TableCell>
                        <TableCell>{order.status}</TableCell>
                        <TableCell>
                          {order.status === 'pending' && (
                            <Button variant="outline" size="sm" onClick={() => removeOrder(order.id)}>
                              Delete
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packed">
          <Card className="mt-6">
            <CardHeader>
              <h2 className="text-xl font-semibold">Packed Orders</h2>
            </CardHeader>
            <CardContent>
              {filteredOrders.length === 0 ? (
                <p>No packed orders found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map(order => (
                      <TableRow key={order.id}>
                        <TableCell>{order.id}</TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell>{order.items.map(item => item.name).join(', ')}</TableCell>
                        <TableCell>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</TableCell>
                        <TableCell>{order.status}</TableCell>
                        <TableCell>
                          {order.status === 'pending' && (
                            <Button variant="outline" size="sm" onClick={() => removeOrder(order.id)}>
                              Delete
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dispatched">
          <Card className="mt-6">
            <CardHeader>
              <h2 className="text-xl font-semibold">Dispatched Orders</h2>
            </CardHeader>
            <CardContent>
              {filteredOrders.length === 0 ? (
                <p>No dispatched orders found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map(order => (
                      <TableRow key={order.id}>
                        <TableCell>{order.id}</TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell>{order.items.map(item => item.name).join(', ')}</TableCell>
                        <TableCell>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</TableCell>
                        <TableCell>{order.status}</TableCell>
                        <TableCell>
                          {order.status === 'pending' && (
                            <Button variant="outline" size="sm" onClick={() => removeOrder(order.id)}>
                              Delete
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="return">
          <Card className="mt-6">
            <CardHeader>
              <h2 className="text-xl font-semibold">Return Orders</h2>
            </CardHeader>
            <CardContent>
              {filteredOrders.length === 0 ? (
                <p>No return orders found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return ID</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Return Type</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map(order => (
                      <TableRow key={order.id}>
                        <TableCell>{order.id}</TableCell>
                        <TableCell>{order.items.map(item => item.name).join(', ')}</TableCell>
                        <TableCell>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</TableCell>
                        <TableCell>{order.returnType}</TableCell>
                      <TableCell>{order.date}</TableCell>
                      <TableCell>{order.time}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {activeTab !== 'return' && (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>Add Order</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-auto" aria-describedby="add-order-desc">
            <DialogTitle>Add Order</DialogTitle>
            <DialogDescription id="add-order-desc">
              Add order manually or upload a shipping label.
            </DialogDescription>
            <div className="mt-4 space-y-4">
              <Tabs value={mode} onValueChange={setMode}>
                <TabsList>
                  <TabsTrigger value="manual">Manual Entry</TabsTrigger>
                  <TabsTrigger value="upload">Upload Shipping Label</TabsTrigger>
                </TabsList>
                <TabsContent value="manual">
                  <div>
                    <Label>Customer Name</Label>
                    <Input value={customerName} onChange={e => setCustomerName(e.target.value)} />
                  </div>
                  <div>
                    <Label>Address</Label>
                    <Input value={address} onChange={e => setAddress(e.target.value)} />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input value={city} onChange={e => setCity(e.target.value)} />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Input value={state} onChange={e => setState(e.target.value)} />
                  </div>
                  <div>
                    <Label>Pincode</Label>
                    <Input value={pincode} onChange={e => setPincode(e.target.value)} />
                  </div>
                  <div>
                    <Label>Phone Number</Label>
                    <Input value={phone} onChange={e => setPhone(e.target.value)} />
                  </div>
                  <div>
                    <Label>Item</Label>
                    {items.map((item, index) => (
                      <div key={index} className="flex space-x-2 items-center mb-2">
                        <Select
                          value={item.productId}
                          onValueChange={value => handleItemChange(index, 'productId', value)}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map(product => (
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
                          onChange={e => handleItemChange(index, 'quantity', e.target.value)}
                          className="w-20"
                        />
                        <Button variant="outline" onClick={() => handleRemoveItem(index)}>Remove</Button>
                      </div>
                    ))}
                    {items.length === 0 && (
                      <Button variant="outline" onClick={handleAddItem}>Add Item</Button>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="upload">
                  <div>
                    <Label>Shipping Label PDF</Label>
                    <Input type="file" accept="application/pdf" onChange={handleFileChange} />
                    {shippingLabelFile && <p>Selected file: {shippingLabelFile.name}</p>}
                  </div>
                </TabsContent>
              </Tabs>
              <div className="mt-4 flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="button" onClick={() => { console.log('Submit clicked'); handleSubmit(); }}>Submit</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default MerchantOrders;
