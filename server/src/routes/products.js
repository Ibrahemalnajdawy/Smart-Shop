import { Router } from "express";
import mongoose from "mongoose";
import Product from "../models/Product.js";
import { sampleProducts } from "../data/products.js";

const router = Router();

function normalizeProduct(product) {
  const plain = product.toObject ? product.toObject() : product;
  const id = plain.slug || plain._id;
  return {
    ...plain,
    _id: String(id),
    specifications: plain.specifications instanceof Map
      ? Object.fromEntries(plain.specifications)
      : plain.specifications || {},
  };
}

async function allProducts() {
  if (mongoose.connection.readyState === 1) {
    return (await Product.find().lean()).map(normalizeProduct);
  }
  return sampleProducts;
}

router.get("/", async (req, res, next) => {
  try {
    const { q = "", category = "" } = req.query;
    const term = String(q).trim().toLowerCase();
    const products = await allProducts();
    const result = products.filter((product) => {
      const matchesTerm = !term || [product.name, product.brand, product.category, product.description]
        .join(" ").toLowerCase().includes(term);
      return matchesTerm && (!category || category === "All products" || product.category === category);
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/compare", async (req, res, next) => {
  try {
    const ids = String(req.query.ids || "").split(",").filter(Boolean).slice(0, 3);
    if (ids.length < 2) {
      return res.status(400).json({ message: "Choose at least two products to compare." });
    }
    const products = await allProducts();
    const selected = ids.map((id) => products.find((product) => product._id === id)).filter(Boolean);
    if (selected.length !== ids.length) {
      return res.status(404).json({ message: "One or more selected products could not be found." });
    }
    res.json({ products: selected });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const products = await allProducts();
    const product = products.find((item) => item._id === req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found." });
    res.json(product);
  } catch (error) {
    next(error);
  }
});

export default router;
