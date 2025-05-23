import React, { useState } from 'react';
import { useInventory } from '../../context/inventory-context.jsx';
import { Card, CardContent, CardHeader } from '../../components/ui/card.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../../components/ui/select.jsx';

const AdminReturns = () => {
  const { orders, products, addReturnOrder, currentUser, users } = useInventory();

  // Filter return orders across all merchants
  const returnOrders = orders.filter(order => order.status === 'return');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [returnItems, setReturnItems] = useState([{ productId: '', quantity: 1 }]);
  const [returnType, setReturnType] = useState('RTO'); // 'RTO' or 'Damaged'
  const [selectedMerchantId, setSelectedMerchantId] = useState(currentUser?.role === 'merchant' ? currentUser.id : '');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedReturnIds, setExpandedReturnIds] = useState(new Set());

  const merchantUsers = users.filter(user => user.role === 'merchant');
  const filteredProducts = products.filter(product => product.merchantId === selectedMerchantId);

  const filteredReturnOrders = returnOrders.filter(order => {
    const lowerSearch = searchTerm.toLowerCase();
    const productDetails = order.items.map(item => item.name).join(', ').toLowerCase();
    return (
      order.id.toLowerCase().includes(lowerSearch) ||
      order.merchantId.toLowerCase().includes(lowerSearch) ||
      productDetails.includes(lowerSearch)
    );
  });

  const toggleExpandReturn = (returnId) => {
    setExpandedReturnIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(returnId)) {
        newSet.delete(returnId);
      } else {
        newSet.add(returnId);
      }
      return newSet;
    });
  };

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
    if (!selectedMerchantId) {
      alert('Please select a merchant before submitting the return order.');
      return;
    }
    if (returnItems.some(item => !item.productId || item.quantity <= 0)) {
      alert('Please add at least one return item with valid product and quantity.');
      return;
    }
    const returnOrder = {
      merchantId: selectedMerchantId,
      customerName: 'Return',
      address: 'Return',
      pincode: '000000',
      items: returnItems.map(item => ({
        productId: item.productId,
        name: products.find(p => p.id === item.productId)?.name || 'Unknown',
        quantity: item.quantity,
      })),
      status: 'return',
      returnType,
      date: new Date().toISOString().split('T')[0],
    };
    addReturnOrder(returnOrder, returnType);
    setIsDialogOpen(false);
    setReturnItems([{ productId: '', quantity: 1 }]);
    setReturnType('RTO');
  };

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <h1 className="text-3xl font-bold mb-4">Admin: Return Orders</h1>
      <Card>
        <CardHeader>
          <input
            type="text"
            placeholder="Search return orders..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-sm border border-gray-300 rounded px-3 py-2"
          />
        </CardHeader>
        <CardContent>
          {filteredReturnOrders.length === 0 ? (
            <p>No return orders found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Return ID</TableHead>
                  <TableHead>Merchant ID</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Quantity</TableHead>
                  <TableHead>Return Type</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReturnOrders.map(order => (
                  <React.Fragment key={order.id}>
                    <TableRow>
                      <TableCell>{order.id}</TableCell>
                      <TableCell>{order.merchantId}</TableCell>
                      <TableCell>
                        <button
                          className="text-blue-600 underline"
                          onClick={() => toggleExpandReturn(order.id)}
                        >
                          {order.items.map(item => item.name).join(', ')}
                        </button>
                      </TableCell>
                      <TableCell>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</TableCell>
                      <TableCell>{order.returnType || 'N/A'}</TableCell>
                      <TableCell>{order.date}</TableCell>
                    </TableRow>
                    {expandedReturnIds.has(order.id) && (
                      <TableRow>
                        <TableCell colSpan={6}>
                          <div className="p-2 bg-gray-50 rounded">
                            {order.items.length > 0 ? (
                              order.items.map((item, idx) => (
                                <div key={idx}>
                                  {item.name} (x{item.quantity})
                                </div>
                              ))
                            ) : (
                              <div>No items</div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button>Add Return Order</Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto" aria-describedby="add-return-order-description">
          <DialogTitle>Add Return Order</DialogTitle>
          <DialogDescription id="add-return-order-description">
            Add return order manually.
          </DialogDescription>
          <div className="mt-4 space-y-4">
            {(currentUser?.role === 'admin' || currentUser?.role === 'superadmin') ? (
              <div>
                <Label>Merchant</Label>
                <Select value={selectedMerchantId} onValueChange={setSelectedMerchantId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {merchantUsers.map(merchant => (
                      <SelectItem key={merchant.id} value={merchant.id}>
                        {merchant.companyName || merchant.email || merchant.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div>
              <Label>Return Type</Label>
              <Select value={returnType} onValueChange={setReturnType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RTO">RTO</SelectItem>
                  <SelectItem value="Damaged">Damaged</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Return Items</Label>
              {returnItems.map((item, index) => (
                <div key={index} className="flex space-x-2 items-center mb-2">
                  <Select
                    value={item.productId}
                    onValueChange={value => handleReturnItemChange(index, 'productId', value)}
                  >
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Select product" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredProducts.map(product => (
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
                    onChange={e => handleReturnItemChange(index, 'quantity', e.target.value)}
                    className="w-20"
                  />
                  <Button variant="outline" onClick={() => handleRemoveReturnItem(index)}>Remove</Button>
                </div>
              ))}
              <Button variant="outline" onClick={handleAddReturnItem}>Add Item</Button>
            </div>
          </div>
          <div className="mt-4 flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleReturnSubmit}>Submit</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminReturns;
