import React, { useState, useEffect, useRef } from 'react';
import { useInventory } from '../context/inventory-context.jsx';
import { Button } from '../components/ui/button.jsx';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from '../components/ui/dialog.jsx';
import { useToast } from '../components/ui/use-toast';
import { Input } from '../components/ui/input.jsx';
import { Label } from '../components/ui/label.jsx';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '../components/ui/select.jsx';
import { Card, CardContent, CardHeader } from '../components/ui/card.jsx';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs.jsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table.jsx';
import { calculateVolumetricWeight, calculateDispatchFee } from '../lib/utils.js';
import { jsPDF } from 'jspdf'; // using jsPDF to generate merged N-up labels
import html2canvas from 'html2canvas';
import { StatusTimelineDropdown } from '../components/StatusTimelineDropdown.jsx';
  // Template rendering function with basic Liquid-like support
  const renderTemplate = (tpl, initialData = {}) => {
    const src = String(tpl || '');
    const ctx = { ...initialData };

    const resolvePath = (path, localCtx = ctx) => {
      if (!path) return undefined;
      const parts = path.trim().split('.');
      let cur = localCtx;
      for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
      }
      return cur;
    };

    const applyFilters = (value, filters = []) => {
      return filters.reduce((val, f) => {
        const [name, arg] = f.split(':').map(s => s.trim());
        if (name === 'default') {
          const def = (arg || '').replace(/^['"]|['"]$/g, '');
          return (val === undefined || val === null || val === '') ? (resolvePath(def) ?? def) : val;
        }
        if (name === 'date') {
          try { return val ? new Date(val).toLocaleDateString() : val; } catch { return val; }
        }
        if (name === 'plus') {
          return (Number(val) || 0) + (Number(arg) || 0);
        }
        if (name === 'size') {
          return Array.isArray(val) ? val.length : (typeof val === 'string' ? val.length : 0);
        }
        return val;
      }, value);
    };

    // Process assign tags
    const processAssign = (t) => t.replace(/{%\s*assign\s+(\w+)\s*=\s*([^%]+?)\s*%}/g, (_, name, expr) => {
      const parts = expr.split('|').map(s => s.trim());
      const path = parts[0];
      const filters = parts.slice(1);
      const raw = resolvePath(path);
      const val = raw === undefined ? path.replace(/^['"]|['"]$/g, '') : raw;
      ctx[name] = applyFilters(val, filters);
      return '';
    });

    const processIfUnless = (t) => {
      // if/else/endif
      t = t.replace(/{%\s*if\s+([^%]+?)\s*%}([\s\S]*?)(?:{%\s*else\s*%}([\s\S]*?))?{%\s*endif\s*%}/g, (_, cond, ifContent, elseContent = '') => {
        const m = cond.match(/^(.+?)\s*(!=|==)\s*blank$/);
        if (m) {
          const [, left, op] = m;
          const v = resolvePath(left);
          const isEmpty = v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
          return (op === '!=') ? (isEmpty ? elseContent : ifContent) : (isEmpty ? ifContent : elseContent);
        }
        const truthy = Boolean(resolvePath(cond.trim()));
        return truthy ? ifContent : elseContent;
      });

      // unless ... endunless
      t = t.replace(/{%\s*unless\s+([^%]+?)\s*%}([\s\S]*?){%\s*endunless\s*%}/g, (_, cond, content) => {
        const truthy = Boolean(resolvePath(cond.trim()));
        return truthy ? '' : content;
      });

      return t;
    };

    const processFor = (t) => {
      return t.replace(/{%\s*for\s+(\w+)\s+in\s+([\w.]+)\s*%}([\s\S]*?){%\s*endfor\s*%}/g, (_, itemVar, collection, inner) => {
        const list = resolvePath(collection) || [];
        if (!Array.isArray(list)) return '';
        return list.map(item => {
          const localCtx = { ...ctx, [itemVar]: item };
          return renderTemplate(inner, localCtx);
        }).join('\n');
      });
    };

    const processVars = (t) => t.replace(/{{\s*([^}]+?)\s*}}/g, (_, expr) => {
      const parts = expr.split('|').map(p => p.trim());
      const path = parts[0];
      const filters = parts.slice(1);
      const val = resolvePath(path);
      const out = applyFilters(val, filters);
      return out == null ? '' : String(out);
    });

    // Run processors in order: assign -> if/unless -> for -> vars
    let out = src;
    out = processAssign(out);
    // repeat conditionals/for loops to handle nesting
    let prev;
    do {
      prev = out;
      out = processIfUnless(out);
      out = processFor(out);
    } while (out !== prev);
    out = processVars(out);

    return out;
  };

  const MerchantOrders = () => {
    const { orders, addOrder, updateOrder, removeOrder, products, currentUser, inventory, addReturnOrder } = useInventory();
    const { toast } = useToast();
    const templateStorageKey = currentUser ? `shipping_label_template_${currentUser.id}` : 'shipping_label_template_default';

    const [activeTab, setActiveTab] = useState('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isReturnDialogOpen, setIsReturnDialogOpen] = useState(false);
  
  // Function to open preview window for shipping label
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

  // Edit order dialog state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editOrder, setEditOrder] = useState(null);
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editState, setEditState] = useState('');
  const [editPincode, setEditPincode] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editItems, setEditItems] = useState([]);
  const [editDeliveryPartner, setEditDeliveryPartner] = useState('');

  // New UI state: search and date range filter
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('all'); // 'all','today','yesterday','last7','last30','custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Function to download shipping label PDF from base64 string
  const downloadShippingLabel = (base64String, orderId) => {
    if (!base64String) {
      alert('No shipping label available for this order.');
      return;
    }
    // Remove the data URL prefix if present
    const base64Data = base64String.split(',')[1] || base64String;
    const link = document.createElement('a');
    link.href = `data:application/pdf;base64,${base64Data}`;
    link.download = `shipping_label_${orderId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // States for Add Order dialog
  const [mode, setMode] = useState('manual'); // 'manual' or 'upload'
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [pincode, setPincode] = useState('');
  const [phone, setPhone] = useState('');
  const [items, setItems] = useState([{ productId: '', quantity: 1 }]);
  const [shippingLabelFile, setShippingLabelFile] = useState(null);
  const [newDeliveryPartner, setNewDeliveryPartner] = useState('');

  // States for Return tab dialog
  const [returnItems, setReturnItems] = useState([{ productId: '', quantity: 1 }]);
  const [returnType, setReturnType] = useState('RTO'); // 'RTO' or 'Damaged'

  // Multi-select for merchant panel
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [expandedOrderIds, setExpandedOrderIds] = useState(new Set());

  // Mobile view detection and order details modal
  const [isMobileView, setIsMobileView] = useState(false);
  const [selectedOrderForModal, setSelectedOrderForModal] = useState(null);
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [packingFeesByOrder, setPackingFeesByOrder] = useState({});
  const packingFeesFetchedRef = useRef(false);

  useEffect(() => {
    const check = () => setIsMobileView(typeof window !== 'undefined' && window.innerWidth < 640);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Normalize status timeline from order object
  const getStatusTimeline = (order) => {
    if (!order) return [];
    // If there's already a timeline array, try to normalize it to our 4-step view
    const pickDate = (v) => {
      if (!v) return null;
      if (typeof v === 'string') return v;
      if (v.date) return v.date;
      if (v.timestamp) return v.timestamp;
      return null;
    };

    // helper to find in statusTimeline array by key or label
    const findInArray = (arr, key) => {
      if (!Array.isArray(arr)) return null;
      const found = arr.find(x => (x.status && x.status.toLowerCase().includes(key)) || (x.title && x.title.toLowerCase().includes(key)) || (String(x).toLowerCase().includes(key)));
      return found ? pickDate(found.date || found.timestamp || found) : null;
    };

    const source = order.statusTimeline || order.timeline || [];
    const created = order.createdAt || order.created_at || order.date || findInArray(source, 'created') || null;
    const packed = order.packedAt || order.packed_at || findInArray(source, 'packed') || (order.status === 'packed' ? (order.updatedAt || order.updated_at) : null) || null;
    const dispatched = order.dispatchedAt || order.dispatched_at || findInArray(source, 'dispatch') || (order.status === 'dispatched' ? (order.updatedAt || order.updated_at) : null) || null;
    const delivered = order.deliveredAt || order.delivered_at || findInArray(source, 'deliver') || (order.status === 'delivered' ? (order.updatedAt || order.updated_at) : null) || null;

    return [
      { key: 'created', label: 'Created', value: created || 'pending' },
      { key: 'packed', label: 'Packed', value: packed || 'pending' },
      { key: 'dispatched', label: 'Dispatched', value: dispatched || 'pending' },
      { key: 'delivered', label: 'Delivered', value: delivered || 'pending' },
    ];
  };

  const toggleExpandOrder = (orderId) => {
    setExpandedOrderIds(prev => {
      const ns = new Set(prev);
      if (ns.has(orderId)) ns.delete(orderId);
      else ns.add(orderId);
      return ns;
    });
  };

  // Calculate total per-item fees from product-level fields (falls back to legacy calculateDispatchFee)
  const calculatePerItemTotalFee = (prod) => {
    if (!prod) return 0;
    const actual = prod.weightKg || 0;
    const vol = calculateVolumetricWeight(prod.lengthCm || 0, prod.breadthCm || 0, prod.heightCm || 0);
    const basePacking = (prod.itemPackingFee !== undefined && prod.itemPackingFee !== null && prod.itemPackingFee !== '')
      ? Number(prod.itemPackingFee) || 0
      : calculateDispatchFee(actual, vol, prod.packingType || 'normal packing');
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

  const merchantOrders = orders.filter(o => o.merchantId === currentUser?.id);

  // Date range helpers
  const getRangeStartEnd = () => {
    const today = new Date();
    const startOfDay = d => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
    const endOfDay = d => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
    switch (dateFilter) {
      case 'today':
        return { start: startOfDay(today), end: endOfDay(today) };
      case 'yesterday': {
        const y = new Date(); y.setDate(y.getDate() - 1);
        return { start: startOfDay(y), end: endOfDay(y) };
      }
      case 'last7': {
        const from = new Date(); from.setDate(from.getDate() - 6); // last 7 days including today
        return { start: startOfDay(from), end: endOfDay(today) };
      }
      case 'last30': {
        const from = new Date(); from.setDate(from.getDate() - 29);
        return { start: startOfDay(from), end: endOfDay(today) };
      }
      case 'custom': {
        if (!customFrom || !customTo) return null;
        const s = new Date(customFrom); const e = new Date(customTo);
        return { start: startOfDay(s), end: endOfDay(e) };
      }
      case 'all':
      default:
        return null;
    }
  };

  // Filter orders by status, date range and search query
  const filteredByStatus = activeTab === 'all' ? merchantOrders : merchantOrders.filter(o => {
    if (activeTab === 'return') return o.status === 'return';
    return o.status === activeTab;
  });

  // Fetch packing fee totals for non-pending orders (batch). Runs once per page load.
  

  const range = getRangeStartEnd();
  const filteredOrders = filteredByStatus.filter(order => {
    // Date filter
    if (range) {
      const orderDate = order.date ? new Date(order.date) : null;
      if (!orderDate) return false;
      if (orderDate < range.start || orderDate > range.end) return false;
    }
    // Search filter
    if (searchQuery && searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const inId = order.id && order.id.toLowerCase().includes(q);
      const inCustomer = order.customerName && order.customerName.toLowerCase().includes(q);
      const inItems = (order.items || []).map(it => it.name || '').join(', ').toLowerCase().includes(q);
      const inCourierPartner = order.deliveryPartner && order.deliveryPartner.toLowerCase().includes(q);
      if (!(inId || inCustomer || inItems || inCourierPartner)) return false;
    }
    return true;
  });

  // Fetch packing fee totals for non-pending orders (batch). Runs once per page load.
  useEffect(() => {
    if (packingFeesFetchedRef.current) return;
    const idsToFetch = (filteredOrders || []).filter(o => String(o.status || '').toLowerCase() !== 'pending' && packingFeesByOrder[o.id] === undefined).map(o => o.id);
    if (!idsToFetch || idsToFetch.length === 0) {
      packingFeesFetchedRef.current = true;
      return;
    }
    (async () => {
      try {
        const q = idsToFetch.join(',');
        const isLocalDev = typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost' && window.location.port === '5173';
        const apiBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE)
          ? import.meta.env.VITE_API_BASE
          : (isLocalDev ? 'https://forwokbackend-1.onrender.com' : 'https://forwokbackend-1.onrender.com');
        const url = `${apiBase}/api/packingfees?orderIds=${encodeURIComponent(q)}`;
        console.log('Merchant: fetching packing fees batch from', url);
        const res = await fetch(url, { cache: 'no-store' });
        if (!res.ok) {
          packingFeesFetchedRef.current = true;
          return;
        }
        const json = await res.json();
        console.log('Merchant: packing fees batch response', json);
        if (json && json.map) {
          const normalized = Object.fromEntries(Object.entries(json.map).map(([k, v]) => {
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
        // ignore
      } finally {
        packingFeesFetchedRef.current = true;
      }
    })();
  }, [filteredOrders]);

  // Multi-select helpers for merchant panel
  const toggleSelect = (id) => {
    setSelectedOrderIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    const allIds = filteredOrders.map(o => o.id);
    const allSelected = allIds.length > 0 && allIds.every(id => selectedOrderIds.includes(id));
    setSelectedOrderIds(allSelected ? [] : allIds);
  };

  const areAllSelectedPending = () => {
    if (selectedOrderIds.length === 0) return false;
    return selectedOrderIds.every(id => {
      const o = merchantOrders.find(o => o.id === id) || orders.find(o => o.id === id);
      return o && o.status === 'pending';
    });
  };

  const deleteSelected = () => {
    if (!confirm('Delete selected orders?')) return;
    selectedOrderIds.forEach(id => removeOrder(id));
    setSelectedOrderIds([]);
  };

  const openEditSelected = () => {
    if (selectedOrderIds.length !== 1) return;
    const id = selectedOrderIds[0];
    const order = merchantOrders.find(o => o.id === id);
    if (order && order.status === 'pending') openEditDialog(order);
  };

  // Handlers for Add Order dialog
  const handleAddItem = () => {
    setItems(prev => [...prev, { productId: '', quantity: 1 }]);
  };

  const handleRemoveItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index, field, value) => {
    if (field === 'quantity') {
      const qty = parseInt(value) || 1;
      const productId = items[index].productId;
      if (productId) {
        const inventoryItem = inventory.find(inv => inv.productId === productId && inv.merchantId === currentUser?.id);
        const inventoryQty = inventoryItem ? inventoryItem.quantity : 0;
        const pendingQty = orders
          .filter(o => o.status === 'pending' && o.merchantId === currentUser?.id)
          .reduce((sum, order) => {
            const item = order.items.find(i => i.productId === productId);
            return sum + (item ? item.quantity : 0);
          }, 0);
        const availableQty = inventoryQty - pendingQty;
        if (qty > availableQty) {
          alert(`Quantity cannot exceed available inventory minus pending orders (${availableQty}).`);
          return;
        }
      }
      setItems(prev => {
        const newItems = [...prev];
        newItems[index][field] = qty;
        return newItems;
      });
    } else {
      setItems(prev => {
        const newItems = [...prev];
        newItems[index][field] = value;
        return newItems;
      });
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setShippingLabelFile(e.target.files[0]);
    } else {
      setShippingLabelFile(null);
    }
  };

  const handleSubmit = async () => {
    const fileToBase64 = (file) => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
      });
    };

    if (mode === 'manual') {
      console.log('Submitting order with city:', city, 'state:', state);
      if (!customerName || !address || !pincode || items.some(item => !item.productId || item.quantity <= 0)) {
        alert('Please fill all fields including pincode and add one product with quantity.');
        return;
      }
      const productId = items[0].productId;
      const qty = items[0].quantity;
      const inventoryItem = inventory.find(inv => inv.productId === productId && inv.merchantId === currentUser?.id);
      const inventoryQty = inventoryItem ? inventoryItem.quantity : 0;
      const pendingQty = orders
        .filter(o => o.status === 'pending' && o.merchantId === currentUser?.id)
        .reduce((sum, order) => {
          const item = order.items.find(i => i.productId === productId);
          return sum + (item ? item.quantity : 0);
        }, 0);
      const availableQty = inventoryQty - pendingQty;
      if (qty > availableQty) {
        alert(`Quantity cannot exceed available inventory minus pending orders (${availableQty}).`);
        return;
      }
      // Calculate weight per item (use max of actual and volumetric) and total weight per item
      const itemsWithWeights = items.map(item => {
        const product = products.find(p => p.id === item.productId) || {};
        const actualWeight = product.weightKg || 0;
        const volumetricWeight = calculateVolumetricWeight(product.lengthCm || 0, product.breadthCm || 0, product.heightCm || 0);
        const weightPerItem = Math.max(actualWeight, volumetricWeight);
        const totalWeight = weightPerItem * (item.quantity || 0);
        return {
          productId: item.productId,
          name: product.name || 'Unknown',
          quantity: item.quantity,
          weightPerItemKg: parseFloat(weightPerItem.toFixed(3)),
          weightKg: parseFloat(totalWeight.toFixed(3)),
        };
      });

      const totalWeightKg = itemsWithWeights.reduce((sum, it) => sum + (it.weightKg || 0), 0);

      const newOrder = {
        merchantId: currentUser.id,
        customerName,
        address,
        city,
        state,
        pincode,
        phone,
        deliveryPartner: newDeliveryPartner,
        items: itemsWithWeights,
        totalWeightKg: parseFloat(totalWeightKg.toFixed(3)),
        status: 'pending',
        date: new Date().toISOString().split('T')[0],
      };
      console.log('Closing dialog before adding order');
      setIsDialogOpen(false);
      addOrder(newOrder);
      try {
        await generateShippingLabelPDF(newOrder, { companyName: currentUser.companyName || '', id: currentUser.id || '' });
      } catch (e) {
        console.warn('Failed to generate shipping PDF', e);
      }
      // Ensure dialog close runs after other code
      setTimeout(() => {
        console.log('Closing dialog after adding order');
        setIsDialogOpen(false);
      }, 0);
  setCustomerName('');
      setAddress('');
      setCity('');
      setState('');
      setPincode('');
      setPhone('');
  setNewDeliveryPartner('');
      setItems([{ productId: '', quantity: 1 }]);
      // Remove redundant setTimeout for closing dialog
    } else if (mode === 'upload') {
      if (!shippingLabelFile) {
        alert('Please upload a shipping label file.');
        return;
      }
      fileToBase64(shippingLabelFile).then(base64String => {
        const newOrder = {
          merchantId: currentUser.id,
          customerName: 'Unknown',
          address: 'Unknown',
          items: [],
          shippingLabelBase64: base64String,
          status: 'shipping_label_pending',
          date: new Date().toISOString().split('T')[0],
        };
        addOrder(newOrder);
        setIsDialogOpen(false);
        setShippingLabelFile(null);
        // Force close dialog after a short delay to ensure state updates
        setTimeout(() => setIsDialogOpen(false), 100);
      }).catch(error => {
        alert('Failed to process the uploaded file.');
      });
    }
  };

  // Handlers for Return tab
  const handleReturnItemChange = (index, field, value) => {
    if (field === 'quantity') {
      const qty = parseInt(value) || 1;
      setReturnItems(prev => {
        const newItems = [...prev];
        newItems[index][field] = qty;
        return newItems;
      });
    } else {
      setReturnItems(prev => {
        const newItems = [...prev];
        newItems[index][field] = value;
        return newItems;
      });
    }
  };

  const handleAddReturnItem = () => {
    setReturnItems(prev => [...prev, { productId: '', quantity: 1 }]);
  };

  const handleRemoveReturnItem = (index) => {
    setReturnItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleReturnSubmit = () => {
    if (returnItems.some(item => !item.productId || item.quantity <= 0)) {
      alert('Please add at least one return item with valid product and quantity.');
      return;
    }
    const returnOrder = {
      merchantId: currentUser.id,
      customerName: 'Return',
      address: 'Return',
      pincode: '000000',
      items: returnItems.map(item => ({
        productId: item.productId,
        name: products.find(p => p.id === item.productId)?.name || 'Unknown',
        quantity: item.quantity,
      })),
      status: 'return',
      date: new Date().toISOString().split('T')[0],
    };
    addReturnOrder(returnOrder, returnType);
    setIsReturnDialogOpen(false);
    setReturnItems([{ productId: '', quantity: 1 }]);
    setReturnType('RTO');
  };

  // Edit dialog helpers
  const openEditDialog = (order) => {
    setEditOrder(order);
    setEditCustomerName(order.customerName || '');
    setEditAddress(order.address || '');
    setEditCity(order.city || '');
    setEditState(order.state || '');
    setEditPincode(order.pincode || '');
    setEditPhone(order.phone || '');
    setEditDeliveryPartner(order.deliveryPartner || '');
    setEditItems((order.items || []).map(it => ({ productId: it.productId, quantity: it.quantity })));
    setIsEditOpen(true);
  };

  // Open order details dialog (used for both mobile and desktop)
  const openOrderDetails = (order) => {
    setSelectedOrderForModal(order);
    setIsOrderDialogOpen(true);

    // If we already have a batch-fetched PackingFee object, merge it immediately for quicker display
    try {
      const pf = packingFeesByOrder && packingFeesByOrder[order.id] ? packingFeesByOrder[order.id] : null;
      if (pf) {
        setSelectedOrderForModal(prev => ({
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

    // Try to fetch server-side PackingFee doc for authoritative values
    (async () => {
      try {
        const isLocalDev = typeof window !== 'undefined' && window.location && window.location.hostname === 'localhost' && window.location.port === '5173';
        const apiBase = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE)
          ? import.meta.env.VITE_API_BASE
          : (isLocalDev ? 'https://forwokbackend-1.onrender.com' : 'https://forwokbackend-1.onrender.com');
        const singleUrl = `${apiBase}/api/packingfees/${encodeURIComponent(order.id)}`;
        console.log('Merchant: fetching packing fee for order', order.id, 'from', singleUrl);
        const res = await fetch(singleUrl, { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        console.log('Merchant: packing fee single response for', order.id, json);
        // Normalize single response into consistent shape
        let pf = null;
        if (!json) pf = null;
        else if (json.packingFee) pf = json.packingFee;
        else if (json.packingfee) pf = json.packingfee;
        else if (typeof json === 'number') pf = { totalPackingFee: Number(json) };
        else pf = json;
        if (pf) {
          setSelectedOrderForModal(prev => ({
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
        // ignore fetch errors — dialog will still show client-calculated values
      }
    })();
  };

  const handleEditItemChange = (index, field, value) => {
    setEditItems(prev => {
      const arr = [...prev];
      arr[index] = { ...arr[index], [field]: field === 'quantity' ? parseInt(value, 10) || 0 : value };
      return arr;
    });
  };

  const handleAddEditItem = () => setEditItems(prev => [...prev, { productId: '', quantity: 1 }]);
  const handleRemoveEditItem = (index) => setEditItems(prev => prev.filter((_, i) => i !== index));

  const handleSaveEdit = () => {
    if (!editOrder) return;
    if (!editCustomerName.trim()) { alert('Customer name required'); return; }
    if (!editAddress.trim()) { alert('Address required'); return; }
    if (editItems.length === 0 || editItems.some(it => !it.productId || it.quantity <= 0)) { alert('Add at least one valid item'); return; }

    // Recalculate item weights
    const itemsWithWeights = editItems.map(item => {
      const product = products.find(p => p.id === item.productId) || {};
      const actualWeight = product.weightKg || 0;
      const volumetricWeight = calculateVolumetricWeight(product.lengthCm || 0, product.breadthCm || 0, product.heightCm || 0);
      const weightPerItem = Math.max(actualWeight, volumetricWeight);
      const totalWeight = weightPerItem * (item.quantity || 0);
      return {
        productId: item.productId,
        name: product.name || 'Unknown',
        quantity: item.quantity,
        weightPerItemKg: parseFloat(weightPerItem.toFixed(3)),
        weightKg: parseFloat(totalWeight.toFixed(3)),
      };
    });
    const totalWeightKg = parseFloat(itemsWithWeights.reduce((s, it) => s + (it.weightKg || 0), 0).toFixed(3));

    // Calculate packing fee (auto-calculated using product-level fees)
    const packingFee = itemsWithWeights.reduce((sum, it) => {
      const prod = products.find(p => p.id === it.productId);
      if (!prod) return sum;
      const feePerItem = calculatePerItemTotalFee(prod);
      return sum + feePerItem * (it.quantity || 0);
    }, 0);

    const updated = {
      customerName: editCustomerName.trim(),
      address: editAddress.trim(),
      city: editCity.trim(),
      state: editState.trim(),
      pincode: editPincode.trim(),
      phone: editPhone.trim(),
      deliveryPartner: editDeliveryPartner.trim(),
      items: itemsWithWeights,
      totalWeightKg,
      packingFee: parseFloat(packingFee.toFixed(2)),
    };

    updateOrder(editOrder.id, updated);
    setIsEditOpen(false);
    setEditOrder(null);
  };

  // Add helper to render top action buttons for merchant bulk actions
  const groupDeleteSelected = () => {
    if (!confirm('Delete selected orders?')) return;
    selectedOrderIds.forEach(id => removeOrder(id));
    setSelectedOrderIds([]);
  };

  // Generate labels as a single PDF with multiple pages (one label per page)
  const generateMultipleLabels = async (selectedOrders) => {
    try {
      if (!selectedOrders || selectedOrders.length === 0) {
        toast({ title: 'No Orders Selected', description: 'Please select at least one order to generate labels.', variant: 'destructive' });
        return;
      }

      const template = localStorage.getItem(templateStorageKey);
      if (!template) {
        toast({ title: 'Template Not Found', description: 'Please configure a shipping label template in Settings first.', variant: 'destructive' });
        return;
      }

      // Create PDF with compression
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });
      
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      
      // layout with margins for single label per page
      const margin = 15; // 15mm margins for better presentation
      
      // Calculate label dimensions to fit the page properly
      const labelW = pageWidth - (margin * 2); // Full width minus margins
      const labelH = pageHeight - (margin * 2); // Full height minus margins

      // hidden container for rendering labels
      const container = document.createElement('div');
      container.style.position = 'fixed';
      container.style.left = '-10000px';
      container.style.top = '0';
      container.style.width = labelW + 'mm';
      document.body.appendChild(container);

      for (let i = 0; i < selectedOrders.length; i++) {
        const order = selectedOrders[i];

        const orderItems = order.items.map(item => {
          const product = products.find(p => p.id === item.productId);
          return {
            title: product?.name || 'Unknown Product',
            quantity: item.quantity,
            price: item.price || 0,
            total: item.quantity * (item.price || 0),
            sku: product?.sku || ''
          };
        });

        const total_quantity = orderItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
        const addressParts = (order.address || '').split(',').map(p => p.trim());

        const data = {
          shop: { name: currentUser?.companyName || 'My Shop', email: currentUser?.email || '', phone: currentUser?.phone || '', address: currentUser?.address || '', website: currentUser?.website || '' },
          order: { name: order.id, created_at: order.createdAt, po_number: order.poNumber || '', total_quantity, total_amount: orderItems.reduce((s, it) => s + (it.total || 0), 0) },
          shipping_address: { name: order.customerName || '', address1: addressParts[0] || '', address2: addressParts.slice(1).join(', ') || '', city_province_zip: `${order.city || ''}, ${order.state || ''} ${order.pincode || ''}`, country: 'India', phone: order.phone || '' },
          items: orderItems,
          line_items: orderItems,
          fulfillment: { line_items: orderItems },
          deliveryPartner: order.deliveryPartner || ''
        };

        const processedTemplate = template.replace(/\r\n/g, '\n').replace(/\{\%\s+/g, '{%').replace(/\s+\%\}/g, '%}').replace(/\{\{\s+/g, '{{').replace(/\s+\}\}/g, '}}');
        const rendered = renderTemplate(processedTemplate, data);

        // create label wrapper optimized for single-page printing
        const labelDiv = document.createElement('div');
        labelDiv.style.width = `${labelW}mm`;
        labelDiv.style.height = `${labelH}mm`;
        labelDiv.style.boxSizing = 'border-box';
  labelDiv.style.padding = '0mm';
        labelDiv.style.background = '#fff';
        labelDiv.style.overflow = 'hidden';
        labelDiv.style.fontSize = '12pt';
        labelDiv.style.lineHeight = '1.4';
        labelDiv.style.display = 'flex';
        labelDiv.style.flexDirection = 'column';
        labelDiv.style.justifyContent = 'space-between';
        labelDiv.style.alignItems = 'center';
        labelDiv.style.textAlign = 'center';
        labelDiv.innerHTML = rendered;

        // Remove UI elements that should not appear in the PDF (print buttons, debug actions, scripts)
        try {
          // remove elements with common print-only classes/buttons
          const removeSelectors = ['.no-print', '.print-actions', 'button[onclick*="print"]', 'button.print', 'a.print', 'script'];
          removeSelectors.forEach(sel => {
            const nodes = labelDiv.querySelectorAll(sel);
            nodes.forEach(n => n.remove());
          });

          // remove any remaining onclick handlers to be safe
          labelDiv.querySelectorAll('[onclick]').forEach(el => el.removeAttribute('onclick'));
        } catch (e) {
          // ignore any errors manipulating the template
        }

        // Clear previous label and add new one
        container.innerHTML = '';
        container.appendChild(labelDiv);

        // Small delay for proper rendering
        await new Promise(r => setTimeout(r, 100));

        // Optimized canvas generation (reduced scale + JPEG compression)
        const canvas = await html2canvas(labelDiv, {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          imageTimeout: 0,
          removeContainer: true,
          async: true
        });

        // Use JPEG at 80% to reduce size
        const imgData = canvas.toDataURL('image/jpeg', 0.8);

        // Add optimized image to PDF
        pdf.addImage(imgData, 'JPEG', margin, margin, labelW, labelH, undefined, 'FAST');

        // Clean up canvas element
        try { canvas.remove(); } catch (e) {}

        // Add a new page if this isn't the last label
        if (i < selectedOrders.length - 1) {
          pdf.addPage();
        }
      }

      // Clean up the temporary container
      document.body.removeChild(container);

      // Save the PDF with all labels
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '');
      pdf.save(`shipping_labels_${timestamp}.pdf`);
    } catch (err) {
      console.error('PDF label generation error', err);
      toast({ title: 'Label Generation Failed', description: 'Could not create PDF labels. Check console for details.', variant: 'destructive' });
    }
  };

  const groupDownloadLabels = () => {
    const selectedOrders = selectedOrderIds.map(id => orders.find(o => o.id === id) || merchantOrders.find(o => o.id === id)).filter(Boolean);
    if (selectedOrders.length === 0) {
      toast({ 
        title: 'No Orders Selected', 
        description: 'Please select orders to generate shipping labels.', 
        variant: 'destructive' 
      });
      return;
    }
    generateMultipleLabels(selectedOrders);
  };

  const renderTopActions = () => {
    if (selectedOrderIds.length === 0) return null;
    const singleSelected = selectedOrderIds.length === 1 ? merchantOrders.find(o => o.id === selectedOrderIds[0]) : null;
    return (
      <div className="ml-auto flex items-center gap-2">
        <div className="font-medium">{selectedOrderIds.length} selected</div>
        {singleSelected && singleSelected.status === 'pending' && (
          <Button variant="outline" size="sm" onClick={openEditSelected}>Edit Selected</Button>
        )}
        {areAllSelectedPending() && (
          <Button variant="destructive" size="sm" onClick={groupDeleteSelected}>Delete Selected</Button>
        )}
        <Button variant="outline" size="sm" onClick={groupDownloadLabels}>Download Labels</Button>
      </div>
    );
  };

  return (
    <div className="p-2 sm:p-6 space-y-6">
      <div className="flex items-start justify-between">
        <h1 className="text-3xl font-bold mb-4">Merchant: My Orders</h1>
        <div className="ml-4">
          <Button onClick={() => setIsDialogOpen(true)}>Add Order</Button>
        </div>
      </div>

      {/* Filters: search + date range */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Input
            placeholder="Search orders by id, customer, courier partner or item..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full sm:w-64"
          />
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-40">
              <SelectValue>
                {dateFilter === 'all' && 'All dates'}
                {dateFilter === 'today' && 'Today'}
                {dateFilter === 'yesterday' && 'Yesterday'}
                {dateFilter === 'last7' && 'Last 7 days'}
                {dateFilter === 'last30' && 'Last 30 days'}
                {dateFilter === 'custom' && 'Custom'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All dates</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="last7">Last 7 days</SelectItem>
              <SelectItem value="last30">Last 30 days</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {dateFilter === 'custom' && (
            <>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-36" />
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-36" />
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { setSearchQuery(''); setDateFilter('all'); setCustomFrom(''); setCustomTo(''); }}>Clear</Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="packed">Packed</TabsTrigger>
          <TabsTrigger value="dispatched">Dispatched</TabsTrigger>
          <TabsTrigger value="return">Return</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card className="mt-6">
            <CardHeader>
              <h2 className="text-xl font-semibold">All Orders</h2>
              {renderTopActions()}
            </CardHeader>
            <CardContent>
              {filteredOrders.length === 0 ? (
                <p>No orders found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="hidden sm:table-cell">
                        <input
                          type="checkbox"
                          checked={filteredOrders.length > 0 && filteredOrders.every(o => selectedOrderIds.includes(o.id))}
                          onChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date &amp; Time</TableHead>
                      <TableHead className="hidden sm:table-cell">Courier Partner</TableHead>
                      <TableHead className="hidden sm:table-cell">Items</TableHead>
                      <TableHead className="hidden sm:table-cell">Quantity</TableHead>
                      <TableHead className="hidden sm:table-cell">Weight (kg)</TableHead>
                      <TableHead className="hidden sm:table-cell">Packing Fee (₹)</TableHead>
                      <TableHead className="hidden sm:table-cell">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map(order => {
                      // calculate packing fee for this order (items + box + box-cutting + tracking)
                      const computedPackingFee = (() => {
                        const itemsFee = (order.items || []).reduce((sum, item) => {
                          const prod = products.find(p => p.id === item.productId);
                          if (!prod) return sum;
                          const comps = calculatePerItemComponents(prod);
                          const feePerItem = (comps.packing || 0) + (comps.transportation || 0) + (comps.warehousing || 0);
                          return sum + feePerItem * (item.quantity || 0);
                        }, 0);
                        const boxFeeVal = Number(order.boxFee) || 0;
                        const boxCuttingVal = order.boxCutting ? 1 : 0;
                        const trackingFee = 3;
                        const boxTotal = boxFeeVal + (boxCuttingVal ? 2 : 0) + trackingFee;
                        return itemsFee + boxTotal;
                      })();
                      const packingFee = (order.packingFee !== undefined && order.packingFee !== null && order.packingFee !== '') ? Number(order.packingFee) : computedPackingFee;
                      return (
                      <TableRow key={order.id}>
                          <TableCell className="hidden sm:table-cell">
                            <input type="checkbox" checked={selectedOrderIds.includes(order.id)} onChange={() => toggleSelect(order.id)} />
                          </TableCell>
                          <TableCell>
                            <button className="text-blue-600 underline" onClick={() => openOrderDetails(order)}>{order.id}</button>
                          </TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell>{order.date}{order.time ? ` ${order.time}` : ''}</TableCell>
                        <TableCell className="hidden sm:table-cell">{order.deliveryPartner || <span className="italic text-muted-foreground">pending</span>}</TableCell>
                        <TableCell className="hidden sm:table-cell">
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
                        <TableCell className="hidden sm:table-cell">{order.items.reduce((sum, item) => sum + item.quantity, 0)}</TableCell>
                        <TableCell className="hidden sm:table-cell">{((order.totalWeightKg !== undefined && order.totalWeightKg !== null)
                          ? order.totalWeightKg
                          : (order.items || []).reduce((s, it) => s + (it.weightKg ?? ((products.find(p => p.id === it.productId)?.weightKg || 0) * (it.quantity || 0))), 0)
                        ).toFixed(3)}</TableCell>
                        <TableCell className="hidden sm:table-cell">{
                          String(order.status || '').toLowerCase() === 'pending'
                            ? 'packing fee pending'
                            : (() => {
                                const backendValue = packingFeesByOrder[order.id];
                                if (backendValue !== undefined && backendValue !== null) {
                                  const backendTotal = (backendValue && backendValue.totalPackingFee !== undefined) ? backendValue.totalPackingFee : (typeof backendValue === 'number' ? backendValue : undefined);
                                  if (backendTotal !== undefined && backendTotal !== null) return `₹${Number(backendTotal).toFixed(2)}`;
                                }
                                const serverVal = (order.totalPackingFee !== undefined && order.totalPackingFee !== null)
                                  ? Number(order.totalPackingFee)
                                  : (order.packingFee !== undefined && order.packingFee !== null ? Number(order.packingFee) : null);
                                if (serverVal !== null) return `₹${Number(serverVal).toFixed(2)}`;
                                return `₹${(isFinite(packingFee) ? packingFee : 0).toFixed(2)}`;
                              })()
                        }</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <StatusTimelineDropdown order={order} isExpanded={expandedOrderIds.has(`status-${order.id}`)} onToggle={() => toggleExpandOrder(`status-${order.id}`)} />
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending">
          <Card className="mt-6">
            <CardHeader>
              <h2 className="text-xl font-semibold">Pending Orders</h2>
              {renderTopActions()}
            </CardHeader>
            <CardContent>
              {filteredOrders.length === 0 ? (
                <p>No pending orders found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="hidden sm:table-cell">
                        <input
                          type="checkbox"
                          checked={filteredOrders.length > 0 && filteredOrders.every(o => selectedOrderIds.includes(o.id))}
                          onChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="hidden sm:table-cell">Items</TableHead>
                      <TableHead className="hidden sm:table-cell">Quantity</TableHead>
                      <TableHead className="hidden sm:table-cell">Weight (kg)</TableHead>
                      <TableHead className="hidden sm:table-cell">Packing Fee (₹)</TableHead>
                      <TableHead className="hidden sm:table-cell">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map(order => {
                      // calculate packing fee for this order (items + box + box-cutting + tracking)
                      const computedPackingFee = (() => {
                        const itemsFee = (order.items || []).reduce((sum, item) => {
                          const prod = products.find(p => p.id === item.productId);
                          if (!prod) return sum;
                          const comps = calculatePerItemComponents(prod);
                          const feePerItem = (comps.packing || 0) + (comps.transportation || 0) + (comps.warehousing || 0);
                          return sum + feePerItem * (item.quantity || 0);
                        }, 0);
                        const boxFeeVal = Number(order.boxFee) || 0;
                        const boxCuttingVal = order.boxCutting ? 1 : 0;
                        const trackingFee = 3;
                        const boxTotal = boxFeeVal + (boxCuttingVal ? 2 : 0) + trackingFee;
                        return itemsFee + boxTotal;
                      })();
                      const packingFee = (order.packingFee !== undefined && order.packingFee !== null && order.packingFee !== '') ? Number(order.packingFee) : computedPackingFee;
                      return (
                      <TableRow key={order.id}>
                        <TableCell className="hidden sm:table-cell">
                          <input type="checkbox" checked={selectedOrderIds.includes(order.id)} onChange={() => toggleSelect(order.id)} />
                        </TableCell>
                        <TableCell>
                          <button className="text-blue-600 underline" onClick={() => openOrderDetails(order)}>{order.id}</button>
                        </TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell className="hidden sm:table-cell">{order.items.map(item => item.name).join(', ')}</TableCell>
                        <TableCell className="hidden sm:table-cell">{order.items.reduce((sum, item) => sum + item.quantity, 0)}</TableCell>
                        <TableCell className="hidden sm:table-cell">{((order.totalWeightKg !== undefined && order.totalWeightKg !== null)
                          ? order.totalWeightKg
                          : (order.items || []).reduce((s, it) => s + (it.weightKg ?? ((products.find(p => p.id === it.productId)?.weightKg || 0) * (it.quantity || 0))), 0)
                        ).toFixed(3)}</TableCell>
                        <TableCell className="hidden sm:table-cell">{
                          String(order.status || '').toLowerCase() === 'pending'
                            ? 'packing fee pending'
                            : (() => {
                                const backendValue = packingFeesByOrder[order.id];
                                if (backendValue !== undefined && backendValue !== null) {
                                  const backendTotal = (backendValue && backendValue.totalPackingFee !== undefined) ? backendValue.totalPackingFee : (typeof backendValue === 'number' ? backendValue : undefined);
                                  if (backendTotal !== undefined && backendTotal !== null) return `₹${Number(backendTotal).toFixed(2)}`;
                                }
                                const serverVal = (order.totalPackingFee !== undefined && order.totalPackingFee !== null)
                                  ? Number(order.totalPackingFee)
                                  : (order.packingFee !== undefined && order.packingFee !== null ? Number(order.packingFee) : null);
                                if (serverVal !== null) return `₹${Number(serverVal).toFixed(2)}`;
                                return `₹${(isFinite(packingFee) ? packingFee : 0).toFixed(2)}`;
                              })()
                        }</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <StatusTimelineDropdown order={order} isExpanded={expandedOrderIds.has(`status-${order.id}`)} onToggle={() => toggleExpandOrder(`status-${order.id}`)} />
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="packed">
          <Card className="mt-6">
            <CardHeader>
              <h2 className="text-xl font-semibold">Packed Orders</h2>
              {renderTopActions()}
            </CardHeader>
            <CardContent>
              {filteredOrders.length === 0 ? (
                <p>No packed orders found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="hidden sm:table-cell">
                        <input
                          type="checkbox"
                          checked={filteredOrders.length > 0 && filteredOrders.every(o => selectedOrderIds.includes(o.id))}
                          onChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="hidden sm:table-cell">Items</TableHead>
                      <TableHead className="hidden sm:table-cell">Quantity</TableHead>
                      <TableHead className="hidden sm:table-cell">Weight (kg)</TableHead>
                      <TableHead className="hidden sm:table-cell">Packing Fee (₹)</TableHead>
                      <TableHead className="hidden sm:table-cell">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map(order => {
                      // calculate packing fee for this order (items + box + box-cutting + tracking)
                      const packingFee = (() => {
                        const itemsFee = (order.items || []).reduce((sum, item) => {
                          const prod = products.find(p => p.id === item.productId);
                          if (!prod) return sum;
                          const feePerItem = calculatePerItemTotalFee(prod);
                          return sum + feePerItem * (item.quantity || 0);
                        }, 0);
                        const boxFeeVal = Number(order.boxFee) || 0;
                        const boxCuttingVal = order.boxCutting ? 1 : 0;
                        const trackingFee = 3;
                        const boxTotal = boxFeeVal + (boxCuttingVal ? 2 : 0) + trackingFee;
                        return itemsFee + boxTotal;
                      })();
                      return (
                      <TableRow key={order.id}>
                        <TableCell className="hidden sm:table-cell">
                          <input type="checkbox" checked={selectedOrderIds.includes(order.id)} onChange={() => toggleSelect(order.id)} />
                        </TableCell>
                        <TableCell>
                          <button className="text-blue-600 underline" onClick={() => openOrderDetails(order)}>{order.id}</button>
                        </TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell className="hidden sm:table-cell">{order.items.map(item => item.name).join(', ')}</TableCell>
                        <TableCell className="hidden sm:table-cell">{order.items.reduce((sum, item) => sum + item.quantity, 0)}</TableCell>
                        <TableCell className="hidden sm:table-cell">{((order.totalWeightKg !== undefined && order.totalWeightKg !== null)
                          ? order.totalWeightKg
                          : (order.items || []).reduce((s, it) => s + (it.weightKg ?? ((products.find(p => p.id === it.productId)?.weightKg || 0) * (it.quantity || 0))), 0)
                        ).toFixed(3)}</TableCell>
                        <TableCell className="hidden sm:table-cell">{
                          String(order.status || '').toLowerCase() === 'pending'
                            ? 'packing fee pending'
                            : (() => {
                                const backendValue = packingFeesByOrder[order.id];
                                if (backendValue !== undefined && backendValue !== null) {
                                  const backendTotal = (backendValue && backendValue.totalPackingFee !== undefined) ? backendValue.totalPackingFee : (typeof backendValue === 'number' ? backendValue : undefined);
                                  if (backendTotal !== undefined && backendTotal !== null) return `₹${Number(backendTotal).toFixed(2)}`;
                                }
                                const serverVal = (order.totalPackingFee !== undefined && order.totalPackingFee !== null)
                                  ? Number(order.totalPackingFee)
                                  : (order.packingFee !== undefined && order.packingFee !== null ? Number(order.packingFee) : null);
                                if (serverVal !== null) return `₹${Number(serverVal).toFixed(2)}`;
                                return `₹${(isFinite(packingFee) ? packingFee : 0).toFixed(2)}`;
                              })()
                        }</TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <StatusTimelineDropdown order={order} isExpanded={expandedOrderIds.has(`status-${order.id}`)} onToggle={() => toggleExpandOrder(`status-${order.id}`)} />
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dispatched">
          <Card className="mt-6">
            <CardHeader>
              <h2 className="text-xl font-semibold">Dispatched Orders</h2>
              {renderTopActions()}
            </CardHeader>
            <CardContent>
              {filteredOrders.length === 0 ? (
                <p>No dispatched orders found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="hidden sm:table-cell">
                        <input
                          type="checkbox"
                          checked={filteredOrders.length > 0 && filteredOrders.every(o => selectedOrderIds.includes(o.id))}
                          onChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Order ID</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="hidden sm:table-cell">Items</TableHead>
                      <TableHead className="hidden sm:table-cell">Quantity</TableHead>
                      <TableHead className="hidden sm:table-cell">Weight (kg)</TableHead>
                      <TableHead className="hidden sm:table-cell">Packing Fee (₹)</TableHead>
                      <TableHead className="hidden sm:table-cell">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map(order => {
                      // calculate packing fee for this order (items + box + box-cutting + tracking)
                      const computedPackingFee = (() => {
                        const itemsFee = (order.items || []).reduce((sum, item) => {
                          const prod = products.find(p => p.id === item.productId);
                          if (!prod) return sum;
                          const comps = calculatePerItemComponents(prod);
                          const feePerItem = (comps.packing || 0) + (comps.transportation || 0) + (comps.warehousing || 0);
                          return sum + feePerItem * (item.quantity || 0);
                        }, 0);
                        const boxFeeVal = Number(order.boxFee) || 0;
                        const boxCuttingVal = order.boxCutting ? 1 : 0;
                        const trackingFee = 3;
                        const boxTotal = boxFeeVal + (boxCuttingVal ? 2 : 0) + trackingFee;
                        return itemsFee + boxTotal;
                      })();
                      const packingFee = (order.packingFee !== undefined && order.packingFee !== null && order.packingFee !== '') ? Number(order.packingFee) : computedPackingFee;
                      return (
                      <TableRow key={order.id}>
                        <TableCell className="hidden sm:table-cell">
                          <input type="checkbox" checked={selectedOrderIds.includes(order.id)} onChange={() => toggleSelect(order.id)} />
                        </TableCell>
                        <TableCell>
                          <button className="text-blue-600 underline" onClick={() => openOrderDetails(order)}>{order.id}</button>
                        </TableCell>
                        <TableCell>{order.customerName}</TableCell>
                        <TableCell>{order.items.map(item => item.name).join(', ')}</TableCell>
                        <TableCell>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</TableCell>
                        <TableCell>{((order.totalWeightKg !== undefined && order.totalWeightKg !== null)
                          ? order.totalWeightKg
                          : (order.items || []).reduce((s, it) => s + (it.weightKg ?? ((products.find(p => p.id === it.productId)?.weightKg || 0) * (it.quantity || 0))), 0)
                        ).toFixed(3)}</TableCell>
                        <TableCell>{
                          String(order.status || '').toLowerCase() === 'pending'
                            ? 'packing fee pending'
                            : (() => {
                                const backendValue = packingFeesByOrder[order.id];
                                if (backendValue !== undefined && backendValue !== null) {
                                  const backendTotal = (backendValue && backendValue.totalPackingFee !== undefined) ? backendValue.totalPackingFee : (typeof backendValue === 'number' ? backendValue : undefined);
                                  if (backendTotal !== undefined && backendTotal !== null) return `₹${Number(backendTotal).toFixed(2)}`;
                                }
                                const serverVal = (order.totalPackingFee !== undefined && order.totalPackingFee !== null)
                                  ? Number(order.totalPackingFee)
                                  : (order.packingFee !== undefined && order.packingFee !== null ? Number(order.packingFee) : null);
                                if (serverVal !== null) return `₹${Number(serverVal).toFixed(2)}`;
                                return `₹${(isFinite(packingFee) ? packingFee : 0).toFixed(2)}`;
                              })()
                        }</TableCell>
                        <TableCell>
                          <StatusTimelineDropdown order={order} isExpanded={expandedOrderIds.has(`status-${order.id}`)} onToggle={() => toggleExpandOrder(`status-${order.id}`)} />
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="return">
          <Card className="mt-6">
            <CardHeader>
              <h2 className="text-xl font-semibold">Return Orders</h2>
              {renderTopActions()}
            </CardHeader>
            <CardContent>
              {filteredOrders.length === 0 ? (
                <p>No return orders found.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Return ID</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Quantity</TableHead>
                      <TableHead>Return Type</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map(order => (
                      <TableRow key={order.id}>
                        <TableCell>{order.id}</TableCell>
                        <TableCell>{order.items.map(item => item.name).join(', ')}</TableCell>
                        <TableCell>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</TableCell>
                        <TableCell>{order.returnType}</TableCell>
                      <TableCell>{order.date}</TableCell>
                      <TableCell>{order.time}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {activeTab !== 'return' && (
        <>
      {/* Edit Order Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="w-full max-w-sm sm:max-w-md p-3 sm:p-6 max-h-[80vh] overflow-auto" aria-describedby="edit-order-desc">
          <DialogTitle>Edit Order</DialogTitle>
          <DialogDescription id="edit-order-desc">Edit order details (only allowed when pending)</DialogDescription>
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 gap-2">
              <Label>Customer Name</Label>
              <Input value={editCustomerName} onChange={e => setEditCustomerName(e.target.value)} />
              <Label>Address</Label>
              <Input value={editAddress} onChange={e => setEditAddress(e.target.value)} />
              <div className="flex gap-2">
                <Input value={editCity} onChange={e => setEditCity(e.target.value)} placeholder="City" />
                <Input value={editState} onChange={e => setEditState(e.target.value)} placeholder="State" />
              </div>
              <div className="flex gap-2">
                <Input value={editPincode} onChange={e => setEditPincode(e.target.value)} placeholder="Pincode" />
                <Input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Phone" />
              </div>
              <div className="flex gap-2 mt-2">
                <Label>Courier Partner</Label>
                <Input value={editDeliveryPartner} onChange={e => setEditDeliveryPartner(e.target.value)} placeholder="Courier / Delivery Partner" />
              </div>
              <Label>Items</Label>
              {editItems.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Select value={it.productId} onValueChange={(v) => handleEditItemChange(idx, 'productId', v)}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="Select product" /></SelectTrigger>
                    <SelectContent>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input type="number" className="w-20" value={it.quantity} onChange={e => handleEditItemChange(idx, 'quantity', e.target.value)} />
                  <Button variant="outline" onClick={() => handleRemoveEditItem(idx)}>Remove</Button>
                </div>
              ))}
              <Button variant="outline" onClick={handleAddEditItem}>Add Item</Button>
              
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTrigger asChild>
         
        </DialogTrigger>
        <DialogContent className="w-full max-w-sm sm:max-w-md p-3 sm:p-6 max-h-[80vh] overflow-auto" aria-describedby="add-order-desc">
          <DialogTitle>Add Order</DialogTitle>
          <DialogDescription id="add-order-desc">
            Add order manually
          </DialogDescription>
          <div className="mt-4 space-y-4">
            <Tabs value={mode} onValueChange={setMode}>
              <TabsList>
                <TabsTrigger value="manual">Manual Entry</TabsTrigger>
               
              </TabsList>
              <TabsContent value="manual">
                <div>
                  <Label>Customer Name</Label>
                  <Input value={customerName} onChange={e => setCustomerName(e.target.value)} />
                </div>
                <div>
                  <Label>Address</Label>
                  <Input value={address} onChange={e => setAddress(e.target.value)} />
                </div>
                <div>
                  <Label>City</Label>
                  <Input value={city} onChange={e => setCity(e.target.value)} />
                </div>
                <div>
                  <Label>State</Label>
                  <Input value={state} onChange={e => setState(e.target.value)} />
                </div>
                <div>
                  <Label>Pincode</Label>
                  <Input value={pincode} onChange={e => setPincode(e.target.value)} />
                </div>
                <div>
                  <Label>Phone Number</Label>
                  <Input value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
                <div>
                  <Label>Courier Partner</Label>
                  <Input value={newDeliveryPartner} onChange={e => setNewDeliveryPartner(e.target.value)} placeholder="Courier / Delivery Partner" />
                </div>
                <div>
                  <Label>Item</Label>
                  {items.map((item, index) => (
                    <div key={index} className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-x-2 mb-2">
                      <Select
                        value={item.productId}
                        onValueChange={value => handleItemChange(index, 'productId', value)}
                      >
                        <SelectTrigger className="w-full sm:w-48">
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          {products.map(product => (
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
                        onChange={e => handleItemChange(index, 'quantity', e.target.value)}
                        className="w-full sm:w-20"
                      />
                      <Button className="w-full sm:w-auto" variant="outline" onClick={() => handleRemoveItem(index)}>Remove</Button>
                    </div>
                  ))}
                  <div className="mt-2">
                    <Button className="w-full sm:w-auto" variant="outline" onClick={handleAddItem}>Add Item</Button>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="upload">
                <div>
                  <Label>Shipping Label PDF</Label>
                  <Input type="file" accept="application/pdf" onChange={handleFileChange} />
                  {shippingLabelFile && <p>Selected file: {shippingLabelFile.name}</p>}
                </div>
              </TabsContent>
            </Tabs>
            <div className="mt-4 flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="button" onClick={() => { console.log('Submit clicked'); handleSubmit(); }}>Submit</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {/* Mobile Order Details Dialog (opened when Order ID clicked on small screens) */}
      <Dialog open={isOrderDialogOpen} onOpenChange={(v) => { setIsOrderDialogOpen(v); if (!v) setSelectedOrderForModal(null); }}>
        <DialogContent className="w-full max-w-sm sm:max-w-md p-3 sm:p-6 max-h-[80vh] overflow-auto" aria-describedby="mobile-order-details-desc">
          <DialogTitle>Order Details</DialogTitle>
          <DialogDescription id="mobile-order-details-desc">Details for selected order</DialogDescription>
          {selectedOrderForModal ? (
            <div className="mt-4 space-y-3 text-sm">
              <div>
                <div className="font-medium">Order ID</div>
                <div className="text-gray-700">{selectedOrderForModal.id}</div>
              </div>
              <div>
                <div className="font-medium">Customer</div>
                <div className="text-gray-700">{selectedOrderForModal.customerName || selectedOrderForModal.customer || '—'}</div>
              </div>
              <div>
                <div className="font-medium">Phone</div>
                <div className="text-gray-700">{selectedOrderForModal.phone || '—'}</div>
              </div>
              <div>
                <div className="font-medium">Address</div>
                <div className="text-gray-700">{selectedOrderForModal.address || `${selectedOrderForModal.address1 || ''}${selectedOrderForModal.city ? ', ' + selectedOrderForModal.city : ''}${selectedOrderForModal.pincode ? ' — PIN: ' + selectedOrderForModal.pincode : ''}`}</div>
              </div>
              <div>
                <div className="font-medium">Date &amp; Time</div>
                <div className="text-gray-700">{(selectedOrderForModal.date || '') + (selectedOrderForModal.time ? `, ${selectedOrderForModal.time}` : '')}</div>
              </div>
              <div>
                <div className="font-medium">Courier Partner</div>
                <div className="text-gray-700">{selectedOrderForModal.deliveryPartner || '—'}</div>
              </div>
              <div>
                <div className="font-medium">Weight (kg)</div>
                <div className="text-gray-700">{(() => {
                  const w = (selectedOrderForModal.totalWeightKg !== undefined && selectedOrderForModal.totalWeightKg !== null)
                    ? Number(selectedOrderForModal.totalWeightKg)
                    : (selectedOrderForModal.items || []).reduce((s, it) => s + (it.weightKg ?? ((products.find(p => p.id === it.productId)?.weightKg || 0) * (it.quantity || 0))), 0);
                  return (typeof w === 'number' && !isNaN(w)) ? w.toFixed(3) : '—';
                })()}</div>
              </div>
              <div>
                <div className="font-medium">Packing Fee</div>
                <div className="text-gray-700">{(() => {
                  const pf = (selectedOrderForModal.items || []).reduce((sum, item) => {
                    const prod = products.find(p => p.id === item.productId);
                    if (!prod) return sum;
                    const actual = prod.weightKg || 0;
                    const vol = calculateVolumetricWeight(prod.lengthCm || 0, prod.breadthCm || 0, prod.heightCm || 0);
                    const feePerItem = calculatePerItemTotalFee(prod);
                    return sum + feePerItem * (item.quantity || 0);
                  }, 0);
                  return pf ? `₹${pf.toFixed(2)}` : '₹0.00';
                })()}</div>
              </div>
              <div>
                <div className="font-medium">Tracking Code</div>
                <div className="text-gray-700">{selectedOrderForModal.trackingCode || 'N/A'}</div>
              </div>
              <div>
                <div className="font-medium">Status Timeline</div>
                <div className="text-gray-700">
                  {(() => {
                    const tl = getStatusTimeline(selectedOrderForModal || {});
                    return (
                      <ul className="list-none p-0 m-0">
                        {tl.map((s) => (
                          <div key={s.key} className="flex justify-between py-1 border-b last:border-b-0">
                            <div className="text-sm text-gray-800">{s.label}</div>
                            <div className={`text-sm ${s.value === 'pending' ? 'text-gray-500 italic' : 'text-gray-700'}`}>{s.value}</div>
                          </div>
                        ))}
                      </ul>
                    );
                  })()}
                </div>
              </div>
              <div>
                <div className="font-medium">Items</div>
                <div className="text-gray-700">
                  {(selectedOrderForModal.items || []).map((it, idx) => (
                    <div key={idx} className="flex justify-between">
                      <div>{it.name}</div>
                      <div className="text-sm">x{it.quantity}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="font-medium">Price Breakup</div>
                <div className="text-gray-700">
                  {/* Desktop table */}
                  <div className="hidden sm:block mt-2">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left">
                          <th>Item</th>
                          <th>Qty</th>
                          <th className="text-right">Packing</th>
                          <th className="text-right">Transport</th>
                          <th className="text-right">Warehousing</th>
                          <th className="text-right">Line Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedOrderForModal.items || []).map((it, idx) => {
                          const prod = products.find(p => p.id === it.productId) || {};
                          const comps = calculatePerItemComponents(prod);
                          const per = (comps.packing || 0) + (comps.transportation || 0) + (comps.warehousing || 0);
                          const lineTotal = per * (it.quantity || 0);
                          return (
                            <tr key={idx} className="border-t">
                              <td className="py-1">{it.name}</td>
                              <td className="py-1">{it.quantity}</td>
                              <td className="py-1 text-right">₹{(comps.packing || 0).toFixed(2)}</td>
                              <td className="py-1 text-right">₹{(comps.transportation || 0).toFixed(2)}</td>
                              <td className="py-1 text-right">₹{(comps.warehousing || 0).toFixed(2)}</td>
                              <td className="py-1 text-right">₹{lineTotal.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {/* Mobile stacked cards */}
                  <div className="sm:hidden mt-2 space-y-2">
                    {(selectedOrderForModal.items || []).map((it, idx) => {
                      const prod = products.find(p => p.id === it.productId) || {};
                      const comps = calculatePerItemComponents(prod);
                      const per = (comps.packing || 0) + (comps.transportation || 0) + (comps.warehousing || 0);
                      const lineTotal = per * (it.quantity || 0);
                      return (
                        <div key={idx} className="border rounded p-2">
                          <div className="flex justify-between"><div className="font-medium">{it.name}</div><div>x{it.quantity}</div></div>
                          <div className="flex justify-between text-sm"><div>Packing</div><div>₹{(comps.packing || 0).toFixed(2)}</div></div>
                          <div className="flex justify-between text-sm"><div>Transport</div><div>₹{(comps.transportation || 0).toFixed(2)}</div></div>
                          <div className="flex justify-between text-sm"><div>Warehousing</div><div>₹{(comps.warehousing || 0).toFixed(2)}</div></div>
                          <div className="flex justify-between text-sm font-semibold mt-1"><div>Line Total</div><div>₹{lineTotal.toFixed(2)}</div></div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Extras and totals */}
                  <div className="mt-3 border-t pt-2">
                    <div className="flex justify-between"><div>Box Fee</div><div>₹{(Number(selectedOrderForModal.boxFee) || 0).toFixed(2)}</div></div>
                    <div className="flex justify-between"><div>Box Cutting</div><div>₹{(selectedOrderForModal.boxCutting === true ? 2 : (Number(selectedOrderForModal.boxCutting) || 0)).toFixed(2)}</div></div>
                    <div className="flex justify-between"><div>Tracking Fee</div><div>₹{(selectedOrderForModal.trackingFee !== undefined ? Number(selectedOrderForModal.trackingFee) : 3).toFixed(2)}</div></div>
                    <div className="flex justify-between font-semibold mt-2">
                      <div>Total (calc)</div>
                      <div>₹{(() => {
                        const itemsTotal = (selectedOrderForModal.items || []).reduce((s, it) => {
                          const prod = products.find(p => p.id === it.productId) || {};
                          const c = calculatePerItemComponents(prod);
                          const per = (c.packing || 0) + (c.transportation || 0) + (c.warehousing || 0);
                          return s + per * (it.quantity || 0);
                        }, 0);
                        const box = Number(selectedOrderForModal.boxFee) || 0;
                        const cutting = selectedOrderForModal.boxCutting === true ? 2 : (Number(selectedOrderForModal.boxCutting) || 0);
                        const track = selectedOrderForModal.trackingFee !== undefined ? Number(selectedOrderForModal.trackingFee) : 3;
                        return (itemsTotal + box + cutting + track).toFixed(2);
                      })()}</div>
                    </div>
                    {selectedOrderForModal.totalPackingFee !== undefined && selectedOrderForModal.totalPackingFee !== null && (
                      <div className="flex justify-between text-sm text-gray-700 mt-1">
                        <div>Server total</div>
                        <div>₹{Number(selectedOrderForModal.totalPackingFee).toFixed(2)}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-4">No order selected</div>
          )}
          <div className="mt-6 flex flex-col sm:flex-row sm:justify-end gap-2">
            {selectedOrderForModal && selectedOrderForModal.status === 'pending' && (
              <>
                <Button className="w-full sm:w-auto" variant="outline" onClick={() => { setIsOrderDialogOpen(false); openEditDialog(selectedOrderForModal); setSelectedOrderForModal(null); }}>Edit</Button>
                <Button className="w-full sm:w-auto" variant="destructive" onClick={() => { if (!confirm('Delete this order?')) return; removeOrder(selectedOrderForModal.id); setIsOrderDialogOpen(false); setSelectedOrderForModal(null); }}>Delete</Button>
              </>
            )}
            <Button className="w-full sm:w-auto" variant="outline" onClick={() => { setIsOrderDialogOpen(false); setSelectedOrderForModal(null); }}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
      </>
      )}
    </div>
  );
};

export default MerchantOrders;
