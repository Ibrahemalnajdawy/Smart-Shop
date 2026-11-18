import mongoose from "mongoose";

const paymentOrderSchema = new mongoose.Schema(
  {
    paypalOrderId: { type: String, required: true, unique: true, index: true },
    captureTokenHash: { type: String, required: true, select: false },
    status: { type: String, enum: ["CREATED", "COMPLETED"], required: true, default: "CREATED" },
    items: [{
      productId: { type: String, required: true },
      name: { type: String, required: true },
      quantity: { type: Number, required: true, min: 1 },
      unitPrice: { type: Number, required: true, min: 0 },
    }],
    shippingDetails: {
      name: { type: String, required: true },
      email: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, required: true },
      city: { type: String, required: true },
      postalCode: { type: String, required: true },
      countryCode: { type: String, required: true, uppercase: true },
    },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, enum: ["USD"], default: "USD" },
    captureId: { type: String, default: "" },
    capturedAt: { type: Date },
    expiresAt: { type: Date, expires: 0 },
  },
  { timestamps: true, versionKey: false },
);

export default mongoose.model("PaymentOrder", paymentOrderSchema);
