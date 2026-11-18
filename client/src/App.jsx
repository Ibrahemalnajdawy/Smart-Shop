import { useEffect, useMemo, useRef, useState } from "react";
import {
  capturePayPalOrder,
  compareProducts,
  createPayPalOrder,
  getCurrentUser,
  getPayPalConfig,
  getProducts,
  getRecommendations,
  login,
  register,
} from "./api.js";

const categories = ["All products", "Audio", "Automotive", "Beauty & Personal Care", "Books", "Cameras", "Computers", "Fashion", "Gaming", "Home", "Kitchen", "Office", "Outdoor", "Phones", "Sports & Fitness", "Tablets", "Toys & Games", "Wearables"];
const money = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

function App() {
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState("shop");
  const [completedOrder, setCompletedOrder] = useState(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All products");
  const [productsToShow, setProductsToShow] = useState(24);
  const [budget, setBudget] = useState("");
  const [selected, setSelected] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [searchedBudget, setSearchedBudget] = useState(false);
  const [compare, setCompare] = useState(null);
  const [detailProduct, setDetailProduct] = useState(null);
  const [cart, setCart] = useState(() => {
    const savedCart = sessionStorage.getItem("shopsmart-cart");
    if (!savedCart) return [];
    try {
      const parsedCart = JSON.parse(savedCart);
      if (!Array.isArray(parsedCart) || parsedCart.some((item) =>
        !item || typeof item._id !== "string" || !Number.isInteger(item.quantity) ||
        item.quantity < 1 || !Number.isFinite(item.price),
      )) {
        throw new Error("Saved cart data is invalid.");
      }
      return parsedCart;
    } catch (reason) {
      console.error("Could not restore the saved shopping cart.", reason);
      sessionStorage.removeItem("shopsmart-cart");
      return [];
    }
  });
  const [cartOpen, setCartOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [account, setAccount] = useState(null);
  const [authMode, setAuthMode] = useState("");
  const searchInput = useRef(null);
  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);

  useEffect(() => {
    sessionStorage.setItem("shopsmart-cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    getProducts()
      .then(setProducts)
      .catch((reason) => setError(reason.message));
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("shopsmart-token");
    if (!token) return;
    getCurrentUser(token)
      .then(({ user }) => setAccount(user))
      .catch(() => sessionStorage.removeItem("shopsmart-token"));
  }, []);

  useEffect(() => {
    function handleSearchShortcut(event) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInput.current?.focus();
      }
    }
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  const visibleProducts = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = activeCategory === "All products" || product.category === activeCategory;
      const matchesSearch =
        !normalized ||
        [product.name, product.brand, product.category, product.description]
          .join(" ")
          .toLowerCase()
          .includes(normalized);
      return matchesCategory && matchesSearch;
    });
  }, [products, search, activeCategory]);
  const displayedProducts = visibleProducts.slice(0, productsToShow);

  useEffect(() => {
    setProductsToShow(24);
  }, [search, activeCategory]);

  async function findRecommendations(event) {
    event.preventDefault();
    if (!budget || Number(budget) <= 0) {
      setError("Enter a budget greater than $0 to get recommendations.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await getRecommendations(Number(budget), activeCategory === "All products" ? "" : activeCategory);
      setRecommendations(result);
      setSearchedBudget(true);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  async function openComparison() {
    if (selected.length < 2) return;
    setBusy(true);
    setError("");
    try {
      setCompare(await compareProducts(selected));
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleProduct(id) {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= 3) {
        setError("You can compare up to 3 products at a time. Remove a pick to add another.");
        return current;
      }
      setError("");
      return [...current, id];
    });
  }

  function addToCart(product) {
    setCart((current) => {
      const existing = current.find((item) => item._id === product._id);
      return existing
        ? current.map((item) => item._id === product._id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { ...product, quantity: 1 }];
    });
    setDetailProduct(null);
    setCartOpen(true);
  }

  function changeCartQuantity(id, change) {
    setCart((current) => current.map((item) =>
      item._id === id ? { ...item, quantity: Math.max(1, item.quantity + change) } : item,
    ));
  }

  function removeFromCart(id) {
    setCart((current) => current.filter((item) => item._id !== id));
  }

  function scrollToProducts() {
    setPage("shop");
    document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });
  }

  function openCheckout() {
    setCartOpen(false);
    setPage("checkout");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function completeDemoOrder({ shippingDetails, paymentMethod }) {
    const order = {
      id: `DEMO-${Date.now().toString(36).toUpperCase()}`,
      items: cart,
      total: cartTotal,
      shippingDetails,
      paymentMethod,
    };
    setCompletedOrder(order);
    setCart([]);
    setPage("confirmation");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function completePayPalOrder(payment) {
    setCompletedOrder({
      id: payment.orderId,
      captureId: payment.captureId,
      items: cart,
      total: Number(payment.total),
      shippingDetails: payment.shippingDetails,
      paymentMethod: "paypal",
    });
    setCart([]);
    setPage("confirmation");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function finishAuthentication(result) {
    sessionStorage.setItem("shopsmart-token", result.token);
    setAccount(result.user);
    setAuthMode("");
  }

  function signOut() {
    sessionStorage.removeItem("shopsmart-token");
    setAccount(null);
  }

  return (
    <div className="app-shell">
      <nav className="navbar navbar-expand-lg app-nav">
        <div className="container">
          <a className="navbar-brand brand-lockup" href="#top">
            <span className="brand-mark"><i className="bi bi-bag-heart-fill" /></span>
            <span>shop<span className="brand-accent">smart</span><small>AI</small></span>
          </a>
          <div className="d-flex align-items-center gap-2 ms-auto">
            <a className="nav-link d-none d-sm-inline" href="#how-it-works">How it works</a>
            <button className="btn btn-outline-primary cart-button" onClick={() => setCartOpen(true)} aria-label={`Open cart, ${cartCount} ${cartCount === 1 ? "item" : "items"}`}>
              <i className="bi bi-bag" /><span className="cart-button-text">Cart</span><span className="cart-count">{cartCount}</span>
            </button>
            {account ? (
              <>
                <span className="account-greeting d-none d-sm-inline">Hi, {account.name}</span>
                <button className="btn btn-outline-primary nav-login" onClick={signOut}>Sign out</button>
              </>
            ) : (
              <>
                <button className="btn btn-outline-primary nav-login" onClick={() => setAuthMode("login")}>Log in</button>
                <button className="btn btn-outline-primary nav-register" onClick={() => setAuthMode("register")}>Register</button>
              </>
            )}
            <button className="btn btn-primary nav-cta" onClick={scrollToProducts}>Explore products <i className="bi bi-arrow-up-right ms-1" /></button>
          </div>
        </div>
      </nav>

      <main id="top">
        {page === "checkout" ? (
          <CheckoutPage items={cart} total={cartTotal} onBack={() => setPage("shop")} onComplete={completeDemoOrder} onPayPalComplete={completePayPalOrder} />
        ) : page === "confirmation" ? (
          <OrderConfirmation order={completedOrder} onContinueShopping={() => { setCompletedOrder(null); setPage("shop"); }} />
        ) : (
          <>
        <section className="hero-section">
          <div className="container hero-grid">
            <div className="hero-copy">
              <div className="eyebrow"><span className="sparkle">✳</span> YOUR PERSONAL SHOPPING SIDEKICK</div>
              <h1>Good choices.<br /><span>Zero guesswork.</span></h1>
              <p className="hero-lede">Find the right product for your life and your budget. Compare the details, skip the review rabbit hole, and shop with confidence.</p>
              <div className="hero-actions">
                <button className="btn btn-primary btn-lg" onClick={scrollToProducts}>Find your fit <i className="bi bi-arrow-right ms-2" /></button>
                <div className="trust-note"><span className="trust-avatars"><i className="bi bi-person-fill" /><i className="bi bi-person-fill" /><i className="bi bi-person-fill" /></span><span><b>Smarter picks,</b><br />made just for you</span></div>
              </div>
              <div className="hero-proof"><span><i className="bi bi-check-circle-fill" /> No endless scrolling</span><span><i className="bi bi-check-circle-fill" /> Just what matters</span></div>
            </div>
            <div className="hero-visual">
              <div className="hero-blob" />
              <div className="hero-image-wrap"><img src="https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1000&q=85" alt="Premium wireless headphones" /></div>
              <div className="floating-card recommendation-float"><span className="float-icon"><i className="bi bi-stars" /></span><span><small>YOUR BEST MATCH</small><b>Sony WH-1000XM5</b></span><i className="bi bi-arrow-up-right float-arrow" /></div>
              <div className="floating-card rating-float"><span className="rating-star"><i className="bi bi-star-fill" /></span><span><b>4.9</b><small> customer rating</small></span></div>
              <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
              <span className="visual-spark spark-one">✳</span><span className="visual-spark spark-two">✦</span>
            </div>
          </div>
          <div className="container stats-strip">
            <div><b>Thoughtful picks</b><span>Less noise, more you</span></div>
            <div><b>Compare with clarity</b><span>Specs made simple</span></div>
            <div><b>Budget, meet brilliant</b><span>Every dollar, well spent</span></div>
            <div className="stats-icon"><i className="bi bi-arrow-down-right" /></div>
          </div>
        </section>

        <section className="shop-section section-pad" id="products">
          <div className="container">
            <div className="section-heading">
              <div><div className="eyebrow">A LITTLE LESS OVERWHELM</div><h2>Find your <span>next favorite.</span></h2></div>
              <p>Great products are out there.<br />Let’s find the one that feels right.</p>
            </div>
            <div className="search-panel">
              <div className="search-field"><i className="bi bi-search" /><input ref={searchInput} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="What are you looking for?" aria-label="Search products" /><kbd>Ctrl K</kbd></div>
              <div className="category-list" role="group" aria-label="Filter by category">
                {categories.map((category) => <button key={category} className={`category-chip ${activeCategory === category ? "active" : ""}`} onClick={() => setActiveCategory(category)}>{category}</button>)}
              </div>
            </div>
            {error && <div className="alert alert-warning mt-3" role="alert">{error}</div>}
            <div className="product-section-title"><div><h3>Popular right now <span className="live-dot" /></h3><span className="muted-copy">{visibleProducts.length} thoughtful picks for you</span></div><div className="sort-note"><i className="bi bi-stars" /> Sorted by smart picks</div></div>
            {visibleProducts.length ? (
              <>
                <div className="row g-4 product-grid">
                  {displayedProducts.map((product) => <ProductCard key={product._id} product={product} selected={selected.includes(product._id)} onToggle={() => toggleProduct(product._id)} onOpenDetails={setDetailProduct} onAddToCart={addToCart} />)}
                </div>
                {displayedProducts.length < visibleProducts.length && <div className="text-center mt-4"><button className="btn btn-outline-primary" onClick={() => setProductsToShow((count) => count + 24)}>Show more products</button></div>}
              </>
            ) : <div className="empty-state"><i className="bi bi-search" /><h4>No matches just yet</h4><p>Try a different search or category.</p></div>}
          </div>
        </section>

        <section className="budget-section section-pad" id="recommend">
          <div className="container budget-grid">
            <div className="budget-copy"><div className="eyebrow"><span className="sparkle">✳</span> MORE VALUE, LESS MATH</div><h2>A great pick<br />at <span>your price.</span></h2><p>Tell us what you’d like to spend. We’ll find the standouts that make every dollar count.</p>
              <form className="budget-form" onSubmit={findRecommendations}><label htmlFor="budget-input">MY BUDGET IS</label><div className="budget-input-wrap"><span>$</span><input id="budget-input" type="number" min="1" step="1" placeholder="e.g. 300" value={budget} onChange={(event) => setBudget(event.target.value)} /><button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Finding…" : "Find my picks"} <i className="bi bi-arrow-right ms-1" /></button></div></form>
              <small className="budget-footnote"><i className="bi bi-shield-check me-1" /> Your budget stays between us. Always.</small>
            </div>
            <div className="budget-art">
              <div className="budget-circle"><div className="budget-circle-inner"><i className="bi bi-wallet2" /><span>YOUR<br />BUDGET</span><b>YOUR<br />CALL</b></div></div>
              <div className="budget-floating floating-one"><i className="bi bi-stars" /><span>Worth every penny</span></div>
              <div className="budget-floating floating-two"><i className="bi bi-heart-fill" /><span>Picked for you</span></div>
              <div className="budget-dot dot-a" /><div className="budget-dot dot-b" /><div className="budget-dot dot-c" />
            </div>
          </div>
          {searchedBudget && <div className="container recommendation-results"><h3>Your best matches under {money(Number(budget))}</h3>{recommendations.length > 0 ? <div className="row g-3">{recommendations.map((product) => <ProductCard key={product._id} product={product} selected={selected.includes(product._id)} onToggle={() => toggleProduct(product._id)} onOpenDetails={setDetailProduct} onAddToCart={addToCart} compact />)}</div> : <p className="recommendation-empty">No matches at this budget in the selected category. Try increasing your budget or choosing “All products.”</p>}</div>}
        </section>

        <section className="how-section section-pad" id="how-it-works">
          <div className="container"><div className="section-heading"><div><div className="eyebrow">SHOPPING, SIMPLIFIED</div><h2>Three steps to <span>“that’s the one.”</span></h2></div><p>A little help goes a long way<br />when it’s the right kind.</p></div>
            <div className="row g-4 steps-row">
              <Step number="01" icon="bi-search" title="Tell us what you need" body="Search a category or share your budget. Start wherever you are." />
              <Step number="02" icon="bi-layout-three-columns" title="See the whole picture" body="Compare the details that matter. Get the gist of real customer reviews." />
              <Step number="03" icon="bi-heart-fill" title="Feel good about it" body="Get a recommendation that makes sense for you, not just the trend." />
            </div>
          </div>
        </section>
        {selected.length > 0 && <div className="container compare-bar"><span><i className="bi bi-check2-square me-2" />{selected.length} of 3 products selected</span><span className="compare-hint">{selected.length < 2 ? "Choose one more to compare" : "Ready for a side-by-side look?"}</span><button className="btn btn-light" disabled={selected.length < 2 || busy} onClick={openComparison}>{busy ? "Working…" : "Compare picks"} <i className="bi bi-arrow-right ms-1" /></button><button className="clear-selection" onClick={() => setSelected([])} aria-label="Clear selected products"><i className="bi bi-x-lg" /></button></div>}
          </>
        )}
      </main>
      <footer className="site-footer"><div className="container footer-inner"><a className="navbar-brand brand-lockup" href="#top"><span className="brand-mark"><i className="bi bi-bag-heart-fill" /></span><span>shop<span className="brand-accent">smart</span><small>AI</small></span></a><span>Better choices, one thoughtful pick at a time.</span><span>© 2025 ShopSmart AI</span></div></footer>
      {compare && <CompareModal result={compare} onClose={() => setCompare(null)} />}
      {detailProduct && <ProductDetailsModal product={detailProduct} onClose={() => setDetailProduct(null)} onAddToCart={addToCart} />}
      {cartOpen && <CartModal items={cart} total={cartTotal} onClose={() => setCartOpen(false)} onRemove={removeFromCart} onChangeQuantity={changeCartQuantity} onExplore={() => { setCartOpen(false); scrollToProducts(); }} onCheckout={openCheckout} />}
      {authMode && <AuthDialog initialMode={authMode} onClose={() => setAuthMode("")} onAuthenticated={finishAuthentication} />}
    </div>
  );
}

function AuthDialog({ initialMode, onClose, onAuthenticated }) {
  const [mode, setMode] = useState(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const details = Object.fromEntries(form.entries());
    try {
      const result = mode === "register"
        ? await register(details)
        : await login({ email: details.email, password: details.password });
      onAuthenticated(result);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setBusy(false);
    }
  }

  const isRegister = mode === "register";
  return (
    <div className="modal-backdrop-custom auth-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <button className="modal-close auth-close" onClick={onClose} aria-label="Close dialog"><i className="bi bi-x-lg" /></button>
        <div className="auth-brand"><span className="brand-mark"><i className="bi bi-bag-heart-fill" /></span></div>
        <div className="eyebrow">{isRegister ? "A SMARTER WAY TO SHOP" : "WELCOME BACK"}</div>
        <h2 id="auth-title">{isRegister ? "Create your account" : "Good to see you again."}</h2>
        <p className="auth-intro">{isRegister ? "Save your shopping preferences and pick up where you left off." : "Sign in to get back to your smarter shopping."}</p>
        <form onSubmit={submit}>
          {isRegister && <label className="auth-field">Your name<input autoComplete="name" name="name" type="text" maxLength="80" placeholder="Alex Morgan" required /></label>}
          <label className="auth-field">Email address<input autoComplete="email" name="email" type="email" maxLength="254" placeholder="you@example.com" required /></label>
          <label className="auth-field">Password<input autoComplete={isRegister ? "new-password" : "current-password"} name="password" type="password" minLength={isRegister ? "8" : undefined} maxLength="72" placeholder={isRegister ? "At least 8 characters" : "Your password"} required /></label>
          {error && <div className="alert alert-warning auth-error" role="alert">{error}</div>}
          <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>{busy ? "One moment…" : isRegister ? "Create account" : "Log in"} <i className="bi bi-arrow-right ms-1" /></button>
        </form>
        <div className="auth-switch">{isRegister ? "Already have an account?" : "New to ShopSmart AI?"}<button onClick={() => { setMode(isRegister ? "login" : "register"); setError(""); }}>{isRegister ? "Log in" : "Create an account"}</button></div>
      </section>
    </div>
  );
}

function CheckoutPage({ items, total, onBack, onComplete, onPayPalComplete }) {
  const [paymentMethod, setPaymentMethod] = useState("paypal");
  const [paymentMessage, setPaymentMessage] = useState("");
  const checkoutForm = useRef(null);

  function submitDemoOrder(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    onComplete({
      shippingDetails: Object.fromEntries(formData.entries()),
      paymentMethod,
    });
  }

  if (!items.length) {
    return (
      <section className="checkout-page">
        <div className="container checkout-empty">
          <span className="checkout-icon"><i className="bi bi-bag" /></span>
          <h1>Your cart is empty</h1>
          <p>Add a product before continuing to checkout.</p>
          <button className="btn btn-primary" onClick={onBack}>Return to shopping</button>
        </div>
      </section>
    );
  }

  return (
    <section className="checkout-page section-pad">
      <div className="container">
        <button className="checkout-back" onClick={onBack}><i className="bi bi-arrow-left me-2" />Back to shopping</button>
        <div className="checkout-heading">
          <div className="eyebrow">{paymentMethod === "paypal" ? "SECURE PAYPAL CHECKOUT" : "DEMO CHECKOUT"}</div>
          <h1>Almost <span>yours.</span></h1>
          <p>{paymentMethod === "paypal" ? "PayPal processes live payments. Confirm your products, prices, and fulfillment are ready before accepting charges." : "This demo option does not process a payment or deliver an order."}</p>
        </div>
        <div className="checkout-grid">
          <form ref={checkoutForm} className="checkout-form" onSubmit={submitDemoOrder}>
            <section className="checkout-panel">
              <h2><span>01</span> Delivery details</h2>
              <div className="checkout-fields">
                <label>Full name<input name="name" autoComplete="name" maxLength="100" required /></label>
                <label>Email address<input name="email" type="email" autoComplete="email" maxLength="254" required /></label>
                <label>Phone number<input name="phone" type="tel" autoComplete="tel" maxLength="30" required /></label>
                <label className="checkout-field-wide">Street address<input name="address" autoComplete="street-address" maxLength="160" required /></label>
                <label>City<input name="city" autoComplete="address-level2" maxLength="80" required /></label>
                <label>Postal code<input name="postalCode" autoComplete="postal-code" maxLength="20" required /></label>
                <label className="checkout-field-wide">Country code (2 letters)<input name="countryCode" autoComplete="country" minLength="2" maxLength="2" pattern="[A-Za-z]{2}" placeholder="US" title="Enter your two-letter country code, such as US or GB." required /></label>
              </div>
            </section>
            <section className="checkout-panel">
              <h2><span>02</span> Payment</h2>
              <div className="payment-method-options">
                <label className={`payment-method-option ${paymentMethod === "paypal" ? "selected" : ""}`}>
                  <input type="radio" name="paymentMethod" value="paypal" checked={paymentMethod === "paypal"} onChange={() => { setPaymentMethod("paypal"); setPaymentMessage(""); }} />
                  <span className="payment-method-logo paypal-wordmark">PayPal</span>
                  <span className="payment-method-copy"><b>PayPal</b><small>Pay securely with your PayPal account.</small></span>
                </label>
                <label className={`payment-method-option ${paymentMethod === "demo_card" ? "selected" : ""}`}>
                  <input type="radio" name="paymentMethod" value="demo_card" checked={paymentMethod === "demo_card"} onChange={() => { setPaymentMethod("demo_card"); setPaymentMessage(""); }} />
                  <i className="bi bi-credit-card payment-method-logo" />
                  <span className="payment-method-copy"><b>Card <em>DEMO ONLY</em></b><small>Simulation only. No card details are collected.</small></span>
                </label>
                <label className={`payment-method-option ${paymentMethod === "cash_on_delivery" ? "selected" : ""}`}>
                  <input type="radio" name="paymentMethod" value="cash_on_delivery" checked={paymentMethod === "cash_on_delivery"} onChange={() => { setPaymentMethod("cash_on_delivery"); setPaymentMessage(""); }} />
                  <i className="bi bi-cash-coin payment-method-logo" />
                  <span className="payment-method-copy"><b>Cash on delivery <em>DEMO ONLY</em></b><small>Simulation only. No order will be delivered.</small></span>
                </label>
              </div>
              {paymentMethod === "paypal" ? (
                <PayPalPayment
                  items={items}
                  checkoutForm={checkoutForm}
                  onComplete={onPayPalComplete}
                  onMessage={setPaymentMessage}
                />
              ) : null}
              {paymentMessage && <div className="checkout-payment-message" role="alert">{paymentMessage}</div>}
            </section>
            {paymentMethod !== "paypal" && (
              <>
                <div className="checkout-disclaimer" role="note"><i className="bi bi-info-circle-fill" /> Demo option only: no payment is processed, and no real order is placed or delivered.</div>
                <button className="btn btn-primary checkout-pay-button" type="submit"><i className="bi bi-check-circle me-2" />Complete demo checkout · {money(total)}</button>
              </>
            )}
          </form>
          <aside className="checkout-summary">
            <h2>Your order</h2>
            <div className="checkout-order-items">{items.map((item) => (
              <article className="checkout-order-item" key={item._id}>
                <img src={item.image} alt="" />
                <div><b>{item.name}</b><span>Qty {item.quantity}</span></div>
                <strong>{money(item.price * item.quantity)}</strong>
              </article>
            ))}</div>
            <div className="checkout-totals"><span>Subtotal</span><b>{money(total)}</b><span>Delivery</span><b>Free</b><span className="checkout-grand-total">Total</span><b className="checkout-grand-total">{money(total)}</b></div>
            <p><i className="bi bi-arrow-repeat me-1" /> You can go back and change your cart before paying or placing a demo order.</p>
          </aside>
        </div>
      </div>
    </section>
  );
}

let payPalSdkPromise;

function loadPayPalSdk(clientId) {
  if (window.paypal?.Buttons) return Promise.resolve(window.paypal);
  if (!payPalSdkPromise) {
    payPalSdkPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=USD&intent=capture`;
      script.async = true;
      script.onload = () => window.paypal?.Buttons
        ? resolve(window.paypal)
        : reject(new Error("PayPal checkout could not be loaded."));
      script.onerror = () => reject(new Error("PayPal checkout could not be loaded. Check your connection and try again."));
      document.head.appendChild(script);
    }).catch((error) => {
      payPalSdkPromise = null;
      throw error;
    });
  }
  return payPalSdkPromise;
}

function PayPalPayment({ items, checkoutForm, onComplete, onMessage }) {
  const buttonContainer = useRef(null);
  const captureToken = useRef("");
  const callbacks = useRef({ items, checkoutForm, onComplete, onMessage });
  callbacks.current = { items, checkoutForm, onComplete, onMessage };

  useEffect(() => {
    let active = true;
    let buttons;

    async function renderPayPalButton() {
      try {
        const config = await getPayPalConfig();
        const paypal = await loadPayPalSdk(config.clientId);
        if (!active || !buttonContainer.current) return;

        buttons = paypal.Buttons({
          style: { layout: "vertical", color: "gold", shape: "rect", label: "paypal" },
          onClick: (_data, actions) => {
            const form = callbacks.current.checkoutForm.current;
            if (!form?.reportValidity()) return actions.reject();
            return actions.resolve();
          },
          createOrder: async () => {
            const { items: currentItems, checkoutForm: formRef } = callbacks.current;
            const form = formRef.current;
            if (!form?.reportValidity()) throw new Error("Complete the delivery details before paying.");
            const shippingDetails = Object.fromEntries(new FormData(form).entries());
            const order = await createPayPalOrder({
              items: currentItems.map((item) => ({ id: item._id, quantity: item.quantity })),
              shippingDetails,
            });
            captureToken.current = order.captureToken;
            return order.id;
          },
          onApprove: async ({ orderID }) => {
            try {
              const payment = await capturePayPalOrder(orderID, captureToken.current);
              if (payment.status !== "COMPLETED") throw new Error("PayPal did not confirm the payment.");
              callbacks.current.onComplete(payment);
            } catch (error) {
              callbacks.current.onMessage(error.message);
            }
          },
          onCancel: () => {
            captureToken.current = "";
            callbacks.current.onMessage("PayPal checkout was canceled. Your cart is unchanged.");
          },
          onError: (error) => callbacks.current.onMessage(error?.message || "PayPal payment failed. Your cart is unchanged."),
        });
        await buttons.render(buttonContainer.current);
      } catch (error) {
        if (active) onMessage(error.message);
      }
    }

    renderPayPalButton();
    return () => {
      active = false;
      buttons?.close().catch((error) => console.error("Could not close the PayPal checkout.", error));
      buttonContainer.current?.replaceChildren();
    };
  }, [onMessage]);

  return (
    <div className="paypal-payment-area">
      <div className="paypal-shipping-note"><i className="bi bi-shield-lock me-1" /> Payment details are handled by PayPal. Your server secret is never sent to the browser.</div>
      <div ref={buttonContainer} className="paypal-button-container" />
    </div>
  );
}

function OrderConfirmation({ order, onContinueShopping }) {
  if (!order) {
    return (
      <section className="checkout-page">
        <div className="container checkout-empty">
          <h1>No demo order found</h1>
          <button className="btn btn-primary" onClick={onContinueShopping}>Continue shopping</button>
        </div>
      </section>
    );
  }

  return (
    <section className="checkout-page section-pad">
      <div className="container">
        <div className="order-confirmation">
          <span className="order-success-icon"><i className="bi bi-check-lg" /></span>
          <div className="eyebrow">{order.paymentMethod === "paypal" ? "PAYPAL PAYMENT COMPLETE" : "DEMO CHECKOUT COMPLETE"}</div>
          <h1>{order.paymentMethod === "paypal" ? <>Payment <span>confirmed.</span></> : <>Your demo order is <span>ready.</span></>}</h1>
          <p>{order.paymentMethod === "paypal" ? "PayPal confirmed your payment." : "No payment was charged, and no real order was submitted."}</p>
          <div className="order-reference">{order.paymentMethod === "paypal" ? "PayPal capture" : "Demo reference"} <b>{order.captureId || order.id}</b></div>
          <div className="order-confirmation-items">{order.items.map((item) => <div key={item._id}><span>{item.name} × {item.quantity}</span><b>{money(item.price * item.quantity)}</b></div>)}</div>
          <div className="order-confirmation-total"><span>{order.paymentMethod === "paypal" ? "Paid with PayPal" : "Demo total"}</span><b>{money(order.total)}</b></div>
          <p className="order-delivery-summary">Delivery details entered for: {order.shippingDetails.name}, {order.shippingDetails.city}, {order.shippingDetails.country || order.shippingDetails.countryCode}.</p>
          <button className="btn btn-primary" onClick={onContinueShopping}>Continue shopping <i className="bi bi-arrow-right ms-1" /></button>
        </div>
      </div>
    </section>
  );
}

function ProductCard({ product, selected, onToggle, onOpenDetails, onAddToCart, compact = false }) {
  return (
    <div className={compact ? "col-md-6 col-lg-4" : "col-sm-6 col-lg-3"}>
      <article className={`product-card ${selected ? "product-selected" : ""}`} onClick={() => onOpenDetails(product)}>
        <div className="product-image-wrap"><img src={product.image} alt={product.name} loading="lazy" /><span className="product-category">{product.category}</span><button className={`select-product ${selected ? "selected" : ""}`} onClick={(event) => { event.stopPropagation(); onToggle(); }} aria-label={`${selected ? "Remove" : "Add"} ${product.name} ${selected ? "from" : "to"} comparison`}><i className={`bi ${selected ? "bi-check-lg" : "bi-plus-lg"}`} /></button></div>
        <div className="product-info"><div className="product-brand">{product.brand}</div><h4><button className="product-title-button" onClick={(event) => { event.stopPropagation(); onOpenDetails(product); }}>{product.name}</button></h4><p>{product.description}</p><div className="product-review"><span className="stars"><i className="bi bi-star-fill" /> {product.rating}</span><span>({product.reviewCount.toLocaleString()} reviews)</span></div><div className="product-bottom"><b>{money(product.price)}</b><span className="value-tag"><i className="bi bi-stars" /> Smart pick</span></div><button className="btn btn-outline-primary add-cart-button" onClick={(event) => { event.stopPropagation(); onAddToCart(product); }}><i className="bi bi-cart-plus me-1" /> Add to cart</button></div>
      </article>
    </div>
  );
}

function ProductDetailsModal({ product, onClose, onAddToCart }) {
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div className="modal-backdrop-custom detail-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title">
        <button className="modal-close detail-close" onClick={onClose} aria-label="Close product details"><i className="bi bi-x-lg" /></button>
        <div className="detail-image"><img src={product.image} alt={product.name} /></div>
        <div className="detail-content">
          <div className="eyebrow">{product.brand} · {product.category}</div>
          <h2 id="detail-title">{product.name}</h2>
          <div className="detail-rating"><span className="stars"><i className="bi bi-star-fill" /> {product.rating}</span><span>{product.reviewCount.toLocaleString()} customer reviews</span></div>
          <div className="detail-price">{money(product.price)}</div>
          <p className="detail-description">{product.description}</p>
          <h3>Specifications</h3>
          <dl className="detail-specs">{Object.entries(product.specifications || {}).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>
          <h3>What customers say</h3>
          <p className="detail-review-summary">{product.reviewSummary}</p>
          {product.reviewHighlights?.length > 0 && <ul className="detail-highlights">{product.reviewHighlights.map((highlight) => <li key={highlight}><i className="bi bi-check-circle-fill" /> {highlight}</li>)}</ul>}
          <button className="btn btn-primary detail-add-button" onClick={() => onAddToCart(product)}><i className="bi bi-cart-plus me-2" />Add to cart · {money(product.price)}</button>
        </div>
      </section>
    </div>
  );
}

function CartModal({ items, total, onClose, onRemove, onChangeQuantity, onExplore, onCheckout }) {
  useEffect(() => {
    function handleEscape(event) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const itemCount = items.reduce((count, item) => count + item.quantity, 0);
  return (
    <div className="modal-backdrop-custom cart-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="cart-modal" role="dialog" aria-modal="true" aria-labelledby="cart-title">
        <div className="modal-heading"><div><div className="eyebrow">YOUR PICKS, ALL IN ONE PLACE</div><h2 id="cart-title">Your cart <span className="cart-modal-count">{itemCount}</span></h2></div><button className="modal-close" onClick={onClose} aria-label="Close cart"><i className="bi bi-x-lg" /></button></div>
        {items.length ? (
          <>
            <div className="cart-items">{items.map((item) => <article className="cart-item" key={item._id}><img src={item.image} alt="" /><div className="cart-item-info"><span>{item.brand}</span><h3>{item.name}</h3><b>{money(item.price)}</b><div className="cart-quantity"><button onClick={() => onChangeQuantity(item._id, -1)} disabled={item.quantity <= 1} aria-label={`Decrease ${item.name} quantity`}><i className="bi bi-dash" /></button><span>{item.quantity}</span><button onClick={() => onChangeQuantity(item._id, 1)} aria-label={`Increase ${item.name} quantity`}><i className="bi bi-plus" /></button><button className="cart-remove" onClick={() => onRemove(item._id)} aria-label={`Remove ${item.name}`}><i className="bi bi-trash3" /> Remove</button></div></div><b className="cart-line-total">{money(item.price * item.quantity)}</b></article>)}</div>
            <div className="cart-summary"><span>Subtotal <small>({itemCount} {itemCount === 1 ? "item" : "items"})</small></span><b>{money(total)}</b></div>
            <p className="cart-checkout-note"><i className="bi bi-info-circle me-1" /> Demo checkout only — no real payment will be processed.</p>
            <button className="btn btn-primary cart-continue-button" onClick={onCheckout}><i className="bi bi-lock-fill me-1" /> Continue to demo checkout</button>
            <button className="cart-keep-shopping" onClick={onClose}>Continue shopping</button>
          </>
        ) : (
          <div className="cart-empty"><span><i className="bi bi-bag" /></span><h3>Your cart is waiting for a good pick.</h3><p>Add products you like and they’ll show up here.</p><button className="btn btn-primary" onClick={onExplore}>Explore products <i className="bi bi-arrow-right ms-1" /></button></div>
        )}
      </section>
    </div>
  );
}

function Step({ number, icon, title, body }) {
  return <div className="col-md-4"><div className="step-card"><div className="step-top"><span className="step-number">{number}</span><span className="step-icon"><i className={`bi ${icon}`} /></span></div><h3>{title}</h3><p>{body}</p><span className="step-arrow"><i className="bi bi-arrow-up-right" /></span></div></div>;
}

function CompareModal({ result, onClose }) {
  const products = result.products || [];
  const keys = [...new Set(products.flatMap((product) => Object.keys(product.specifications || {})))];
  return <div className="modal-backdrop-custom" role="presentation" onClick={onClose}><section className="compare-modal" role="dialog" aria-modal="true" aria-labelledby="compare-title" onClick={(event) => event.stopPropagation()}><div className="modal-heading"><div><div className="eyebrow">THE DETAILS, SIDE BY SIDE</div><h2 id="compare-title">Your comparison</h2></div><button className="modal-close" onClick={onClose} aria-label="Close comparison"><i className="bi bi-x-lg" /></button></div><div className="compare-table-wrap"><table className="table compare-table"><thead><tr><th>At a glance</th>{products.map((product) => <th key={product._id}><img src={product.image} alt="" /><span>{product.name}</span></th>)}</tr></thead><tbody><tr><th>Price</th>{products.map((product) => <td key={product._id}><b>{money(product.price)}</b></td>)}</tr><tr><th>Rating</th>{products.map((product) => <td key={product._id}><span className="stars"><i className="bi bi-star-fill" /> {product.rating}</span></td>)}</tr>{keys.map((key) => <tr key={key}><th>{key}</th>{products.map((product) => <td key={product._id}>{product.specifications?.[key] || "—"}</td>)}</tr>)}<tr><th>Customer says</th>{products.map((product) => <td key={product._id}>{product.reviewSummary}</td>)}</tr></tbody></table></div><div className="modal-footer-note"><i className="bi bi-stars" /> A clear view makes a confident choice.</div></section></div>;
}

export default App;
