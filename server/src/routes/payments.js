import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import mongoose from "mongoose";
import PaymentOrder from "../models/PaymentOrder.js";
import Product from "../models/Product.js";
import { sampleProducts } from "../data/products.js";

const router = Router();

function getPayPalConfiguration() {
  const mode = process.env.PAYPAL_MODE || "live";
  if (!["live", "sandbox"].includes(mode)) {
    return { error: "PAYPAL_MODE must be set to live or sandbox." };
  }
  if (mongoose.connection.readyState !== 1) {
    return { error: "Connect MongoDB first so paid orders can be saved securely." };
  }
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    return { error: "Add PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET to the server environment." };
  }
  return {
    mode,
    clientId: process.env.PAYPAL_CLIENT_ID,
    clientSecret: process.env.PAYPAL_CLIENT_SECRET,
    apiUrl: mode === "sandbox" ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com",
  };
}

async function getPayPalAccessToken(configuration) {
  const response = await fetch(`${configuration.apiUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${configuration.clientId}:${configuration.clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.access_token) {
    console.error("PayPal access-token request failed.", { status: response.status, error: result.error });
    throw new Error("PayPal could not authorize this request.");
  }
  return result.access_token;
}

async function payPalRequest(configuration, token, path, options = {}) {
  const response = await fetch(`${configuration.apiUrl}${path}`, {
    method: options.method || "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.requestId ? { "PayPal-Request-Id": options.requestId } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("PayPal API request failed.", {
      status: response.status,
      name: result.name,
      message: result.message,
    });
    throw new Error("PayPal could not complete this request.");
  }
  return result;
}

function validShippingDetails(details) {
  return details
    && typeof details.name === "string" && details.name.trim().length > 0 && details.name.length <= 100
    && typeof details.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email) && details.email.length <= 254
    && typeof details.phone === "string" && details.phone.trim().length >= 7 && details.phone.length <= 30
    && typeof details.address === "string" && details.address.trim().length > 0 && details.address.length <= 160
    && typeof details.city === "string" && details.city.trim().length > 0 && details.city.length <= 80
    && typeof details.postalCode === "string" && details.postalCode.trim().length > 0 && details.postalCode.length <= 20
    && typeof details.countryCode === "string" && /^[A-Za-z]{2}$/.test(details.countryCode);
}

async function loadProducts(ids) {
  if (mongoose.connection.readyState === 1) {
    return (await Product.find({ slug: { $in: ids } }).lean())
      .map((product) => ({ ...product, _id: String(product.slug || product._id) }));
  }
  return sampleProducts.filter((product) => ids.includes(product._id));
}

router.get("/paypal/config", (_req, res) => {
  const configuration = getPayPalConfiguration();
  if (configuration.error) {
    return res.status(503).json({ message: `PayPal is unavailable. ${configuration.error}` });
  }
  res.json({ clientId: configuration.clientId, currency: "USD", mode: configuration.mode });
});

router.post("/paypal/orders", async (req, res) => {
  const configuration = getPayPalConfiguration();
  if (configuration.error) {
    return res.status(503).json({ message: `PayPal is unavailable. ${configuration.error}` });
  }

  const items = req.body?.items;
  const shipping = req.body?.shippingDetails;
  if (!Array.isArray(items) || items.length < 1 || items.length > 100) {
    return res.status(400).json({ message: "Your cart must contain between 1 and 100 products." });
  }
  if (items.some((item) =>
    !item || typeof item.id !== "string" || item.id.length > 160
    || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 99,
  )) {
    return res.status(400).json({ message: "One or more cart items have an invalid quantity." });
  }
  if (new Set(items.map((item) => item.id)).size !== items.length) {
    return res.status(400).json({ message: "Remove duplicate cart entries before paying." });
  }
  if (!validShippingDetails(shipping)) {
    return res.status(400).json({ message: "Enter a valid delivery address, including a two-letter country code." });
  }

  try {
    const products = await loadProducts(items.map((item) => item.id));
    const productsById = new Map(products.map((product) => [product._id, product]));
    if (productsById.size !== items.length) {
      return res.status(404).json({ message: "One or more products in your cart are no longer available." });
    }

    const lineItems = items.map(({ id, quantity }) => {
      const product = productsById.get(id);
      if (!Number.isFinite(product.price) || product.price < 0) {
        throw new Error(`Product "${id}" has an invalid price.`);
      }
      return {
        name: product.name.slice(0, 127),
        quantity: String(quantity),
        unit_amount: { currency_code: "USD", value: Number(product.price).toFixed(2) },
      };
    });
    const totalCents = items.reduce((total, { id, quantity }) =>
      total + Math.round(Number(productsById.get(id).price) * 100) * quantity, 0,
    );
    const total = (totalCents / 100).toFixed(2);
    const token = await getPayPalAccessToken(configuration);
    const paypalOrder = await payPalRequest(configuration, token, "/v2/checkout/orders", {
      method: "POST",
      requestId: randomUUID(),
      body: {
        intent: "CAPTURE",
        purchase_units: [{
          amount: {
            currency_code: "USD",
            value: total,
            breakdown: { item_total: { currency_code: "USD", value: total } },
          },
          items: lineItems,
          shipping: {
            name: { full_name: shipping.name.trim() },
            address: {
              address_line_1: shipping.address.trim(),
              admin_area_2: shipping.city.trim(),
              postal_code: shipping.postalCode.trim(),
              country_code: shipping.countryCode.toUpperCase(),
            },
          },
        }],
        application_context: {
          brand_name: "ShopSmart AI",
          user_action: "PAY_NOW",
          shipping_preference: "SET_PROVIDED_ADDRESS",
        },
      },
    });
    if (!paypalOrder.id || paypalOrder.status !== "CREATED") {
      console.error("PayPal returned an unexpected order response.");
      return res.status(502).json({ message: "PayPal could not start checkout. Please try again." });
    }

    const captureToken = randomBytes(32).toString("hex");
    const orderItems = items.map(({ id, quantity }) => ({
      productId: id,
      name: productsById.get(id).name,
      quantity,
      unitPrice: Number(productsById.get(id).price),
    }));
    await PaymentOrder.create({
      paypalOrderId: paypalOrder.id,
      captureTokenHash: createHash("sha256").update(captureToken).digest("hex"),
      items: orderItems,
      shippingDetails: {
        name: shipping.name.trim(),
        email: shipping.email.trim().toLowerCase(),
        phone: shipping.phone.trim(),
        address: shipping.address.trim(),
        city: shipping.city.trim(),
        postalCode: shipping.postalCode.trim(),
        countryCode: shipping.countryCode.toUpperCase(),
      },
      total,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    res.set("Cache-Control", "no-store").status(201).json({ id: paypalOrder.id, captureToken });
  } catch (error) {
    console.error("Could not create PayPal order.", error);
    res.status(502).json({ message: "PayPal checkout could not be started. Please check your PayPal configuration and try again." });
  }
});

router.post("/paypal/orders/:id/capture", async (req, res) => {
  const configuration = getPayPalConfiguration();
  if (configuration.error) {
    return res.status(503).json({ message: `PayPal is unavailable. ${configuration.error}` });
  }

  const orderId = req.params.id;
  if (!/^[A-Z0-9-]{6,64}$/i.test(orderId)) {
    return res.status(400).json({ message: "The PayPal order ID is invalid." });
  }
  const { captureToken } = req.body || {};
  if (typeof captureToken !== "string" || !/^[a-f0-9]{64}$/i.test(captureToken)) {
    return res.status(400).json({ message: "The PayPal capture token is invalid." });
  }

  let pendingOrder;
  try {
    pendingOrder = await PaymentOrder.findOne({ paypalOrderId: orderId }).select("+captureTokenHash");
  } catch (error) {
    console.error("Could not load the saved PayPal order.", error);
    return res.status(500).json({ message: "The saved order could not be loaded. Please try again." });
  }
  if (!pendingOrder) {
    return res.status(404).json({ message: "This PayPal checkout has expired. Please start checkout again." });
  }
  if (pendingOrder.status !== "COMPLETED" && pendingOrder.expiresAt && pendingOrder.expiresAt <= new Date()) {
    return res.status(410).json({ message: "This PayPal checkout has expired. Please start checkout again." });
  }
  const expectedTokenHash = Buffer.from(pendingOrder.captureTokenHash, "hex");
  const suppliedTokenHash = Buffer.from(createHash("sha256").update(captureToken).digest("hex"), "hex");
  if (expectedTokenHash.length !== suppliedTokenHash.length || !timingSafeEqual(expectedTokenHash, suppliedTokenHash)) {
    return res.status(403).json({ message: "This PayPal capture token does not match the order." });
  }
  if (pendingOrder.status === "COMPLETED") {
    return res.set("Cache-Control", "no-store").json({
      orderId,
      captureId: pendingOrder.captureId,
      status: pendingOrder.status,
      total: pendingOrder.total.toFixed(2),
      shippingDetails: pendingOrder.shippingDetails,
    });
  }

  try {
    const token = await getPayPalAccessToken(configuration);
    const paypalOrder = await payPalRequest(configuration, token, `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
      method: "POST",
      requestId: createHash("sha256").update(`capture:${orderId}`).digest("hex").slice(0, 32),
      body: {},
    });
    const capture = paypalOrder.purchase_units?.[0]?.payments?.captures?.[0];
    if (paypalOrder.status !== "COMPLETED" || capture?.status !== "COMPLETED"
      || capture.amount?.currency_code !== pendingOrder.currency
      || Number(capture.amount?.value) !== pendingOrder.total) {
      console.error("PayPal capture did not match the expected order amount or status.", {
        orderId,
        status: paypalOrder.status,
      });
      return res.status(409).json({ message: "PayPal did not confirm the expected payment. Contact support before retrying." });
    }

    const result = {
      orderId,
      captureId: capture.id,
      status: capture.status,
      total: capture.amount.value,
      shippingDetails: pendingOrder.shippingDetails,
    };
    pendingOrder.captureId = capture.id;
    pendingOrder.status = "COMPLETED";
    pendingOrder.capturedAt = new Date();
    pendingOrder.expiresAt = undefined;
    await pendingOrder.save();
    res.set("Cache-Control", "no-store").json(result);
  } catch (error) {
    console.error("Could not capture PayPal order.", error);
    res.status(502).json({ message: "PayPal could not confirm payment. Check your PayPal account before trying again." });
  }
});

export default router;
