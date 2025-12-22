import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/theme-provider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { useInventory } from '../context/inventory-context.jsx';
import BackupRestore from '@/components/admin/BackupRestore.jsx';

const Settings = () => {
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const { currentUser } = useInventory();
  const [otpInProgress, setOtpInProgress] = useState(false);
  const [otpUserId, setOtpUserId] = useState(null);

  const templateStorageKey = currentUser ? `shipping_label_template_${currentUser.id}` : 'shipping_label_template_default';
  // If admin navigated here with ?merchantId=xxx, use that merchant's key instead
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams('');
  const merchantQueryId = searchParams.get('merchantId');
  const activeTemplateKey = merchantQueryId ? `shipping_label_template_${merchantQueryId}` : templateStorageKey;
  const sampleTemplate = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Packing Slip – {{ order.name }}</title><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:Arial,Helvetica,sans-serif}</style></head><body><div><h2>{{ shop.name }}</h2><p>Order {{ order.name }}</p><p>{{ order.created_at }}</p><div><strong>Ship To</strong><p>{{ shipping_address.name }}<br>{{ shipping_address.address1 }}<br>{{ shipping_address.city_province_zip }}<br>{{ shipping_address.country }}<br>{{ shipping_address.phone }}</p></div>{% for li in items %}<div>{{ li.title }} × {{ li.quantity }}</div>{% endfor %}</div></body></html>`;

  const [labelTemplate, setLabelTemplate] = useState('');

  useEffect(() => {
    let isMounted = true;
    // Try loading from server (MongoDB) first, then fallback to localStorage
    (async () => {
      try {
        const id = merchantQueryId || (currentUser && currentUser.id);
        if (id) {
          const res = await fetch(`https://api.forvoq.com/api/merchants/${id}/shipping-template`);
          if (res.ok) {
            const body = await res.json();
            if (isMounted) setLabelTemplate(body.template || '');
            return;
          }
        }
      } catch (e) {
        // ignore and fallback
      }
      try { if (isMounted) setLabelTemplate(localStorage.getItem(activeTemplateKey) || ''); } catch (e) { if (isMounted) setLabelTemplate(''); }
    })();
    return () => { isMounted = false; };
  }, [activeTemplateKey]);

  const saveLabelTemplate = () => {
    (async () => {
      try {
        const id = merchantQueryId || (currentUser && currentUser.id);
        if (id) {
          const res = await fetch(`https://api.forvoq.com/api/merchants/${id}/shipping-template`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: labelTemplate })
          });
          if (res.ok) {
            toast({ title: 'Template Saved', description: merchantQueryId ? `Shipping label template saved for merchant ${merchantQueryId}.` : 'Shipping label template saved for your account.' });
            return;
          }
        }
      } catch (e) { console.warn('Server save failed', e); }
      // fallback to localStorage
      try { localStorage.setItem(activeTemplateKey, labelTemplate); toast({ title: 'Template Saved', description: 'Saved to localStorage (fallback).' }); } catch (e) { console.error('Failed to save template', e); toast({ title: 'Save Failed', description: 'Could not save template.' , variant: 'destructive'}); }
    })();
  };

  const renderTemplate = (tpl, data) => {
    const src = String(tpl || '');
    const local = {};

    const resolvePath = (path) => {
      if (!path) return undefined;
      const parts = path.trim().split('.');
      if (parts[0] && Object.prototype.hasOwnProperty.call(local, parts[0])) {
        let v = local[parts[0]];
        for (let i = 1; i < parts.length; i++) { if (v == null) return undefined; v = v[parts[i]]; }
        return v;
      }
      let cur = data;
      for (const p of parts) { if (cur == null) return undefined; cur = cur[p]; }
      return cur;
    };

    let out = src
      // assign: {% assign items = fulfillment.line_items | default: line_items | default: order.line_items %}
      .replace(/{%\s*assign\s+(\w+)\s*=\s*([^%]+?)\s*%}/g, (m, name, expr) => {
        try {
          const parts = expr.split(/\|\s*default\s*:\s*/).map(s => s.trim()).filter(Boolean);
          for (const p of parts) {
            const lit = p.match(/^['"](.*)['"]$/);
            if (lit) { local[name] = lit[1]; break; }
            const val = resolvePath(p);
            if (val !== undefined && val !== null && !(Array.isArray(val) && val.length === 0) && !(typeof val === 'string' && String(val).trim() === '')) { local[name] = val; break; }
          }
        } catch (e) { local[name] = null; }
        return '';
      });

    // provide items fallback
    if (!Object.prototype.hasOwnProperty.call(local, 'items')) {
      const fallback = resolvePath('fulfillment.line_items') || resolvePath('line_items') || resolvePath('order.line_items') || resolvePath('items') || resolvePath('order.items');
      if (fallback !== undefined) local.items = fallback;
    }
    if (Array.isArray(local.items)) local.total_quantity = local.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);

    // Iteratively resolve for-loops (handles nested loops)
    const forRegex = /{%\s*for\s+(\w+)\s+in\s+([\w.]+)\s*%}([\s\S]*?){%\s*endfor\s*%}/g;
    let prevOut;
    do {
      prevOut = out;
      out = out.replace(forRegex, (m, itemVar, listPath, inner) => {
        try {
          const list = (Object.prototype.hasOwnProperty.call(local, listPath) ? local[listPath] : resolvePath(listPath)) || [];
          if (!Array.isArray(list)) return '';
          return list.map(it => inner.replace(/{{\s*([^}]+)\s*}}/g, (m2, token) => {
            const t = token.trim();
            if (t.startsWith(itemVar + '.')) { const prop = t.slice(itemVar.length + 1); return (it && it[prop] != null) ? String(it[prop]) : ''; }
            const val = resolvePath(t); return val == null ? '' : String(val);
          })).join('\n');
        } catch (e) { console.error('for loop error', e); return ''; }
      });
    } while (out !== prevOut);

    // Iteratively resolve unless blocks
    const unlessRegex = /{%\s*unless\s+([^%]+?)\s*%}([\s\S]*?){%\s*endunless\s*%}/g;
    do {
      prevOut = out;
      out = out.replace(unlessRegex, (m, cond, inner) => {
        try {
          const truth = (cond || '').trim();
          const isTrue = (() => {
            const notBlank = truth.match(/^([\w.]+)\s*!=\s*blank$/);
            if (notBlank) { const v = resolvePath(notBlank[1]); return !(v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)); }
            return Boolean(resolvePath(truth));
          })();
          return !isTrue ? inner : '';
        } catch (e) { console.error('unless error', e); return ''; }
      });
    } while (out !== prevOut);

    // Iteratively resolve if blocks (handles nested ifs)
    const ifRegex = /{%\s*if\s+([^%]+?)\s*%}([\s\S]*?)(?:{%\s*else\s*%}([\s\S]*?))?{%\s*endif\s*%}/g;
    do {
      prevOut = out;
      out = out.replace(ifRegex, (m, cond, a, b) => {
        try {
          const evalCond = (c) => {
            c = (c || '').trim();
            const notBlank = c.match(/^([\w.]+)\s*!=\s*blank$/);
            if (notBlank) { const v = resolvePath(notBlank[1]); return !(v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)); }
            const eqBlank = c.match(/^([\w.]+)\s*==\s*blank$/);
            if (eqBlank) { const v = resolvePath(eqBlank[1]); return (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)); }
            const neg = c.match(/^\s*not\s+([\w.]+)\s*$/i);
            if (neg) return !Boolean(resolvePath(neg[1]));
            return Boolean(resolvePath(c));
          };
          return evalCond(cond) ? (a || '') : (b || '');
        } catch (e) { console.error('if error', e); return ''; }
      });
    } while (out !== prevOut);

    // final token replacement with basic | date filter
    out = out.replace(/{{\s*([^}]+)\s*}}/g, (m, expr) => {
      try {
        const parts = expr.split('|').map(p => p.trim()).filter(Boolean);
        const key = parts[0];
        let val = Object.prototype.hasOwnProperty.call(local, key) ? local[key] : resolvePath(key);
        for (let i = 1; i < parts.length; i++) {
          const f = parts[i];
          if (/^date\b/.test(f)) { if (!val) continue; const d = new Date(val); if (!isNaN(d.getTime())) val = d.toLocaleDateString(); else val = String(val); }
        }
        return val == null ? '' : String(val);
      } catch (e) { console.error('token replace error', e); return ''; }
    });

    return out;
  };

  const openPreviewWindow = (renderedHtml, autoPrint = false) => {
    // Try to open a new window/tab for preview
    const w = window.open('', '_blank');
    if (!w) {
      toast({ title: 'Popup Blocked', description: 'Please allow popups for preview.' });
      return;
    }

    // Make sure we write a full HTML document. If the template already contains <html> or <!doctype>, use as-is.
    let docHtml = (renderedHtml || '').trim();
    const hasDoc = /^\s*<!doctype/i.test(docHtml) || /^\s*<html/i.test(docHtml);
    if (!hasDoc) {
      docHtml = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Label Preview</title></head><body>${docHtml}</body></html>`;
    }

    try {
      w.document.open();
      w.document.write(docHtml);
      w.document.close();
    } catch (err) {
      console.error('Failed to write preview window document', err);
      toast({ title: 'Preview Failed', description: 'Could not render preview. Check console for details.', variant: 'destructive' });
      try { w.close(); } catch (e) {}
      return;
    }

    if (autoPrint) {
      // Wait briefly for the content to render before triggering print
      setTimeout(() => {
        try {
          w.focus();
          w.print();
        } catch (e) {
          console.error('Auto print failed', e);
          toast({ title: 'Print Failed', description: 'Could not start printing from preview.', variant: 'destructive' });
        }
      }, 600);
    }
  };

  const handlePreviewSample = (autoPrint = false) => {
    const sampleData = {
      shop: { name: currentUser?.companyName || 'My Shop' },
      order: { name: 'SAMPLE123', created_at: new Date().toLocaleString() },
      shipping_address: { name: 'John Doe', address1: '123 Main St', city_province_zip: 'City, State 12345', country: 'Country', phone: '9999999999' },
      items: [ { title: 'Sample Item A', quantity: 2 }, { title: 'Sample Item B', quantity: 1 } ],
      deliveryPartner: 'Express Courier'
    };
    const rendered = renderTemplate(labelTemplate, sampleData);
    openPreviewWindow(rendered, autoPrint);
  };

  const handleClearData = () => {
    // Merchant users must verify via OTP before clearing their merchant data
    if (currentUser && currentUser.role === 'merchant') {
      if (!window.confirm('Clearing data will remove only your merchant data from this browser. An OTP will be sent to your registered email. Proceed?')) return;
      setOtpInProgress(true);
      // Request OTP from backend
      fetch('https://api.forvoq.com/api/forgot-password/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId: currentUser.id, email: currentUser.email }),
      })
        .then(res => res.json())
        .then(data => {
          if (data && (data.userId || data.email)) {
            const userId = data.userId || currentUser.id || data.email;
            setOtpUserId(userId);
            const otp = window.prompt('An OTP was sent to your registered email. Enter OTP to confirm clearing your merchant data:');
            if (!otp) {
              setOtpInProgress(false);
              toast({ title: 'Cancelled', description: 'OTP verification cancelled.' });
              return;
            }
            // Verify OTP
            fetch('https://api.forvoq.com/api/forgot-password/verify-otp', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId, otp }),
            })
              .then(vres => vres.json())
              .then(vdata => {
                setOtpInProgress(false);
                if (vdata && vdata.message === 'OTP verified') {
                  // Remove merchant-owned keys from localStorage
                  for (let i = localStorage.length - 1; i >= 0; i--) {
                    const key = localStorage.key(i);
                    try {
                      const val = JSON.parse(localStorage.getItem(key));
                      if (Array.isArray(val)) {
                        // Filter arrays by merchantId or product.merchantId
                        const filtered = val.filter(item => {
                          if (!item) return false;
                          if (item.merchantId) return item.merchantId !== currentUser.id;
                          if (item.product && item.product.merchantId) return item.product.merchantId !== currentUser.id;
                          // Keep items that don't belong to merchant
                          return true;
                        });
                        localStorage.setItem(key, JSON.stringify(filtered));
                      } else if (val && typeof val === 'object') {
                        // If object has merchantId at root, remove it
                        if (val.merchantId && val.merchantId === currentUser.id) {
                          localStorage.removeItem(key);
                        }
                      }
                    } catch (e) {
                      // non-json key - skip
                    }
                  }
                  toast({ title: 'Data Cleared', description: 'Your merchant data has been removed from local storage.', variant: 'destructive' });
                  window.location.reload();
                } else {
                  toast({ title: 'OTP Verification Failed', description: vdata.error || 'Invalid OTP', variant: 'destructive' });
                }
              })
              .catch(err => {
                setOtpInProgress(false);
                console.error('OTP verify error', err);
                toast({ title: 'Error', description: 'Failed to verify OTP.', variant: 'destructive' });
              });
          } else {
            setOtpInProgress(false);
            toast({ title: 'Error', description: 'Failed to request OTP. Check server logs.', variant: 'destructive' });
          }
        })
        .catch(err => {
          setOtpInProgress(false);
          console.error('OTP request error', err);
          toast({ title: 'Error', description: 'Failed to request OTP.', variant: 'destructive' });
        });
      return;
    }

    // Non-merchant or admin actions: clear all local storage
    if (window.confirm('Are you sure you want to clear all local data? This action cannot be undone.')) {
      localStorage.clear();
      toast({ title: 'Data Cleared', description: 'All local application data has been removed.', variant: 'destructive' });
      window.location.reload();
    }
  };

  const handleExportData = () => {
     try {
       const dataToExport = {};
       for (let i = 0; i < localStorage.length; i++) {
         const key = localStorage.key(i);
         if (key === 'theme') continue;
         try {
           const parsed = JSON.parse(localStorage.getItem(key));
           // If merchant, only include items owned by this merchant
           if (currentUser && currentUser.role === 'merchant' && Array.isArray(parsed)) {
             dataToExport[key] = parsed.filter(item => {
               if (!item) return false;
               if (item.merchantId) return item.merchantId === currentUser.id;
               if (item.product && item.product.merchantId) return item.product.merchantId === currentUser.id;
               // fallback: include if object references merchantId anywhere
               if (typeof item === 'object') {
                 return Object.values(item).some(v => v === currentUser.id);
               }
               return false;
             });
           } else {
             dataToExport[key] = parsed;
           }
         } catch (e) {
           // non-JSON value
           if (!currentUser || currentUser.role !== 'merchant') dataToExport[key] = localStorage.getItem(key);
         }
       }
       const jsonString = JSON.stringify(dataToExport, null, 2);
       const blob = new Blob([jsonString], { type: 'application/json' });
       const link = document.createElement('a');
       link.href = URL.createObjectURL(blob);
       link.download = `inventory_data_backup_${new Date().toISOString().split('T')[0]}.json`;
       document.body.appendChild(link);
       link.click();
       document.body.removeChild(link);
       toast({ title: 'Data Exported', description: 'Your inventory data has been exported successfully.' });
     } catch (error) {
       console.error('Failed to export data:', error);
       toast({ title: 'Export Failed', description: 'Could not export data. Check console for details.', variant: 'destructive' });
     }
  };

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize the look and feel of the application.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="dark-mode" className="flex flex-col space-y-1">
              <span>Dark Mode</span>
              <span className="font-normal leading-snug text-muted-foreground">
                Enable dark theme for the application.
              </span>
            </Label>
            <Switch
              id="dark-mode"
              checked={theme === 'dark'}
              onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data Management</CardTitle>
           <CardDescription>Manage your application data stored locally.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <div className="flex items-center justify-between">
             <Label className="flex flex-col space-y-1">
               <span>Export Data</span>
               <span className="font-normal leading-snug text-muted-foreground">
                 Download all your inventory data as a JSON file.
               </span>
             </Label>
             <Button variant="outline" onClick={handleExportData}>Export Data</Button>
           </div>
           <div className="flex items-center justify-between">
             <Label className="flex flex-col space-y-1 text-destructive">
               <span>Clear Local Data</span>
               <span className="font-normal leading-snug text-muted-foreground">
                 Permanently delete all products, inventory, and transactions stored in your browser.
               </span>
             </Label>
             <Button variant="destructive" onClick={handleClearData}>Clear All Data</Button>
           </div>
        </CardContent>
      </Card>

      {currentUser && currentUser.role === 'superadmin' ? (
        <Card>
          <CardHeader>
            <CardTitle>Admin Backups</CardTitle>
            <CardDescription>Super admin: create backups and restore data (Google Drive upload supported).</CardDescription>
          </CardHeader>
          <CardContent>
            <BackupRestore currentUser={currentUser} />
          </CardContent>
        </Card>
      ) : null}

       <Card>
        <CardHeader>
          <CardTitle>Future Enhancements</CardTitle>
           <CardDescription>Consider these options for a production-ready application.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
           <div className="flex items-center justify-between">
             <Label className="flex flex-col space-y-1">
               <span>Cloud Storage (Recommended)</span>
               <span className="font-normal leading-snug text-muted-foreground">
                 Migrate data from local storage to a secure cloud database like Supabase for reliability and multi-user access.
               </span>
             </Label>
             <Button variant="secondary" disabled>Migrate to Supabase (Coming Soon)</Button>
           </div>
           <div className="flex items-center justify-between">
             <Label className="flex flex-col space-y-1">
               <span>User Authentication</span>
               <span className="font-normal leading-snug text-muted-foreground">
                 Implement user accounts to secure access and manage permissions.
               </span>
             </Label>
             <Button variant="secondary" disabled>Setup Authentication</Button>
           </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shipping Label Customization</CardTitle>
          <CardDescription>
            Provide an HTML/CSS template for your shipping label. Available variables: <code>{"{{ shop.name }}"}</code>, <code>{"{{ order.name }}"}</code>, <code>{"{{ deliveryPartner }}"}</code>, shipping_address fields and a simple items loop: <code>{"{% for li in items % ... % endfor %"}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {merchantQueryId ? (
            <div className="p-2 rounded bg-gray-50">
              <div className="font-medium">Editing template for merchant: {merchantQueryId}</div>
              <div className="text-sm text-muted-foreground">Changes here will save to <code>{activeTemplateKey}</code></div>
            </div>
          ) : null}

          <Label>Template (HTML/CSS)</Label>
          { !labelTemplate && (
            <div className="p-2 rounded bg-yellow-50 text-sm text-yellow-800">No template found — enter HTML/CSS here or use the sample template to get started.</div>
          )}
          <textarea value={labelTemplate} onChange={e => setLabelTemplate(e.target.value)} className="w-full h-64 p-2 border rounded font-mono text-sm" />
          <div className="flex gap-2">
            <Button onClick={() => handlePreviewSample(false)}>Preview</Button>
            <Button onClick={() => handlePreviewSample(true)}>Preview & Print</Button>
            <Button variant="outline" onClick={saveLabelTemplate}>Save Template</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Settings;
