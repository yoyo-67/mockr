// E-commerce catalog — multiple endpoints, cross-endpoint handlers, query filtering.

import { mockr, file } from "../../src/index.js";

interface Product {
  id: number;
  name: string;
  price: number;
  category: string;
  stock: number;
}

interface CartItem {
  id: number;
  product_id: number;
  quantity: number;
}

type Endpoints = {
  "/internal/products": Product[];
  "/internal/cart": CartItem[];
};

const server = await mockr<Endpoints>({
  port: 3002,
  endpoints: [
    // Product catalog — loaded from JSON file, full CRUD available.
    // `file<Product[]>(...)` carries the array element type through to
    // the handle, so `ctx.endpoint("/internal/products")` is `ListHandle<Product>`.
    {
      url: "/internal/products",
      dataFile: file<Product[]>(
        new URL("./products.json", import.meta.url).pathname,
      ),
    },

    // Shopping cart — starts empty
    {
      url: "/internal/cart",
      data: [],
    },

    // GET /api/products?category=electronics&maxPrice=100
    // Filterable product listing. Reads from /internal/products.
    {
      url: "/api/products",
      method: "GET",
      handler: (req, ctx) => {
        const products = ctx.endpoint("/internal/products");
        let items = products.data;

        const category = req.query.category as string | undefined;
        if (category) {
          items = items.filter((p) => p.category === category);
        }

        const maxPrice = req.query.maxPrice as string | undefined;
        if (maxPrice) {
          items = items.filter((p) => p.price <= Number(maxPrice));
        }

        return { body: { products: items, count: items.length } };
      },
    },

    // POST /api/cart — add product to cart
    // Body: { product_id, quantity }
    // Validates that the product exists and has enough stock.
    {
      url: "/api/cart",
      method: "POST",
      handler: (req, ctx) => {
        const { product_id, quantity } = req.body as {
          product_id: number;
          quantity: number;
        };
        const products = ctx.endpoint("/internal/products");
        const cart = ctx.endpoint("/internal/cart");

        const product = products.findById(product_id);
        if (!product) {
          return {
            status: 404,
            body: { error: `Product ${product_id} not found` },
          };
        }
        if (product.stock < quantity) {
          return {
            status: 400,
            body: { error: `Only ${product.stock} in stock` },
          };
        }

        // Decrease stock
        products.update(product_id, { stock: product.stock - quantity });

        // Add to cart (or increase quantity if already there)
        const existing = cart.where(
          (item) => item.product_id === product_id,
        )[0];
        if (existing) {
          cart.update(existing.id, { quantity: existing.quantity + quantity });
          return { body: { item: cart.findById(existing.id) } };
        }

        const item = cart.insert({ product_id, quantity });
        return { status: 201, body: { item } };
      },
    },

    // GET /api/cart — cart summary with product details and total
    {
      url: "/api/cart",
      method: "GET",
      handler: (_req, ctx) => {
        const products = ctx.endpoint("/internal/products");
        const cart = ctx.endpoint("/internal/cart");

        const items = cart.data.map((item) => {
          const product = products.findById(item.product_id);
          return {
            ...item,
            product_name: product?.name ?? "Unknown",
            unit_price: product?.price ?? 0,
            subtotal: (product?.price ?? 0) * item.quantity,
          };
        });

        const total = items.reduce((sum, i) => sum + i.subtotal, 0);
        return { body: { items, total } };
      },
    },
  ],
});

console.log(`E-commerce API running at ${server.url}`);
