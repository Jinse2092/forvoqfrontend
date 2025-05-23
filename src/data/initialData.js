export const initialProducts = [
  { id: '1', merchantId: 'merchant-1', name: 'Laptop Pro 15"', sku: 'LP15-001', category: 'Electronics', price: 1299.99, cost: 950, description: '16GB RAM, 512GB SSD', imageUrl: '/images/placeholder-150.png', weightKg: 1.8 },
  { id: '2', merchantId: 'merchant-1', name: 'Smartphone X', sku: 'SPX-002', category: 'Electronics', price: 799.99, cost: 550, description: '128GB, 5G', imageUrl: '/images/placeholder-150.png', weightKg: 0.2 },
  { id: '3', merchantId: 'merchant-2', name: 'Ergo Office Chair', sku: 'OC-ERG-003', category: 'Furniture', price: 249.99, cost: 150, description: 'Lumbar support, mesh back', imageUrl: '/images/placeholder-150.png', weightKg: 15 },
  { id: '4', merchantId: 'merchant-1', name: 'LED Desk Lamp', sku: 'DL-LED-004', category: 'Lighting', price: 39.99, cost: 20, description: 'Adjustable brightness', imageUrl: '/images/placeholder-150.png', weightKg: 0.8 },
  { id: '5', merchantId: 'merchant-2', name: 'Wireless ANC Headphones', sku: 'HP-ANC-005', category: 'Audio', price: 199.99, cost: 110, description: '30-hour battery', imageUrl: '/images/placeholder-150.png', weightKg: 0.3 },
];

export const initialInventory = [
  { id: 'inv-1', merchantId: 'merchant-1', productId: '1', quantity: 25, location: 'Warehouse A', minStockLevel: 10, maxStockLevel: 50 },
  { id: 'inv-2', merchantId: 'merchant-1', productId: '2', quantity: 42, location: 'Warehouse A', minStockLevel: 15, maxStockLevel: 60 },
  { id: 'inv-3', merchantId: 'merchant-2', productId: '3', quantity: 18, location: 'Warehouse B', minStockLevel: 5, maxStockLevel: 30 },
  { id: 'inv-4', merchantId: 'merchant-1', productId: '4', quantity: 36, location: 'Warehouse B', minStockLevel: 10, maxStockLevel: 40 },
  { id: 'inv-5', merchantId: 'merchant-2', productId: '5', quantity: 12, location: 'Warehouse A', minStockLevel: 8, maxStockLevel: 25 },
];

export const initialTransactions = [
  { id: 'txn-1', merchantId: 'merchant-1', productId: '1', type: 'purchase', quantity: 10, date: '2025-04-25', notes: 'Supplier order' },
  { id: 'txn-2', merchantId: 'merchant-1', orderId: 'ord-1', productId: '2', type: 'dispatch_fee', quantity: 1, date: '2025-04-26', notes: 'Fee for order ord-1', amount: 7 },
  { id: 'txn-3', merchantId: 'merchant-2', productId: '3', type: 'adjustment', quantity: -1, date: '2025-04-27', notes: 'Damaged' },
  { id: 'txn-4', merchantId: 'merchant-1', orderId: 'ord-2', productId: '1', type: 'dispatch_fee', quantity: 1, date: '2025-04-28', notes: 'Fee for order ord-2', amount: 7 },
  { id: 'txn-5', merchantId: 'merchant-2', productId: '5', type: 'purchase', quantity: 15, date: '2025-04-29', notes: 'Stock arrival' },
  { id: 'txn-6', merchantId: 'merchant-1', inboundId: 'inb-1', type: 'inbound_fee', quantity: 1, date: '2025-04-30', notes: 'Fee for inbound inb-1', amount: 150 },
];

export const initialOrders = [
  { id: 'ord-1', merchantId: 'merchant-1', status: 'dispatched', date: '2025-04-26', items: [{ productId: '2', quantity: 1 }], shippingLabelUrl: null, shippingDetails: { name: 'John Doe', address: '123 Main St' }, dispatchDate: '2025-04-26' },
  { id: 'ord-2', merchantId: 'merchant-1', status: 'pending', date: '2025-04-28', items: [{ productId: '1', quantity: 1 }], shippingLabelUrl: '/labels/sample-label.pdf', shippingDetails: null },
  { id: 'ord-3', merchantId: 'merchant-2', status: 'pending', date: '2025-05-01', items: [{ productId: '5', quantity: 2 }], shippingLabelUrl: null, shippingDetails: { name: 'Jane Smith', address: '456 Oak Ave' } },
];

export const initialInbounds = [
   { id: 'inb-1', merchantId: 'merchant-1', status: 'completed', date: '2025-04-30', items: [{ productId: '4', quantity: 20 }], pickupLocation: 'Merchant Warehouse X', pickupDate: '2025-04-29', pickupTime: '14:00', totalWeightKg: 16, fee: 150, receivedDate: '2025-04-30' },
   { id: 'inb-2', merchantId: 'merchant-2', status: 'pending', date: '2025-05-02', items: [{ productId: '3', quantity: 10 }], pickupLocation: 'Supplier Y', pickupDate: '2025-05-03', pickupTime: '16:00', totalWeightKg: 150, fee: 2250 },
];

export const initialUsers = [
  { id: 'superadmin-0', email: 'leo112944@gmail.com', password: 'pypyabcd', role: 'superadmin', companyName: 'Super Admin' },
  { id: 'admin-1', email: 'admin@fulfill.com', password: 'password', role: 'admin', companyName: 'Fulfillment Admin' },
  { id: 'merchant-1', email: 'merchant1@shop.com', password: 'password', role: 'merchant', companyName: 'Shop One' },
  { id: 'merchant-2', email: 'merchant2@store.com', password: 'password', role: 'merchant', companyName: 'Store Two' },
];
