const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const productsFile = path.join(__dirname, 'products.json');
let products = [];
let orders = [];
const supportedPaymentMethods = ['MTN Mobile Money', 'Airtel Money', 'Visa / Mastercard', 'Bank transfer'];

function loadProducts() {
  try {
    products = JSON.parse(fs.readFileSync(productsFile, 'utf8'));
  } catch (error) {
    console.error('Failed to load products:', error.message);
    products = [];
  }
}

function saveProducts() {
  try {
    fs.writeFileSync(productsFile, JSON.stringify(products, null, 2), 'utf8');
  } catch (error) {
    console.error('Failed to save products:', error.message);
  }
}

function findProduct(id) {
  return products.find((item) => item.id === Number(id));
}

loadProducts();

app.use(express.json());
app.use(require('cors')());
app.use(express.static(path.join(__dirname)));

app.get('/api/status', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ status: 'ok', uptime: process.uptime() });
});

app.get('/api/products', (req, res) => {
  res.set('Cache-Control', 'public, max-age=30');
  const query = (req.query.q || '').trim().toLowerCase();
  if (!query) {
    return res.json(products);
  }

  const filtered = products.filter((product) => {
    return product.name.toLowerCase().includes(query) ||
      product.category.toLowerCase().includes(query) ||
      product.description.toLowerCase().includes(query);
  });

  return res.json(filtered);
});

app.get('/api/products/:id', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  const product = findProduct(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found.' });
  }
  return res.json(product);
});

app.get('/api/categories', (req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  const categories = Array.from(new Set(products.map((product) => product.category))).sort();
  res.json(categories);
});

app.post('/api/products', (req, res) => {
  const { name, category, description, priceUSD, priceUGX, image, stock } = req.body;
  if (!name || !category || !priceUSD || !priceUGX) {
    return res.status(400).json({ success: false, message: 'Required product fields are missing.' });
  }

  const nextId = products.length ? Math.max(...products.map((item) => item.id)) + 1 : 1;
  const newProduct = {
    id: nextId,
    name,
    category,
    description: description || '',
    priceUSD: Number(priceUSD),
    priceUGX: Number(priceUGX),
    image: image || '',
    stock: Number(stock || 0)
  };

  products.push(newProduct);
  saveProducts();
  res.status(201).json({ success: true, product: newProduct });
});

app.put('/api/products/:id', (req, res) => {
  const product = findProduct(req.params.id);
  if (!product) {
    return res.status(404).json({ success: false, message: 'Product not found.' });
  }

  const updates = req.body;
  Object.assign(product, updates);
  saveProducts();
  res.json({ success: true, product });
});

app.delete('/api/products/:id', (req, res) => {
  const currentLength = products.length;
  products = products.filter((item) => item.id !== Number(req.params.id));
  if (products.length === currentLength) {
    return res.status(404).json({ success: false, message: 'Product not found.' });
  }
  saveProducts();
  res.json({ success: true, message: 'Product deleted.' });
});

app.post('/api/cart', (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || !items.length) {
    return res.status(400).json({ success: false, message: 'Cart items are required.' });
  }

  const cart = items.map((item) => {
    const product = findProduct(item.id);
    if (!product) {
      return null;
    }
    return {
      productId: product.id,
      name: product.name,
      quantity: item.quantity || 1,
      priceUSD: product.priceUSD,
      priceUGX: product.priceUGX,
      totalUSD: Number((product.priceUSD * (item.quantity || 1)).toFixed(2)),
      totalUGX: product.priceUGX * (item.quantity || 1)
    };
  }).filter(Boolean);

  if (!cart.length) {
    return res.status(400).json({ success: false, message: 'No valid cart items found.' });
  }

  const totals = cart.reduce((acc, item) => {
    acc.totalUSD += item.totalUSD;
    acc.totalUGX += item.totalUGX;
    return acc;
  }, { totalUSD: 0, totalUGX: 0 });

  return res.json({ success: true, cart, totals });
});

app.post('/api/checkout', (req, res) => {
  const { method, amount, phone, items, email } = req.body;

  if (!supportedPaymentMethods.includes(method)) {
    return res.status(400).json({ success: false, message: 'Selected payment method is not supported.' });
  }

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Enter a valid payment amount.' });
  }

  if ((method === 'MTN Mobile Money' || method === 'Airtel Money') && !phone) {
    return res.status(400).json({ success: false, message: 'A mobile money number is required for this payment method.' });
  }

  const order = {
    id: orders.length + 1,
    reference: `NM-${Date.now()}`,
    method,
    amount: Number(amount),
    phone: phone || null,
    email: email || null,
    items: Array.isArray(items) ? items : [],
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  orders.push(order);

  return res.json({
    success: true,
    message: 'Checkout completed successfully.',
    order
  });
});

app.post('/api/payment', (req, res) => {
  const { method, amount, phone } = req.body;

  if (!supportedPaymentMethods.includes(method)) {
    return res.status(400).json({ success: false, message: 'Selected payment method is not supported.' });
  }

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ success: false, message: 'Enter a valid payment amount.' });
  }

  if ((method === 'MTN Mobile Money' || method === 'Airtel Money') && !phone) {
    return res.status(400).json({ success: false, message: 'A mobile money number is required for this payment method.' });
  }

  return res.json({
    success: true,
    message: `Payment of UGX ${Number(amount).toLocaleString()} via ${method} was received successfully.`,
    payment: {
      method,
      amount: Number(amount),
      phone: phone || null,
      status: 'paid'
    }
  });
});

app.post('/api/auth/register', (req, res) => {
  const { email, phone, password } = req.body;
  if ((!email && !phone) || !password || password.length < 4) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email or phone and password.' });
  }

  return res.status(201).json({
    success: true,
    message: 'Registration successful. You can now sign in.',
    user: {
      email: email || null,
      phone: phone || null
    }
  });
});

app.post('/api/auth/signin', (req, res) => {
  const { email, phone, password } = req.body;
  if ((!email && !phone) || !password || password.length < 4) {
    return res.status(400).json({
      success: false,
      message: 'Please enter a valid email or phone and password.'
    });
  }

  return res.json({
    success: true,
    message: 'Signed in successfully.',
    user: {
      email: email || null,
      phone: phone || null
    }
  });
});

app.get('/api/me', (req, res) => {
  res.json({
    success: true,
    user: {
      name: 'Naramart customer',
      email: null,
      phone: null,
      authenticated: false
    }
  });
});

app.listen(PORT, () => {
  console.log(`Naramart backend running at http://localhost:${PORT}`);
});
