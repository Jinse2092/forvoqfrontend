import React, { useState } from 'react';
import { useInventory } from '../context/inventory-context.jsx';
import { Button } from '../components/ui/button.jsx';
import { Input } from '../components/ui/input.jsx';
import { Label } from '../components/ui/label.jsx';
import { Textarea } from '../components/ui/textarea.jsx';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '../components/ui/card.jsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose, DialogDescription } from '../components/ui/dialog.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table.jsx';
import { PlusCircle, Edit, Trash2, Package } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { calculateVolumetricWeight, calculateDispatchFee, calculateInboundFee } from '../lib/utils.js';

const Products = () => {
  const { products, users, addProduct, updateProduct, deleteProduct, currentUser } = useInventory();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);
  // Bulk add state (admin-only)
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [selectedMerchantForBulk, setSelectedMerchantForBulk] = useState('');
  const [bulkProducts, setBulkProducts] = useState([{ name: '', price: '', weightKg: '' }]);
  const [bulkFees, setBulkFees] = useState({ transportationFee: '', itemPackingFee: '', warehousingRatePerKg: '' });
  
  const [formData, setFormData] = useState({
    name: '',
    skus: [''],
    category: '',
    price: '',
    cost: '',
    description: '',
    imageUrl: '',
    weightKg: '',
    // New fee fields
    transportationFee: '',
    itemPackingFee: '',
    warehousingRatePerKg: '',
    lengthCm: '',
    breadthCm: '',
    heightCm: '',
    inboundPrice: '',
    outboundPrice: '',
    packingPrice: ''
  });
  const [searchTerm, setSearchTerm] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name.startsWith('sku-')) {
      // Handle SKU array
      const idx = parseInt(name.split('-')[1], 10);
      setFormData(prev => {
        const skus = [...prev.skus];
        skus[idx] = value;
        return { ...prev, skus };
      });
    } else {
      setFormData(prev => ({ ...prev, [name]: value === undefined || value === null ? '' : value }));
    }
  };

  const handleAddSku = () => {
    setFormData(prev => ({ ...prev, skus: [...prev.skus, ''] }));
  };

  const handleRemoveSku = (idx) => {
    setFormData(prev => {
      const skus = prev.skus.filter((_, i) => i !== idx);
      return { ...prev, skus: skus.length ? skus : [''] };
    });
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const productData = {
      ...formData,
      skus: formData.skus.map(s => s.trim()).filter(Boolean),
      category: formData.category || '',
      price: formData.price === '' ? 0 : parseFloat(formData.price),
      cost: formData.cost === '' ? 0 : parseFloat(formData.cost),
      weightKg: formData.weightKg === '' ? 0 : parseFloat(formData.weightKg),
      transportationFee: formData.transportationFee === '' ? 0 : parseFloat(formData.transportationFee),
      itemPackingFee: formData.itemPackingFee === '' ? 0 : parseFloat(formData.itemPackingFee),
      warehousingRatePerKg: formData.warehousingRatePerKg === '' ? 0 : parseFloat(formData.warehousingRatePerKg),
      packingPrice: formData.packingPrice === '' ? 0 : parseFloat(formData.packingPrice),
      inboundPrice: formData.inboundPrice === '' ? 0 : parseFloat(formData.inboundPrice),
      outboundPrice: formData.outboundPrice === '' ? 0 : parseFloat(formData.outboundPrice),
    };
    if (currentProduct) {
      updateProduct(currentProduct.id, productData);
    } else {
      addProduct({ ...productData, id: Date.now().toString() });
    }
    closeModal();
  };

  const openModal = (product = null) => {
    setCurrentProduct(product);
    if (product) {
      setFormData({
        name: product.name ?? '',
        skus: Array.isArray(product.skus) ? product.skus : [product.sku ?? ''],
        category: product.category ?? '',
        price: product.price !== undefined && product.price !== null ? product.price.toString() : '',
        cost: product.cost !== undefined && product.cost !== null ? product.cost.toString() : '',
        description: product.description ?? '',
        imageUrl: product.imageUrl ?? '',
        transportationFee: product.transportationFee !== undefined && product.transportationFee !== null ? product.transportationFee.toString() : '',
        itemPackingFee: product.itemPackingFee !== undefined && product.itemPackingFee !== null ? product.itemPackingFee.toString() : '',
        warehousingRatePerKg: product.warehousingRatePerKg !== undefined && product.warehousingRatePerKg !== null ? product.warehousingRatePerKg.toString() : '',
        weightKg: product.weightKg !== undefined && product.weightKg !== null ? product.weightKg.toString() : '',
        lengthCm: product.lengthCm !== undefined && product.lengthCm !== null ? product.lengthCm.toString() : '',
        breadthCm: product.breadthCm !== undefined && product.breadthCm !== null ? product.breadthCm.toString() : '',
        heightCm: product.heightCm !== undefined && product.heightCm !== null ? product.heightCm.toString() : '',
        inboundPrice: product.inboundPrice !== undefined && product.inboundPrice !== null ? product.inboundPrice.toString() : '',
        outboundPrice: product.outboundPrice !== undefined && product.outboundPrice !== null ? product.outboundPrice.toString() : '',
        packingPrice: product.packingPrice !== undefined && product.packingPrice !== null ? product.packingPrice.toString() : ''
      });
    } else {
      setFormData({ name: '', skus: [''], category: '', price: '', cost: '', description: '', imageUrl: '', weightKg: '', transportationFee: '', itemPackingFee: '', warehousingRatePerKg: '', lengthCm: '', breadthCm: '', heightCm: '', inboundPrice: '', outboundPrice: '', packingPrice: '' });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setCurrentProduct(null);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this product? This action cannot be undone.')) {
      deleteProduct(id);
    }
  };

  // Bulk add handlers
  const handleBulkChangeRow = (index, field, value) => {
    setBulkProducts(prev => {
      const arr = [...prev];
      arr[index] = { ...arr[index], [field]: value };
      return arr;
    });
  };

  const handleBulkAddRow = () => setBulkProducts(prev => [...prev, { name: '', price: '', weightKg: '' }]);
  const handleBulkRemoveRow = (index) => setBulkProducts(prev => prev.filter((_, i) => i !== index));

  const handleBulkFeeChange = (e) => {
    const { name, value } = e.target;
    setBulkFees(prev => ({ ...prev, [name]: value }));
  };

  const handleBulkSubmit = (e) => {
    e.preventDefault();
    if (!selectedMerchantForBulk) {
      alert('Please select a merchant for the bulk products.');
      return;
    }
    // Validate rows
    const rows = bulkProducts.filter(r => (r.name && String(r.name).trim() !== ''));
    if (rows.length === 0) {
      alert('Please add at least one product row with a name.');
      return;
    }

    // Parse fees
    const tFee = parseFloat(bulkFees.transportationFee || 0) || 0;
    const pFee = parseFloat(bulkFees.itemPackingFee || 0) || 0;
    const wRate = parseFloat(bulkFees.warehousingRatePerKg || 0) || 0;

    rows.forEach((r, idx) => {
      const price = r.price === '' ? 0 : parseFloat(r.price) || 0;
      const weightKg = r.weightKg === '' ? 0 : parseFloat(r.weightKg) || 0;
      const product = {
        id: `bulk_${Date.now()}_${idx}_${Math.floor(Math.random()*10000)}`,
        name: String(r.name).trim(),
        skus: [],
        category: '',
        price,
        cost: 0,
        description: '',
        imageUrl: '',
        weightKg,
        transportationFee: tFee,
        itemPackingFee: pFee,
        warehousingRatePerKg: wRate,
        lengthCm: '',
        breadthCm: '',
        heightCm: '',
        inboundPrice: 0,
        outboundPrice: 0,
        packingPrice: 0,
        merchantId: selectedMerchantForBulk,
      };
      addProduct(product);
    });

    // Reset and close
    setSelectedMerchantForBulk('');
    setBulkProducts([{ name: '', price: '', weightKg: '' }]);
    setBulkFees({ transportationFee: '', itemPackingFee: '', warehousingRatePerKg: '' });
    setIsBulkModalOpen(false);
  };

  const filteredProducts = products.filter(product =>
    (product.name && product.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (product.sku && product.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (product.category && product.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Products</h1>
          <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => openModal()}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add Product
              </Button>
            </DialogTrigger>
            <DialogContent aria-describedby="product-dialog-desc" className="w-full max-w-full sm:max-w-lg p-4 sm:p-6 overflow-auto max-h-[90vh]">
              <DialogHeader>
                <DialogTitle>{currentProduct ? 'Edit Product' : 'Add New Product'}</DialogTitle>
                <DialogDescription id="product-dialog-desc">
                  Please fill in the product details below. All required fields must be completed to add or edit a product.
                </DialogDescription>
              </DialogHeader>
              <div className="max-w-full overflow-x-auto">
                <form onSubmit={handleFormSubmit} className="grid gap-4 py-4 max-w-full min-w-[320px]">
                  <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4 w-full">
                    <Label htmlFor="name" className="text-right sm:text-left">Name</Label>
                    <Input id="name" name="name" value={formData.name} onChange={handleInputChange} className="col-span-3 sm:col-span-1 w-full" required />
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4 w-full">
                    <Label className="text-right sm:text-left">SKUs</Label>
                    <div className="col-span-3 sm:col-span-1 w-full flex flex-col gap-2">
                      {formData.skus.map((sku, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <Input
                            name={`sku-${idx}`}
                            value={sku}
                            onChange={handleInputChange}
                            placeholder={`SKU #${idx + 1}`}
                            required={idx === 0}
                            className="flex-1"
                          />
                          {formData.skus.length > 1 && (
                            <Button type="button" variant="outline" onClick={() => handleRemoveSku(idx)}>-</Button>
                          )}
                          {idx === formData.skus.length - 1 && (
                            <Button type="button" variant="outline" onClick={handleAddSku}>+</Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4 w-full">
                    <Label htmlFor="category" className="text-right sm:text-left">Category</Label>
                    <Input id="category" name="category" value={formData.category} onChange={handleInputChange} className="col-span-3 sm:col-span-1 w-full" />
                  </div>
                  <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4 w-full">
                    <Label htmlFor="price" className="text-right sm:text-left">Price (₹)</Label>
                    <Input id="price" name="price" type="number" step="0.01" value={formData.price} onChange={handleInputChange} className="col-span-3 sm:col-span-1 w-full" required />
                  </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4 w-full">
                  <Label htmlFor="cost" className="text-right sm:text-left">Cost (₹)</Label>
                  <Input id="cost" name="cost" type="number" step="0.01" value={formData.cost} onChange={handleInputChange} className="col-span-3 sm:col-span-1 w-full" />
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4 w-full">
                  <Label htmlFor="weightKg" className="text-right sm:text-left">Weight (kg)</Label>
                  <Input id="weightKg" name="weightKg" type="number" step="0.01" value={formData.weightKg} onChange={handleInputChange} className="col-span-3 sm:col-span-1 w-full" required />
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  <Label htmlFor="description" className="text-right sm:text-left">Description</Label>
                  <Textarea id="description" name="description" value={formData.description} onChange={handleInputChange} className="col-span-3 sm:col-span-1" />
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  <Label htmlFor="imageUrl" className="text-right sm:text-left">Image URL</Label>
                  <Input id="imageUrl" name="imageUrl" value={formData.imageUrl} onChange={handleInputChange} className="col-span-3 sm:col-span-1" placeholder="Optional: https://..." />
                  <input
                    type="file"
                    id="imageUpload"
                    name="imageUpload"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setFormData(prev => ({ ...prev, imageUrl: reader.result }));
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="col-span-3 sm:col-span-1 mt-2"
                  />
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  <Label htmlFor="lengthCm" className="text-right sm:text-left">Length (cm)</Label>
                  <Input
                    id="lengthCm"
                    name="lengthCm"
                    type="number"
                    step="0.01"
                    value={formData.lengthCm}
                    onChange={handleInputChange}
                    className="col-span-3 sm:col-span-1"
                  />
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  <Label htmlFor="breadthCm" className="text-right sm:text-left">Breadth (cm)</Label>
                  <Input
                    id="breadthCm"
                    name="breadthCm"
                    type="number"
                    step="0.01"
                    value={formData.breadthCm}
                    onChange={handleInputChange}
                    className="col-span-3 sm:col-span-1"
                  />
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  <Label htmlFor="heightCm" className="text-right sm:text-left">Height (cm)</Label>
                  <Input
                    id="heightCm"
                    name="heightCm"
                    type="number"
                    step="0.01"
                    value={formData.heightCm}
                    onChange={handleInputChange}
                    className="col-span-3 sm:col-span-1"
                  />
                </div>
                {currentUser?.role !== 'merchant' && (
                  <>
                    <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                      <Label className="text-right sm:text-left">Transportation Fee (₹) per item</Label>
                      <Input id="transportationFee" name="transportationFee" value={formData.transportationFee} onChange={handleInputChange} className="col-span-3 sm:col-span-1 w-full" placeholder="e.g. 5.00" />
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                      <Label className="text-right sm:text-left">Item Packing Fee (₹) per item</Label>
                      <Input id="itemPackingFee" name="itemPackingFee" value={formData.itemPackingFee} onChange={handleInputChange} className="col-span-3 sm:col-span-1 w-full" placeholder="e.g. 12.00" />
                    </div>
                    <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                      <Label className="text-right sm:text-left">Warehousing Rate (₹) per kg</Label>
                      <Input id="warehousingRatePerKg" name="warehousingRatePerKg" value={formData.warehousingRatePerKg} onChange={handleInputChange} className="col-span-3 sm:col-span-1 w-full" placeholder="e.g. 2.00" />
                    </div>
                  </>
                )}
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  <Label className="text-right sm:text-left">Warehousing Fee (₹) per item</Label>
                  <div className="col-span-3 sm:col-span-1 py-2">
                    {(() => {
                      const src = currentProduct || formData;
                      const rate = Number(src.warehousingRatePerKg) || 0;
                      const w = Number(src.weightKg) || 0;
                      const perItem = rate * w;
                      return perItem.toFixed(2);
                    })()}
                  </div>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  <Label className="text-right sm:text-left">Transportation Fee (₹) per item</Label>
                  <div className="col-span-3 sm:col-span-1 py-2">{(() => {
                    const src = currentProduct || formData;
                    return (Number(src.transportationFee) || 0).toFixed(2);
                  })()}</div>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  <Label className="text-right sm:text-left">Item Packing Fee (₹) per item</Label>
                  <div className="col-span-3 sm:col-span-1 py-2">{(() => {
                    const src = currentProduct || formData;
                    return (Number(src.itemPackingFee) || 0).toFixed(2);
                  })()}</div>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  <Label className="text-right sm:text-left">Estimated Total Item Fees (₹) per item</Label>
                  <div className="col-span-3 sm:col-span-1 py-2">
                    {(() => {
                      const src = currentProduct || formData;
                      const rate = Number(src.warehousingRatePerKg) || 0;
                      const w = Number(src.weightKg) || 0;
                      const ware = rate * w;
                      const trans = Number(src.transportationFee) || 0;
                      const pack = Number(src.itemPackingFee) || 0;
                      return (ware + trans + pack).toFixed(2);
                    })()}
                  </div>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  {/* Removed admin-set prices as per new requirement */}
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  {/* Removed admin-set prices as per new requirement */}
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  {/* Removed admin-set prices as per new requirement */}
                </div>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button type="submit">{currentProduct ? 'Save Changes' : 'Add Product'}</Button>
                </DialogFooter>
              </form>
              </div>
            </DialogContent>
          </Dialog>
            {/* Bulk Add Products - Admin Only */}
            {currentUser?.role !== 'merchant' && (
              <Dialog open={isBulkModalOpen} onOpenChange={setIsBulkModalOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => setIsBulkModalOpen(true)} variant="ghost" className="ml-2">
                    <PlusCircle className="mr-2 h-4 w-4" /> Bulk Add
                  </Button>
                </DialogTrigger>
                <DialogContent className="w-full max-w-full sm:max-w-2xl p-4 sm:p-6 overflow-auto max-h-[85vh]">
                  <DialogHeader>
                    <DialogTitle>Bulk Add Products</DialogTitle>
                    <DialogDescription>Add multiple products for a merchant and apply bulk fees.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleBulkSubmit} className="space-y-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Merchant</Label>
                      <select value={selectedMerchantForBulk} onChange={(e) => setSelectedMerchantForBulk(e.target.value)} className="col-span-3 sm:col-span-1 p-2 border rounded">
                        <option value="">-- Select Merchant --</option>
                        {users.filter(u => u.role === 'merchant').map(u => (
                          <option key={u.id} value={u.id}>{u.companyName || u.id}</option>
                        ))}
                      </select>
                    </div>

                    {/* Show selected merchant details so rows clearly inherit this merchant */}
                    {selectedMerchantForBulk && (() => {
                      const sel = users.find(u => u.id === selectedMerchantForBulk) || null;
                      return (
                        <div className="grid grid-cols-4 items-center gap-4 bg-muted p-2 rounded">
                          <div className="col-span-2 sm:col-span-1 text-sm">
                            <strong>Merchant ID:</strong> {sel ? sel.id : selectedMerchantForBulk}
                          </div>
                          <div className="col-span-2 sm:col-span-3 text-sm">
                            <strong>Merchant:</strong> {sel ? (sel.companyName || sel.id) : selectedMerchantForBulk}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="space-y-2">
                      {bulkProducts.map((row, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                          <input className="col-span-5 p-2 border rounded" placeholder="Product name" value={row.name} onChange={(e) => handleBulkChangeRow(idx, 'name', e.target.value)} />
                          <input className="col-span-2 p-2 border rounded" placeholder="Price (₹)" type="number" step="0.01" value={row.price} onChange={(e) => handleBulkChangeRow(idx, 'price', e.target.value)} />
                          <input className="col-span-2 p-2 border rounded" placeholder="Weight (kg)" type="number" step="0.01" value={row.weightKg} onChange={(e) => handleBulkChangeRow(idx, 'weightKg', e.target.value)} />
                          <div className="col-span-3 flex gap-2 justify-end">
                            {bulkProducts.length > 1 && (
                              <Button type="button" variant="outline" onClick={() => handleBulkRemoveRow(idx)}>Remove</Button>
                            )}
                            {idx === bulkProducts.length - 1 && (
                              <Button type="button" variant="outline" onClick={handleBulkAddRow}>Add Row</Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Transportation Fee (₹) per item</Label>
                      <Input id="transportationFee_bulk" name="transportationFee" value={bulkFees.transportationFee} onChange={handleBulkFeeChange} className="col-span-3 sm:col-span-1 w-full" placeholder="e.g. 5.00" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Item Packing Fee (₹) per item</Label>
                      <Input id="itemPackingFee_bulk" name="itemPackingFee" value={bulkFees.itemPackingFee} onChange={handleBulkFeeChange} className="col-span-3 sm:col-span-1 w-full" placeholder="e.g. 12.00" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label className="text-right">Warehousing Rate (₹) per kg</Label>
                      <Input id="warehousingRatePerKg_bulk" name="warehousingRatePerKg" value={bulkFees.warehousingRatePerKg} onChange={handleBulkFeeChange} className="col-span-3 sm:col-span-1 w-full" placeholder="e.g. 2.00" />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                      </DialogClose>
                      <Button type="submit">Create Products</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
      </div>
      <Card>
        <CardHeader>
          <Input
            placeholder="Search products by name, SKU, or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-full sm:max-w-sm"
          />
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Image</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Merchant ID</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredProducts.map((product, idx) => {
                    const merchant = users.find(u => u.id === product.merchantId);
                    const merchantName = merchant ? merchant.companyName : 'Unknown';
                    const merchantId = merchant ? merchant.id : 'Unknown';
                    // Use a unique key: combine product.id and idx if duplicate ids are possible
                    return (
                    <motion.tr
                      key={product.id + '-' + idx}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      layout
                    >
                      <TableCell>
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="h-10 w-10 object-cover rounded-sm" />
                        ) : (
                          <div className="h-10 w-10 bg-muted rounded-sm flex items-center justify-center text-muted-foreground">
                            <Package size={20} />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.sku}</TableCell>
                      <TableCell>{product.category}</TableCell>
                      <TableCell className="text-right">₹{(product.price ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right">₹{(product.cost ?? 0).toFixed(2)}</TableCell>
                      <TableCell>{merchantId}</TableCell>
                      <TableCell>{merchantName}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openModal(product)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDelete(product.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          </div>
          {filteredProducts.length === 0 && (
            <p className="text-center text-muted-foreground py-4">No products found.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Products;
