import "dotenv/config";
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import productsRouter from "./routes/products.js";
import recommendationsRouter from "./routes/recommendations.js";
import authRouter from "./routes/auth.js";
import paymentsRouter from "./routes/payments.js";
import Product from "./models/Product.js";
import { sampleProducts } from "./data/products.js";
import { randomBytes } from "node:crypto";

const app = express();
const port = Number(process.env.PORT) || 5000;
if (!process.env.AUTH_TOKEN_SECRET) {
  process.env.AUTH_TOKEN_SECRET = randomBytes(32).toString("hex");
  console.warn("AUTH_TOKEN_SECRET is not set; signed-in sessions expire when the server restarts.");
}

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "sample-data" });
});
app.use("/api/products", productsRouter);
app.use("/api/recommendations", recommendationsRouter);
app.use("/api/auth", authRouter);
app.use("/api/payments", paymentsRouter);
app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "The request could not be completed. Please try again." });
});

async function connectDatabase() {
  if (!process.env.MONGODB_URI) {
    console.info("MONGODB_URI is not set; serving the included sample catalog.");
    return;
  }
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    const seedOperations = sampleProducts.map(({ _id, ...product }) => {
      const { image, price, ...newProduct } = product;
      return {
        updateOne: {
          filter: { slug: _id },
          update: {
            $set: { image, price },
            $setOnInsert: { ...newProduct, slug: _id },
          },
          upsert: true,
        },
      };
    });
    const result = await Product.bulkWrite(seedOperations);
    if (result.upsertedCount) console.info(`Added ${result.upsertedCount} sample products to MongoDB.`);
    console.info("Connected to MongoDB.");
  } catch (error) {
    console.error(`MongoDB connection failed: ${error.message}`);
    console.info("Continuing with the included sample catalog.");
  }
}

await connectDatabase();
app.listen(port, () => console.info(`ShopSmart AI API listening on http://localhost:${port}`));
