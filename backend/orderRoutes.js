const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

// Define Order schema
const orderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  merchantId: String,
  customerName: String,
  address: String,
  city: String,
  state: String,
  pincode: String,
  phone: String,
  items: [
    {
      productId: String,
      name: String,
      quantity: Number,
    }
  ],
  status: String,
  date: String,
  shippingLabelBase64: String, // Store base64 encoded PDF
});

const Order = mongoose.model('Order', orderSchema);

// POST endpoint to add new order
router.post('/orders', async (req, res) => {
  const orderData = req.body;
  if (!orderData.id) {
    return res.status(400).json({ error: 'Order id is required' });
  }
  try {
    const existingOrder = await Order.findOne({ id: orderData.id });
    if (existingOrder) {
      return res.status(409).json({ error: 'Order with this id already exists' });
    }
    const newOrder = new Order(orderData);
    await newOrder.save();
    res.status(201).json(newOrder);
  } catch (err) {
    console.error('Error saving order:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// GET endpoint to retrieve orders
router.get('/orders', async (req, res) => {
  try {
    const orders = await Order.find().sort({ date: -1 });
    res.json(orders);
  } catch (err) {
    console.error('Error fetching orders:', err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
