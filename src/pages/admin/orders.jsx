import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../../context/inventory-context.jsx';
import { Button } from '../../components/ui/button.jsx';
import { useToast } from '../../components/ui/use-toast.js';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
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

// Ensure renderTemplate is defined at the top level of the file
const renderTemplate = (tpl, data = {}) => {
  const src = String(tpl || '').trim();

  const resolvePath = (path, ctx = data) => {
    if (!path) return undefined;
    const parts = path.trim().split('.');
    let cur = ctx;
    for (const p of parts) {
      if (cur == null) {
        console.warn(`Missing path: ${path} at part: ${p}`);
        return undefined;
      }
      cur = cur[p];
    }
    return cur;
  };

  // Add debugging logs
  console.log("Template source:", src);
  console.log("Data context:", data);

  // Replace {{ }} placeholders
  let out = src.replace(/{{\s*([^}]+)\s*}}/g, (_, expr) => {
    try {
      const key = expr.trim();
      const val = resolvePath(key);
      if (val == null) {
        console.warn(`Missing value for: ${key}`);
        return '';
      }
      return String(val).trim();
    } catch (e) {
      console.error(`Error resolving path: ${expr}`, e);
      return '';
    }
  });

  // Process {% if %} and {% else %} blocks
  const ifRegex = /{%\s*if\s+([^%]+)\s*%}([\s\S]*?){%\s*else\s*%}([\s\S]*?){%\s*endif\s*%}/g;
  out = out.replace(ifRegex, (match, condition, ifTrue, ifFalse) => {
    const value = resolvePath(condition.trim());
    console.log(`Condition: ${condition.trim()}, Value: ${value}`);
    return value ? ifTrue.trim() : ifFalse.trim();
  });

  // Process {% if %} blocks without {% else %}
  const ifOnlyRegex = /{%\s*if\s+([^%]+)\s*%}([\s\S]*?){%\s*endif\s*%}/g;
  out = out.replace(ifOnlyRegex, (match, condition, ifTrue) => {
    const value = resolvePath(condition.trim());
    console.log(`Condition: ${condition.trim()}, Value: ${value}`);
    return value ? ifTrue.trim() : '';
  });

  return out.trim();
};

