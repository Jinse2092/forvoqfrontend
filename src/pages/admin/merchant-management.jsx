import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInventory } from '../../context/inventory-context.jsx';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../components/ui/card.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Button } from '../../components/ui/button.jsx';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../../components/ui/select.jsx';

const AdminMerchantManagement = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { users, products, updateProduct, updateOrder, updateUser, currentUser } = useInventory();
  const [merchant, setMerchant] = useState(null);
  const [merchantProducts, setMerchantProducts] = useState([]);
  const [template, setTemplate] = useState('');

  useEffect(() => {
    const m = users.find(u => u.id === id);
    setMerchant(m || null);
  }, [users, id]);

  useEffect(() => {
    setMerchantProducts((products || []).filter(p => p.merchantId === id));
  }, [products, id]);

  useEffect(() => {
    try {
      const key = `shipping_label_template_${id}`;
      const saved = localStorage.getItem(key);
      setTemplate(saved || '');
    } catch (e) {
      setTemplate('');
    }
  }, [id]);

  if (!merchant) return (
    <div className="p-4">Merchant not found.</div>
  );

  const handleSaveTemplate = () => {
    try {
      const key = `shipping_label_template_${id}`;
      localStorage.setItem(key, template);
      alert('Template saved');
    } catch (e) {
      alert('Failed to save template');
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Manage Merchant: {merchant.companyName || merchant.name}</h1>
        <div>
          <Button onClick={() => window.close()}>Close</Button>
        </div>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Merchant Details</CardTitle>
          <CardDescription>Edit basic merchant information</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-2">
            <Label>Company Name</Label>
            <Input value={merchant.companyName || ''} onChange={e => setMerchant(prev => ({ ...prev, companyName: e.target.value }))} />
            <Label>Email</Label>
            <Input value={merchant.email || ''} onChange={e => setMerchant(prev => ({ ...prev, email: e.target.value }))} />
            <Label>Phone</Label>
            <Input value={merchant.phoneNumber || ''} onChange={e => setMerchant(prev => ({ ...prev, phoneNumber: e.target.value }))} />
            <div className="flex justify-end gap-2 mt-2">
              <Button onClick={() => { /* save to backend if desired */ alert('Save merchant not implemented in this view'); }}>Save</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Products & Pricing</CardTitle>
          <CardDescription>View and (read-only) product list for this merchant. Click a product to edit.</CardDescription>
        </CardHeader>
        <CardContent>
          {merchantProducts.length === 0 ? (
            <p>No products found for this merchant.</p>
          ) : (
            <div className="space-y-2">
              {merchantProducts.map(p => (
                <div key={p.id} className="p-2 border rounded flex justify-between items-center">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-sm text-muted-foreground">SKU: {p.sku || '-'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="font-medium">₹{(p.price || 0).toFixed(2)}</div>
                    <Button size="sm" variant="outline" onClick={() => {
                      const newPrice = prompt('Enter new price', String(p.price || 0));
                      if (!newPrice) return;
                      const parsed = parseFloat(newPrice);
                      if (isNaN(parsed)) return alert('Invalid price');
                      updateProduct(p.id, { ...p, price: parsed });
                    }}>Edit Price</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipping Label Template</CardTitle>
          <CardDescription>Edit merchant shipping label template</CardDescription>
        </CardHeader>
        <CardContent>
          <Label>Template (HTML/CSS)</Label>
          <textarea value={template} onChange={e => setTemplate(e.target.value)} className="w-full h-64 p-2 border rounded font-mono text-sm" />
          <div className="flex gap-2 mt-2">
            <Button onClick={() => {
              // preview sample
              const sampleData = { shop: { name: merchant.companyName || merchant.name }, order: { name: 'PREVIEW', created_at: new Date().toLocaleString() }, shipping_address: { name: 'John Doe', address1: '123', city_province_zip: 'City, State', country: 'Country', phone: '999999' }, items: [{ title: 'Sample', quantity: 1 }] };
              const win = window.open('', '_blank');
              if (!win) return alert('Popup blocked');
              win.document.write(template || '<div>No template</div>');
            }}>Preview</Button>
            <Button onClick={handleSaveTemplate} variant="outline">Save Template</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminMerchantManagement;
