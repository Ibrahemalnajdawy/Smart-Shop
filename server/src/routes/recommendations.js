import { Router } from "express";
import { sampleProducts } from "../data/products.js";
import Product from "../models/Product.js";
import mongoose from "mongoose";

const router = Router();

router.get("/", async (req, res, next) => {
  try {
    const budget = Number(req.query.budget);
    const category = String(req.query.category || "");
    if (!Number.isFinite(budget) || budget <= 0) {
      return res.status(400).json({ message: "Enter a budget greater than $0." });
    }
    const products = mongoose.connection.readyState === 1
      ? await Product.find({ price: { $lte: budget }, ...(category ? { category } : {}) }).lean()
      : sampleProducts.filter((product) => product.price <= budget && (!category || product.category === category));
    const result = products
      .map((product) => {
        const plain = product.toObject ? product.toObject() : product;
        const specifications = plain.specifications instanceof Map
          ? Object.fromEntries(plain.specifications)
          : plain.specifications || {};
        return { ...plain, _id: String(plain.slug || plain._id), specifications };
      })
      .sort((a, b) => (b.rating * Math.log10(b.reviewCount + 1)) - (a.rating * Math.log10(a.reviewCount + 1)))
      .slice(0, 3);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
