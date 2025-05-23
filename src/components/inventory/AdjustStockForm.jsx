import React, { useState } from 'react';
import { useInventory } from '@/context/inventory-context.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose, DialogDescription } from '@/components/ui/dialog';

const AdjustStockForm = ({ currentItem, closeModal, getProductName }) => {
  const { updateInventoryItem, addTransaction } = useInventory();
  const [adjustData, setAdjustData] = useState({ quantity: '', type: 'adjustment', notes: '' });

  const handleAdjustInputChange = (e) => {
    const { name, value } = e.target;
    setAdjustData(prev => ({ ...prev, [name]: value }));
  };

  const handleAdjustSubmit = (e) => {
    e.preventDefault();
    if (!currentItem) return;

    const quantityChange = parseInt(adjustData.quantity);
    if (isNaN(quantityChange)) return;

    // Determine the actual change based on type if not 'adjustment'
    let actualQuantityChange = quantityChange;
    if (['damage', 'loss', 'sale'].includes(adjustData.type)) {
       actualQuantityChange = -Math.abs(quantityChange); // Ensure negative for deductions
    } else if (['purchase', 'return', 'correction', 'found'].includes(adjustData.type)) {
       actualQuantityChange = Math.abs(quantityChange); // Ensure positive for additions
    }
    // For 'adjustment', use the entered value directly (+/-)

    const newQuantity = currentItem.quantity + actualQuantityChange;

    updateInventoryItem(currentItem.id, { quantity: newQuantity });
    addTransaction({
      id: `txn-${Date.now()}`,
      merchantId: currentItem.merchantId, // Include merchantId
      productId: currentItem.productId,
      type: adjustData.type,
      quantity: actualQuantityChange, // Record the actual signed change
      date: new Date().toISOString().split('T')[0],
      notes: adjustData.notes || `${adjustData.type.charAt(0).toUpperCase() + adjustData.type.slice(1)}`,
    });
    closeModal();
  };

  return (
    <DialogContent className="sm:max-w-[425px]" aria-describedby="adjust-stock-desc">
      <DialogHeader>
        <DialogTitle>Adjust Stock for {currentItem ? getProductName(currentItem.productId) : ''}</DialogTitle>
        <DialogDescription id="adjust-stock-desc">
          Adjust the stock quantity for this inventory item.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleAdjustSubmit} className="grid gap-4 py-4">
        <p className="text-sm text-muted-foreground">Current Quantity: {currentItem?.quantity}</p>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="quantity" className="text-right">Change</Label>
          <Input
            id="quantity"
            name="quantity"
            type="number"
            placeholder="e.g., 10 or -5 for adjustment"
            value={adjustData.quantity}
            onChange={handleAdjustInputChange}
            className="col-span-3"
            required
          />
        </div>
         <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="type" className="text-right">Reason</Label>
            <Select onValueChange={(value) => setAdjustData(prev => ({ ...prev, type: value }))} value={adjustData.type} name="type">
              <SelectTrigger className="col-span-3">
                <SelectValue placeholder="Select reason" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="adjustment">Adjustment (+/-)</SelectItem>
                <SelectItem value="damage">Damaged (-)</SelectItem>
                <SelectItem value="loss">Inventory Loss (-)</SelectItem>
                <SelectItem value="correction">Count Correction (+)</SelectItem>
                 <SelectItem value="return">Customer Return (+)</SelectItem>
                 <SelectItem value="found">Found Stock (+)</SelectItem>
                 {/* Add other relevant types */}
              </SelectContent>
            </Select>
          </div>
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor="notes" className="text-right">Notes</Label>
          <Input
            id="notes"
            name="notes"
            placeholder="Optional notes"
            value={adjustData.notes}
            onChange={handleAdjustInputChange}
            className="col-span-3"
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">Cancel</Button>
          </DialogClose>
          <Button type="submit">Adjust Stock</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
};

export default AdjustStockForm;
