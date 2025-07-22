import React, { useState } from 'react';
import { useInventory } from '../context/inventory-context.jsx';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Label } from '../components/ui/label.jsx';
import { useToast } from '../components/ui/use-toast.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.jsx';
import InventoryRequestsList from '../components/inventory/InventoryRequestsList.jsx';
import { Card, CardContent, CardHeader } from '../components/ui/card.jsx';

const Inbound = () => {
  const { inbounds, addInboundRequest, currentUser, products, savedPickupLocations, addPickupLocation, inventory } = useInventory();
  const { toast } = useToast();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [newLocation, setNewLocation] = useState({ buildingNumber: '', location: '', pincode: '', phone: '' });
  const [showAddDeliveryLocation, setShowAddDeliveryLocation] = useState(false);
  const [newDeliveryLocation, setNewDeliveryLocation] = useState({ buildingNumber: '', location: '', pincode: '', phone: '' });

  const [inboundDetails, setInboundDetails] = useState({
    items: [{ productId: '', quantity: 0 }],
    pickupLocation: '', // was null
    deliveryLocation: '', // was null
    type: 'inbound',
  });

  const handleInputChange = (e, index) => {
    const { name, value } = e.target;
    setInboundDetails(prev => {
      const newItems = [...prev.items];
      if (name === 'productId' || name === 'quantity') {
        if (name === 'quantity') {
          newItems[index][name] = parseInt(value) || 0;
        } else {
          newItems[index][name] = value;
        }
      }
      return { ...prev, items: newItems };
    });
  };

  const handlePickupLocationChange = (e) => {
    const selectedId = e.target.value;
    const selectedLocation = savedPickupLocations.find(loc => loc.id === selectedId) || null;
    setInboundDetails(prev => ({ ...prev, pickupLocation: selectedLocation }));
  };

  const handleDeliveryLocationChange = (e) => {
    const selectedId = e.target.value;
    const selectedLocation = savedPickupLocations.find(loc => loc.id === selectedId) || null;
    setInboundDetails(prev => ({ ...prev, deliveryLocation: selectedLocation }));
  };

  const handleTypeChange = (e) => {
    setInboundDetails(prev => ({ ...prev, type: e.target.value }));
  };

  const addItem = () => {
    setInboundDetails(prev => ({ ...prev, items: [...prev.items, { productId: '', quantity: 0 }] }));
  };

  const removeItem = (index) => {
    setInboundDetails(prev => {
      const newItems = prev.items.filter((_, i) => i !== index);
      return { ...prev, items: newItems.length > 0 ? newItems : [{ productId: '', quantity: 0 }] };
    });
  };

  const handleAddInbound = async () => {
    if (!currentUser) {
      toast({ title: 'Error', description: 'Please login to add inventory requests.', variant: 'destructive' });
      return;
    }
    if (inboundDetails.type === 'inbound' && !inboundDetails.pickupLocation) {
      toast({ title: 'Error', description: 'Please fill pickup location.', variant: 'destructive' });
      return;
    }
    if (inboundDetails.type === 'outbound' && !inboundDetails.deliveryLocation) {
      toast({ title: 'Error', description: 'Please fill delivery location.', variant: 'destructive' });
      return;
    }
    if (inboundDetails.items.some(item => !item.productId || item.quantity <= 0)) {
      toast({ title: 'Error', description: 'Please fill all product items with valid quantity.', variant: 'destructive' });
      return;
    }

    if (inboundDetails.type === 'outbound') {
      for (const item of inboundDetails.items) {
        const inventoryItem = inventory.find(i => i.productId === item.productId && i.merchantId === currentUser.id);
        if (!inventoryItem || item.quantity > inventoryItem.quantity) {
          toast({ title: 'Inventory Error', description: `Cannot request more than available inventory for product.`, variant: 'destructive' });
          return;
        }
        // PATCH request to decrement inventory, with fallback
        const newQuantity = inventoryItem.quantity - item.quantity;
        let patchRes = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://https://forwokbackend-1.onrender.com'}/api/inventory/${inventoryItem.id}`,
          {
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
          await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://https://forwokbackend-1.onrender.com'}/api/inventory/${inventoryItem.id}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...inventoryItem, id: inventoryItem.id, quantity: newQuantity })
            });
          // Retry PATCH
          patchRes = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://https://forwokbackend-1.onrender.com'}/api/inventory/${inventoryItem.id}`,
            {
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

    const totalWeightKg = inboundDetails.items.reduce((sum, item) => {
      const product = products.find(p => p.id === item.productId);
      return sum + (item.quantity * (product?.weightKg || 0));
    }, 0);

    const fee = Math.ceil(Math.max(1, totalWeightKg) / 10) * 150; // Min fee 150, charge per 10kg block

    const newInbound = {
      id: `inb-${Date.now()}`,
      merchantId: currentUser.id,
      items: inboundDetails.items,
      totalWeightKg: totalWeightKg,
      pickupLocation: inboundDetails.type === 'inbound' ? inboundDetails.pickupLocation : null,
      deliveryLocation: inboundDetails.type === 'outbound' ? inboundDetails.deliveryLocation : null,
      type: inboundDetails.type,
      status: 'pending',
      fee,
      date: new Date().toISOString().split('T')[0],
    };

    addInboundRequest(newInbound);
    toast({ title: 'Inventory Request Added', description: `${inboundDetails.type === 'inbound' ? 'Pickup' : 'Delivery'} scheduled. Estimated fee: ₹${fee.toFixed(2)}` });
    setIsDialogOpen(false);
    setInboundDetails({ items: [{ productId: '', quantity: 0 }], pickupLocation: '', deliveryLocation: '', type: 'inbound' });
  };

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Inbound / Outbound Inventory</h1>
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
          <Button className="mb-4 px-6 py-2 text-lg font-semibold">Add/Remove Inventory Request</Button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-auto" aria-describedby="inbound-dialog-desc">
          <DialogTitle className="text-xl font-semibold mb-2">Add/Remove Inventory Request</DialogTitle>
          <DialogDescription className="mb-4 text-gray-700" id="inbound-dialog-desc">
            Add inbound or outbound inventory request with product details, weight, and pickup or delivery location.
          </DialogDescription>
          <div className="space-y-4 mt-4">
            <div>
              <Label className="mb-2 block font-medium text-gray-900">Type</Label>
              <Tabs value={inboundDetails.type} onValueChange={(value) => setInboundDetails(prev => ({ ...prev, type: value }))}>
                <TabsList className="mb-3">
                  <TabsTrigger value="inbound" className="px-4 py-2 font-semibold rounded-md">Inbound</TabsTrigger>
                  <TabsTrigger value="outbound" className="px-4 py-2 font-semibold rounded-md">Outbound</TabsTrigger>
                </TabsList>
                <TabsContent value="inbound" className="space-y-4">
                  {inboundDetails.items.map((item, index) => (
                    <div key={index} className="flex flex-wrap items-center space-x-3 space-y-2">
                      <select
                        name="productId"
                        value={item.productId || ''}
                        onChange={(e) => handleInputChange(e, index)}
                        className="flex-grow min-w-[160px] border border-gray-300 rounded p-2"
                        required
                      >
                        <option value="">Select product</option>
                        {products.map(product => (
                          <option key={product.id} value={product.id}>
                            {product.name} ({product.sku})
                          </option>
                        ))}
                      </select>
                      <Input
                        name="quantity"
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => handleInputChange(e, index)}
                        placeholder="Quantity"
                        className="w-28 min-w-[80px]"
                        required
                      />
                      <Button type="button" variant="outline" onClick={() => removeItem(index)} className="h-9 px-3">Remove</Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" onClick={addItem} className="mt-2 px-4 py-1">Add Product</Button>
                  <div className="mt-4">
                    <Label htmlFor="pickupLocation" className="mb-1 block font-medium text-gray-900">Pickup Location</Label>
                    <select
                      id="pickupLocation"
                      name="pickupLocation"
                      value={inboundDetails.pickupLocation ? inboundDetails.pickupLocation.id : ''}
                      onChange={handlePickupLocationChange}
                      className="w-full border border-gray-300 rounded p-2"
                      required
                    >
                      <option value="">Select pickup location</option>
                      {savedPickupLocations
                        .filter(loc => loc.merchantId === currentUser?.id)
                        .map(loc => (
                          <option key={loc.id} value={loc.id}>
                            {loc.buildingNumber}, {loc.location}, {loc.pincode}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="mt-2 text-blue-600 underline hover:text-blue-800"
                      onClick={() => setShowAddLocation(true)}
                    >
                      Add New Pickup Location
                    </button>
                    {showAddLocation && (
                      <div className="mt-3 space-y-3 border p-3 rounded bg-gray-50">
                        <Input
                          placeholder="Building Number"
                          value={newLocation.buildingNumber}
                          onChange={e => setNewLocation(prev => ({ ...prev, buildingNumber: e.target.value }))}
                          required
                        />
                        <Input
                          placeholder="Location"
                          value={newLocation.location}
                          onChange={e => setNewLocation(prev => ({ ...prev, location: e.target.value }))}
                          required
                        />
                        <Input
                          placeholder="Pincode"
                          value={newLocation.pincode}
                          onChange={e => setNewLocation(prev => ({ ...prev, pincode: e.target.value }))}
                          required
                        />
                        <Input
                          placeholder="Phone Number"
                          value={newLocation.phone}
                          onChange={e => setNewLocation(prev => ({ ...prev, phone: e.target.value }))}
                          required
                        />
                        <div className="flex space-x-2">
                              <Button
                                onClick={() => {
                                  if (newLocation.buildingNumber && newLocation.location && newLocation.pincode && newLocation.phone) {
                                    const locationToSave = {
                                      buildingNumber: newLocation.buildingNumber,
                                      location: newLocation.location,
                                      pincode: newLocation.pincode,
                                      phone: newLocation.phone,
                                      merchantId: currentUser?.id
                                    };
                                    addPickupLocation(locationToSave);
                                    setInboundDetails(prev => ({
                                      ...prev,
                                      pickupLocation: `${locationToSave.buildingNumber}, ${locationToSave.location}, ${locationToSave.pincode}`
                                    }));
                                    setNewLocation({ buildingNumber: '', location: '', pincode: '', phone: '' });
                                    setShowAddLocation(false);
                                    toast({ title: 'Pickup Location Added', description: 'New pickup location saved.' });
                                  } else {
                                    toast({ title: 'Error', description: 'Please fill all fields to add location.', variant: 'destructive' });
                                  }
                                }}
                                className="flex-grow"
                              >
                                Save Location
                              </Button>
                          <Button variant="outline" onClick={() => setShowAddLocation(false)} className="flex-grow">Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="outbound" className="space-y-4">
                  {inboundDetails.items.map((item, index) => {
                    const inventoryItem = inventory.find(i => i.productId === item.productId && i.merchantId === currentUser?.id);
                    const availableQuantity = inventoryItem ? inventoryItem.quantity : 0;
                    return (
                      <div key={index} className="flex flex-wrap items-center space-x-3 space-y-2">
                        <select
                          name="productId"
                          value={item.productId || ''}
                          onChange={(e) => handleInputChange(e, index)}
                          className="flex-grow min-w-[160px] border border-gray-300 rounded p-2"
                          required
                        >
                          <option value="">Select product</option>
                          {products.map(product => (
                            <option key={product.id} value={product.id}>
                              {product.name} ({product.sku})
                            </option>
                          ))}
                        </select>
                        <div className="flex flex-col">
                          <Input
                            name="quantity"
                            type="number"
                            min="1"
                            max={availableQuantity}
                            value={item.quantity}
                            onChange={(e) => handleInputChange(e, index)}
                            placeholder="Quantity"
                            className="w-28 min-w-[80px]"
                            required
                          />
                          <span className="text-xs text-gray-500">Available: {availableQuantity}</span>
                        </div>
                        <Button type="button" variant="outline" onClick={() => removeItem(index)} className="h-9 px-3">Remove</Button>
                      </div>
                    );
                  })}
                  <Button type="button" variant="outline" onClick={addItem} className="mt-2 px-4 py-1">Add Product</Button>
                  <div className="mt-4">
                    <Label htmlFor="deliveryLocation" className="mb-1 block font-medium text-gray-900">Delivery Location</Label>
                    <select
                      id="deliveryLocation"
                      name="deliveryLocation"
                      value={inboundDetails.deliveryLocation ? inboundDetails.deliveryLocation.id : ''}
                      onChange={handleDeliveryLocationChange}
                      className="w-full border border-gray-300 rounded p-2"
                      required
                    >
                      <option value="">Select delivery location</option>
                      {savedPickupLocations
                        .filter(loc => loc.merchantId === currentUser?.id)
                        .map(loc => (
                          <option key={loc.id} value={loc.id}>
                            {loc.buildingNumber}, {loc.location}, {loc.pincode}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      className="mt-2 text-blue-600 underline hover:text-blue-800"
                      onClick={() => setShowAddDeliveryLocation(true)}
                    >
                      Add New Delivery Location
                    </button>
                    {showAddDeliveryLocation && (
                      <div className="mt-3 space-y-3 border p-3 rounded bg-gray-50">
                        <Input
                          placeholder="Building Number"
                          value={newDeliveryLocation.buildingNumber}
                          onChange={e => setNewDeliveryLocation(prev => ({ ...prev, buildingNumber: e.target.value }))}
                          required
                        />
                        <Input
                          placeholder="Location"
                          value={newDeliveryLocation.location}
                          onChange={e => setNewDeliveryLocation(prev => ({ ...prev, location: e.target.value }))}
                          required
                        />
                        <Input
                          placeholder="Pincode"
                          value={newDeliveryLocation.pincode}
                          onChange={e => setNewDeliveryLocation(prev => ({ ...prev, pincode: e.target.value }))}
                          required
                        />
                        <Input
                          placeholder="Phone Number"
                          value={newDeliveryLocation.phone}
                          onChange={e => setNewDeliveryLocation(prev => ({ ...prev, phone: e.target.value }))}
                          required
                        />
                        <div className="flex space-x-2">
                          <Button
                            onClick={() => {
                              if (newDeliveryLocation.buildingNumber && newDeliveryLocation.location && newDeliveryLocation.pincode && newDeliveryLocation.phone) {
                                addPickupLocation({ ...newDeliveryLocation, merchantId: currentUser?.id });
                                setInboundDetails(prev => ({
                                  ...prev,
                                  deliveryLocation: `${newDeliveryLocation.buildingNumber}, ${newDeliveryLocation.location}, ${newDeliveryLocation.pincode}`
                                }));
                                setNewDeliveryLocation({ buildingNumber: '', location: '', pincode: '', phone: '' });
                                setShowAddDeliveryLocation(false);
                                toast({ title: 'Delivery Location Added', description: 'New delivery location saved.' });
                              } else {
                                toast({ title: 'Error', description: 'Please fill all fields to add location.', variant: 'destructive' });
                              }
                            }}
                            className="flex-grow"
                          >
                            Save Location
                          </Button>
                          <Button variant="outline" onClick={() => setShowAddDeliveryLocation(false)} className="flex-grow">Cancel</Button>
                        </div>
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>
            </div>
            <Button onClick={handleAddInbound} className="mt-4 px-6 py-2 text-lg font-semibold">Add Request</Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-8 mt-8">
        <Card>
          <CardHeader>
            <Input
              placeholder="Search inventory requests..."
              // Add search state and handler if needed
              className="max-w-sm"
            />
          </CardHeader>
          <CardContent>
            {inbounds.length === 0 ? (
              <p className="text-gray-600">No inventory requests found.</p>
            ) : (
              <InventoryRequestsList requests={inbounds.filter(inb => inb.merchantId === currentUser?.id)} products={products} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Inbound;
