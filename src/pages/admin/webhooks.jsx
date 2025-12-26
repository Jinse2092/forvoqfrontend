import React, { useEffect, useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from '@/components/ui/table';
import { useInventory } from '../../context/inventory-context.jsx';
import { Edit, Trash2 } from 'lucide-react';

const Webhooks = () => {
  const { currentUser, users } = useInventory();
  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
  const [webhooks, setWebhooks] = useState([]);
  const [loading, setLoading] = useState(false);

  // resilient fetch: try relative path first, then fallback to backend host
  const apiFetch = async (path, opts) => {
    // If path is absolute URL, use it directly
    try {
      const isAbsolute = /^https?:\/\//i.test(path);
      if (isAbsolute) return await fetch(path, opts);
      // try relative path first
      try {
        const r = await fetch(path, opts);
        if (r && r.ok) return r;
        // if non-ok (404/500) fall through to try backend host
      } catch (e) {
        // ignore and try fallback
      }
      const base = 'https://api.forvoq.com';
      return await fetch(base + path, opts);
    } catch (err) {
      throw err;
    }
  };

  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      try {
        // Determine endpoint based on role: merchants see their webhooks, admins see all
        const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';
        const merchantId = currentUser?.id;
        const url = isAdmin ? '/api/webhooks' : (merchantId ? `/api/merchants/${merchantId}/webhooks` : '/api/webhooks');
        console.log('Fetching webhooks from', url);
        const res = await apiFetch(url);
        console.log('Fetch response status', res && res.status);
        if (!isMounted) return;
        if (res.ok) {
          const body = await res.json();
          const list = Array.isArray(body) ? body : body.webhooks || [];
          setWebhooks(list);
        } else {
          setWebhooks([]);
        }
      } catch (e) {
        console.error('Failed to load webhooks', e);
        setWebhooks([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, [currentUser]);

  // If the user is not an admin, do not render the admin UI
  if (!currentUser) {
    return <div className="p-6">Please log in to view webhooks.</div>;
  }
  if (!isAdmin) {
    return <div className="p-6">Access denied — admin users only.</div>;
  }

  // Modal/form state for creating a webhook
  const [createOpen, setCreateOpen] = useState(false);
  const [address, setAddress] = useState('');
  const [format, setFormat] = useState('json');
  const [shopifyDomain, setShopifyDomain] = useState('');
  const [signature, setSignature] = useState('');
  const [merchantId, setMerchantId] = useState(currentUser?.id || '');
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);

  const resetForm = () => {
    setAddress(''); setFormat('json'); setShopifyDomain(''); setSignature('');
    setMerchantId(currentUser?.id || '');
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e && e.preventDefault();
    // topic is fixed to 'orders/create'; address is optional in this UI
    setCreating(true);
    try {
      const mId = merchantId || currentUser?.id;
      const payload = { topic: 'orders/create', address, format, shopifyDomain, signature, merchantId: mId };
        if (editingId) {
        // update existing; admins call global endpoint, merchants call merchant-scoped
        const url = isAdmin ? `/api/webhooks/${editingId}` : (mId ? `/api/merchants/${mId}/webhooks/${editingId}` : `/api/webhooks/${editingId}`);
        console.log('PATCH', url, payload);
        const res = await apiFetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        console.log('PATCH response', res && res.status);
        if (res.ok) {
          const updated = await res.json();
          setWebhooks((s) => s.map(w => (String(w.id) === String(editingId) ? updated : w)));
          setCreateOpen(false);
          resetForm();
        } else {
          const text = await res.text();
          alert('Failed to update webhook: ' + text);
        }
      } else {
        const url = isAdmin ? '/api/webhooks' : (mId ? `/api/merchants/${mId}/webhooks` : '/api/webhooks');
        console.log('POST', url, payload);
        const res = await apiFetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        console.log('POST response', res && res.status);
        if (res.ok) {
          const created = await res.json();
          setWebhooks((s) => [created, ...s]);
          setCreateOpen(false);
          resetForm();
        } else {
          const text = await res.text();
          alert('Failed to create webhook: ' + text);
        }
      }
    } catch (err) {
      console.error('Error creating/updating webhook', err);
      alert('Error creating/updating webhook');
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = (w) => {
    setEditingId(w.id || w._id);
    setShopifyDomain(w.shopifyDomain || '');
    setSignature(w.signature || '');
    setMerchantId(w.merchantId || currentUser?.id || '');
    setCreateOpen(true);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this webhook?')) return;
    try {
      const merchantId = currentUser?.id;
      const url = isAdmin ? `/api/webhooks/${id}` : (merchantId ? `/api/merchants/${merchantId}/webhooks/${id}` : `/api/webhooks/${id}`);
      console.log('DELETE', url);
      const res = await apiFetch(url, { method: 'DELETE' });
      console.log('DELETE response', res && res.status);
      if (res.ok) setWebhooks((s) => s.filter(w => String(w.id) !== String(id)));
      else alert('Failed to delete webhook');
    } catch (e) {
      console.error(e);
      alert('Error deleting webhook');
    }
  };

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <h1 className="text-3xl font-bold">Webhooks</h1>

      <Card>
        <CardHeader>
          <CardTitle>Shopify Webhooks</CardTitle>
          <CardDescription>Manage your Shopify webhook registrations and endpoints.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-muted-foreground">Register, view and remove webhooks for your shop.</div>
            <div className="flex gap-2">
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <Button>Create Webhook</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Webhook</DialogTitle>
                    <DialogDescription>Provide webhook details and save to database.</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                      <Label>Shopify Internal Domain</Label>
                      <Input value={shopifyDomain} onChange={(e) => setShopifyDomain(e.target.value)} placeholder="your-shop.myshopify.com" />
                    </div>
                    <div>
                      <Label>Webhook Signature</Label>
                      <Input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="signature" />
                    </div>
                    <div>
                      <Label>Merchant</Label>
                      {currentUser?.role === 'merchant' ? (
                        <div className="px-3 py-2 border rounded-md">{currentUser.companyName || currentUser.email || currentUser.id}</div>
                      ) : (
                        <Select value={merchantId} onValueChange={(v) => setMerchantId(v)}>
                          <SelectTrigger>
                            <SelectValue>{merchantId ? (users.find(u=>u.id===merchantId)?.companyName || merchantId) : 'Select merchant'}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {users && users.filter(u => u.role === 'merchant').map(u => (
                              <SelectItem key={u.id} value={u.id}>{u.companyName || u.email || u.id}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="secondary" type="button" onClick={() => { setCreateOpen(false); resetForm(); }}>Cancel</Button>
                      <Button type="submit" disabled={creating}>{creating ? 'Creating…' : 'Create'}</Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Merchant</TableHead>
                <TableHead>Domain</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6}>Loading…</TableCell>
                </TableRow>
              )}
              {!loading && webhooks.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6}>No webhooks registered.</TableCell>
                </TableRow>
              )}
              {webhooks.map((w) => (
                <TableRow key={w.id || w._id || `${w.id}-${w.shopifyDomain || ''}`}>
                  <TableCell>{w.id || w._id || '—'}</TableCell>
                  <TableCell>{users.find(u => u.id === w.merchantId)?.companyName || w.merchantId || '—'}</TableCell>
                  <TableCell className="truncate max-w-xs">{w.shopifyDomain || '—'}</TableCell>
                  <TableCell>{w.active ? 'active' : 'inactive'}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="icon" title="Edit" onClick={() => handleEdit(w)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDelete(w.id || w._id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableCaption>Webhooks are registered on Shopify and forwarded to your merchant endpoint.</TableCaption>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Webhooks;
