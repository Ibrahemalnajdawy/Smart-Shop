import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    slug: { type: String, unique: true, required: true, index: true },
    name: { type: String, required: true, trim: true },
    brand: { type: String, required: true },
    category: { type: String, required: true, index: true },
    price: { type: Number, required: true, min: 0 },
    rating: { type: Number, required: true, min: 0, max: 5 },
    reviewCount: { type: Number, default: 0 },
    description: { type: String, required: true },
    image: { type: String, required: true },
    specifications: { type: Map, of: String, default: {} },
    reviewSummary: { type: String, required: true },
    reviewHighlights: { type: [String], default: [] },
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model("Product", productSchema);
