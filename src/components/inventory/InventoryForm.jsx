import React, { useState, useEffect } from 'react';
import { useInventory } from '@/context/inventory-context.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const InventoryForm = ({ currentItem, closeModal }) => {
  const { products, addInventoryItem, updateInventoryItem, currentUser } = useInventory();
  const [formData, setFormData] = useState({
    productId: '', quantity: '', location: '', minStockLevel: '', maxStockLevel: ''
  });

  useEffect(() => {
    if (currentItem) {
      setFormData({
        productId: currentItem.productId,
        quantity: currentItem.quantity?.toString() || '',
        location: currentItem.location || '',
        minStockLevel: currentItem.minStockLevel?.toString() || '',
        maxStockLevel: currentItem.maxStockLevel?.toString() || '',
      });
    } else {
      // Reset form for adding - though adding is now via Inbounds
      setFormData({ productId: '', quantity: '0', location: '', minStockLevel: '0', maxStockLevel: '0' });
    }
  }, [currentItem]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (value) => {
    setFormData(prev => ({ ...prev, productId: value }));
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const inventoryData = {
      ...formData,
      quantity: parseInt(formData.quantity) || 0, // Keep quantity from form if editing
      minStockLevel: parseInt(formData.minStockLevel) || 0,
      maxStockLevel: parseInt(formData.maxStockLevel) || 0,
      merchantId: currentItem ? currentItem.merchantId : currentUser?.id, // Preserve merchantId on edit
    };

    if (currentItem) {
      updateInventoryItem(currentItem.id, inventoryData);
    } else {
      // Adding new items directly is disabled, use Inbound process
      // addInventoryItem({ ...inventoryData, id: `inv-${Date.now()}` });
       console.warn("Direct inventory addition is disabled. Use Inbound process.");
    }
    closeModal();
  };

  // Filter products relevant to the current user if merchant
   const availableProducts = currentUser?.role === 'merchant'
     ? products.filter(p => p.merchantId === currentUser.id)
     : products;


  return (
    <DialogContent className="sm:max-w-[425px]" aria-describedby="inventory-form-desc">
      <DialogHeader>
        <DialogTitle>{currentItem ? 'Edit Inventory Details' : 'Add New Inventory Item (Disabled)'}</DialogTitle>
        <DialogDescription id="inventory-form-desc">
          Fill in the inventory details below.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleFormSubmit} className="grid gap-4 py-4">
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="productId" className="text-right">Product</Label>
          <Select onValueChange={handleSelectChange} value={formData.productId} name="productId" required disabled={!!currentItem}>
            <SelectTrigger className="col-span-3" disabled={!!currentItem}>
              <SelectValue placeholder="Select a product" />
            </SelectTrigger>
            <SelectContent>
              {availableProducts.map((product, index) => (
                <SelectItem key={product.id || index} value={product.id}>{product.name} ({product.sku})</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="quantity" className="text-right">Quantity</Label>
          <Input id="quantity" name="quantity" type="number" value={formData.quantity} onChange={handleInputChange} className="col-span-3" required disabled={!currentItem} />
           {!currentItem && <p className="col-span-4 text-xs text-muted-foreground text-center">Quantity managed via Inbounds & Orders.</p>}
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="location" className="text-right">Location</Label>
          <Input id="location" name="location" value={formData.location} onChange={handleInputChange} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="minStockLevel" className="text-right">Min Stock</Label>
          <Input id="minStockLevel" name="minStockLevel" type="number" value={formData.minStockLevel} onChange={handleInputChange} className="col-span-3" />
        </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="maxStockLevel" className="text-right">Max Stock</Label>
          <Input id="maxStockLevel" name="maxStockLevel" type="number" value={formData.maxStockLevel} onChange={handleInputChange} className="col-span-3" />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="submit" disabled={!currentItem}>{currentItem ? 'Save Changes' : 'Add Item (Disabled)'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
};

export default InventoryForm;
