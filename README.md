# ShopSmart AI

A JavaScript MERN shopping assistant with a separate React client and Express/MongoDB API. The sample catalog includes 697 products (41 in each of 17 categories: audio, automotive, beauty and personal care, books, cameras, computers, fashion, gaming, home, kitchen, office, outdoor, phones, sports and fitness, tablets, toys and games, and wearables). Sample prices are illustrative estimates, not live retailer pricing; generated prices use a product-type base with modest variant adjustments. Added listings use unique CC0 category-matched photos, which may not show the exact model; generated ratings, specifications, and review summaries are illustrative too. Verify real product details before purchase. The client includes product search, category filters, clickable product details, a session-persistent shopping cart, side-by-side comparison, customer review summaries, budget-based recommendations, account registration/sign-in, live PayPal checkout, and non-charging demo card/cash options.

## Requirements

- Node.js 20.19 or newer (or 22.12 or newer)
- MongoDB (optional; sample catalog is available without a database)

## Run locally

1. In `server`, install dependencies and start the API:

   ```sh
   cd server
   npm install
   npm run dev
   ```

2. In a separate terminal, install dependencies and start the client:

   ```sh
   cd client
   npm install
   npm run dev
   ```

3. Open the Vite URL shown in the client terminal (usually `http://localhost:5173`).

To use MongoDB, copy `server/.env.example` to `server/.env`, set `MONGODB_URI`, and replace `AUTH_TOKEN_SECRET` with a long random secret. The server initializes an empty database with the included sample catalog and stores registered accounts in MongoDB with hashed passwords. Without MongoDB, accounts are kept in server memory for local demos and are cleared when the API restarts. Configure a persistent `AUTH_TOKEN_SECRET` for deployments so signed-in sessions survive server restarts.

## Payments

Live PayPal checkout requires MongoDB and PayPal REST app credentials. Set `PAYPAL_MODE=live`, `PAYPAL_CLIENT_ID`, and `PAYPAL_CLIENT_SECRET` in the private `server/.env` file. Keep the client secret on the server; never put it in client code or commit it. The API persists orders before enabling PayPal checkout and verifies PayPal's captured USD amount before marking an order complete. Use `PAYPAL_MODE=sandbox` with sandbox credentials to test without live charges.

The card and cash options are demo-only: they do not collect card data, charge a payment method, or create a real fulfillment order. The included catalog and its prices are illustrative sample data. Replace and verify product details, prices, and fulfillment operations before accepting live payments.

## Build the client

```sh
cd client
npm run build
```
