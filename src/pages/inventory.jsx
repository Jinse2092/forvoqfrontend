import React, { useState } from 'react';
import { useInventory } from '../context/inventory-context.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.jsx';
import { Dialog, DialogTrigger } from '../components/ui/dialog.jsx';
import { PlusCircle } from 'lucide-react';
import InventoryList from '../components/inventory/InventoryList.jsx';
import InventoryForm from '../components/inventory/InventoryForm.jsx';
import AdjustStockForm from '../components/inventory/AdjustStockForm.jsx';

const Inventory = () => {
  const { inventory, products, currentUser, users } = useInventory();
  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState(false);
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const openAddEditModal = (item = null) => {
    setCurrentItem(item);
    setIsAddEditModalOpen(true);
  };

  const closeAddEditModal = () => {
    setIsAddEditModalOpen(false);
    setCurrentItem(null);
  };

  const openAdjustModal = (item) => {
    setCurrentItem(item);
    setIsAdjustModalOpen(true);
  };

  const closeAdjustModal = () => {
    setIsAdjustModalOpen(false);
    setCurrentItem(null);
  };

  const getProductName = (productId) => {
    const product = products.find(p => p.id === productId);
    return product ? product.name : null;
  };

  const getMerchantName = (merchantId) => {
    const user = users.find(u => u.id === merchantId);
    if (user && user.companyName) {
      return user.companyName;
    }
    if (merchantId) {
      return merchantId.toString();
    }
    return '';
  };

  const filteredInventory = inventory.filter(item => {
    if (currentUser?.role === 'merchant' && item.merchantId !== currentUser.id) {
      return false;
    }
    const productName = getProductName(item.productId);
    if (!productName) {
      return false; // filter out unknown products
    }
    const productNameLower = productName.toLowerCase();
    const location = item.location?.toLowerCase() || '';
    const merchantName = getMerchantName(item.merchantId).toLowerCase();
    const searchTermLower = searchTerm.toLowerCase();
    const merchantIdMatch = currentUser?.role !== 'merchant' && (item.merchantId?.toLowerCase().includes(searchTermLower) || merchantName.includes(searchTermLower));
    return productNameLower.includes(searchTermLower) || location.includes(searchTermLower) || merchantIdMatch;
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Inventory</h1>
        {currentUser?.role === 'merchant' && (
          <p className="text-sm text-muted-foreground">Manage your stock levels.</p>
        )}
        {currentUser?.role !== 'merchant' && (
          <p className="text-sm text-muted-foreground">Viewing all merchant inventory.</p>
        )}
        {/* Add button might be admin-only or have different behavior */}
        {/* Hiding Add button for now as inventory is added via Inbounds */}
        {/*
        <Dialog open={isAddEditModalOpen} onOpenChange={setIsAddEditModalOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => openAddEditModal()}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add Inventory Item
            </Button>
          </DialogTrigger>
          <InventoryForm currentItem={currentItem} closeModal={closeAddEditModal} />
        </Dialog>
        */}
      </div>

      <Card>
        <CardHeader>
          <Input
            placeholder={currentUser?.role === 'merchant' ? "Search by product name or location..." : "Search by product, location, or merchant ID..."}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
          />
        </CardHeader>
        <CardContent>
          <InventoryList
            inventory={filteredInventory}
            openEditModal={openAddEditModal} // Keep edit for min/max stock etc.
            openAdjustModal={openAdjustModal}
            // deleteInventoryItem={deleteInventoryItem} // Deletion might be restricted
            getProductName={getProductName}
            isAdminView={currentUser?.role !== 'merchant'}
            users={users}
          />
        </CardContent>
      </Card>

      {/* Edit Modal (for min/max stock etc.) */}
      <Dialog open={isAddEditModalOpen} onOpenChange={setIsAddEditModalOpen}>
        <InventoryForm currentItem={currentItem} closeModal={closeAddEditModal} />
      </Dialog>

      {/* Adjust Stock Modal */}
      <Dialog open={isAdjustModalOpen} onOpenChange={setIsAdjustModalOpen}>
        <AdjustStockForm currentItem={currentItem} closeModal={closeAdjustModal} getProductName={getProductName} />
      </Dialog>
    </div>
  );
};

export default Inventory;
