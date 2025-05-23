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
  const { products, users, addProduct, updateProduct, deleteProduct } = useInventory();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentProduct, setCurrentProduct] = useState(null);
  
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: '',
    price: '',
    cost: '',
    description: '',
    imageUrl: '',
    weightKg: '', // Ensure this is always a string
    packingType: 'normal packing',
    lengthCm: '',
    breadthCm: '',
    heightCm: '',
    inboundPrice: '',
    outboundPrice: '',
    packingPrice: '' // Ensure packingPrice is always present
  });
  const [searchTerm, setSearchTerm] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value === undefined || value === null ? '' : value })); // Always fallback to empty string
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    const productData = {
      ...formData,
      sku: formData.sku || '',
      category: formData.category || '',
      price: formData.price === '' ? 0 : parseFloat(formData.price),
      cost: formData.cost === '' ? 0 : parseFloat(formData.cost),
      weightKg: formData.weightKg === '' ? 0 : parseFloat(formData.weightKg),
      packingType: formData.packingType || 'normal packing',
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
        sku: product.sku ?? '',
        category: product.category ?? '',
        price: product.price !== undefined && product.price !== null ? product.price.toString() : '',
        cost: product.cost !== undefined && product.cost !== null ? product.cost.toString() : '',
        description: product.description ?? '',
        imageUrl: product.imageUrl ?? '',
        packingType: product.packingType ?? 'normal packing',
        weightKg: product.weightKg !== undefined && product.weightKg !== null ? product.weightKg.toString() : '',
        lengthCm: product.lengthCm !== undefined && product.lengthCm !== null ? product.lengthCm.toString() : '',
        breadthCm: product.breadthCm !== undefined && product.breadthCm !== null ? product.breadthCm.toString() : '',
        heightCm: product.heightCm !== undefined && product.heightCm !== null ? product.heightCm.toString() : '',
        inboundPrice: product.inboundPrice !== undefined && product.inboundPrice !== null ? product.inboundPrice.toString() : '',
        outboundPrice: product.outboundPrice !== undefined && product.outboundPrice !== null ? product.outboundPrice.toString() : '',
        packingPrice: product.packingPrice !== undefined && product.packingPrice !== null ? product.packingPrice.toString() : ''
      });
    } else {
      setFormData({ name: '', sku: '', category: '', price: '', cost: '', description: '', imageUrl: '', packingType: 'normal packing', weightKg: '', lengthCm: '', breadthCm: '', heightCm: '', inboundPrice: '', outboundPrice: '', packingPrice: '' });
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
                    <Label htmlFor="sku" className="text-right sm:text-left">SKU</Label>
                    <Input id="sku" name="sku" value={formData.sku} onChange={handleInputChange} className="col-span-3 sm:col-span-1 w-full" required />
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
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  <Label htmlFor="packingType" className="text-right sm:text-left">Packing Type</Label>
                  <select
                    id="packingType"
                    name="packingType"
                    value={formData.packingType}
                    onChange={handleInputChange}
                    className="col-span-3 sm:col-span-1 border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-100"
                  >
                    <option value="normal packing">Normal Packing</option>
                    <option value="fragile packing">Fragile Packing</option>
                    <option value="eco friendly fragile packing">eco friendly fragile packing</option>
                  </select>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  <Label htmlFor="packingFee" className="text-right sm:text-left">Packing Fee (₹)</Label>
                  <div className="col-span-3 sm:col-span-1 py-2">
                    {(() => {
                      const actualWeight = parseFloat(formData.weightKg) || 0;
                      const length = parseFloat(formData.lengthCm) || 0;
                      const breadth = parseFloat(formData.breadthCm) || 0;
                      const height = parseFloat(formData.heightCm) || 0;
                      const volumetricWeight = calculateVolumetricWeight(length, breadth, height);
                      const fee = calculateDispatchFee(actualWeight, volumetricWeight, formData.packingType);
                      return fee.toFixed(2);
                    })()}
                  </div>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  <Label htmlFor="inboundPrice" className="text-right sm:text-left">Inbound/Outbound Fee (₹)</Label>
                  <div className="col-span-3 sm:col-span-1 py-2">
                    {(() => {
                      const actualWeight = parseFloat(formData.weightKg) || 0;
                      const length = parseFloat(formData.lengthCm) || 0;
                      const breadth = parseFloat(formData.breadthCm) || 0;
                      const height = parseFloat(formData.heightCm) || 0;
                      const volumetricWeight = calculateVolumetricWeight(length, breadth, height);
                      const fee = calculateInboundFee(actualWeight, volumetricWeight);
                      return fee.toFixed(2);
                    })()}
                  </div>
                </div>
                <div className="grid grid-cols-4 sm:grid-cols-1 items-center gap-4">
                  <Label htmlFor="totalCharges" className="text-right sm:text-left">Estimated Total Charges (₹)</Label>
                  <div className="col-span-3 sm:col-span-1 py-2">
                    {(() => {
                      const actualWeight = parseFloat(formData.weightKg) || 0;
                      const length = parseFloat(formData.lengthCm) || 0;
                      const breadth = parseFloat(formData.breadthCm) || 0;
                      const height = parseFloat(formData.heightCm) || 0;
                      const volumetricWeight = calculateVolumetricWeight(length, breadth, height);
                      const packingFee = calculateDispatchFee(actualWeight, volumetricWeight, formData.packingType);
                      const inboundFee = calculateInboundFee(actualWeight, volumetricWeight);
                      const total = packingFee + inboundFee;
                      return total.toFixed(2);
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
      </div>
      <Card>
        <CardHeader>
          <Input
            placeholder="Search products by name, SKU, or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-sm"
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
