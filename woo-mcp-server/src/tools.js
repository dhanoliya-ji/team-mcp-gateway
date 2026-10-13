// tools.js
// Here we list every tool our WooCommerce MCP server gives.
// Each tool has:
//   1. a name           (what the AI calls)
//   2. a description    (tells the AI when to use it)
//   3. an input schema  (what inputs it needs, checked with "zod")
//   4. a function       (the real work)

import { z } from "zod";
import { wooRequest } from "./woo-api.js";

// The store's time zone. "Today" means today in this time zone.
const STORE_TIMEZONE = process.env.STORE_TIMEZONE || "UTC";

// Get today's date like "2026-10-13" in the store time zone.
function todayInStore() {
  // "en-CA" prints dates as YYYY-MM-DD, which is what we want.
  return new Intl.DateTimeFormat("en-CA", { timeZone: STORE_TIMEZONE }).format(new Date());
}

// The public store address, for product links (for example http://store.localtest.me).
const STORE_PUBLIC_URL = process.env.STORE_PUBLIC_URL || "";

// WordPress makes links with "https://" because of our X-Forwarded-Proto header.
// We swap the start of the link for the real public store address.
function publicLink(link) {
  if (!STORE_PUBLIC_URL || !link) return link;
  const url = new URL(link);
  return STORE_PUBLIC_URL + url.pathname + url.search;
}

// MCP tools must return "content". We send back JSON as text.
function reply(data) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

// A product from WooCommerce has many fields. We keep only the useful ones.
function shortProduct(p) {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    status: p.status,
    stock_status: p.stock_status,
    link: publicLink(p.permalink),
  };
}

// Same idea for an order.
function shortOrder(o) {
  return {
    id: o.id,
    status: o.status,
    total: o.total,
    currency: o.currency,
    created: o.date_created,
    customer: ((o.billing?.first_name || "") + " " + (o.billing?.last_name || "")).trim(),
    email: o.billing?.email,
    payment: o.payment_method_title,
    items: (o.line_items || []).map((item) => ({
      name: item.name,
      quantity: item.quantity,
      total: item.total,
    })),
  };
}

// All order statuses WooCommerce knows.
const ORDER_STATUSES = ["pending", "processing", "on-hold", "completed", "cancelled", "refunded", "failed"];

// This function adds all tools to an MCP server.
export function addTools(server) {
  // ---------- Tool 1: list products ----------
  server.registerTool(
    "list_products",
    {
      description: "List products in the WooCommerce store. You can search by name.",
      inputSchema: {
        search: z.string().optional().describe("Words to search in product names"),
        limit: z.number().int().min(1).max(50).optional().describe("How many products (default 20)"),
      },
    },
    async ({ search, limit }) => {
      const products = await wooRequest("GET", "/wc/v3/products", {
        search: search,
        per_page: limit || 20,
      });
      return reply(products.map(shortProduct));
    }
  );

  // ---------- Tool 2: create product ----------
  server.registerTool(
    "create_product",
    {
      description: "Create a new simple product in the store. It is published right away.",
      inputSchema: {
        name: z.string().min(1).describe("Product name"),
        price: z.number().positive().describe("Price, for example 19.99"),
        description: z.string().optional().describe("Product description"),
      },
    },
    async ({ name, price, description }) => {
      const product = await wooRequest("POST", "/wc/v3/products", {}, {
        name: name,
        type: "simple",
        status: "publish",
        regular_price: String(price), // WooCommerce wants the price as text
        description: description || "",
      });
      return reply(shortProduct(product));
    }
  );

  // ---------- Tool 3: list orders ----------
  server.registerTool(
    "list_orders",
    {
      description:
        "List orders. Use date='today' to get orders that came in today. " +
        "The store time zone is " + STORE_TIMEZONE + ".",
      inputSchema: {
        date: z.string().optional().describe("'today' or a date like 2026-10-13. Leave empty for latest orders."),
        status: z.enum(ORDER_STATUSES).optional().describe("Only orders with this status"),
        limit: z.number().int().min(1).max(50).optional().describe("How many orders (default 20)"),
      },
    },
    async ({ date, status, limit }) => {
      const query = { per_page: limit || 20, status: status };

      // If a date is given, only get orders from that whole day.
      if (date) {
        const day = date === "today" ? todayInStore() : date;
        query.after = day + "T00:00:00";
        query.before = day + "T23:59:59";
      }

      const orders = await wooRequest("GET", "/wc/v3/orders", query);
      return reply({ count: orders.length, orders: orders.map(shortOrder) });
    }
  );

  // ---------- Tool 4: get one order ----------
  server.registerTool(
    "get_order",
    {
      description: "Get the full details of one order by its ID.",
      inputSchema: {
        id: z.number().int().positive().describe("Order ID"),
      },
    },
    async ({ id }) => {
      const order = await wooRequest("GET", "/wc/v3/orders/" + id);
      return reply(shortOrder(order));
    }
  );

  // ---------- Tool 5: update order status ----------
  server.registerTool(
    "update_order_status",
    {
      description: "Change the status of an order, for example to 'completed'.",
      inputSchema: {
        id: z.number().int().positive().describe("Order ID"),
        status: z.enum(ORDER_STATUSES).describe("The new status"),
      },
    },
    async ({ id, status }) => {
      const order = await wooRequest("PUT", "/wc/v3/orders/" + id, {}, { status: status });
      return reply(shortOrder(order));
    }
  );

  // ---------- Tool 6: ping ----------
  // A tiny tool to check the server is alive.
  // Our other two MCP servers also have a tool called "ping".
  // This shows how the gateway handles two tools with the same name.
  server.registerTool(
    "ping",
    { description: "Check that the WooCommerce MCP server is alive.", inputSchema: {} },
    async () => reply({ server: "woocommerce", ok: true, time: new Date().toISOString() })
  );
}