const AdminOrders = () => {
  const { orders, markOrderPacked, dispatchOrder, products, updateOrder, addOrder, removeOrder, inventory, currentUser, users, replaceOrder } = useInventory();
  const { toast } = useToast();

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
  const [boxFees, setBoxFees] = useState({});
  const [boxCuttings, setBoxCuttings] = useState({});
  const [packingFeesByOrder, setPackingFeesByOrder] = useState({});
  const packingFeesFetchedRef = useRef(false);

  // Dialog state for tracking codes
  const [isTrackingCodeDialogOpen, setIsTrackingCodeDialogOpen] = useState(false);

  // New states for tracking codes and order details
  const [trackingCodes, setTrackingCodes] = useState({});
  const [isOrderDetailsDialogOpen, setIsOrderDetailsDialogOpen] = useState(false);
  const [orderDetails, setOrderDetails] = useState(null);

  // Helper to compute per-item total fees from product-level fields
  const calculatePerItemTotalFee = (prod) => {
    if (!prod) return 0;
    const actual = prod.weightKg || 0;
    const vol = calculateVolumetricWeight(prod.lengthCm || 0, prod.breadthCm || 0, prod.heightCm || 0);
    const basePacking = (prod.itemPackingFee !== undefined && prod.itemPackingFee !== null && prod.itemPackingFee !== '')
      ? Number(prod.itemPackingFee) || 0
      : (calculateDispatchFee ? calculateDispatchFee(actual, vol, prod.packingType || 'normal packing') : 0);
    const transportation = Number(prod.transportationFee || 0);
    const warehousingPerItem = (Number(prod.warehousingRatePerKg || 0)) * (prod.weightKg || actual || 0);
    return basePacking + transportation + warehousingPerItem;
  };

  // Helper: return per-item breakdown { packing, transportation, warehousing }
  const calculatePerItemComponents = (prod) => {
    if (!prod) return { packing: 0, transportation: 0, warehousing: 0 };
    const actual = prod.weightKg || 0;
    const vol = calculateVolumetricWeight(prod.lengthCm || 0, prod.breadthCm || 0, prod.heightCm || 0);
    const packing = (prod.itemPackingFee !== undefined && prod.itemPackingFee !== null && prod.itemPackingFee !== '')
      ? Number(prod.itemPackingFee) || 0
      : (calculateDispatchFee ? calculateDispatchFee(actual, vol, prod.packingType || 'normal packing') : 0);
    const transportation = Number(prod.transportationFee || 0);
    const warehousing = (Number(prod.warehousingRatePerKg || 0)) * (prod.weightKg || actual || 0);
    return { packing, transportation, warehousing };
  };

  // Add state for newTrackingCode
  const [newTrackingCode, setNewTrackingCode] = useState('');

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

  // Fetch packing fee totals for all non-pending orders not yet loaded in state (batch)
  // Only run once per reload — use a ref guard so we don't refetch on state/prop updates
  useEffect(() => {
    if (packingFeesFetchedRef.current) return;
    const idsToFetch = (filteredOrders || [])
      .filter(o => String(o.status || '').toLowerCase() !== 'pending' && packingFeesByOrder[o.id] === undefined)
      .map(o => o.id);
    if (!idsToFetch || idsToFetch.length === 0) return;
    (async () => {
      try {
        const q = idsToFetch.join(',');
        // Prefer relative API path, but when running the Vite dev server it may return cached 304s
        // so fall back to calling the backend directly on port 4000 in dev.
        const isLocalDev = typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost' && window.location.port === '5173';
        const apiBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) ? import.meta.env.VITE_API_BASE : (isLocalDev ? 'https://forwokbackend-1.onrender.com' : '');
        const url = `${apiBase}/api/packingfees?orderIds=${encodeURIComponent(q)}`;
        console.log('Admin: fetching packing fees batch from', url);
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          packingFeesFetchedRef.current = true;
          return;
        }
        const json = await res.json();
        console.log('Admin: packing fees batch response', json);
        if (json && json.map) {
          // Store the full packing fee object for each order (coerce numeric fields)
          const normalized = Object.fromEntries(Object.entries(json.map).map(([k, v]) => {
            // handle numeric shortcut (v can be a number)
            if (typeof v === 'number') {
              return [k, {
                totalPackingFee: Number(v),
                boxFee: 0,
                boxCutting: false,
                trackingFee: 3,
                totalWeightKg: undefined,
                raw: v
              }];
            }
            const boxFee = Number(v.boxFee ?? v.box_fee ?? 0) || 0;
            const boxCutting = (v.boxCutting ?? v.box_cutting ?? v.box_cut) ? true : false;
            const totalPackingFee = v.totalPackingFee !== undefined ? Number(v.totalPackingFee) : (v.total !== undefined ? Number(v.total) : undefined);
            return [k, {
              totalPackingFee,
              boxFee,
              boxCutting,
              trackingFee: Number(v.trackingFee ?? v.tracking_fee ?? 3),
              totalWeightKg: v.totalWeightKg !== undefined ? Number(v.totalWeightKg) : (v.total_weight_kg !== undefined ? Number(v.total_weight_kg) : undefined),
              items: v.items ?? v.products ?? v.map?.items ?? [],
              raw: v
            }];
          }));
          setPackingFeesByOrder(prev => ({ ...prev, ...normalized }));
        }
      } catch (e) {
        // ignore fetch errors
      } finally {
        packingFeesFetchedRef.current = true;
      }
    })();
  }, [filteredOrders]);

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

  // Open weight dialog for a single order (from order details)
  const openWeightDialogForOrder = (order) => {
    if (!order) return;
    setOrdersForWeightUpdate([order]);
    setWeights({ [order.id]: order.packedweight ?? order.totalWeightKg ?? '' });
    setIsWeightDialogOpen(true);
    setIsTrackingCodeDialogOpen(false);
  };

  const downloadShippingLabel = async (order) => {
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
        shipping_address: { 
          name: order.customerName || '', 
          address1: addressParts[0] || '', 
          address2: (addressParts.slice(1).join(', ') || ''), 
          city: order.city || '', 
          province: order.state || '', 
          zip: order.pincode || '', 
          country: 'India', 
          phone: order.phone || '' 
        },
        items: (order.items || []).map(i => ({ title: i.name || i.title || 'Item', quantity: i.quantity || 0 })),
        deliveryPartner: order.deliveryPartner || ''
      };
      const rendered = renderTemplate(tpl, data);
      // Open in new window and trigger print
      openPreviewWindow(rendered, true);
      return;
    }

    // Fallback: use PDF generator for the order - will trigger print in its own window
    const augmentedOrder = {
      ...order,
      city: order.city || '',
      state: order.state || '',
    };
    console.log('No merchant template found — generating default PDF for order:', augmentedOrder);
    generateShippingLabelPDF(augmentedOrder, { companyName: merchant.companyName, id: merchant.id });
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

  const groupDownloadLabels = async () => {
    if (selectedOrderIds.length === 0) return;
    const toDownload = filteredOrders.filter(o => selectedOrderIds.includes(o.id));
    
    // Create a single PDF with multiple pages
    const pdf = new jsPDF();
    let firstPage = true;

    for (const order of toDownload) {
      // Get merchant template
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
        console.warn('Failed to fetch server template', e);
      }

      if (!tpl) {
        try { tpl = localStorage.getItem(templateKey); } catch (e) { tpl = null; }
      }

      // Create a temporary div to render the template
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.width = '210mm';
      tempDiv.style.height = '297mm';
      tempDiv.style.padding = '20px';
      tempDiv.style.boxSizing = 'border-box';
      tempDiv.style.backgroundColor = 'white';
      tempDiv.style.fontFamily = 'Arial, sans-serif';

      if (tpl) {
        // Render merchant template
        const addressParts = (order.address || '').split(',').map(p => p.trim());
        const data = {
          shop: { name: merchant.companyName || merchant.name || 'Merchant' },
          order: { name: order.id, created_at: order.createdAt || order.date || '' },
          shipping_address: { 
            name: order.customerName || '', 
            address1: addressParts[0] || '', 
            address2: (addressParts.slice(1).join(', ') || ''), 
            city: order.city || '', 
            province: order.state || '', 
            zip: order.pincode || '', 
            country: 'India', 
            phone: order.phone || '' 
          },
          items: (order.items || []).map(i => ({ title: i.name || i.title || 'Item', quantity: i.quantity || 0 })),
          deliveryPartner: order.deliveryPartner || ''
        };
        const rendered = renderTemplate(tpl, data);
        tempDiv.innerHTML = rendered;
      } else {
        // Fallback: create simple HTML template
        const addressParts = (order.address || '').split(',').map(p => p.trim());
        tempDiv.innerHTML = `
          <div style="padding: 20px; font-family: Arial, sans-serif;">
            <h2>${merchant.companyName || 'Shipping Label'}</h2>
            <hr style="margin: 10px 0;">
            <p><strong>Order ID:</strong> ${order.id}</p>
            <p><strong>Date:</strong> ${order.date || order.createdAt || 'N/A'}</p>
            <p><strong>Customer:</strong> ${order.customerName || 'N/A'}</p>
            <p><strong>Phone:</strong> ${order.phone || 'N/A'}</p>
            <hr style="margin: 10px 0;">
            <p><strong>Shipping Address:</strong></p>
            <p>${addressParts.join(', ')}</p>
            <p>${order.city || ''}, ${order.state || ''} ${order.pincode || ''}</p>
            <p><strong>Courier Partner:</strong> ${order.deliveryPartner || 'TBD'}</p>
            <hr style="margin: 10px 0;">
            <p><strong>Items:</strong></p>
            <ul>
              ${(order.items || []).map(i => `<li>${i.name || i.title || 'Item'} (Qty: ${i.quantity || 0})</li>`).join('')}
            </ul>
          </div>
        `;
      }

      document.body.appendChild(tempDiv);

      try {
        // Convert HTML to canvas
        const canvas = await html2canvas(tempDiv, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff'
        });

        // Add page to PDF
        if (!firstPage) {
          pdf.addPage();
        }

        const imgData = canvas.toDataURL('image/png');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        
        pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);
        firstPage = false;
      } catch (err) {
        console.error('Error generating page for order:', order.id, err);
      } finally {
        document.body.removeChild(tempDiv);
      }
    }

    // Download the PDF
    pdf.save('shipping-labels.pdf');
    toast({ title: 'Success', description: `Generated PDF with ${toDownload.length} shipping label(s).` });
    setSelectedOrderIds([]);
  };

  const groupMarkPacked = async () => {
    if (selectedOrderIds.length === 0) return;

    const ordersToUpdate = selectedOrderIds
      .map((id) => filteredOrders.find((o) => o.id === id))
      .filter(Boolean);

    const initialWeights = {};
    const initialBoxFees = {};
    const initialBoxCuttings = {};
    ordersToUpdate.forEach((order) => {
      initialWeights[order.id] = order.packedweight ?? order.totalWeightKg ?? '';
      const pf = packingFeesByOrder && packingFeesByOrder[order.id] ? packingFeesByOrder[order.id] : null;
      initialBoxFees[order.id] = pf && pf.boxFee !== undefined ? String(pf.boxFee) : (order.boxFee !== undefined ? String(order.boxFee) : '');
      initialBoxCuttings[order.id] = pf && pf.boxCutting !== undefined ? Boolean(pf.boxCutting) : (order.boxCutting === true);
    });

    setOrdersForWeightUpdate(ordersToUpdate);
    setWeights(initialWeights);
    setBoxFees(initialBoxFees);
    setBoxCuttings(initialBoxCuttings);
    setIsWeightDialogOpen(true); // Open the weight dialog

    // Explicitly ensure tracking code dialog is not opened
    setIsTrackingCodeDialogOpen(false);
  };

  const groupDispatch = async () => {
    if (selectedOrderIds.length === 0) return;
    setIsTrackingCodeDialogOpen(true); // Open the tracking code dialog
  };

  const groupMarkDelivered = async () => {
    if (selectedOrderIds.length === 0) return;
    if (!window.confirm(`Mark ${selectedOrderIds.length} selected orders as delivered?`)) return;
    try {
      const deliveredAt = new Date().toISOString();
      await Promise.all(selectedOrderIds.map((id) => updateOrder(id, { status: 'delivered', deliveredAt })));
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

  // Function to handle dispatch with tracking codes
  const handleDispatchWithTracking = async (targetStatus) => {
    if (selectedOrderIds.length === 0) return;

    try {
      for (const id of selectedOrderIds) {
        const order = orders.find((o) => o.id === id);

        if (!order) {
          toast({ title: 'Error', description: `Order ${id} not found.`, variant: 'destructive' });
          return;
        }

        // Determine the tracking code to persist (entered value takes precedence)
        const codeToSave = (trackingCodes && trackingCodes[id]) ? trackingCodes[id] : order.trackingCode;

        // If we're dispatching, tracking code must exist (either previously saved or entered now)
        if (targetStatus === 'Dispatched' && (!codeToSave || codeToSave === '')) {
          toast({ title: 'Error', description: `Tracking code is required for order ${id}.`, variant: 'destructive' });
          setIsTrackingCodeDialogOpen(true); // Open the tracking code dialog
          return;
        }

        // Persist tracking code if we have one (this updates server and local state)
        if (codeToSave) {
          await saveTrackingCodeAndRefresh(id, codeToSave);
        }

        // Update order status and include trackingCode to ensure backend persists it with the dispatch
        await dispatchOrder(id, { status: targetStatus, trackingCode: codeToSave });
      }

      toast({ title: 'Success', description: `Selected orders updated to ${targetStatus} successfully.` });
      setSelectedOrderIds([]);
      setTrackingCodes({});
      setIsTrackingCodeDialogOpen(false); // Close the tracking code dialog
    } catch (err) {
      console.error('Dispatch error', err);
      toast({ title: 'Error', description: `Failed to update some orders to ${targetStatus}.`, variant: 'destructive' });
    }
  };

  // Handle confirming mark packed from weight dialog
  const handleConfirmMarkPacked = async () => {
    if (!ordersForWeightUpdate || ordersForWeightUpdate.length === 0) {
      setIsWeightDialogOpen(false);
      return;
    }
    try {
      const now = new Date().toISOString();
      const results = await Promise.all(ordersForWeightUpdate.map(async (order) => {
        const w = parseFloat(weights[order.id]) || 0;
        // Box fee and cutting
        const pf = packingFeesByOrder && packingFeesByOrder[order.id] ? packingFeesByOrder[order.id] : null;
        const boxFeeVal = boxFees[order.id] !== undefined ? parseFloat(boxFees[order.id]) || 0 : (pf && pf.boxFee !== undefined ? Number(pf.boxFee) : (order.boxFee !== undefined ? Number(order.boxFee) : 0));
        const boxCuttingVal = boxCuttings[order.id] !== undefined ? Boolean(boxCuttings[order.id]) : (pf && pf.boxCutting !== undefined ? Boolean(pf.boxCutting) : Boolean(order.boxCutting));

        // Calculate per-order extra: boxFee + (boxCutting ? 2 : 0) + tracking fee (₹2)
        const trackingFee = 3; // fixed tracking fee as requested
        const boxTotal = boxFeeVal + (boxCuttingVal ? 2 : 0) + trackingFee;

        // Calculate item-wise packing fee using existing helper
        const itemsPacking = (order.items || []).reduce((sum, item) => {
          const prod = products.find(p => p.id === item.productId);
          if (!prod) return sum;
          const feePerItem = calculatePerItemTotalFee(prod);
          return sum + feePerItem * (item.quantity || 0);
        }, 0);

        const totalPackingFee = itemsPacking + boxTotal;

        // Save packed weight explicitly as `packedweight` along with totalWeightKg
        // Do NOT send client-side packingDetails: server will compute authoritative packing breakdown
        let updatedFields = { totalWeightKg: w, packedweight: w, status: 'packed', packedAt: now, boxFee: boxFeeVal, boxCutting: boxCuttingVal };
        if (order.items && order.items.length === 1) {
          const item = order.items[0];
          const updatedItem = { ...item, weightKg: w };
          updatedFields.items = [updatedItem];
        }
        console.log('MarkPacked: updating order', order.id, 'with', updatedFields);
        const res = await updateOrder(order.id, updatedFields);
        console.log('MarkPacked: server response for', order.id, res);
        return res;
      }));
      console.log('MarkPacked: all results', results);
      // If order details dialog is open for one of the updated orders, refresh it with the saved data
      if (orderDetails && results && results.length > 0) {
        const updated = results.find(r => r && r.id === orderDetails.id);
        if (updated) setOrderDetails(updated);
      }
      toast({ title: 'Updated', description: `Marked ${ordersForWeightUpdate.length} order(s) as packed.` });
      setSelectedOrderIds([]);
      setOrdersForWeightUpdate([]);
      setWeights({});
      setBoxFees({});
      setBoxCuttings({});
      setIsWeightDialogOpen(false);
      // Ensure tracking dialog remains closed
      setIsTrackingCodeDialogOpen(false);
    } catch (err) {
      console.error('Mark packed error', err);
      toast({ title: 'Error', description: 'Failed to mark some orders as packed.', variant: 'destructive' });
    }
  };

  // Function to open order details dialog
  const openOrderDetails = (order) => {
    // show current order first, then try to fetch authoritative server copy
    setOrderDetails(order);
    // If we already have a batch-fetched PackingFee object, merge it immediately for quicker display
    try {
      const pf = packingFeesByOrder && packingFeesByOrder[order.id] ? packingFeesByOrder[order.id] : null;
      if (pf) {
        setOrderDetails(prev => ({
          ...(prev || {}),
          boxFee: pf.boxFee !== undefined ? pf.boxFee : prev?.boxFee,
          boxCutting: pf.boxCutting !== undefined ? pf.boxCutting : prev?.boxCutting,
          trackingFee: pf.trackingFee !== undefined ? pf.trackingFee : prev?.trackingFee,
          totalPackingFee: pf.totalPackingFee !== undefined ? pf.totalPackingFee : prev?.totalPackingFee,
          totalWeightKg: pf.totalWeightKg !== undefined ? pf.totalWeightKg : prev?.totalWeightKg,
          packingDetails: pf.items && Array.isArray(pf.items) ? pf.items : prev?.packingDetails,
        }));
      }
    } catch (e) {
      // noop
    }
    setIsOrderDetailsDialogOpen(true);
    (async () => {
      try {
        const serverOrder = await fetchOrderFromServer(order.id || order._id || order.orderId || order.id);
        let finalOrder = serverOrder || order;
        // If serverOrder exists but doesn't include packingDetails, try fetching PackingFee doc
        if (finalOrder) {
          const hasPackingDetails = Array.isArray(finalOrder.packingDetails) && finalOrder.packingDetails.length > 0;
          if (!hasPackingDetails) {
            const pf = await fetchPackingFeeFromServer(finalOrder.id || finalOrder.orderId || finalOrder._id || order.id);
            if (pf) {
              // Determine items: prefer pf.items, else try common alt keys, else compute from order items
              let itemsFromPf = null;
              if (Array.isArray(pf.items) && pf.items.length > 0) itemsFromPf = pf.items;
              if (!itemsFromPf && Array.isArray(pf.products) && pf.products.length > 0) itemsFromPf = pf.products;
              if (!itemsFromPf && pf.map && Array.isArray(pf.map.items)) itemsFromPf = pf.map.items;
              // If packing doc lacks item breakdown, compute per-item components client-side from products
              if (!itemsFromPf || itemsFromPf.length === 0) {
                itemsFromPf = (finalOrder.items || []).map(it => {
                  const prod = products.find(p => p.id === it.productId) || {};
                  const comps = calculatePerItemComponents(prod);
                  const qty = it.quantity || 1;
                  const lineTotal = (Number(comps.packing || 0) + Number(comps.transportation || 0) + Number(comps.warehousing || 0)) * qty;
                  return {
                    productId: it.productId,
                    name: it.name || prod.name || 'Item',
                    quantity: qty,
                    itemPackingPerItem: comps.packing || 0,
                    transportationPerItem: comps.transportation || 0,
                    warehousingPerItem: comps.warehousing || 0,
                    lineTotal: Number(lineTotal.toFixed(2)),
                  };
                });
              }
              finalOrder = {
                ...finalOrder,
                packingDetails: itemsFromPf || finalOrder.packingDetails || [],
                boxFee: pf.boxFee !== undefined ? pf.boxFee : finalOrder.boxFee,
                boxCutting: pf.boxCutting !== undefined ? pf.boxCutting : finalOrder.boxCutting,
                trackingFee: pf.trackingFee !== undefined ? pf.trackingFee : finalOrder.trackingFee,
                totalPackingFee: pf.totalPackingFee !== undefined ? pf.totalPackingFee : finalOrder.totalPackingFee,
                totalWeightKg: pf.totalWeightKg !== undefined ? pf.totalWeightKg : finalOrder.totalWeightKg,
              };
            }
          }
        }
        setOrderDetails(finalOrder);
      } catch (e) {
        // ignore - keep showing local order
        console.warn('Failed to fetch server order for details view', e);
      }
    })();
  };

  // Helpers for formatting in Order Details dialog
  const formatDateTime = (val) => {
    if (!val) return 'N/A';
    const d = parseDateSafe(val) || parseDateSafe((val + '').replace(' ', 'T'));
    if (!d) return 'N/A';
    const z = (n) => (n < 10 ? '0' + n : n);
    const day = z(d.getDate());
    const month = z(d.getMonth() + 1);
    const year = d.getFullYear();
    const hours = z(d.getHours());
    const minutes = z(d.getMinutes());
    const seconds = z(d.getSeconds());
    return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
  };

  const computeWeight = (o) => {
    if (!o) return null;
    if (o.packedweight !== undefined && o.packedweight !== null && o.packedweight !== '') {
      const parsed = parseFloat(o.packedweight);
      return (isFinite(parsed) && !isNaN(parsed)) ? parsed : 0;
    }
    if (o.totalWeightKg !== undefined && o.totalWeightKg !== null && o.totalWeightKg !== '') {
      const parsed = parseFloat(o.totalWeightKg);
      return (isFinite(parsed) && !isNaN(parsed)) ? parsed : 0;
    }
    let perItemsSum = 0;
    let foundAny = false;
    (o.items || []).forEach(it => {
      if (it && (it.weightKg !== undefined && it.weightKg !== null && it.weightKg !== '')) {
        const v = parseFloat(it.weightKg);
        if (isFinite(v) && !isNaN(v)) {
          perItemsSum += v * (it.quantity || 1);
          foundAny = true;
        }
      } else {
        const prod = products.find(p => p.id === it.productId) || {};
        const actual = prod.weightKg || 0;
        const vol = calculateVolumetricWeight(prod.lengthCm || 0, prod.breadthCm || 0, prod.heightCm || 0);
        const perItem = Math.max(actual, vol);
        perItemsSum += perItem * (it.quantity || 1);
      }
    });
    return (foundAny || perItemsSum > 0) ? perItemsSum : null;
  };

  const computePackingFee = (o) => {
    if (!o) return 'N/A';
    // Item-wise fees broken into components
    const itemComponents = (o.items || []).reduce((acc, item) => {
      const prod = products.find(p => p.id === item.productId);
      if (!prod) return acc;
      const comps = calculatePerItemComponents(prod);
      const qty = item.quantity || 0;
      acc.packing += comps.packing * qty;
      acc.transportation += comps.transportation * qty;
      acc.warehousing += comps.warehousing * qty;
      return acc;
    }, { packing: 0, transportation: 0, warehousing: 0 });
    const itemsFee = itemComponents.packing + itemComponents.transportation + itemComponents.warehousing;
    // Box and tracking fees
    const boxFeeVal = Number(o.boxFee) || 0;
    const boxCuttingVal = o.boxCutting ? 1 : 0; // boolean
    const trackingFee = 3; // fixed ₹3 tracking fee per order
    const boxTotal = boxFeeVal + (boxCuttingVal ? 2 : 0) + trackingFee;
    const total = itemsFee + boxTotal;
    return isFinite(total) ? `₹${total.toFixed(2)}` : 'N/A';
  };

  // Fetch a fresh order document directly from the backend (reads DB)
  const fetchOrderFromServer = async (orderId) => {
    try {
      const res = await fetch(`https://forwokbackend-1.onrender.com/api/orders-debug/${orderId}`);
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Failed to fetch order ${orderId}: ${res.status} ${res.statusText} ${txt}`);
      }
      const body = await res.json();
      return body && body.order ? body.order : null;
    } catch (err) {
      console.error('fetchOrderFromServer error', err);
      return null;
    }
  };

  // Fetch PackingFee document for an order from the backend
  const fetchPackingFeeFromServer = async (orderId) => {
    if (!orderId) return null;
    try {
      const isLocalDev = typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost' && window.location.port === '5173';
      const apiBase = isLocalDev ? 'https://forwokbackend-1.onrender.com' : '';
      const singleUrl = `${apiBase}/api/packingfees/${encodeURIComponent(orderId)}`;
      console.log('Admin: fetching packing fee for order', orderId, 'from', singleUrl);
      const res = await fetch(singleUrl, { cache: 'no-store' });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Failed to fetch packingfee ${orderId}: ${res.status} ${res.statusText} ${txt}`);
      }
      const body = await res.json();
      console.log('Admin: packing fee single response for', orderId, body);
      // Normalize various possible shapes into a consistent object
      if (!body) return null;
      let pf = null;
      if (body.packingFee) pf = body.packingFee;
      else if (body.packingfee) pf = body.packingfee;
      else if (body.map && (body.map.items || body.map[orderId])) pf = body.map[orderId] ?? body.map;
      else if (typeof body === 'number') pf = { totalPackingFee: Number(body) };
      else pf = body;
      const normalized = {
        totalPackingFee: Number(pf.totalPackingFee ?? pf.total ?? 0),
        boxFee: Number(pf.boxFee ?? pf.box_fee ?? 0) || 0,
        boxCutting: (pf.boxCutting ?? pf.box_cutting ?? pf.box_cut) ? true : false,
        trackingFee: Number(pf.trackingFee ?? pf.tracking_fee ?? 3),
        totalWeightKg: pf.totalWeightKg !== undefined ? Number(pf.totalWeightKg) : (pf.total_weight_kg !== undefined ? Number(pf.total_weight_kg) : undefined),
        items: pf.items ?? pf.products ?? [],
        raw: pf
      };
      return normalized;
    } catch (err) {
      console.warn('fetchPackingFeeFromServer error', err);
      return null;
    }
  };

  // Function to save the tracking code to the database
  const saveTrackingCode = async (orderId, trackingCode) => {
    try {
      const response = await fetch(`https://forwokbackend-1.onrender.com/api/orders/${orderId}/tracking-code`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trackingCode }),
      });

      if (!response.ok) {
        throw new Error('Failed to save tracking code');
      }

      toast({ title: 'Success', description: 'Tracking code saved successfully.' });
    } catch (error) {
      console.error('Error saving tracking code:', error);
      toast({ title: 'Error', description: 'Failed to save tracking code.', variant: 'destructive' });
    }
  };

  // Simple, self-contained saver: PATCH tracking code directly for selected orders
  // This function does not integrate with updateOrder/dispatchOrder and only saves trackingCode field
  const saveTrackingCodesDirect = async () => {
    console.log('saveTrackingCodesDirect called', { selectedOrderIds, trackingCodes });
    if (!selectedOrderIds || selectedOrderIds.length === 0) {
      toast({ title: 'No Orders', description: 'No orders selected to save tracking codes for.', variant: 'destructive' });
      return;
    }
    try {
      let anySent = false;
      for (const id of selectedOrderIds) {
        const code = trackingCodes && trackingCodes[id] ? String(trackingCodes[id]).trim() : '';
        if (!code) {
          console.log(`Skipping order ${id} because no tracking code entered.`);
          continue; // skip empty entries to avoid server 400
        }
        anySent = true;
        console.log(`Saving tracking code for ${id}:`, code);
        const res = await fetch(`https://forwokbackend-1.onrender.com/api/orders/${id}/tracking-code`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackingCode: code }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          console.error(`Failed to save tracking code for ${id}:`, res.status, res.statusText, text);
          toast({ title: 'Error', description: `Failed to save tracking for ${id}.`, variant: 'destructive' });
          continue;
        }
        // Optionally read response
        const body = await res.json().catch(() => null);
        console.log(`Saved tracking code for ${id}`, body);
        // Fetch the fresh order document directly from the DB via debug endpoint
        try {
          const fresh = await fetchOrderFromServer(id);
          if (fresh && typeof replaceOrder === 'function') replaceOrder(fresh);
          if (orderDetails && orderDetails.id === id) setOrderDetails(fresh || orderDetails);
        } catch (e) {
          console.warn('Failed to fetch fresh order from server after saving tracking code', e);
          // Fallback to using server-returned body.order if present
          try {
            if (body && body.order && typeof replaceOrder === 'function') replaceOrder(body.order);
            if (orderDetails && orderDetails.id === id) setOrderDetails(body && body.order ? body.order : orderDetails);
          } catch (ee) {
            console.warn('Fallback replace failed', ee);
          }
        }
        toast({ title: 'Saved', description: `Tracking code saved for ${id}.` });
      }
      if (!anySent) {
        toast({ title: 'No Codes', description: 'No tracking codes entered. Nothing saved.', variant: 'warning' });
        return;
      }
      // Close dialog and clear entered codes (keeps UI simple)
      setIsTrackingCodeDialogOpen(false);
      setTrackingCodes({});
      setSelectedOrderIds([]);
    } catch (err) {
      console.error('Error saving tracking codes directly:', err);
      toast({ title: 'Error', description: 'Failed to save some tracking codes.', variant: 'destructive' });
    }
  };
  // Save entered tracking codes and mark selected orders as dispatched with timestamp
  const saveTrackingCodesAndDispatch = async () => {
    console.log('saveTrackingCodesAndDispatch called', { selectedOrderIds, trackingCodes });
    if (!selectedOrderIds || selectedOrderIds.length === 0) {
      toast({ title: 'No Orders', description: 'No orders selected to dispatch.', variant: 'destructive' });
      return;
    }
    try {
      let anySent = false;
      const dispatchedAt = new Date().toISOString();
      for (const id of selectedOrderIds) {
        const code = trackingCodes && trackingCodes[id] ? String(trackingCodes[id]).trim() : '';
        const order = orders.find(o => o.id === id) || {};
        const finalCode = code || order.trackingCode || '';
        if (!finalCode) {
          toast({ title: 'Error', description: `Tracking code required for order ${id}.`, variant: 'destructive' });
          setIsTrackingCodeDialogOpen(true);
          return;
        }
        anySent = true;
        if (typeof updateOrder === 'function') {
          try {
            const saved = await updateOrder(id, { trackingCode: finalCode, status: 'dispatched', dispatchedAt });
            console.log('Dispatched order saved via updateOrder', id, saved);
            if (saved && typeof replaceOrder === 'function') replaceOrder(saved);
            if (orderDetails && orderDetails.id === id && saved) setOrderDetails(saved);
          } catch (err) {
            console.error('Failed updateOrder for dispatch', id, err);
            await fetch(`https://forwokbackend-1.onrender.com/api/orders/${id}/tracking-code`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ trackingCode: finalCode }),
            });
            await fetch(`https://forwokbackend-1.onrender.com/api/orders/${id}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'dispatched', dispatchedAt }),
            });
          }
        } else {
          await fetch(`https://forwokbackend-1.onrender.com/api/orders/${id}/tracking-code`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ trackingCode: finalCode }),
          });
          await fetch(`https://forwokbackend-1.onrender.com/api/orders/${id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'dispatched', dispatchedAt }),
          });
        }
      }
      if (!anySent) {
        toast({ title: 'No Codes', description: 'No tracking codes entered. Nothing dispatched.', variant: 'warning' });
        return;
      }
      toast({ title: 'Dispatched', description: `Marked ${selectedOrderIds.length} order(s) as dispatched.` });
      setSelectedOrderIds([]);
      setTrackingCodes({});
      setIsTrackingCodeDialogOpen(false);
    } catch (err) {
      console.error('Error saving tracking codes and dispatching:', err);
      toast({ title: 'Error', description: 'Failed to dispatch some orders.', variant: 'destructive' });
    }
  };

  // Improved: save tracking code via PATCH, then refresh order locally via PUT to ensure UI updates
  const saveTrackingCodeAndRefresh = async (orderId, trackingCode) => {
    // Simpler: use the existing updateOrder (PUT) which updates trackingCode and returns saved order
    try {
      if (typeof updateOrder === 'function') {
        const saved = await updateOrder(orderId, { trackingCode });
        // updateOrder already refreshes local state and calls fetchAllData, so also refresh orderDetails if needed
        try {
          if (orderDetails && orderDetails.id === orderId && saved) setOrderDetails(saved);
        } catch (e) {
          console.warn('Failed to refresh orderDetails after updateOrder:', e);
        }
        return saved;
      }

      // Fallback: PATCH endpoint if updateOrder is not available (save tracking code only)
      const response = await fetch(`https://forwokbackend-1.onrender.com/api/orders/${orderId}/tracking-code`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackingCode }),
      });
      if (!response.ok) throw new Error('Failed to save tracking code via PATCH');
      const body = await response.json();
      if (body && body.order && typeof replaceOrder === 'function') {
        replaceOrder(body.order);
        if (orderDetails && orderDetails.id === orderId) setOrderDetails(body.order);
        return body.order;
      }
      toast({ title: 'Success', description: 'Tracking code saved and UI refreshed.' });
      return null;
    } catch (err) {
      console.error('Error saving tracking code and refreshing:', err);
      toast({ title: 'Error', description: 'Failed to save tracking code.', variant: 'destructive' });
      return null;
    }
  };

  // Function to handle saving a new order
  const handleSaveNewOrder = async () => {
    try {
      console.log('Save button clicked'); // Log button click

      // Validate required fields
      if (!selectedMerchantId || !newCustomerName || !newAddress || !newCity || !newState || !newPincode || !newPhone || !newDeliveryPartner || newItems.length === 0) {
        toast({ title: 'Error', description: 'Please fill in all required fields.', variant: 'destructive' });
        console.error('Validation failed: Missing required fields'); // Log validation failure
        return;
      }

      // Generate a unique ID for the new order
      const uniqueId = `ord-${Date.now()}`;

      // Prepare order data
      const newOrder = {
        id: uniqueId, // Include the generated ID
        merchantId: selectedMerchantId,
        customerName: newCustomerName,
        address: newAddress,
        city: newCity,
        state: newState,
        pincode: newPincode,
        phone: newPhone,
        deliveryPartner: newDeliveryPartner,
        items: newItems,
      };

      console.log('Prepared order data:', newOrder); // Log the prepared order data

      // Call backend API to save the order
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOrder),
      });

      console.log('API call made to /api/orders'); // Log API call
      console.log('API response status:', response.status); // Log the response status

      if (!response.ok) {
        const errorData = await response.json();
        console.error('API error:', errorData); // Log the error response
        toast({ title: 'Error', description: `Failed to save the order: ${errorData.error || 'Unknown error'}`, variant: 'destructive' });
        return;
      }

      const responseData = await response.json();
      console.log('API response data:', responseData); // Log the response data

      toast({ title: 'Success', description: 'Order added successfully.' });
      setIsAddOrderOpen(false); // Close the dialog

      // Reset form fields
      setSelectedMerchantId(null);
      setNewCustomerName('');
      setNewAddress('');
      setNewCity('');
      setNewState('');
      setNewPincode('');
      setNewPhone('');
      setNewDeliveryPartner('');
      setNewItems([]);
    } catch (error) {
      console.error('Unexpected error saving new order:', error); // Log unexpected errors
      toast({ title: 'Error', description: 'Failed to save the order.', variant: 'destructive' });
    }
  };

  return (
    <div className="p-2 sm:p-6 space-y-6">
      {/* Tracking Code Dialog */}
      <Dialog open={isTrackingCodeDialogOpen} onOpenChange={setIsTrackingCodeDialogOpen}>
        <DialogContent className="max-w-2xl" aria-describedby="tracking-code-description">
          <DialogTitle>Enter Tracking Codes</DialogTitle>
          <DialogDescription id="tracking-code-description">
            Provide tracking codes for the selected orders.
          </DialogDescription>
          <div className="space-y-4">
            {selectedOrderIds.map((id) => (
              <div key={id} className="flex items-center gap-2">
                <Label htmlFor={`tracking-${id}`}>Order ID: {id}</Label>
                <Input
                  id={`tracking-${id}`}
                  value={trackingCodes[id] || ''}
                  onChange={(e) => setTrackingCodes((prev) => ({ ...prev, [id]: e.target.value }))}
                  placeholder="Enter tracking code"
                />
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsTrackingCodeDialogOpen(false)}>Cancel</Button>
            <Button onClick={saveTrackingCodesAndDispatch}>Dispatch</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Weight Dialog (for Mark Packed) */}
      <Dialog open={isWeightDialogOpen} onOpenChange={setIsWeightDialogOpen}>
        <DialogContent className="max-w-2xl" aria-describedby="weight-dialog-description">
          <DialogTitle>Enter Weights / Mark Packed</DialogTitle>
          <DialogDescription id="weight-dialog-description">
            Enter total weight (kg) for the selected orders, then click Mark Packed.
          </DialogDescription>
          <div className="space-y-4">
            {(ordersForWeightUpdate || []).map((order) => (
              <div key={order.id} className="flex flex-col sm:flex-row sm:items-center gap-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor={`weight-${order.id}`}>Order ID: {order.id}</Label>
                  <Input
                    id={`weight-${order.id}`}
                    type="number"
                    step="0.001"
                    value={weights[order.id] || ''}
                    onChange={(e) => setWeights((prev) => ({ ...prev, [order.id]: e.target.value }))}
                    placeholder="Weight (kg)"
                    className="w-40"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`boxFee-${order.id}`}>Box Fee (₹)</Label>
                  <Input
                    id={`boxFee-${order.id}`}
                    type="number"
                    step="0.01"
                    value={boxFees[order.id] ?? (packingFeesByOrder && packingFeesByOrder[order.id] && packingFeesByOrder[order.id].boxFee !== undefined ? String(packingFeesByOrder[order.id].boxFee) : (order.boxFee !== undefined ? String(order.boxFee) : ''))}
                    onChange={(e) => setBoxFees((prev) => ({ ...prev, [order.id]: e.target.value }))}
                    placeholder="e.g. 10.00"
                    className="w-32"
                  />
                  <Label htmlFor={`boxCutting-${order.id}`} className="flex items-center gap-1">
                    <input
                      id={`boxCutting-${order.id}`}
                      type="checkbox"
                      checked={boxCuttings[order.id] ?? (packingFeesByOrder && packingFeesByOrder[order.id] && packingFeesByOrder[order.id].boxCutting !== undefined ? Boolean(packingFeesByOrder[order.id].boxCutting) : Boolean(order.boxCutting))}
                      onChange={(e) => setBoxCuttings((prev) => ({ ...prev, [order.id]: e.target.checked }))}
                    />
                    <span className="text-sm">Box Cutting (+₹2)</span>
                  </Label>
                </div>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => { setIsWeightDialogOpen(false); setOrdersForWeightUpdate([]); setWeights({}); }}>Cancel</Button>
            <Button onClick={handleConfirmMarkPacked}>Mark Packed</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Order Details Dialog */}
      <Dialog open={isOrderDetailsDialogOpen} onOpenChange={setIsOrderDetailsDialogOpen}>
        <DialogContent className="max-w-full sm:max-w-lg p-4 sm:p-6 bg-white rounded-lg shadow-md" aria-describedby="order-details-description">
            <DialogTitle className="text-xl font-bold text-gray-800">Order Details</DialogTitle>
            <DialogDescription id="order-details-description" className="text-sm text-gray-600 mb-4">
              Details for Order ID: <span className="font-medium text-gray-800">{orderDetails?.id || 'N/A'}</span>
            </DialogDescription>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div>
                  <div className="text-xs text-gray-500">Customer</div>
                  <div className="font-medium text-gray-800">{orderDetails?.customerName || <span className="italic text-gray-400">No name</span>}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Phone</div>
                  <div className="text-gray-800">{orderDetails?.phone || 'N/A'}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Address</div>
                  <div className="text-gray-800">{orderDetails ? `${orderDetails.address || ''}${orderDetails.city ? ', ' + orderDetails.city : ''}${orderDetails.state ? ', ' + orderDetails.state : ''}${orderDetails.pincode ? ' — PIN: ' + orderDetails.pincode : ''}` : 'N/A'}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <div className="text-xs text-gray-500">Date & Time</div>
                  <div className="text-gray-800">{formatDateTime(orderDetails?.date || orderDetails?.createdAt)}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Courier Partner</div>
                  <div className="text-gray-800">{orderDetails?.deliveryPartner || <span className="italic text-gray-400">pending</span>}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Weight (kg)</div>
                  <div className="text-gray-800">{(() => { const w = computeWeight(orderDetails); return w !== null ? Number(w).toFixed(3) : 'N/A'; })()}</div>
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-gray-500">Packing Fee</div>
                <div className="text-gray-800">{(() => {
                  // Prefer authoritative server value when available on the order or fetched packingFees map
                  const serverVal = orderDetails && (orderDetails.totalPackingFee !== undefined && orderDetails.totalPackingFee !== null
                    ? orderDetails.totalPackingFee
                    : (orderDetails.packingFee !== undefined && orderDetails.packingFee !== null ? orderDetails.packingFee : undefined));
                  if (serverVal !== undefined) {
                    return `₹${Number(serverVal).toFixed(2)}`;
                  }
                  // fallback to batch fetched packing fees map (if this dialog was opened after batch fetch)
                  const backendMapVal = orderDetails && packingFeesByOrder[orderDetails.id];
                  if (backendMapVal !== undefined && backendMapVal !== null) {
                    const backendTotal = (backendMapVal && backendMapVal.totalPackingFee !== undefined) ? backendMapVal.totalPackingFee : (typeof backendMapVal === 'number' ? backendMapVal : undefined);
                    if (backendTotal !== undefined && backendTotal !== null) return `₹${Number(backendTotal).toFixed(2)}`;
                  }
                  // final fallback: compute client-side from product metadata
                  return computePackingFee(orderDetails);
                })()}</div>
                {/* Price breakup: show per-item components and order-level extras when available */}
                {(orderDetails?.packingDetails && orderDetails.packingDetails.length > 0) ? (
                  <div className="mt-3 bg-gray-50 p-4 sm:p-6 rounded">
                    <div className="text-base sm:text-lg font-semibold mb-3">Price Breakup</div>
                    <div>
                      {/* Desktop / tablet: table view */}
                      <div className="hidden sm:block w-full overflow-x-auto">
                        <table className="w-full text-base">
                          <thead>
                            <tr className="text-left text-sm text-gray-600">
                              <th className="pb-2">Item</th>
                              <th className="pb-2">Qty</th>
                              <th className="pb-2">Packing</th>
                              <th className="pb-2">Transport</th>
                              <th className="pb-2">Warehousing</th>
                              <th className="pb-2">Line Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {orderDetails.packingDetails.map((it, idx) => (
                              <tr key={idx} className="border-t border-gray-100">
                                <td className="py-3 text-base">{it.name || 'Item'}</td>
                                <td className="py-3 text-base">{it.quantity || 1}</td>
                                <td className="py-3 text-base">₹{(Number(it.itemPackingPerItem || 0)).toFixed(2)}</td>
                                <td className="py-3 text-base">₹{(Number(it.transportationPerItem || 0)).toFixed(2)}</td>
                                <td className="py-3 text-base">₹{(Number(it.warehousingPerItem || 0)).toFixed(2)}</td>
                                <td className="py-3 text-base">₹{(Number(it.lineTotal || 0)).toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {/* Mobile: stacked view */}
                      <div className="sm:hidden space-y-3">
                        {orderDetails.packingDetails.map((it, idx) => (
                          <div key={idx} className="p-3 bg-white border border-gray-100 rounded">
                            <div className="flex justify-between items-center">
                              <div className="font-medium text-base">{it.name || 'Item'}</div>
                              <div className="text-sm text-gray-600">x{it.quantity || 1}</div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-3 text-base text-gray-800">
                              <div className="flex justify-between"><span>Packing</span><span>₹{(Number(it.itemPackingPerItem || 0)).toFixed(2)}</span></div>
                              <div className="flex justify-between"><span>Transport</span><span>₹{(Number(it.transportationPerItem || 0)).toFixed(2)}</span></div>
                              <div className="flex justify-between"><span>Warehousing</span><span>₹{(Number(it.warehousingPerItem || 0)).toFixed(2)}</span></div>
                              <div className="flex justify-between font-medium"><span>Line Total</span><span>₹{(Number(it.lineTotal || 0)).toFixed(2)}</span></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-3 text-sm">
                      <div className="flex justify-between"><span>Box Fee</span><span>₹{(Number(orderDetails.boxFee || 0)).toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Box Cutting</span><span>{orderDetails.boxCutting ? '₹2.00' : '₹0.00'}</span></div>
                      <div className="flex justify-between"><span>Tracking Fee</span><span>₹{(Number(orderDetails.trackingFee !== undefined ? orderDetails.trackingFee : 3)).toFixed(2)}</span></div>
                      <div className="flex justify-between font-medium mt-2">
                        <span>Total</span>
                        <span>{(() => {
                          const pd = orderDetails.packingDetails || [];
                          const lines = pd.reduce((s, i) => s + Number(i.lineTotal || 0), 0);
                          const box = Number(orderDetails.boxFee || 0);
                          const cutting = orderDetails.boxCutting ? 2 : 0;
                          const track = Number(orderDetails.trackingFee !== undefined ? orderDetails.trackingFee : 3);
                          const fallback = lines + box + cutting + track;
                          const total = (orderDetails.packingFee !== undefined && orderDetails.packingFee !== null)
                            ? Number(orderDetails.packingFee)
                            : (orderDetails.totalPackingFee !== undefined ? Number(orderDetails.totalPackingFee) : fallback);
                          return `₹${total.toFixed(2)}`;
                        })()}</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div>
                <div className="text-xs text-gray-500">Tracking Code</div>
                <div className="text-gray-800">{orderDetails?.trackingCode || <span className="italic text-gray-400">N/A</span>}</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs text-gray-500 mb-2">Status Timeline</div>
              <div className="space-y-2 bg-gray-50 p-3 rounded">
                <div className="flex justify-between"><span className="text-sm text-gray-600">Created</span><span className="text-sm font-medium">{formatDateTime(orderDetails?.createdAt || orderDetails?.date)}</span></div>
                <div className="flex justify-between"><span className="text-sm text-gray-600">Packed</span><span className={`text-sm ${orderDetails?.packedAt ? 'font-medium text-gray-800' : 'italic text-gray-400'}`}>{orderDetails?.packedAt ? formatDateTime(orderDetails.packedAt) : 'pending'}</span></div>
                <div className="flex justify-between"><span className="text-sm text-gray-600">Dispatched</span><span className={`text-sm ${orderDetails?.dispatchedAt ? 'font-medium text-gray-800' : 'italic text-gray-400'}`}>{orderDetails?.dispatchedAt ? formatDateTime(orderDetails.dispatchedAt) : 'pending'}</span></div>
                <div className="flex justify-between"><span className="text-sm text-gray-600">Delivered</span><span className={`text-sm ${orderDetails?.deliveredAt ? 'font-medium text-gray-800' : 'italic text-gray-400'}`}>{orderDetails?.deliveredAt ? formatDateTime(orderDetails.deliveredAt) : 'pending'}</span></div>
              </div>
            </div>

            <div className="mt-4">
              <div className="text-xs text-gray-500 mb-2">Items</div>
              <ul className="divide-y divide-gray-100 bg-white rounded shadow-sm">
                {(orderDetails?.items || []).length === 0 ? (
                  <li className="px-4 py-3 italic text-gray-400">No items marked</li>
                ) : (
                  (orderDetails.items || []).map((item, index) => (
                    <li key={index} className="flex justify-between items-center px-4 py-3">
                      <span className="text-gray-800">{item.name || item.title || 'Item'}</span>
                      <span className="text-sm text-gray-600">x{item.quantity || 1}</span>
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              {orderDetails && (
                <Button className="px-4 py-2 text-sm" onClick={() => openAdminEditDialog(orderDetails)}>Edit</Button>
              )}
              <Button variant="outline" className="px-4 py-2 text-sm" onClick={() => setIsOrderDetailsDialogOpen(false)}>Close</Button>
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
                     // Prefer showing the packer's entered weight (`packedweight`).
                     // If not present, fall back to `totalWeightKg`, then to per-item `weightKg` / product weights, otherwise show 'N/A'.
                     let computedWeightValue = null;
                     if (order.packedweight !== undefined && order.packedweight !== null && order.packedweight !== '') {
                       const parsed = parseFloat(order.packedweight);
                       computedWeightValue = (isFinite(parsed) && !isNaN(parsed)) ? parsed : 0;
                     } else if (order.totalWeightKg !== undefined && order.totalWeightKg !== null && order.totalWeightKg !== '') {
                       const parsed = parseFloat(order.totalWeightKg);
                       computedWeightValue = (isFinite(parsed) && !isNaN(parsed)) ? parsed : 0;
                     } else {
                       // Sum per-item weightKg if available, else compute from product metadata
                       let perItemsSum = 0;
                       let foundAny = false;
                       (order.items || []).forEach(it => {
                         if (it && (it.weightKg !== undefined && it.weightKg !== null && it.weightKg !== '')) {
                           const v = parseFloat(it.weightKg);
                           if (isFinite(v) && !isNaN(v)) {
                             perItemsSum += v * (it.quantity || 1);
                             foundAny = true;
                           }
                         } else {
                           const prod = products.find(p => p.id === it.productId) || {};
                           const actual = prod.weightKg || 0;
                           const vol = calculateVolumetricWeight(prod.lengthCm || 0, prod.breadthCm || 0, prod.heightCm || 0);
                           const perItem = Math.max(actual, vol);
                           perItemsSum += perItem * (it.quantity || 1);
                         }
                       });
                       if (foundAny || perItemsSum > 0) computedWeightValue = perItemsSum;
                       else computedWeightValue = null;
                     }
                      const computedPackingFee = (order.items || []).reduce((sum, item) => {
                        const prod = products.find(p => p.id === item.productId);
                        if (!prod) return sum;
                        const fee = calculatePerItemTotalFee(prod);
                        return sum + fee * (item.quantity || 0);
                      }, 0);
                      const packingFee = (order.packingFee !== undefined && order.packingFee !== null && order.packingFee !== '') ? Number(order.packingFee) : computedPackingFee;
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
                       <TableCell>
                         <Button variant="link" onClick={() => openOrderDetails(order)}>{order.id}</Button>
                       </TableCell>
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
                       <TableCell>{computedWeightValue !== null ? computedWeightValue.toFixed(3) : 'N/A'}</TableCell>
                      <TableCell>
                        {String(order.status || '').toLowerCase() === 'pending'
                          ? 'packing fee pending'
                          : (() => {
                              // Prefer backend `totalPackingFee` from packingfees collection when available
                              const backendValue = packingFeesByOrder[order.id];
                              if (backendValue !== undefined && backendValue !== null) {
                                const backendTotal = (backendValue && backendValue.totalPackingFee !== undefined) ? backendValue.totalPackingFee : (typeof backendValue === 'number' ? backendValue : undefined);
                                if (backendTotal !== undefined && backendTotal !== null) return `₹${Number(backendTotal).toFixed(2)}`;
                              }
                              const orderHasPacking = (order.packingFee !== undefined && order.packingFee !== null && order.packingFee !== '');
                              const amount = orderHasPacking ? Number(order.packingFee) : Number(computedPackingFee || 0);
                              return `₹${(isFinite(amount) ? amount : 0).toFixed(2)}`;
                            })()}
                      </TableCell>
                       <TableCell>
                         <StatusTimelineDropdown order={order} />
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
             Add order manually.
           </DialogDescription>
           <div className="mt-4">
             <div className="flex space-x-4 border-b border-gray-300">
               <button
                 className={`px-4 py-2 font-semibold ${addOrderTab === 'manual' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-600'}`}
                 onClick={() => setAddOrderTab('manual')}
               >
                 Manual Entry
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
                       {/* Add Tracking Code input box to Manual Entry form */}
                       {isEditingOrder && (
  <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
    <div className="flex-1">
      <Label htmlFor="trackingCode" className="block mb-1 font-medium text-gray-700">Tracking Code</Label>
      <Input
        id="trackingCode"
        value={newTrackingCode}
        onChange={(e) => setNewTrackingCode(e.target.value)}
        placeholder="Enter Tracking Code"
        className="block w-full border border-gray-300 rounded px-3 py-2 text-sm"
      />
    </div>
  </div>
)}
                     </div>
                   )}
             
             <div className="mt-4 flex justify-end space-x-2">
               <Button variant="outline" onClick={() => setIsAddOrderOpen(false)}>Cancel</Button>
               <Button
  className="px-4 py-2 bg-blue-600 text-white text-sm rounded"
  onClick={async () => {
      if (isEditingOrder && editOrderId) {
      await saveTrackingCodeAndRefresh(editOrderId, newTrackingCode);
    }
    setIsAddOrderOpen(false);
  }}
>
  Save
</Button>
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

// Example data structure for testing
const testData = {
  shipping_address: {
    name: "kjhj",
    address1: "oksokzdod",
    address2: "",
    city: "osadij",
    province: "doaisj",
    zip: "109832",
    phone: "1321309832",
  },
  order: {
    name: "ord-1764304917963",
    created_at: "2025-11-28",
  },
};

// Test the template rendering
const template = `
  <strong>City:</strong> {{ shipping_address.city }}<br>
  <strong>State:</strong> {{ shipping_address.province }}<br>
  <strong>PIN:</strong> {{ shipping_address.zip }}<br>
`;

const rendered = renderTemplate(template, testData);
console.log("Rendered Template:", rendered);
