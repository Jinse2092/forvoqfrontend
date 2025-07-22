import React, { createContext, useContext, useState, useEffect } from 'react';
import { useToast } from '../components/ui/use-toast.js';
import { calculateDispatchFee, calculateVolumetricWeight } from '../lib/utils.js';
import {
  initialProducts,
  initialInventory,
  initialOrders,
  initialInbounds,
  initialUsers
} from '../data/initialData.js';

// Removed import of useLocalStorage since it is no longer used

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://https://forwokbackend-1.onrender.com';

const InventoryContext = createContext();

// --- Provider Component ---
export const InventoryProvider = ({ children }) => {
  const { toast } = useToast();
  const [products, setProducts] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [inbounds, setInbounds] = useState([]);
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(() => {
    // Initialize currentUser from localStorage if available
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  });

  // Sync currentUser state to localStorage whenever it changes
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('currentUser');
    }
  }, [currentUser]);

  // Fetch all data from backend API on mount
  const fetchAllData = async () => {
    try {
      const endpoints = ['products', 'inventory', 'transactions', 'orders', 'inbounds', 'users', 'savedPickupLocations'];
      const results = await Promise.all(endpoints.map(ep => fetch(`${API_BASE_URL}/api/${ep}`).then(res => {
        if (!res.ok) throw new Error(`Failed to fetch ${ep}`);
        return res.json();
      })));

      // Helper function to parse city and state from address string (simple heuristic)
      const parseCityState = (address) => {
        if (!address) return { city: '', state: '' };
        // Example: "123 Main St, Springfield, IL 62704"
        const parts = address.split(',');
        if (parts.length >= 3) {
          const city = parts[parts.length - 2].trim();
          const stateZip = parts[parts.length - 1].trim().split(' ');
          const state = stateZip.length > 0 ? stateZip[0] : '';
          return { city, state };
        }
        return { city: '', state: '' };
      };

      // Add city and state dynamically to orders
      const ordersWithCityState = results[3].map(order => {
        // Use city and state from order if present, else parse from address
        const city = order.city || parseCityState(order.address).city;
        const state = order.state || parseCityState(order.address).state;
        return { ...order, city, state };
      });
      console.log('Orders with city and state:', ordersWithCityState);

      setProducts(results[0]);
      setInventory(results[1]);
      setTransactions(results[2]);
      setOrders(ordersWithCityState);

      // Calculate totalWeightKg and fee for each inbound
      const inboundsWithWeight = results[4].map(inbound => {
        const totalWeightKg = inbound.items.reduce((sum, item) => {
          const product = results[0].find(p => p.id === item.productId);
          if (!product) return sum;
          const actualWeight = product.weightKg || 0;
          const length = product.lengthCm || 0;
          const breadth = product.breadthCm || 0;
          const height = product.heightCm || 0;
          const volumetricWeight = (length * breadth * height) / 5000;
          const weightToUse = Math.max(actualWeight, volumetricWeight);
          return sum + (item.quantity * weightToUse);
        }, 0);

        // Calculate fee: ₹5 per 500g (0.5kg), round up
        const fee = Math.ceil(totalWeightKg / 0.5) * 5;

        return {
          ...inbound,
          totalWeightKg,
          fee
        };
      });

      setInbounds(inboundsWithWeight);
      setUsers(results[5]);
      setSavedPickupLocations(results[6]);
    } catch (error) {
      toast({ title: "Error", description: "Failed to load data from server.", variant: "destructive" });
      setProducts([]);
      setInventory([]);
      setTransactions([]);
      setOrders([]);
      setInbounds([]);
      setUsers([]);
      setSavedPickupLocations([]);
    }
  };

  // Derived state: enhanced inventory with product and location details
  const enhancedInventory = inventory.map(invItem => {
    const product = products.find(p => p.id === invItem.productId) || {};
    const merchant = users.find(u => u.id === invItem.merchantId) || {};
    const inbound = inbounds.find(i => i.merchantId === invItem.merchantId && i.items.some(item => item.productId === invItem.productId)) || {};
    const location = inbound.items ? inbound.items.find(item => item.productId === invItem.productId)?.location : '';
    return {
      ...invItem,
      merchantName: merchant.companyName || '',
      productName: product.name || '',
      location: location || invItem.location || '',
      quantity: invItem.quantity || 0,
      minStock: invItem.minStockLevel || 0,
      maxStock: invItem.maxStockLevel || 0,
    };
  });

  useEffect(() => {
    fetchAllData();
    const interval = setInterval(() => {
      fetchAllData();
    }, 20000); // 20 seconds
    return () => clearInterval(interval);
  }, []);

  // Helper to add data item to backend and update state
  const addDataToBackend = async (type, item, setState) => {
    try {
      console.log(`Sending POST request to backend for type: ${type}`, item);
      const response = await fetch(`${API_BASE_URL}/api/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to add ${type}: ${response.status} ${response.statusText} - ${errorText}`);
        throw new Error(`Failed to add ${type}`);
      }
      const savedItem = await response.json();
      console.log(`Successfully saved ${type} to backend:`, savedItem);
      setState(prev => [savedItem, ...prev]);
      return savedItem;
    } catch (error) {
      console.error(`Error saving ${type} to backend:`, error);
      toast({ title: "Error", description: `Failed to save ${type} to server.`, variant: "destructive" });
      return null;
    }
  };

  // --- Authentication Simulation ---
  const login = async (email, password) => {
    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        toast({ title: "Login Failed", description: "Invalid email or password.", variant: "destructive" });
        return false;
      }
      const data = await response.json();
      setCurrentUser(data.user);
      localStorage.setItem('currentUser', JSON.stringify(data.user));
      toast({ title: "Login Successful", description: `Welcome, ${data.user.companyName}!` });
      return true;
    } catch (error) {
      toast({ title: "Login Failed", description: "Error connecting to server.", variant: "destructive" });
      return false;
    }
  };

  const register = async (companyDetails) => {
    if (!companyDetails.email || !companyDetails.password || !companyDetails.companyName) {
      toast({ title: "Registration Failed", description: "Please fill all required fields.", variant: "destructive" });
      return false;
    }
    if (users.some(u => u.email === companyDetails.email)) {
      toast({ title: "Registration Failed", description: "Email already exists.", variant: "destructive" });
      return false;
    }
    const newUser = {
      id: `merchant-${Date.now()}`,
      role: 'merchant',
      ...companyDetails
    };
    try {
      const response = await fetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newUser),
      });
      if (!response.ok) {
        toast({ title: "Registration Failed", description: "Failed to save user to server.", variant: "destructive" });
        return false;
      }
      const savedUser = await response.json();
      setUsers(prev => [...prev, savedUser]);
      toast({ title: "Registration Successful", description: `Welcome, ${savedUser.companyName}! Please log in.` });
      return true;
    } catch (error) {
      toast({ title: "Registration Failed", description: "Error saving user to server.", variant: "destructive" });
      return false;
    }
  };

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    toast({ title: "Logged Out" });
  };

  // --- Helper: Verify user is authenticated ---
  const verifyUser = () => {
    if (!currentUser) {
      toast({ title: "Not Authenticated", description: "Please log in to perform this action.", variant: "destructive" });
      return false;
    }
    return true;
  };

  // --- Product CRUD ---
  const addProduct = async (product) => {
    if (!verifyUser()) return;
    // Ensure merchantId is preserved when adding product
    const newProduct = { ...product, merchantId: currentUser?.id };
    const savedProduct = await addDataToBackend('products', newProduct, setProducts);
    if (savedProduct) {
      toast({ title: "Product Added", description: `${savedProduct.name} has been added.` });
      await fetchAllData();
    }
  };

  const updateProduct = async (id, updatedProduct) => {
    if (!verifyUser()) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/products/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updatedProduct, id }),
      });
      if (!response.ok) throw new Error('Failed to update product');
      const savedProduct = await response.json();
      setProducts(prev => prev.map(p => p.id === id ? savedProduct : p));
      toast({ title: "Product Updated", description: `${savedProduct.name} has been updated.` });
      await fetchAllData();
    } catch (error) {
      toast({ title: "Error", description: "Failed to update product.", variant: "destructive" });
    }
  };

  const deleteProduct = async (id) => {
    if (!verifyUser()) return;
    const product = products.find(p => p.id === id);
    if (!product) return;
    if (currentUser?.role === 'merchant' && product.merchantId !== currentUser.id) {
       toast({ title: "Permission Denied", description: "You can only delete your own products.", variant: "destructive" });
       return;
    }
    try {
    const response = await fetch(`${API_BASE_URL}/api/products/${id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete product');
      setProducts(prev => prev.filter(p => p.id !== id));
      setInventory(prev => prev.filter(i => i.productId !== id));
      setTransactions(prev => prev.filter(t => t.productId !== id));
      setOrders(prev => prev.map(o => ({ ...o, items: o.items.filter(item => item.productId !== id) })));
      setInbounds(prev => prev.map(i => ({ ...i, items: i.items.filter(item => item.productId !== id) })));
      toast({ title: "Product Deleted", description: `${product.name} and related data removed.`, variant: "destructive" });
      await fetchAllData();
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete product.", variant: "destructive" });
    }
  };

  // --- Inventory CRUD ---
   const addInventoryItem = async (item) => {
     if (!verifyUser()) return;
     const existingItem = inventory.find(i => i.productId === item.productId && i.merchantId === item.merchantId);
     if (existingItem) {
       await updateInventoryItem(existingItem.id, { quantity: existingItem.quantity + item.quantity });
     } else {
       const newItem = { id: `inv-${Date.now()}`, ...item };
       const savedItem = await addDataToBackend('inventory', newItem, setInventory);
       if (savedItem) {
         const productName = products.find(p => p.id === item.productId)?.name || 'Item';
         toast({ title: "Inventory Item Added", description: `${productName} added to inventory.` });
         await fetchAllData();
       }
     }
   };

   const removeInventoryItemQuantity = async (item) => {
     if (!verifyUser()) return false;
     const existingItem = inventory.find(i => i.productId === item.productId && i.merchantId === item.merchantId);
     if (existingItem) {
       const newQuantity = existingItem.quantity - item.quantity;
       if (newQuantity < 0) {
         toast({ title: "Inventory Error", description: `Cannot remove more than available inventory for product.`, variant: "destructive" });
         return false;
       }
       await updateInventoryItem(existingItem.id, { quantity: newQuantity });
       return true;
     } else {
       toast({ title: "Inventory Error", description: `Inventory item not found for removal.`, variant: "destructive" });
       return false;
     }
   };

   const updateInventoryItem = async (id, updatedItem) => {
     if (!verifyUser()) return;
     try {
      const response = await fetch(`${API_BASE_URL}/api/inventory/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updatedItem, id }),
      });
      if (response.status === 404) {
        // Item not found, try to create it
        const createRes = await fetch(`${API_BASE_URL}/api/inventory/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...updatedItem, id }),
        });
        if (!createRes.ok) throw new Error('Failed to create inventory item after 404');
        // Try update again (in case more fields need to be set)
        const retryRes = await fetch(`${API_BASE_URL}/api/inventory/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...updatedItem, id }),
        });
        if (!retryRes.ok) throw new Error('Failed to update inventory item after creation');
        const savedItem = await retryRes.json();
        setInventory(prev => prev.map(i => i.id === id ? savedItem : i));
        await fetchAllData();
        return;
      }
      if (!response.ok) throw new Error('Failed to update inventory item');
      const savedItem = await response.json();
      setInventory(prev => prev.map(i => i.id === id ? savedItem : i));
      await fetchAllData();
    } catch (error) {
      toast({ title: "Error", description: "Failed to update inventory item.", variant: "destructive" });
    }
   };

   const deleteInventoryItem = async (id) => {
     if (!verifyUser()) return;
     const item = inventory.find(i => i.id === id);
     if (!item) return;
     if (currentUser?.role === 'merchant' && item.merchantId !== currentUser.id) {
        toast({ title: "Permission Denied", description: "You can only delete your own inventory.", variant: "destructive" });
        return;
     }
     try {
      const response = await fetch(`${API_BASE_URL}/api/inventory/${id}`, { method: 'DELETE' });
       if (!response.ok) throw new Error('Failed to delete inventory item');
       setInventory(prev => prev.filter(i => i.id !== id));
       toast({ title: "Inventory Item Deleted", description: `${products.find(p => p.id === item.productId)?.name || 'Item'} inventory record removed.`, variant: "destructive" });
       await fetchAllData();
     } catch (error) {
       toast({ title: "Error", description: "Failed to delete inventory item.", variant: "destructive" });
     }
   };

  // --- Transaction Handling ---
  const addTransaction = async (transaction) => {
    if (!verifyUser()) return;
    const fullTransaction = { ...transaction, id: `txn-${Date.now()}`, date: new Date().toISOString().split('T')[0] };
    const savedTransaction = await addDataToBackend('transactions', fullTransaction, setTransactions);
    if (!savedTransaction) return;

    const productName = products.find(p => p.id === transaction.productId)?.name || 'Item';
    let description = `${transaction.type.charAt(0).toUpperCase() + transaction.type.slice(1)}`;
    if (transaction.quantity && transaction.type !== 'dispatch_fee' && transaction.type !== 'inbound_fee') description += ` (${transaction.quantity > 0 ? '+' : ''}${transaction.quantity})`;
    if (productName && transaction.productId) description += ` - ${productName}`;
    if (transaction.amount) description += `. Amount: ₹${transaction.amount.toFixed(2)}.`;
    if (transaction.notes) description += ` Notes: ${transaction.notes}`;

    toast({
      title: "Transaction Recorded",
      description: description,
    });
  };

  // Add received payment with monthly terms (admin only)
  const addReceivedPayment = async ({ merchantId, amount, notes, monthlyTerms }) => {
    if (!verifyUser()) return;
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'superadmin') {
      toast({ title: "Permission Denied", description: "Only admins can add received payments.", variant: "destructive" });
      return;
    }
    const fullTransaction = {
      id: `txn-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      merchantId,
      type: 'received_payment',
      amount,
      notes: notes ? `${notes} (Monthly Terms: ${monthlyTerms})` : `Monthly Terms: ${monthlyTerms}`,
      monthlyTerms
    };
    const savedTransaction = await addDataToBackend('transactions', fullTransaction, setTransactions);
    if (!savedTransaction) return;

    toast({
      title: "Received Payment Added",
      description: `Received payment of ₹${amount.toFixed(2)} added for merchant ${merchantId}.`,
    });
  };

  // --- Order Management ---

  const calculateOrderPrice = (items) => {
    const unitPrice = 7;
    return items.reduce((sum, item) => sum + (item.quantity * unitPrice), 0);
  };

  const addOrder = async (order) => {
    if (!verifyUser()) return;
    const price = calculateOrderPrice(order.items || []);
    const newOrder = { ...order, id: `ord-${Date.now()}`, merchantId: order.merchantId || currentUser?.id, status: 'pending', date: new Date().toISOString().split('T')[0], price };
    const savedOrder = await addDataToBackend('orders', newOrder, setOrders);
    if (savedOrder) {
      toast({ title: "Order Added", description: `Order ${savedOrder.id} created and is pending.` });
      await fetchAllData();
    }
  };

  // Add return order with RTO or Damaged option
  const addReturnOrder = async (returnOrder, returnType) => {
    if (!verifyUser()) return;
    const price = calculateOrderPrice(returnOrder.items || []);
    const newOrder = { ...returnOrder, id: `ret-${Date.now()}`, merchantId: returnOrder.merchantId, status: 'return', date: new Date().toISOString().split('T')[0], price, returnType };
    const savedReturnOrder = await addDataToBackend('orders', newOrder, setOrders);
    if (savedReturnOrder) {
      toast({ title: "Return Order Added", description: `Return order ${savedReturnOrder.id} created with type ${returnType}.` });
      await fetchAllData();
    }

    if (returnType === 'RTO') {
      // Increase inventory for returned items
      returnOrder.items.forEach(item => {
        const existingItem = inventory.find(i => i.productId === item.productId && i.merchantId === returnOrder.merchantId);
        if (existingItem) {
          updateInventoryItem(existingItem.id, { quantity: existingItem.quantity + item.quantity });
        } else {
          // Instead of direct state update, use addInventoryItem to persist new inventory item
          addInventoryItem({
            productId: item.productId,
            merchantId: returnOrder.merchantId,
            quantity: item.quantity,
            location: 'Default Warehouse',
            minStockLevel: 0,
            maxStockLevel: 0,
          });
        }
      });
    }

    if (savedReturnOrder) {
      toast({ title: "Return Order Added", description: `Return order ${savedReturnOrder.id} created with type ${returnType}.` });
    }
  };

  const updateOrder = async (orderId, updatedFields) => {
    if (!verifyUser()) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updatedFields, id: orderId }),
      });
      if (!response.ok) throw new Error('Failed to update order');
      const savedOrder = await response.json();
      setOrders(prev => prev.map(o => o.id === orderId ? savedOrder : o));
      toast({ title: "Order Updated", description: `Order ${orderId} has been updated.` });
      await fetchAllData();
    } catch (error) {
      toast({ title: "Error", description: "Failed to update order.", variant: "destructive" });
    }
  };

  const removeOrder = async (orderId) => {
    if (!verifyUser()) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete order');
      setOrders(prev => prev.filter(o => o.id !== orderId));
      toast({ title: "Order Removed", description: `Order ${orderId} has been removed.` });
      await fetchAllData();
    } catch (error) {
      toast({ title: "Error", description: "Failed to remove order.", variant: "destructive" });
    }
  };

  const dispatchOrder = async (orderId) => {
    if (!verifyUser()) return;
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'superadmin') {
       toast({ title: "Permission Denied", description: "Only admins can dispatch orders.", variant: "destructive" });
       return;
    }
    const orderIndex = orders.findIndex(o => o.id === orderId);
    if (orderIndex === -1) return;
    const order = orders[orderIndex];

    let inventoryUpdated = true;
    let updatedInventory = [...inventory];
    let changedInventory = [];

    order.items.forEach(item => {
      const invIndex = updatedInventory.findIndex(inv => inv.productId === item.productId && inv.merchantId === order.merchantId);
      if (invIndex !== -1) {
        const invItem = updatedInventory[invIndex];
        const newQuantity = invItem.quantity - item.quantity;
        if (newQuantity < 0) {
           toast({ title: "Dispatch Error", description: `Insufficient stock for ${products.find(p=>p.id === item.productId)?.name || 'product'} (Order ${orderId}).`, variant: "destructive" });
           inventoryUpdated = false;
           return;
        }
        updatedInventory[invIndex] = { ...invItem, quantity: newQuantity };
        changedInventory.push({ ...invItem, quantity: newQuantity });
        if (newQuantity <= invItem.minStockLevel && invItem.minStockLevel > 0) {
           const productName = products.find(p => p.id === item.productId)?.name || 'Item';
           toast({
             title: "Low Stock Alert",
             description: `${productName} is running low (${newQuantity} remaining) after dispatching order ${orderId}.`,
             variant: "destructive",
             duration: 10000,
           });
        }
      } else {
         const productName = products.find(p => p.id === item.productId)?.name || 'Item';
         toast({ title: "Inventory Warning", description: `Could not find inventory for ${productName} to dispatch order ${orderId}.`, variant: "destructive" });
         inventoryUpdated = false;
         return;
      }
    });

    if (!inventoryUpdated) return;

    setInventory(updatedInventory);
    // Persist inventory changes to backend
    for (const inv of changedInventory) {
      await updateInventoryItem(inv.id, { quantity: inv.quantity });
    }
    await updateOrder(orderId, { status: 'dispatched', dispatchDate: new Date().toISOString().split('T')[0] });

    const totalQuantity = order.items.reduce((sum, item) => sum + item.quantity, 0);

    // Calculate dispatch fee per item using new calculator
    let totalDispatchFee = 0;
    order.items.forEach(item => {
      const product = products.find(p => p.id === item.productId);
      if (product) {
        const actualWeight = product.weightKg || 0;
        const length = product.lengthCm || 0;
        const breadth = product.breadthCm || 0;
        const height = product.heightCm || 0;
        const volumetricWeight = calculateVolumetricWeight(length, breadth, height);
        const feePerItem = calculateDispatchFee(actualWeight, volumetricWeight, product.packingType || 'normal packing');
        totalDispatchFee += feePerItem * item.quantity;
      }
    });

    addTransaction({
      merchantId: order.merchantId,
      orderId: order.id,
      productId: null, // Fee applies to order, not a specific product line item
      type: 'dispatch_fee',
      quantity: totalQuantity,
      notes: `Packing & Dispatch fee for order ${order.id}`,
      amount: totalDispatchFee
    });

    // Persist inventory changes to backend
    for (const inv of changedInventory) {
      await updateInventoryItem(inv.id, { quantity: inv.quantity });
    }

    toast({ title: "Order Dispatched", description: `Order ${orderId} marked as dispatched and inventory updated.` });
  };

  const markOrderPacked = async (orderId) => {
    if (!verifyUser()) return;
    if (currentUser?.role !== 'admin' && currentUser?.role !== 'superadmin') {
       toast({ title: "Permission Denied", description: "Only admins can mark orders as packed.", variant: "destructive" });
       return;
    }
    await updateOrder(orderId, { status: 'packed' });
    toast({ title: "Order Updated", description: `Order ${orderId} marked as packed.` });
  };

  // --- Inbound Management ---
   let isSubmittingInbound = false; // Prevent double submissions
   const addInboundRequest = async (inboundData) => {
     if (!verifyUser()) return;
     if (isSubmittingInbound) return; // Guard against double submit
     isSubmittingInbound = true;
     // Calculate total weight using max of actual and volumetric weight per item
     const totalWeightKg = inboundData.items.reduce((sum, item) => {
       const product = products.find(p => p.id === item.productId);
       if (!product) return sum;
       const actualWeight = product.weightKg || 0;
       const length = product.lengthCm || 0;
       const breadth = product.breadthCm || 0;
       const height = product.heightCm || 0;
       const volumetricWeight = (length * breadth * height) / 5000; // volumetric weight in kg
       const weightToUse = Math.max(actualWeight, volumetricWeight);
       return sum + (item.quantity * weightToUse);
     }, 0);

     // Calculate fee: ₹5 per 500g (0.5kg), round up
     const fee = Math.ceil(totalWeightKg / 0.5) * 5;

     // --- Ensure pickupLocation is set for both inbound and outbound ---
     let pickupLocation = inboundData.pickupLocation;
     if (inboundData.type === 'outbound' && inboundData.deliveryLocation) {
       pickupLocation = inboundData.deliveryLocation;
     }

     const newInbound = {
       ...inboundData,
       id: `inb-${Date.now()}`,
       merchantId: currentUser?.id,
       status: 'pending',
       date: new Date().toISOString().split('T')[0],
       totalWeightKg: totalWeightKg,
       fee: fee,
       pickupLocation // always set for both types
     };
     try {
       const response = await fetch(`${API_BASE_URL}/api/inbounds`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify(newInbound),
       });
       if (!response.ok) {
         toast({ title: "Error", description: "Failed to save inbound request to server.", variant: "destructive" });
         isSubmittingInbound = false;
         return;
       }
       const savedInbound = await response.json();
       setInbounds(prev => [savedInbound, ...prev]);
       toast({ title: "Inbound Request Added", description: `Pickup scheduled for ${savedInbound.pickupDate}. Estimated fee: ₹${fee.toFixed(2)}` });
     } catch (error) {
       toast({ title: "Error", description: "Error saving inbound request to server.", variant: "destructive" });
     } finally {
       isSubmittingInbound = false;
     }
  };

   const receiveInbound = async (inboundId) => {
     if (!verifyUser()) return;
     if (currentUser?.role !== 'admin' && currentUser?.role !== 'superadmin') {
        toast({ title: "Permission Denied", description: "Only admins can receive inbounds.", variant: "destructive" });
        return;
     }
     const inbound = inbounds.find(i => i.id === inboundId);
     if (!inbound) return;

     const updatedInbound = { ...inbound, status: 'completed', receivedDate: new Date().toISOString().split('T')[0] };

     try {
      const response = await fetch(`${API_BASE_URL}/api/inbounds/${inboundId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedInbound),
      });
       if (!response.ok) {
         toast({ title: "Error", description: "Failed to update inbound status on server.", variant: "destructive" });
         return;
       }
       const savedInbound = await response.json();
       setInbounds(prev => prev.map(i => i.id === inboundId ? savedInbound : i));

       if (savedInbound.type === 'inbound') {
         savedInbound.items.forEach(item => {
           addInventoryItem({
             merchantId: savedInbound.merchantId,
             productId: item.productId,
             quantity: item.quantity,
             location: 'Default Warehouse',
             minStockLevel: 0,
             maxStockLevel: 0,
           });
         });

         addTransaction({
           merchantId: savedInbound.merchantId,
           inboundId: savedInbound.id,
           productId: null,
           type: 'inbound_fee',
           quantity: 1,
           notes: `Inbound fee for shipment ${savedInbound.id}`,
           amount: savedInbound.fee
         });

         toast({ title: "Inbound Received", description: `Inbound ${inboundId} marked as completed and inventory updated.` });
       } else if (savedInbound.type === 'outbound') {
         let inventoryUpdated = true;
         let updatedInventory = [...inventory];

         savedInbound.items.forEach(item => {
           const invIndex = updatedInventory.findIndex(inv => inv.productId === item.productId && inv.merchantId === savedInbound.merchantId);
           if (invIndex !== -1) {
             const invItem = updatedInventory[invIndex];
             const newQuantity = invItem.quantity - item.quantity;
             if (newQuantity < 0) {
               toast({ title: "Inventory Error", description: `Insufficient stock for ${products.find(p => p.id === item.productId)?.name || 'product'}.`, variant: "destructive" });
               inventoryUpdated = false;
               return;
             }
             updatedInventory[invIndex] = { ...invItem, quantity: newQuantity };
           } else {
             toast({ title: "Inventory Error", description: `Inventory item not found for product removal.`, variant: "destructive" });
             inventoryUpdated = false;
             return;
           }
         });

         if (!inventoryUpdated) return;

         setInventory(updatedInventory);

         addTransaction({
           merchantId: savedInbound.merchantId,
           inboundId: savedInbound.id,
           productId: null,
           type: 'outbound_fee',
           quantity: 1,
           notes: `Outbound fee for shipment ${savedInbound.id}`,
           amount: savedInbound.fee
         });

         toast({ title: "Outbound Processed", description: `Outbound ${inboundId} marked as completed and inventory updated.` });
       }
     } catch (error) {
       toast({ title: "Error", description: "Error updating inbound status on server.", variant: "destructive" });
     }
   };

   // --- Admin User Management ---
   const addAdmin = async (adminDetails) => {
      if (!verifyUser()) return false;
      if (currentUser?.role !== 'superadmin') {
         toast({ title: "Permission Denied", description: "Only Super Admins can add admins.", variant: "destructive" });
         return false;
      }
      if (!adminDetails.email || !adminDetails.password || !adminDetails.companyName) {
        toast({ title: "Admin Creation Failed", description: "Please fill all required fields.", variant: "destructive" });
        return false;
      }
      if (users.some(u => u.email === adminDetails.email)) {
        toast({ title: "Admin Creation Failed", description: "Email already exists.", variant: "destructive" });
        return false;
      }
      const newAdmin = {
        id: `admin-${Date.now()}`,
        role: 'admin',
        ...adminDetails
      };
      try {
      const response = await fetch(`${API_BASE_URL}/api/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAdmin),
      });
        if (!response.ok) {
          toast({ title: "Admin Creation Failed", description: "Failed to save admin to server.", variant: "destructive" });
          return false;
        }
        const savedAdmin = await response.json();
        setUsers(prev => [...prev, savedAdmin]);
        toast({ title: "Admin Added", description: `${savedAdmin.companyName} has been added as an admin.` });
        return true;
      } catch (error) {
        toast({ title: "Admin Creation Failed", description: "Error saving admin to server.", variant: "destructive" });
        return false;
      }
   };

   const removeUser = async (userId) => {
    if (!verifyUser()) return;
      const userToRemove = users.find(u => u.id === userId);
      if (!userToRemove) return;

      if (currentUser?.role === 'superadmin' && userId !== currentUser.id) {
         // Allow removal
      } else if (currentUser?.role === 'admin' && userToRemove.role === 'merchant') {
         // Allow removal
      } else {
         toast({ title: "Permission Denied", description: "You do not have permission to remove this user.", variant: "destructive" });
         return;
      }

      try {
      const response = await fetch(`${API_BASE_URL}/api/users/${userId}`, { method: 'DELETE' });
        if (!response.ok) {
          toast({ title: "User Removal Failed", description: "Failed to remove user from server.", variant: "destructive" });
          return;
        }
        setUsers(prev => prev.filter(u => u.id !== userId));
        toast({ title: "User Removed", description: `${userToRemove.companyName} has been removed.`, variant: "destructive" });
      } catch (error) {
        toast({ title: "User Removal Failed", description: "Error removing user from server.", variant: "destructive" });
      }
   };


  // Filter data for merchants to only their own
  const filteredProducts = currentUser?.role === 'merchant' ? products.filter(p => p.merchantId === currentUser.id) : products;
  const filteredInventory = currentUser?.role === 'merchant' ? inventory.filter(i => i.merchantId === currentUser.id) : inventory;
  const filteredTransactions = currentUser?.role === 'merchant' ? transactions.filter(t => t.merchantId === currentUser.id) : transactions;
  const filteredOrders = currentUser?.role === 'merchant' ? orders.filter(o => o.merchantId === currentUser.id) : orders;
  const filteredInbounds = currentUser?.role === 'merchant' ? inbounds.filter(i => i.merchantId === currentUser.id) : inbounds;
  const filteredUsers = currentUser?.role === 'merchant' ? users.filter(u => u.id === currentUser.id) : users;

  const [savedPickupLocations, setSavedPickupLocations] = useState([]);

  const addPickupLocation = async (location) => {
    if (!verifyUser()) return;
    const newLocation = { id: `loc-${Date.now()}`, ...location };
    try {
      const response = await fetch(`${API_BASE_URL}/api/savedPickupLocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLocation),
      });
      if (!response.ok) throw new Error('Failed to add pickup location');
      const savedLocation = await response.json();
      setSavedPickupLocations(prev => [savedLocation, ...prev]);
    } catch (error) {
      toast({ title: "Error", description: "Failed to save pickup location to server.", variant: "destructive" });
    }
  };

  const updatePickupLocation = async (id, updatedLocation) => {
    if (!verifyUser()) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/savedPickupLocations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedLocation),
      });
      if (!response.ok) throw new Error('Failed to update pickup location');
      const savedLocation = await response.json();
      setSavedPickupLocations(prev => prev.map(loc => loc.id === id ? savedLocation : loc));
    } catch (error) {
      toast({ title: "Error", description: "Failed to update pickup location on server.", variant: "destructive" });
    }
  };

  const deletePickupLocation = async (id) => {
    if (!verifyUser()) return;
    try {
      const response = await fetch(`${API_BASE_URL}/api/savedPickupLocations/${id}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Failed to delete pickup location');
      setSavedPickupLocations(prev => prev.filter(loc => loc.id !== id));
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete pickup location from server.", variant: "destructive" });
    }
  };

  return (
    <InventoryContext.Provider value={{
      products: filteredProducts, addProduct, updateProduct, deleteProduct,
      inventory: enhancedInventory, addInventoryItem, updateInventoryItem, deleteInventoryItem,
      transactions: filteredTransactions, addTransaction,
      orders: filteredOrders, addOrder, addReturnOrder, updateOrder, removeOrder, dispatchOrder, markOrderPacked,
      inbounds: filteredInbounds, setInbounds, addInboundRequest, receiveInbound,
      users: filteredUsers, setUsers,
      savedPickupLocations, addPickupLocation, updatePickupLocation, deletePickupLocation,
      currentUser, setCurrentUser, login, register, logout,
      addAdmin, removeUser
    }}>
      {children}
    </InventoryContext.Provider>
  );
};

// --- Hook ---
export const useInventory = () => {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('useInventory must be used within an InventoryProvider');
  }
  return context;
};
