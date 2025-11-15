import React, { useState } from 'react';
import { useInventory } from '../../context/inventory-context.jsx';
import { Button } from '../../components/ui/button.jsx';
import { useToast } from '../../components/ui/use-toast.js';
import jsPDF from 'jspdf';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '../../components/ui/dialog.jsx';
import { Input } from '../../components/ui/input.jsx';
import { Label } from '../../components/ui/label.jsx';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../../components/ui/select.jsx';
import { Card, CardContent, CardHeader } from '../../components/ui/card.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table.jsx';
import { AnimatePresence, motion } from 'framer-motion';
import { generateShippingLabelPDF } from '../../lib/pdfGenerator.js';
import { calculateVolumetricWeight, calculateDispatchFee } from '../../lib/utils.js';
import { StatusTimelineDropdown } from '../../components/StatusTimelineDropdown.jsx';

const AdminOrders = () => {
  const { orders, markOrderPacked, dispatchOrder, products, updateOrder, addOrder, removeOrder, inventory, currentUser, users } = useInventory();
  const { toast } = useToast();

  // Helper: render basic template with support for {{ }} and {% for %} loops
  const renderTemplate = (tpl, data = {}) => {
    const src = String(tpl || '');

    const resolvePath = (path, ctx = data) => {
      if (!path) return undefined;
      const parts = path.trim().split('.');
      let cur = ctx;
      for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
      }
      return cur;
    };

    // process for-loops: {% for item in items %}...{% endfor %}
    const forRegex = /{%\s*for\s+(\w+)\s+in\s+([\w.]+)\s*%}([\s\S]*?){%\s*endfor\s*%}/g;
    let out = src;
    let prev;
    do {
      prev = out;
      out = out.replace(forRegex, (m, itemVar, listPath, inner) => {
        const list = resolvePath(listPath) || [];
        if (!Array.isArray(list)) return '';
        return list.map(it => {
          // replace {{ item.prop }} inside inner
          return inner.replace(/{{\s*([^}]+)\s*}}/g, (_, token) => {
            const t = token.trim();
            if (t.startsWith(itemVar + '.')) {
              const prop = t.slice(itemVar.length + 1);
              return (it && it[prop] != null) ? String(it[prop]) : '';
            }
            const val = resolvePath(t, { [itemVar]: it, ...data });
            return val == null ? '' : String(val);
          });
        }).join('\n');
      });
    } while (out !== prev);

    // final variable replacement
    out = out.replace(/{{\s*([^}]+)\s*}}/g, (_, expr) => {
      try {
        const key = expr.trim();
        const val = resolvePath(key);
        if (val === undefined || val === null) return '';
        return String(val);
      } catch (e) { return ''; }
    });

    return out;
  };

  const openPreviewWindow = (renderedHtml, autoPrint = false) => {
    const w = window.open('', '_blank');
    if (!w) {
      toast({ title: 'Popup Blocked', description: 'Please allow popups for preview.' });
      return;
    }
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
      setTimeout(() => {
        try { w.focus(); w.print(); } catch (e) { console.error('Auto print failed', e); }
      }, 600);
    }
  };

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedOrderIds, setExpandedOrderIds] = useState(new Set());

  // New state for Add Order manual entry dialog
  const [isAddOrderOpen, setIsAddOrderOpen] = useState(false);
  const [addOrderTab, setAddOrderTab] = useState('manual'); // 'manual' or 'upload'
  const [selectedMerchantId, setSelectedMerchantId] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newCity, setNewCity] = useState('');
  const [newState, setNewState] = useState('');
  const [newPincode, setNewPincode] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newDeliveryPartner, setNewDeliveryPartner] = useState('');
  const [newItems, setNewItems] = useState([{ productId: '', quantity: 1 }]);
  const [newItemCount, setNewItemCount] = useState(1);
  const [isEditingOrder, setIsEditingOrder] = useState(false);
  const [editOrderId, setEditOrderId] = useState(null);
  const [newStatus, setNewStatus] = useState('pending');
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [uploadFile, setUploadFile] = useState(null);
  const [isWeightDialogOpen, setIsWeightDialogOpen] = useState(false);
  const [ordersForWeightUpdate, setOrdersForWeightUpdate] = useState([]);
  const [weights, setWeights] = useState({});

  // Filters
  const [statusFilter, setStatusFilter] = useState('all'); // all, pending, packed, dispatched, delivered, return
  const [dateRangeFilter, setDateRangeFilter] = useState('all'); // all, today, yesterday, last7, last30, custom
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'superadmin')) {
    return (
      <div className="p-4">
        <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
        <p>You must be an admin to view this page.</p>
      </div>
    );
  }

  const parseDateSafe = (val) => {
    if (!val) return null;
    try {
      const d = new Date(val);
      if (isNaN(d.getTime())) return null;
      return d;
    } catch (e) { return null; }
  };

  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const filteredOrders = (orders || []).filter(order => {
    // status filter
    if (statusFilter && statusFilter !== 'all' && order.status !== statusFilter) return false;

    // always exclude return orders from admin view
    if (order.status === 'return') return false;

    // date range filter
    const od = parseDateSafe(order.date) || parseDateSafe(order.createdAt) || null;
    if (dateRangeFilter && dateRangeFilter !== 'all') {
      const today = startOfDay(new Date());
      if (dateRangeFilter === 'today') {
        if (!od || startOfDay(od).getTime() !== today.getTime()) return false;
      } else if (dateRangeFilter === 'yesterday') {
        const y = new Date(today); y.setDate(y.getDate() - 1);
        if (!od || startOfDay(od).getTime() !== y.getTime()) return false;
      } else if (dateRangeFilter === 'last7') {
        const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 6);
        if (!od || startOfDay(od) < cutoff) return false;
      } else if (dateRangeFilter === 'last30') {
        const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() - 29);
        if (!od || startOfDay(od) < cutoff) return false;
      } else if (dateRangeFilter === 'custom') {
        if (customStart) {
          const cs = parseDateSafe(customStart + 'T00:00:00');
          if (!od || od < cs) return false;
        }
        if (customEnd) {
          const ce = parseDateSafe(customEnd + 'T23:59:59');
          if (!od || od > ce) return false;
        }
      }
    }

    // search filter
    const q = (searchTerm || '').trim().toLowerCase();
    if (!q) return true;
    const prodNames = (order.items || []).map(i => (i.name || '')).join(' ').toLowerCase();
    if ((order.id || '').toLowerCase().includes(q)) return true;
    if ((order.merchantId || '').toLowerCase().includes(q)) return true;
    if ((order.customerName || '').toLowerCase().includes(q)) return true;
    if (prodNames.includes(q)) return true;
    return false;
  }).sort((a, b) => {
    const da = parseDateSafe(a.date) || parseDateSafe(a.createdAt) || new Date(0);
    const db = parseDateSafe(b.date) || parseDateSafe(b.createdAt) || new Date(0);
    return db.getTime() - da.getTime();
  });

  const toggleExpandOrder = (orderId) => {
    setExpandedOrderIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const handleMarkPacked = (orderId) => {
    markOrderPacked(orderId);
  };

  const handleMarkPickedUp = (orderId) => {
    dispatchOrder(orderId);
  };

  const downloadShippingLabel = async (order) => {
    if (order.shippingLabelFile) {
      const url = URL.createObjectURL(order.shippingLabelFile);
      const link = document.createElement('a');
      link.href = url;
      link.download = order.shippingLabelFile.name || 'shipping-label';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else if (order.shippingLabelBase64) {
      // Convert base64 to Blob and download
      const base64Data = order.shippingLabelBase64.split(',')[1];
      const contentType = order.shippingLabelBase64.split(',')[0].split(':')[1].split(';')[0];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'shipping-label.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      // Check if merchant has a saved HTML template in server (MongoDB)
      const merchant = users.find(u => u.id === order.merchantId) || { companyName: '', id: '' };
      const templateKey = `shipping_label_template_${merchant.id}`;
      let tpl = null;
      try {
        const res = await fetch(`https://forwokbackend-1.onrender.com/api/merchants/${merchant.id}/shipping-template`);
        if (res.ok) {
          const body = await res.json();
          tpl = body && body.template ? body.template : null;
        }
      } catch (e) {
        // ignore and fall back to localStorage
        console.warn('Failed to fetch server template', e);
      }

      // fallback: check localStorage
      if (!tpl) {
        try { tpl = localStorage.getItem(templateKey); } catch (e) { tpl = null; }
      }

      if (tpl) {
        // Prepare data for template
        const addressParts = (order.address || '').split(',').map(p => p.trim());
        const data = {
          shop: { name: merchant.companyName || merchant.name || 'Merchant' },
          order: { name: order.id, created_at: order.createdAt || order.date || '' },
          shipping_address: { name: order.customerName || '', address1: addressParts[0] || '', address2: (addressParts.slice(1).join(', ') || ''), city_province_zip: `${order.city || ''}, ${order.state || ''} ${order.pincode || ''}`, country: 'India', phone: order.phone || '' },
          items: (order.items || []).map(i => ({ title: i.name || i.title || 'Item', quantity: i.quantity || 0 })),
          deliveryPartner: order.deliveryPartner || ''
        };
        const rendered = renderTemplate(tpl, data);
        openPreviewWindow(rendered, false);
        return;
      }

      // Fallback: use PDF generator for the order
      const augmentedOrder = {
        ...order,
        city: order.city || '',
        state: order.state || '',
      };
      console.log('No merchant template found — generating default PDF for order:', augmentedOrder);
      generateShippingLabelPDF(augmentedOrder, { companyName: merchant.companyName, id: merchant.id });
    }
  };

const openMarkItemsDialog = (order) => {
  if (!order || !order.id) {
    alert('Invalid order selected. Cannot mark items.');
    return;
  }
  setSelectedOrder(order);
  if (order.items && order.items.length > 0) {
    setSelectedItems(order.items.map(item => ({ productId: item.productId, quantity: item.quantity || 1 })));
  } else {
    setSelectedItems([]);
  }
  setIsDialogOpen(true);
};

  const handleItemChange = (productId, quantity) => {
    setSelectedItems(prev => {
      const existing = prev.find(item => item.productId === productId);
      if (existing) {
        if (quantity <= 0) {
          return prev.filter(item => item.productId !== productId);
        } else {
          return prev.map(item => item.productId === productId ? { ...item, quantity } : item);
        }
      } else {
        if (quantity > 0) {
          return [...prev, { productId, quantity }];
        }
        return prev;
      }
    });
  };

  const handleSubmitMarkedItems = () => {
    if (!selectedOrder) {
      return;
    }
    if (selectedItems.length === 0) {
      toast({ title: 'Error', description: 'Please select at least one product with quantity.', variant: 'destructive' });
      return;
    }
    // Remove restriction to only one product
    // Validate unique productIds
    const productIds = selectedItems.map(item => item.productId);
    const uniqueProductIds = new Set(productIds);
    if (uniqueProductIds.size !== productIds.length) {
      toast({ title: 'Error', description: 'Duplicate products are not allowed.', variant: 'destructive' });
      return;
    }
    for (const item of selectedItems) {
      if (!item.productId) {
        toast({ title: 'Error', description: 'Please select a product for all rows.', variant: 'destructive' });
        return;
      }
      const inventoryQuantity = inventory.find(inv => inv.productId === item.productId && inv.merchantId === selectedOrder?.merchantId)?.quantity || 0;
      if (item.quantity > inventoryQuantity) {
        toast({ title: 'Error', description: `Quantity cannot exceed available inventory (${inventoryQuantity}).`, variant: 'destructive' });
        return;
      }
    }
    // Update the existing order with selected items
    const updatedItems = selectedItems.map(item => {
      const product = products.find(p => p.id === item.productId);
      return {
        productId: item.productId,
        name: product ? product.name : 'Unknown',
        quantity: item.quantity,
      };
    });
    updateOrder(selectedOrder.id, { items: updatedItems });
    toast({ title: 'Success', description: 'Order items updated successfully.' });
    setIsDialogOpen(false);
    setSelectedOrder(null);
    setSelectedItems([]);
  };

  // New handlers for Add Order manual entry form
  const handleNewItemChange = (index, field, value) => {
    setNewItems(prev => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: field === 'quantity' ? parseInt(value, 10) || 1 : value };
      return newItems;
    });
  };

  const handleAddNewItem = () => {
    setNewItems(prev => [...prev, { name: '', quantity: 1 }]);
    setNewItemCount(prev => prev + 1);
  };

  const handleRemoveNewItem = (index) => {
    setNewItems(prev => prev.filter((_, i) => i !== index));
    setNewItemCount(prev => Math.max(1, prev - 1));
  };

  const handleSubmitNewOrder = () => {
    const fileToBase64 = (file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
      });
    };

    if (addOrderTab === 'manual') {
      if (!selectedMerchantId) {
        toast({ title: 'Error', description: 'Please select a merchant.', variant: 'destructive' });
        return;
      }
      if (!newCustomerName.trim()) {
        toast({ title: 'Error', description: 'Customer Name is required.', variant: 'destructive' });
        return;
      }
      if (!newAddress.trim()) {
        toast({ title: 'Error', description: 'Address is required.', variant: 'destructive' });
        return;
      }
      if (!newCity.trim()) {
        toast({ title: 'Error', description: 'City is required.', variant: 'destructive' });
        return;
      }
      if (!newState.trim()) {
        toast({ title: 'Error', description: 'State is required.', variant: 'destructive' });
        return;
      }
      if (!newPincode.trim()) {
        toast({ title: 'Error', description: 'Pincode is required.', variant: 'destructive' });
        return;
      }
      if (newItems.length === 0 || newItems.some(item => !item.productId || item.quantity <= 0)) {
        toast({ title: 'Error', description: 'Please add at least one valid item with quantity.', variant: 'destructive' });
        return;
      }
      // Construct order object
      const orderItems = newItems.map(item => {
        const product = products.find(p => p.id === item.productId);
        return {
          productId: item.productId,
          name: product ? product.name : 'Unknown',
          quantity: item.quantity,
        };
      });
      const newOrder = {
        id: `order_${Date.now()}`,
        customerName: newCustomerName.trim(),
        address: newAddress.trim(),
        city: newCity.trim(),
        state: newState.trim(),
        pincode: newPincode.trim(),
        phone: newPhone.trim(),
        deliveryPartner: newDeliveryPartner.trim(),
        items: orderItems,
        status: isEditingOrder ? newStatus : 'pending',
        merchantId: selectedMerchantId,
        date: new Date(new Date().getTime() + 5.5 * 60 * 60000).toISOString().replace('T', ' ').substring(0, 19), // Set date and time in IST
      };
      if (isEditingOrder && editOrderId) {
        // Save edited order
        const updatedFields = {
          customerName: newOrder.customerName,
          address: newOrder.address,
          city: newOrder.city,
          state: newOrder.state,
          pincode: newOrder.pincode,
          phone: newOrder.phone,
          deliveryPartner: newOrder.deliveryPartner,
          items: newOrder.items,
          status: newOrder.status,
          merchantId: newOrder.merchantId,
        };
        updateOrder(editOrderId, updatedFields);
        toast({ title: 'Success', description: 'Order updated successfully.' });
        setIsEditingOrder(false);
        setEditOrderId(null);
      } else {
        addOrder(newOrder);
        toast({ title: 'Success', description: 'Order added successfully.' });
      }
      // Reset form and close dialog
      setSelectedMerchantId('');
      setNewCustomerName('');
      setNewAddress('');
      setNewCity('');
      setNewState('');
      setNewPincode('');
  setNewPhone('');
  setNewDeliveryPartner('');
      setNewItems([{ productId: '', quantity: 1 }]);
      setIsAddOrderOpen(false);
    } else if (addOrderTab === 'upload') {
      if (!selectedMerchantId) {
        toast({ title: 'Error', description: 'Please select a merchant.', variant: 'destructive' });
        return;
      }
      if (!uploadFile) {
        toast({ title: 'Error', description: 'Please upload a shipping label file.', variant: 'destructive' });
        return;
      }
      fileToBase64(uploadFile).then(base64String => {
        const newOrder = {
          id: `order_${Date.now()}`,
          customerName: '',
          address: '',
          pincode: '',
          phone: '',
          items: [],
          status: 'pending',
          merchantId: selectedMerchantId,
          shippingLabelBase64: base64String,
        };
        if (isEditingOrder && editOrderId) {
          updateOrder(editOrderId, { shippingLabelBase64: base64String });
          toast({ title: 'Success', description: 'Order updated with shipping label.' });
          setIsEditingOrder(false);
          setEditOrderId(null);
        } else {
          addOrder(newOrder);
          toast({ title: 'Success', description: 'Order with shipping label uploaded successfully.' });
        }
        setUploadFile(null);
        setSelectedMerchantId('');
        setIsAddOrderOpen(false);
      }).catch(error => {
        toast({ title: 'Error', description: 'Failed to process the uploaded file.', variant: 'destructive' });
      });
    }
  };

  const openAdminEditDialog = (order) => {
    if (!order) return;
    setIsEditingOrder(true);
    setEditOrderId(order.id);
    setSelectedMerchantId(order.merchantId || '');
    setNewCustomerName(order.customerName || '');
    setNewAddress(order.address || '');
    setNewCity(order.city || '');
    setNewState(order.state || '');
    setNewPincode(order.pincode || '');
    setNewPhone(order.phone || '');
    setNewDeliveryPartner(order.deliveryPartner || '');
    setNewItems((order.items || []).map(it => ({ productId: it.productId, quantity: it.quantity || 1 })));
    setNewItemCount(Math.max(1, (order.items || []).length));
    setNewStatus(order.status || 'pending');
    setIsAddOrderOpen(true);
  };

  const toggleSelect = (orderId) => {
    setSelectedOrderIds(prev => {
      if (prev.includes(orderId)) return prev.filter(id => id !== orderId);
      return [...prev, orderId];
    });
  };

  const toggleSelectAll = () => {
    if (selectedOrderIds.length === filteredOrders.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filteredOrders.map(o => o.id));
    }
  };

  const groupDeleteSelected = async () => {
    if (selectedOrderIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedOrderIds.length} selected orders? This cannot be undone.`)) return;
    try {
      await Promise.all(selectedOrderIds.map(id => removeOrder(id)));
      setSelectedOrderIds([]);
      toast({ title: 'Deleted', description: 'Selected orders deleted.' });
      await fetchAllData?.();
    } catch (err) {
      console.error('Group delete error', err);
      toast({ title: 'Error', description: 'Failed to delete some orders.', variant: 'destructive' });
    }
  };

  const groupDownloadLabels = () => {
    if (selectedOrderIds.length === 0) return;
    const toDownload = filteredOrders.filter(o => selectedOrderIds.includes(o.id));
    toDownload.forEach(order => downloadShippingLabel(order));
    toast({ title: 'Download started', description: `Downloading ${toDownload.length} labels (if available).` });
  };

  const groupMarkPacked = async () => {
    if (selectedOrderIds.length === 0) return;
    // Get the full order objects for the dialog
    const ordersToUpdate = selectedOrderIds
      .map(id => filteredOrders.find(o => o.id === id))
      .filter(Boolean);
    const initialWeights = {};
    ordersToUpdate.forEach(order => {
      initialWeights[order.id] = order.totalWeightKg || '';
    });
    setOrdersForWeightUpdate(ordersToUpdate);
    setWeights(initialWeights);
    setIsWeightDialogOpen(true);
  };

  const handleWeightSave = async () => {
    try {
      const updates = ordersForWeightUpdate.map(order => ({
        orderId: order.id,
        totalWeightKg: parseFloat(weights[order.id]) || order.totalWeightKg || 0
      }));

      await Promise.all(updates.map(update =>
        updateOrder(update.orderId, {
          status: 'packed',
          packedAt: new Date().toISOString(),
          totalWeightKg: update.totalWeightKg
        })
      ));

      toast({ title: 'Success', description: `${updates.length} orders marked as packed with updated weights.` });
      setSelectedOrderIds([]);
      setIsWeightDialogOpen(false);
      setOrdersForWeightUpdate([]);
      setWeights({});
    } catch (err) {
      console.error('Error updating weights:', err);
      toast({ title: 'Error', description: 'Failed to update orders.', variant: 'destructive' });
    }
  };

  const groupDispatch = async () => {
    if (selectedOrderIds.length === 0) return;
    try {
      for (const id of selectedOrderIds) {
        // dispatchOrder handles inventory updates
        // await sequentially to avoid race conditions
        // eslint-disable-next-line no-await-in-loop
        await dispatchOrder(id);
      }
      toast({ title: 'Dispatched', description: 'Selected orders dispatched.' });
      setSelectedOrderIds([]);
    } catch (err) {
      console.error('Group dispatch error', err);
      toast({ title: 'Error', description: 'Failed to dispatch some orders.', variant: 'destructive' });
    }
  };

  const groupMarkDelivered = async () => {
    if (selectedOrderIds.length === 0) return;
    if (!window.confirm(`Mark ${selectedOrderIds.length} selected orders as delivered?`)) return;
    try {
  const deliveredAt = new Date().toISOString();
  await Promise.all(selectedOrderIds.map(id => updateOrder(id, { status: 'delivered', deliveredAt })));
      toast({ title: 'Updated', description: 'Selected orders marked as delivered.' });
      setSelectedOrderIds([]);
    } catch (err) {
      console.error('Group mark delivered error', err);
      toast({ title: 'Error', description: 'Failed to update some orders.', variant: 'destructive' });
    }
  };

  // Open edit dialog for the single selected order (only when exactly one selected)
  const openEditSelected = () => {
    if (selectedOrderIds.length !== 1) return;
    const id = selectedOrderIds[0];
    const order = orders.find(o => o.id === id);
    if (order) {
      openAdminEditDialog(order);
    } else {
      toast({ title: 'Error', description: 'Selected order not found.', variant: 'destructive' });
    }
  };

  return (
    <div className="p-2 sm:p-6 space-y-6">
      {/* Weight Update Dialog */}
      <Dialog open={isWeightDialogOpen} onOpenChange={setIsWeightDialogOpen}>
        <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col">
          <DialogTitle>Update Weights for Packed Orders</DialogTitle>
          <DialogDescription>
            Enter the total weight (kg) for each order before marking as packed.
          </DialogDescription>

          <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
            <div className="space-y-4">
              {ordersForWeightUpdate.map(order => (
                <Card key={order.id} className="p-4 border border-gray-200">
                  <div className="mb-3">
                    <p className="font-semibold text-sm text-gray-900">Order ID: {order.id}</p>
                    <p className="text-xs text-gray-600">Items: {(order.items || []).map(i => `${i.name} (x${i.quantity})`).join(', ')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`weight-${order.id}`} className="min-w-fit">
                      Total Weight (kg):
                    </Label>
                    <Input
                      id={`weight-${order.id}`}
                      type="number"
                      step="0.001"
                      min="0"
                      value={weights[order.id] || ''}
                      onChange={(e) => setWeights(prev => ({
                        ...prev,
                        [order.id]: e.target.value
                      }))}
                      placeholder="Enter weight in kg"
                      className="flex-1"
                    />
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t pt-4 px-6 shrink-0">
            <Button variant="outline" onClick={() => {
              setIsWeightDialogOpen(false);
              setOrdersForWeightUpdate([]);
              setWeights({});
            }}>
              Cancel
            </Button>
            <Button onClick={handleWeightSave}>
              Save & Mark Packed
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <h1 className="text-3xl font-bold mb-4">All Orders</h1>
      <Button onClick={() => setIsAddOrderOpen(true)} className="mb-4">Add Order</Button>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input
                type="text"
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full max-w-sm border border-gray-300 rounded px-3 py-2"
              />
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36"><SelectValue>{statusFilter}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">pending</SelectItem>
                  <SelectItem value="packed">packed</SelectItem>
                  <SelectItem value="dispatched">dispatched</SelectItem>
                  <SelectItem value="delivered">delivered</SelectItem>
                  <SelectItem value="return">return</SelectItem>
                </SelectContent>
              </Select>
              <Select value={dateRangeFilter} onValueChange={setDateRangeFilter}>
                <SelectTrigger className="w-44"><SelectValue>{dateRangeFilter}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last7">Last 7 days</SelectItem>
                  <SelectItem value="last30">Last 30 days</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {dateRangeFilter === 'custom' && (
              <div className="flex items-center gap-2">
                <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                <span>—</span>
                <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent>
          {selectedOrderIds.length > 0 && (
            <div className="mb-4 flex items-center gap-2">
              <div className="font-medium">{selectedOrderIds.length} selected</div>
              {selectedOrderIds.length === 1 && (
                <Button variant="outline" size="sm" onClick={openEditSelected}>Edit Selected</Button>
              )}
              <Button variant="destructive" size="sm" onClick={groupDeleteSelected}>Delete Selected</Button>
              <Button variant="outline" size="sm" onClick={groupDownloadLabels}>Download Labels</Button>
              <Button variant="outline" size="sm" onClick={groupMarkPacked}>Mark Packed</Button>
              <Button variant="outline" size="sm" onClick={groupDispatch}>Dispatch</Button>
              <Button variant="outline" size="sm" onClick={groupMarkDelivered}>Mark Delivered</Button>
            </div>
          )}
          {filteredOrders.length === 0 ? (
            <p>No orders found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <input type="checkbox" onChange={toggleSelectAll} checked={selectedOrderIds.length === filteredOrders.length && filteredOrders.length > 0} />
                  </TableHead>
                  <TableHead>Order ID</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date &amp; Time</TableHead>
                  <TableHead>Courier Partner</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Weight (kg)</TableHead>
                  <TableHead>Packing Fee (₹)</TableHead>
                  <TableHead>Status</TableHead>
                  {/* Actions column removed - bulk actions provided above */}
                </TableRow>
              </TableHeader>
              <TableBody>
                 <AnimatePresence>
                   {filteredOrders.map(order => {
                     const hasUploadedPDF = (order.shippingLabelFile || order.shippingLabelBase64) && !order.generatedPDF;
                     const hasNoItems = !order.items || order.items.length === 0;
                     let computedWeight = (order.totalWeightKg !== undefined && order.totalWeightKg !== null)
                       ? parseFloat(order.totalWeightKg)
                       : (order.items || []).reduce((s, it) => {
                         const prod = products.find(p => p.id === it.productId) || {};
                         const actual = prod.weightKg || 0;
                         const vol = calculateVolumetricWeight(prod.lengthCm || 0, prod.breadthCm || 0, prod.heightCm || 0);
                         const perItem = Math.max(actual, vol);
                         return s + perItem * (it.quantity || 0);
                       }, 0);
                     if (!isFinite(computedWeight) || isNaN(computedWeight)) computedWeight = 0;
                     const packingFee = (order.items || []).reduce((sum, item) => {
                       const prod = products.find(p => p.id === item.productId);
                       if (!prod) return sum;
                       const actual = prod.weightKg || 0;
                       const vol = calculateVolumetricWeight(prod.lengthCm || 0, prod.breadthCm || 0, prod.heightCm || 0);
                       const fee = calculateDispatchFee ? calculateDispatchFee(actual, vol, prod.packingType || 'normal packing') : 0;
                       return sum + fee * (item.quantity || 0);
                     }, 0);
                     return (
                     <motion.tr
                       key={order.id}
                       initial={{ opacity: 0 }}
                       animate={{ opacity: 1 }}
                       exit={{ opacity: 0 }}
                       layout
                     >
                       <TableCell>
                         <input type="checkbox" checked={selectedOrderIds.includes(order.id)} onChange={() => toggleSelect(order.id)} />
                       </TableCell>
                       <TableCell>{order.id}</TableCell>
                       <TableCell>{users.find(user => user.id === order.merchantId)?.companyName || users.find(user => user.id === order.merchantId)?.name || order.merchantId}</TableCell>
                       <TableCell>{order.customerName || (order.shippingLabelBase64 ? 'bulk order' : <span className="italic text-muted-foreground">No customer name</span>)}</TableCell>
                       <TableCell>{order.date}{order.time ? ` ${order.time}` : ''}</TableCell>
                       <TableCell>{order.deliveryPartner || <span className="italic text-muted-foreground">pending</span>}</TableCell>
                       <TableCell>
                         <div className="relative inline-block text-left">
                           <button
                             type="button"
                             className="inline-flex justify-center w-full rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50"
                             id={`menu-button-${order.id}`}
                             aria-expanded="true"
                             aria-haspopup="true"
                             onClick={() => toggleExpandOrder(order.id)}
                           >
                             Items
                             <svg
                               className="ml-2 -mr-1 h-5 w-5"
                               xmlns="http://www.w3.org/2000/svg"
                               viewBox="0 0 20 20"
                               fill="currentColor"
                               aria-hidden="true"
                             >
                               <path
                                 fillRule="evenodd"
                                 d={expandedOrderIds.has(order.id) ? "M5.23 7.21a.75.75 0 011.06.02L10 11.293l3.71-4.06a.75.75 0 111.08 1.04l-4.25 4.65a.75.75 0 01-1.08 0l-4.25-4.65a.75.75 0 01.02-1.06z" : "M14.77 12.79a.75.75 0 01-1.06-.02L10 8.707l-3.71 4.06a.75.75 0 11-1.08-1.04l4.25-4.65a.75.75 0 011.08 0l4.25 4.65a.75.75 0 01-.02 1.06z"}
                                 clipRule="evenodd"
                               />
                             </svg>
                           </button>
                           {expandedOrderIds.has(order.id) && (
                             <div
                               className="origin-top-left absolute left-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10"
                               role="menu"
                               aria-orientation="vertical"
                               aria-labelledby={`menu-button-${order.id}`}
                               tabIndex="-1"
                             >
                               <div className="py-1" role="none">
                                 {order.items && order.items.length > 0 ? (
                                   order.items.map((item, idx) => (
                                     <div
                                       key={idx}
                                       className="text-gray-700 block px-4 py-2 text-sm"
                                       role="menuitem"
                                       tabIndex="-1"
                                       id={`menu-item-${idx}`}
                                     >
                                       {item.name} (x{item.quantity})
                                     </div>
                                   ))
                                 ) : (
                                   <div className="text-gray-700 block px-4 py-2 text-sm italic text-muted-foreground">No items marked</div>
                                 )}
                               </div>
                             </div>
                           )}
                         </div>
                       </TableCell>
                       <TableCell>{computedWeight.toFixed(3)}</TableCell>
                       <TableCell>₹{packingFee.toFixed(2)}</TableCell>
                       <TableCell>
                         <StatusTimelineDropdown 
                           order={order} 
                           isExpanded={expandedOrderIds.has(`status-${order.id}`)}
                           onToggle={() => toggleExpandOrder(`status-${order.id}`)}
                         />
                       </TableCell>
                     </motion.tr>
                     );
                   })}
                 </AnimatePresence>
               </TableBody>
             </Table>
           )}
         </CardContent>
       </Card>

       {/* Add Order Manual Entry Dialog */}
       <Dialog open={isAddOrderOpen} onOpenChange={setIsAddOrderOpen}>
         <DialogContent className="max-w-lg" aria-describedby="add-order-manual-desc">
           <DialogTitle>Add Order - Manual Entry</DialogTitle>
           <DialogDescription id="add-order-manual-desc">
             Add order manually by filling the form below or upload a shipping label.
           </DialogDescription>
           <div className="mt-4">
             <div className="flex space-x-4 border-b border-gray-300">
               <button
                 className={`px-4 py-2 font-semibold ${addOrderTab === 'manual' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
                 onClick={() => setAddOrderTab('manual')}
               >
                 Manual Entry
               </button>
               <button
                 className={`px-4 py-2 font-semibold ${addOrderTab === 'upload' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
                 onClick={() => setAddOrderTab('upload')}
               >
                 Upload Shipping Label
               </button>
             </div>
                   {addOrderTab === 'manual' && (
                     <div className="space-y-4 mt-4">
                       <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
                         <div className="flex-1">
                           <Label htmlFor="merchant">Select Merchant</Label>
                           <Select value={selectedMerchantId} onValueChange={setSelectedMerchantId}>
                             <SelectTrigger className="w-full">
                               <SelectValue>
                                 {selectedMerchantId
                                   ? (users.find(user => user.id === selectedMerchantId)?.companyName || users.find(user => user.id === selectedMerchantId)?.name || selectedMerchantId)
                                   : "Select merchant"}
                               </SelectValue>
                             </SelectTrigger>
                             <SelectContent>
                               {users
                                 .filter(user => user.role === 'merchant')
                                 .map(user => (
                                   <SelectItem key={user.id} value={user.id}>
                                     {user.companyName || user.name || user.id}
                                   </SelectItem>
                                 ))}
                             </SelectContent>
                           </Select>
                         </div>
                         <div className="flex-1">
                           <Label htmlFor="customerName">Customer Name</Label>
                           <Input
                             id="customerName"
                             value={newCustomerName}
                             onChange={(e) => setNewCustomerName(e.target.value)}
                             placeholder="Customer Name"
                           />
                         </div>
                       </div>
                       <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
                         <div className="flex-1">
                           <Label htmlFor="address">Address</Label>
                           <Input
                             id="address"
                             value={newAddress}
                             onChange={(e) => setNewAddress(e.target.value)}
                             placeholder="Full Address"
                           />
                         </div>
                         <div className="flex-1">
                           <Label htmlFor="city">City</Label>
                           <Input
                             id="city"
                             value={newCity}
                             onChange={(e) => setNewCity(e.target.value)}
                             placeholder="City"
                           />
                         </div>
                       </div>
                       <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
                         <div className="flex-1">
                           <Label htmlFor="state">State</Label>
                           <Input
                             id="state"
                             value={newState}
                             onChange={(e) => setNewState(e.target.value)}
                             placeholder="State"
                           />
                         </div>
                         <div className="flex-1">
                           <Label htmlFor="pincode">Pincode</Label>
                           <Input
                             id="pincode"
                             value={newPincode}
                             onChange={(e) => setNewPincode(e.target.value)}
                             placeholder="Pincode"
                           />
                         </div>
                       </div>
                       <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
                         <div className="flex-1">
                           <Label htmlFor="phone" className="block mb-1 font-medium text-gray-700">Phone Number</Label>
                           <Input
                             id="phone"
                             value={newPhone}
                             onChange={(e) => setNewPhone(e.target.value)}
                             placeholder="Phone Number"
                             className="block w-full"
                           />
                         </div>
                       </div>
                      <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0 mt-2">
                        <div className="flex-1">
                          <Label htmlFor="deliveryPartner" className="block mb-1 font-medium text-gray-700">Courier Partner</Label>
                          <Input
                            id="deliveryPartner"
                            value={newDeliveryPartner}
                            onChange={(e) => setNewDeliveryPartner(e.target.value)}
                            placeholder="Courier / Delivery Partner"
                            className="block w-full"
                          />
                        </div>
                      </div>
                       <div>
                         <Label>Items</Label>
                         {newItems.slice(0, newItemCount).map((item, index) => (
                           <div key={index} className="flex flex-col sm:flex-row sm:items-center sm:space-x-2 mb-2 space-y-2 sm:space-y-0">
                             <Select
                               value={item.productId}
                               onValueChange={(value) => handleNewItemChange(index, 'productId', value)}
                               className="flex-grow"
                             >
                               <SelectTrigger className="w-full">
                                 <SelectValue placeholder="Select product" />
                               </SelectTrigger>
                               <SelectContent>
                                 {products
                                   .filter(product => product.merchantId === selectedMerchantId)
                                   .map(product => (
                                     <SelectItem key={product.id} value={product.id}>
                                       {product.name}
                                     </SelectItem>
                                   ))}
                               </SelectContent>
                             </Select>
                             <Input
                               type="number"
                               min="1"
                               placeholder="Quantity"
                               value={item.quantity}
                               onChange={(e) => handleNewItemChange(index, 'quantity', e.target.value)}
                               className="w-20"
                             />
                             <Button variant="outline" onClick={() => handleRemoveNewItem(index)}>Remove</Button>
                           </div>
                         ))}
                         <Button variant="outline" onClick={handleAddNewItem}>Add Item</Button>
                       </div>
                       <div className="mt-4 p-2 border rounded bg-gray-50 dark:bg-gray-800">
                         <p className="text-gray-900 dark:text-gray-100">
                          <strong>Address Summary:</strong> {newAddress}, {newCity}, {newState}, PIN: {newPincode}, Phone: {newPhone} {newDeliveryPartner ? ` — Courier: ${newDeliveryPartner}` : ''}
                         </p>
                       </div>
                       {isEditingOrder && (
                         <div>
                           <Label htmlFor="orderStatus">Status</Label>
                           <Select value={newStatus} onValueChange={setNewStatus}>
                             <SelectTrigger className="w-full"><SelectValue>{newStatus}</SelectValue></SelectTrigger>
                             <SelectContent>
                               <SelectItem value="pending">pending</SelectItem>
                               <SelectItem value="packed">packed</SelectItem>
                               <SelectItem value="dispatched">dispatched</SelectItem>
                               <SelectItem value="delivered">delivered</SelectItem>
                               <SelectItem value="return">return</SelectItem>
                             </SelectContent>
                           </Select>
                         </div>
                       )}
                     </div>
                   )}
             {addOrderTab === 'upload' && (
               <div className="mt-4 space-y-4">
                 <div>
                   <Label htmlFor="merchantUpload">Select Merchant</Label>
                   <Select value={selectedMerchantId} onValueChange={setSelectedMerchantId}>
                     <SelectTrigger className="w-full">
                       <SelectValue>
                         {selectedMerchantId
                           ? (users.find(user => user.id === selectedMerchantId)?.companyName || users.find(user => user.id === selectedMerchantId)?.name || selectedMerchantId)
                           : "Select merchant"}
                       </SelectValue>
                     </SelectTrigger>
                     <SelectContent>
                       {users
                         .filter(user => user.role === 'merchant')
                         .map(user => (
                           <SelectItem key={user.id} value={user.id}>
                             {user.companyName || user.name || user.id}
                           </SelectItem>
                         ))}
                     </SelectContent>
                   </Select>
                 </div>
                 <div>
                   <Label htmlFor="shippingLabelFile">Upload Shipping Label</Label>
                   <Input
                     id="shippingLabelFile"
                     type="file"
                     accept=".pdf,.png,.jpg,.jpeg"
                     onChange={(e) => setUploadFile(e.target.files ? e.target.files[0] : null)}
                   />
                 </div>
               </div>
             )}
             <div className="mt-4 flex justify-end space-x-2">
               <Button variant="outline" onClick={() => setIsAddOrderOpen(false)}>Cancel</Button>
               <Button onClick={handleSubmitNewOrder}>Submit</Button>
             </div>
           </div>
         </DialogContent>
       </Dialog>

       {/* Existing Mark Products Dialog */}
       <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
         <DialogContent className="max-w-md" aria-describedby="mark-products-desc">
           <DialogTitle>Mark Products and Quantity</DialogTitle>
           <DialogDescription id="mark-products-desc">
             Select products and specify quantities for the uploaded order.
           </DialogDescription>
           <div className="space-y-4 mt-4">
             {selectedItems.map((item, index) => (
               <div key={index} className="flex items-center space-x-2">
                 <Select
                   value={item.productId}
                   onValueChange={(value) => {
                     const newItems = [...selectedItems];
                     newItems[index].productId = value;
                     setSelectedItems(newItems);
                   }}
                 >
                   <SelectTrigger className="w-48">
                     <SelectValue placeholder="Select product" />
                   </SelectTrigger>
                   <SelectContent>
                     {products
                       .filter(product => product.merchantId === selectedOrder?.merchantId)
                       .map(product => (
                         <SelectItem key={product.id} value={product.id}>
                           {product.name}
                         </SelectItem>
                       ))}
                   </SelectContent>
                 </Select>
                 <Input
                   type="number"
                   min="1"
                   value={item.quantity}
                   onChange={(e) => {
                     const qty = parseInt(e.target.value, 10);
                     handleItemChange(item.productId, qty);
                   }}
                   className="w-20"
                 />
                 <Button variant="outline" onClick={() => {
                   // Remove this item
                   setSelectedItems(prev => prev.filter((_, i) => i !== index));
                 }}>Remove</Button>
               </div>
             ))}
             <Button variant="outline" onClick={() => {
               // Add new empty item
               setSelectedItems(prev => [...prev, { productId: '', quantity: 1 }]);
             }}>Add Item</Button>
           </div>
           <div className="mt-4 flex justify-between">
             <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
             <Button onClick={handleSubmitMarkedItems}>Submit</Button>
           </div>
         </DialogContent>
       </Dialog>
    </div>
  );
};

export default AdminOrders;
