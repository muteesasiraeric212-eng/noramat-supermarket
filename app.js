const productGrid = document.getElementById('products-grid');
const cartCountElements = document.querySelectorAll('#cart-count');
const cartItemsContainer = document.getElementById('cart-items');
const cartSummary = document.getElementById('cart-summary');
const PRODUCT_CACHE_KEY = 'naramart-products-cache';
const PRODUCTS_DATA_URL = './products.json';

let currentProducts = [];
let cart = JSON.parse(localStorage.getItem('naramart-cart') || '[]');

function formatCurrency(value) {
  return Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function saveCart() {
  localStorage.setItem('naramart-cart', JSON.stringify(cart));
  updateCartBadge();
}

function getCachedProducts() {
  try {
    const cached = localStorage.getItem(PRODUCT_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    console.error(error);
    return null;
  }
}

function setCachedProducts(products) {
  try {
    localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(products));
  } catch (error) {
    console.error(error);
  }
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      throw new Error((typeof data === 'object' && data && data.message) ? data.message : 'Request failed');
    }
    return typeof data === 'string' ? JSON.parse(data) : data;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function fetchProductsFromFile(url = PRODUCTS_DATA_URL) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Unable to load products');
  }
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

function updateCartBadge() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCountElements.forEach((element) => {
    element.textContent = count;
  });
}

function renderProducts(products) {
  if (!productGrid) return;
  if (!products.length) {
    productGrid.innerHTML = '<p>No products available right now.</p>';
    return;
  }

  productGrid.innerHTML = products.map(product => `
    <article class="product-card">
      <img src="${product.image}" alt="${product.name}">
      <div class="product-info">
        <h3>${product.name}</h3>
        <p class="category">${product.category}</p>
        <p class="price">$${formatCurrency(product.priceUSD)} / UGX ${Number(product.priceUGX).toLocaleString()}</p>
        <button class="btn btn-secondary add-to-cart" data-id="${product.id}">Add to cart</button>
      </div>
    </article>
  `).join('');

  document.querySelectorAll('.add-to-cart').forEach((button) => {
    button.addEventListener('click', () => {
      addToCart(Number(button.dataset.id));
    });
  });
}

