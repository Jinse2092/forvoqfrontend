import React, { useState, useMemo } from 'react';
import { useInventory } from '@/context/inventory-context.jsx';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel
} from '@/components/ui/alert-dialog';

const AdminMerchants = () => {
  const { users, removeUser, currentUser } = useInventory();
  const [searchTerm, setSearchTerm] = useState('');

  const merchants = useMemo(() => users.filter(u => u.role === 'merchant'), [users]);

  const filteredMerchants = merchants.filter(m => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return true;
    return (m.companyName || '').toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q) || (m.id || '').toLowerCase().includes(q);
  });

  const handleRemove = (id) => {
    if (!confirm('Are you sure you want to remove this merchant?')) return;
    removeUser(id);
  };

  // Simple template renderer used for preview inside popup (supports {{ var }} and simple {% for %})
  function renderTemplate(tpl, data) {
    try {
      let out = String(tpl || '');

      // helper to get nested value by path 'a.b.c' from data context
      function getValue(ctx, path) {
        if (path == null) return '';
        const parts = String(path).split('.');
        let cur = ctx;
        for (let p of parts) {
          if (cur == null) return '';
          // allow numeric index access for arrays
          if (p.match(/^\d+$/)) p = parseInt(p, 10);
          cur = cur[p];
        }
        return cur == null ? '' : cur;
      }

      // process simple if / unless blocks: {% if <expr> %}...{% endif %}
      out = out.replace(/{%\s*(if|unless)\s+([^%]+)\s*%}([\s\S]*?){%\s*(?:endif|endunless)\s*%}/g, (m, type, expr, inner) => {
        // support expressions like "order.po_number != blank" or "shipping_address != blank"
        try {
          const parts = expr.trim().split(/\s+/);
          let left = parts[0];
          let op = parts[1] || '';
          let right = parts.slice(2).join(' ') || '';
          const leftVal = getValue(data, left);
          let cond = false;
          if (op === '!=' && right === 'blank') cond = String(leftVal).trim() !== '';
          else if ((op === '==' || op === '=') && right === 'blank') cond = String(leftVal).trim() === '';
          else if (!op) cond = !!leftVal;
          else cond = !!leftVal;
          if (type === 'unless') cond = !cond;
          return cond ? inner : '';
        } catch (e) {
          return inner;
        }
      });

      // process for-loops
      out = out.replace(/{%\s*for\s+(\w+)\s+in\s+([\w.]+)\s*%}([\s\S]*?){%\s*endfor\s*%}/g, (m, itemVar, listPath, inner) => {
        const list = getValue(data, listPath) || [];
        if (!Array.isArray(list)) return '';
        return list.map(item => inner.replace(/{{\s*([^}]+)\s*}}/g, (_, token) => {
          const t = token.trim();
          if (t.startsWith(itemVar + '.')) {
            const prop = t.slice(itemVar.length + 1);
            return getValue(item, prop) || '';
          }
          // support nested lookups like shipping_address.name
          return getValue(data, t) || '';
        })).join('\n');
      });

      // simple variable interpolation supporting nested paths
      out = out.replace(/{{\s*([^}]+)\s*}}/g, (m, expr) => {
        const key = expr.trim();
        return String(getValue(data, key) || '');
      });

      return out;
    } catch (e) {
      return tpl;
    }
  }

  function openMerchantPopup(merchant) {
    const key = `shipping_label_template_${merchant.id}`;
    // robust loader: try exact key, then scan for any shipping_label_template_* key, then fallback to generic key
    function loadSavedTemplate() {
      try {
        let val = localStorage.getItem(key);
        if (val && val.trim() !== '') return decodeStored(val);

        // check generic key
        val = localStorage.getItem('shipping_label_template');
        if (val && val.trim() !== '') return decodeStored(val);

        // scan all keys for shipping_label_template_ prefix
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (!k) continue;
          if (k.startsWith('shipping_label_template_')) {
            const candidate = localStorage.getItem(k);
            if (candidate && candidate.trim() !== '') return decodeStored(candidate);
          }
        }
        return '';
      } catch (e) {
        return '';
      }
    }

    function decodeStored(v) {
      // Try JSON parse if value looks JSON-encoded
      try {
        const trimmed = v.trim();
        if ((trimmed[0] === '"' && trimmed[trimmed.length-1] === '"') || trimmed[0] === '{' || trimmed[0] === '[') {
          const parsed = JSON.parse(trimmed);
          if (typeof parsed === 'string') v = parsed;
        }
      } catch (e) {
        // ignore, use raw
      }
      // unescape common encoded sequences
      try { v = v.replace(/\\u003c/g, '<'); } catch (e) {}
      return v;
    }

    const tpl = loadSavedTemplate();
    console.log('openMerchantPopup: initial tpl length=', (tpl || '').length, 'for key=', key);

    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { alert('Popup blocked. Allow popups for this site.'); return; }

    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Merchant: ${merchant.companyName}</title></head><body><div id="root"></div></body></html>`);
    w.document.close();

    const doc = w.document;
    const root = doc.getElementById('root');
    root.style.fontFamily = 'Arial, Helvetica, sans-serif';
    root.style.padding = '12px';

    const h2 = doc.createElement('h2');
    h2.textContent = `Merchant: ${merchant.companyName}`;
    root.appendChild(h2);

    const info = doc.createElement('p');
    info.innerHTML = `<strong>Email:</strong> ${merchant.email || '-'}<br/><strong>Phone:</strong> ${merchant.phoneNumber || '-'}<br/><strong>ID:</strong> ${merchant.id}`;
    root.appendChild(info);

    const h3 = doc.createElement('h3');
    h3.textContent = 'Shipping Label Template';
    root.appendChild(h3);

    const textarea = doc.createElement('textarea');
    textarea.style.width = '100%';
    textarea.style.height = '360px';
    textarea.style.fontFamily = 'monospace';
    textarea.style.fontSize = '13px';
    textarea.value = tpl || '';
    if (!textarea.value || textarea.value.trim() === '') {
      const hint = doc.createElement('p');
      hint.textContent = 'No template found for this merchant — use Save Template to create or load from localStorage.';
      hint.style.color = '#666';
      hint.style.fontStyle = 'italic';
      hint.id = 'no-template-hint';
      root.appendChild(hint);
    }
  console.log('openMerchantPopup: textarea initial length=', textarea.value.length, 'localStorage key present=', localStorage.getItem(key) ? true : false);
    root.appendChild(textarea);

    const controls = doc.createElement('div');
    controls.style.marginTop = '8px';
    root.appendChild(controls);

    const previewBtn = doc.createElement('button'); previewBtn.textContent = 'Preview'; controls.appendChild(previewBtn);
    const printBtn = doc.createElement('button'); printBtn.textContent = 'Preview & Print'; controls.appendChild(printBtn);
    const saveBtn = doc.createElement('button'); saveBtn.textContent = 'Save Template'; controls.appendChild(saveBtn);
    const closeBtn = doc.createElement('button'); closeBtn.textContent = 'Close'; controls.appendChild(closeBtn);

    // Attempt to load from server first (MongoDB). If not available, keep local tpl fallback.
    (async function tryLoadFromServer() {
      try {
        const res = await fetch(`https://api.forvoq.com/api/merchants/${merchant.id}/shipping-template`);
          if (res.ok) {
          const body = await res.json();
          console.log('MERCHANT TEMPLATE LOAD: res.ok=', res.ok, 'body=', body);
          if (body && body.template) textarea.value = body.template;
            // remove hint if present
            const existingHint = doc.getElementById('no-template-hint');
            if (existingHint) { existingHint.remove(); }
        }
      } catch (e) {
        // ignore and keep local value
      }
    })();

    previewBtn.onclick = () => {
      const v = textarea.value || '';
      const sample = { shop: { name: merchant.companyName || '' }, order: { name: 'SAMPLE_ORDER', created_at: new Date().toLocaleString() }, shipping_address: { name: 'John Doe', address1: '123 Main St', city_province_zip: 'City, State 12345', country: 'India', phone: '9999999999' }, items: [{ title: 'Sample Item', quantity: 1 }] };
      const rendered = renderTemplate(v, { 'shop.name': sample.shop.name, 'order.name': sample.order.name, shop: sample.shop, order: sample.order, shipping_address: sample.shipping_address, items: sample.items });
      const pw = window.open('', '_blank'); if (!pw) { alert('Popup blocked'); return; }
      pw.document.open(); pw.document.write(rendered); pw.document.close();
    };

    printBtn.onclick = () => {
      const v = textarea.value || '';
      const sample = { shop: { name: merchant.companyName || '' }, order: { name: 'SAMPLE_ORDER', created_at: new Date().toLocaleString() }, shipping_address: { name: 'John Doe', address1: '123 Main St', city_province_zip: 'City, State 12345', country: 'India', phone: '9999999999' }, items: [{ title: 'Sample Item', quantity: 1 }] };
      const rendered = renderTemplate(v, { 'shop.name': sample.shop.name, 'order.name': sample.order.name, shop: sample.shop, order: sample.order, shipping_address: sample.shipping_address, items: sample.items });
      const pw = window.open('', '_blank'); if (!pw) { alert('Popup blocked'); return; }
      pw.document.open(); pw.document.write(rendered); pw.document.close();
      setTimeout(() => { try { pw.focus(); pw.print(); } catch (e) { console.error(e); } }, 600);
    };

      saveBtn.onclick = async () => {
      const v = textarea.value || '';
      // try saving to backend (MongoDB)
      try {
        const res = await fetch(`https://api.forvoq.com/api/merchants/${merchant.id}/shipping-template`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: v })
        });
        console.log('save template response status =', res.status);
        if (res.ok) {
          alert('Template saved to server');
          return;
        }
      } catch (e) {
        console.warn('Server save failed', e);
      }
      // fallback to localStorage
      try { localStorage.setItem(key, v); alert('Template saved locally'); } catch (e) { alert('Save failed: ' + e); }
    };

    closeBtn.onclick = () => { w.close(); };
  }

  return (
    <div>
      <Card>
        <CardHeader>
          <CardTitle>Merchants</CardTitle>
          <CardDescription>Manage merchant accounts and edit shipping label templates.</CardDescription>
          <div style={{ marginTop: 8 }}>
            <Input placeholder="Search by name, email, or ID..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="max-w-sm" />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone Number</TableHead>
                <TableHead>Merchant ID</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMerchants.map((merchant) => (
                <TableRow key={merchant.id}>
                  <TableCell className="font-medium">
                    <button className="text-left text-blue-600 hover:underline" onClick={() => openMerchantPopup(merchant)}>{merchant.companyName}</button>
                  </TableCell>
                  <TableCell>{merchant.email}</TableCell>
                  <TableCell>{merchant.phoneNumber || '-'}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{merchant.id}</TableCell>
                  <TableCell className="text-right">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="destructive" size="sm" disabled={merchant.id === currentUser?.id}>
                          <Trash2 className="h-4 w-4 mr-1" /> Kick Out
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action cannot be undone. This will permanently remove the merchant account
                            <span className="font-semibold"> {merchant.companyName}</span> and potentially their associated data.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleRemove(merchant.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                            Yes, Kick Out Merchant
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filteredMerchants.length === 0 && (
            <p className="text-center text-muted-foreground py-4">No merchants found matching your search.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminMerchants;
