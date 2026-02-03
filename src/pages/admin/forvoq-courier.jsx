import React, { useEffect, useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { useInventory } from '../../context/inventory-context.jsx';

const SLABS = ['<500g','<1kg','<1.5kg','<2kg','<2.5kg','<3kg','<3.5kg','<4kg','<4.5kg','<5kg'];

const ForvoqCourierAdmin = () => {
  const { users, currentUser } = useInventory();
  const [merchants, setMerchants] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState(null);
  const [fees, setFees] = useState({});
  const [saving, setSaving] = useState(false);
  const [merchantOrders, setMerchantOrders] = useState([]);
  const [showSlabEditor, setShowSlabEditor] = useState(false);

  useEffect(() => {
    // load merchants from context
    const m = (users || []).filter(u => u.role === 'merchant');
    setMerchants(m);
  }, [users]);

  const openEditor = (merchant) => {
    setEditingMerchant(merchant);
    const existing = (merchant.forvoqFees && typeof merchant.forvoqFees === 'object') ? merchant.forvoqFees : {};
    const init = {};
    SLABS.forEach(s => { init[s] = existing[s] !== undefined ? String(existing[s]) : ''; });
    setFees(init);
    // fetch recent orders for this merchant and filter for FORVOQ courier
    loadMerchantOrders(merchant);
  };

  const loadMerchantOrders = async (merchant) => {
    setLoading(true);
    try {
      const id = merchant.id || merchant._id;
      const base = 'https://api.forvoq.com';
      const url = `${base}/api/orders?merchantId=${encodeURIComponent(id)}&deliveryPartner=forvoq`;
      let res = await fetch(url);
      let list = [];
      if (res.ok) {
        const body = await res.json();
        list = Array.isArray(body) ? body : body.orders || [];
      }

      // If server-side filter returned nothing, fall back to fetching merchant orders and filter client-side
      if (!list || list.length === 0) {
        try {
          const res2 = await fetch(`${base}/api/orders?merchantId=${encodeURIComponent(id)}`);
          if (res2.ok) {
            const body2 = await res2.json();
            const all = Array.isArray(body2) ? body2 : body2.orders || [];
            list = all.filter(o => {
              const dp = (o.deliveryPartner || o.courier || o.delivery_partner || '').toString().toLowerCase();
              return dp === 'forvoq' || dp.includes('forvoq');
            });
          }
        } catch (e) {
          console.warn('Fallback fetch failed', e);
        }
      }

      setMerchantOrders(list || []);
    } catch (e) {
      console.warn('Failed to load merchant orders', e);
      setMerchantOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const saveFees = async () => {
    if (!editingMerchant) return;
    setSaving(true);
    try {
      const payload = { forvoqFees: {} };
      SLABS.forEach(s => {
        const v = fees[s];
        if (v !== undefined && v !== '') payload.forvoqFees[s] = Number(v);
      });
      const id = editingMerchant.id || editingMerchant._id;
      const url = `https://api.forvoq.com/api/merchants/${id}`;
      const res = await fetch(url, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        // update local copy
        const updated = await res.json();
        setMerchants((m) => m.map(x => (String(x.id) === String(id) ? updated : x)));
        setEditingMerchant(null);
      } else {
        const text = await res.text();
        alert('Failed to save fees: ' + text);
      }
    } catch (e) {
      console.error(e);
      alert('Error saving fees');
    } finally {
      setSaving(false);
    }
  };

  if (!currentUser || !(currentUser.role === 'admin' || currentUser.role === 'superadmin')) {
    return <div className="p-6">Access denied — admin users only.</div>;
  }

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <h1 className="text-3xl font-bold">FORVOQ Courier — Admin</h1>
      <Card>
        <CardHeader>
          <CardTitle>Per-merchant FORVOQ Fees</CardTitle>
          <CardDescription>Manage weight-slab fees for FORVOQ courier per merchant.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Merchant</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Configured Slabs</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {merchants.map(m => (
                <TableRow key={m.id || m._id}>
                  <TableCell>{m.id || m._id}</TableCell>
                  <TableCell>{m.companyName || m.email || '—'}</TableCell>
                  <TableCell>{m.forvoqFees ? Object.keys(m.forvoqFees).length + ' slabs' : 'Not configured'}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button onClick={() => openEditor(m)}>Edit Fees</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editingMerchant} onOpenChange={(o) => { if (!o) setEditingMerchant(null); }}>
        <DialogContent className="w-full max-w-2xl p-4 sm:p-6 max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Edit FORVOQ Fees — {editingMerchant?.companyName || editingMerchant?.id}</DialogTitle>
            <DialogDescription>Enter fees (numeric) per weight slab. Leave blank to skip.</DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-medium">FORVOQ Orders for this merchant</div>
              <div className="flex items-center gap-2">
                <div className="text-sm text-muted-foreground">Showing orders with courier = FORVOQ</div>
                <Button variant="ghost" onClick={() => editingMerchant && loadMerchantOrders(editingMerchant)}>Refresh</Button>
              </div>
            </div>
            <div className="max-h-52 overflow-auto border rounded-md p-2 bg-muted">
              {loading ? (
                <div className="text-sm">Loading orders…</div>
              ) : (merchantOrders && merchantOrders.length > 0) ? (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-1">ID</th>
                      <th className="pb-1">Customer</th>
                      <th className="pb-1">Pincode</th>
                      <th className="pb-1">Weight(kg)</th>
                      <th className="pb-1">Tracking</th>
                    </tr>
                  </thead>
                  <tbody>
                    {merchantOrders.map(o => (
                      <tr key={o.id} className="border-t">
                        <td className="py-1">{o.id}</td>
                        <td className="py-1">{o.customerName || o.name || '—'}</td>
                        <td className="py-1">{o.pincode || o.zip || '—'}</td>
                        <td className="py-1">{(o.totalWeightKg !== undefined && o.totalWeightKg !== null) ? Number(o.totalWeightKg).toFixed(3) : ((o.items||[]).reduce((s,it) => s + (it.weightKg || 0),0)).toFixed(3)}</td>
                        <td className="py-1">{o.trackingCode || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-sm">No FORVOQ orders found for this merchant.</div>
              )}
            </div>

            <div className="mt-3">
              <Button variant="ghost" onClick={() => setShowSlabEditor(s => !s)}>{showSlabEditor ? 'Hide Slab Editor' : 'Configure Slabs'}</Button>
            </div>

            {showSlabEditor && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                {SLABS.map(s => (
                  <div key={s}>
                    <Label>{s}</Label>
                    <Input value={fees[s] || ''} onChange={(e) => setFees(prev => ({ ...prev, [s]: e.target.value }))} placeholder="0.00" />
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="secondary" onClick={() => setEditingMerchant(null)}>Close</Button>
              <Button onClick={saveFees} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ForvoqCourierAdmin;