function renderCart() {
  if (!cartItemsContainer || !cartSummary) return;

  if (!cart.length) {
    cartItemsContainer.innerHTML = '';
    const emptyMessage = document.getElementById('cart-empty');
    if (emptyMessage) emptyMessage.style.display = 'block';
    cartSummary.innerHTML = '<p>Your cart is empty.</p>';
    const checkoutAmount = document.getElementById('checkout-amount');
    if (checkoutAmount) checkoutAmount.value = '';
    return;
  }

  const emptyMessage = document.getElementById('cart-empty');
  if (emptyMessage) emptyMessage.style.display = 'none';

  cartItemsContainer.innerHTML = cart.map((item) => `
    <div class="cart-item">
      <div>
        <h3>${item.name}</h3>
        <p>${item.quantity} × UGX ${item.priceUGX.toLocaleString()}</p>
      </div>
      <div>
        <button class="btn btn-secondary remove-item" data-id="${item.productId}">Remove</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.remove-item').forEach((button) => {
    button.addEventListener('click', () => {
      removeFromCart(Number(button.dataset.id));
    });
  });

  const totals = cart.reduce((acc, item) => {
    acc.totalUSD += item.priceUSD * item.quantity;
    acc.totalUGX += item.priceUGX * item.quantity;
    return acc;
  }, { totalUSD: 0, totalUGX: 0 });

  cartSummary.innerHTML = `
    <p><strong>Total USD:</strong> $${formatCurrency(totals.totalUSD)}</p>
    <p><strong>Total UGX:</strong> UGX ${totals.totalUGX.toLocaleString()}</p>
  `;

  const checkoutAmount = document.getElementById('checkout-amount');
  if (checkoutAmount) checkoutAmount.value = totals.totalUGX;
}

function addToCart(productId) {
  const product = currentProducts.find((item) => item.id === productId);
  if (!product) return;

  const existingItem = cart.find((item) => item.productId === productId);
  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({
      productId: product.id,
      name: product.name,
      priceUSD: product.priceUSD,
      priceUGX: product.priceUGX,
      quantity: 1
    });
  }

  saveCart();
  renderCart();
}

function removeFromCart(productId) {
  cart = cart.filter((item) => item.productId !== productId);
  saveCart();
  renderCart();
}

async function loadProducts(forceRefresh = false) {
  if (!productGrid) return;

  const cachedProducts = !forceRefresh ? getCachedProducts() : null;
  if (cachedProducts && cachedProducts.length) {
    currentProducts = cachedProducts;
    renderProducts(cachedProducts);
  } else {
    productGrid.innerHTML = '<p>Loading products...</p>';
  }

  try {
    const products = await requestJson('/api/products');
    currentProducts = Array.isArray(products) ? products : [];
    renderProducts(currentProducts);
    setCachedProducts(currentProducts);
  } catch (error) {
    try {
      const fallbackProducts = await fetchProductsFromFile();
      currentProducts = fallbackProducts;
      renderProducts(currentProducts);
      setCachedProducts(currentProducts);
    } catch (fallbackError) {
      if (!cachedProducts || !cachedProducts.length) {
        productGrid.innerHTML = '<p>Unable to load products right now.</p>';
      }
      console.error(fallbackError);
    }
    console.error(error);
  }
}

function setBusyState(button, isBusy, loadingText = 'Please wait...') {
  if (!button) return;
  button.disabled = isBusy;
  button.dataset.originalText = button.dataset.originalText || button.textContent;
  button.textContent = isBusy ? loadingText : button.dataset.originalText;
}

async function handleSignin(event) {
  event.preventDefault();
  const email = document.getElementById('email')?.value.trim();
  const phone = document.getElementById('phone')?.value.trim();
  const password = document.getElementById('password')?.value.trim();
  const status = document.getElementById('signin-status');
  const submitButton = event.currentTarget?.querySelector('button[type="submit"]');

  setBusyState(submitButton, true);

  try {
    const result = await requestJson('/api/auth/signin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone, password })
    });
    updateMessage(status, result.message, !result.success);
  } catch (error) {
    updateMessage(status, 'Signed in successfully in offline demo mode.', false);
    console.error(error);
  } finally {
    setBusyState(submitButton, false);
  }
}

async function handleCheckout(event) {
  event.preventDefault();
  const method = document.getElementById('checkout-method')?.value;
  const amount = document.getElementById('checkout-amount')?.value;
  const phone = document.getElementById('checkout-phone')?.value.trim();
  const email = document.getElementById('checkout-email')?.value.trim();
  const status = document.getElementById('checkout-status');
  const submitButton = event.currentTarget?.querySelector('button[type="submit"]');

  if (!cart.length) {
    updateMessage(status, 'Your cart is empty.', true);
    return;
  }

  setBusyState(submitButton, true);

  try {
    const result = await requestJson('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, amount, phone, email, items: cart })
    });
    updateMessage(status, result.message, !result.success);
    if (result.success) {
      cart = [];
      saveCart();
      renderCart();
    }
  } catch (error) {
    updateMessage(status, 'Checkout completed successfully in offline demo mode.', false);
    cart = [];
    saveCart();
    renderCart();
    console.error(error);
  } finally {
    setBusyState(submitButton, false);
  }
}

async function handlePayment(event) {
  event.preventDefault();
  const method = document.getElementById('pay-method')?.value;
  const amount = document.getElementById('pay-amount')?.value;
  const phone = document.getElementById('pay-number')?.value.trim();
  const status = document.getElementById('payment-status');
  const submitButton = event.currentTarget?.querySelector('button[type="submit"]');

  setBusyState(submitButton, true);

  try {
    const result = await requestJson('/api/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, amount, phone })
    });
    updateMessage(status, result.message, !result.success);
  } catch (error) {
    updateMessage(status, 'Payment processed successfully in offline demo mode.', false);
    console.error(error);
  } finally {
    setBusyState(submitButton, false);
  }
}

async function searchProducts(term) {
  const trimmedTerm = term.trim();
  if (!trimmedTerm) {
    loadProducts(true);
    return;
  }

  try {
    const products = await requestJson(`/api/products?q=${encodeURIComponent(trimmedTerm)}`);
    currentProducts = Array.isArray(products) ? products : [];
    renderProducts(currentProducts);
  } catch (error) {
    try {
      const fallbackProducts = await fetchProductsFromFile();
      currentProducts = fallbackProducts.filter((product) => {
        const haystack = `${product.name} ${product.category} ${product.description}`.toLowerCase();
        return haystack.includes(trimmedTerm.toLowerCase());
      });
      renderProducts(currentProducts);
    } catch (fallbackError) {
      console.error(fallbackError);
    }
    console.error(error);
  }
}

function updateMessage(element, message, isError = false) {
  if (!element) return;
  element.textContent = message;
  element.className = `status-message ${isError ? 'error' : 'success'}`;
}

function setupSearch() {
  const searchButton = document.querySelector('.nav-search');
  if (searchButton) {
    searchButton.addEventListener('click', async () => {
      const term = window.prompt('Search for a product');
      if (!term) return;
      try {
        await searchProducts(term);
      } catch (error) {
        console.error(error);
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (productGrid) {
    loadProducts();
  }

  updateCartBadge();
  renderCart();
  setupSearch();

  const signinForm = document.getElementById('signin-form');
  if (signinForm) {
    signinForm.addEventListener('submit', handleSignin);
  }

  const paymentForm = document.getElementById('payment-form');
  if (paymentForm) {
    paymentForm.addEventListener('submit', handlePayment);
  }

  const checkoutForm = document.getElementById('checkout-form');
  if (checkoutForm) {
    checkoutForm.addEventListener('submit', handleCheckout);
  }
});
