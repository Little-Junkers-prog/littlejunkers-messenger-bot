// api/odoo-probe.js
// TEMPORARY — delete after field names are confirmed.
// Hit this endpoint once in your browser to verify Odoo field names.
// GET https://your-vercel-url/api/odoo-probe

async function odooCall(model, method, args, kwargs = {}) {
  const url  = `${process.env.ODOO_URL}/web/dataset/call_kw`;
  const body = {
    jsonrpc: "2.0",
    method:  "call",
    params:  { model, method, args, kwargs: { context: {}, ...kwargs } },
  };
  const res  = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Bearer ${process.env.ODOO_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // ── 1. Get all date/rental-related fields on sale.order.line ──
    const allFields = await odooCall("sale.order.line", "fields_get", [], {
      attributes: ["string", "type"],
    });

    const relevantLineFields = Object.entries(allFields)
      .filter(([k]) =>
        k.includes("rental") || k.includes("return") ||
        k.includes("date")   || k.includes("pickup") ||
        k.includes("start")
      )
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce((acc, [k, v]) => { acc[k] = `(${v.type}) ${v.string}`; return acc; }, {});

    // ── 2. Get all rental-related fields on sale.order ──
    const orderFields = await odooCall("sale.order", "fields_get", [], {
      attributes: ["string", "type"],
    });

    const relevantOrderFields = Object.entries(orderFields)
      .filter(([k]) =>
        k.includes("rental") || k.includes("return") ||
        k.includes("pickup") || k.includes("start")
      )
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce((acc, [k, v]) => { acc[k] = `(${v.type}) ${v.string}`; return acc; }, {});

    // ── 3. Fetch 3 live active rental order lines for product ID 60 (11-Yard) ──
    const sampleLines = await odooCall(
      "sale.order.line",
      "search_read",
      [[
        ["product_id.product_tmpl_id", "=", 60],
        ["is_rental", "=", true],
      ]],
      {
        fields: [
          "id", "order_id", "product_id", "is_rental",
          "rental_start_date", "rental_return_date",
          "start_date", "return_date",
          "pickup_date", "start_date",
          "qty_delivered", "product_uom_qty",
        ],
        limit: 3,
      }
    );

    // ── 4. Fetch 3 live sale.orders with rental_status ──
    const sampleOrders = await odooCall(
      "sale.order",
      "search_read",
      [[["is_rental_order", "=", true], ["rental_status", "in", ["pickup", "pickedup"]]]],
      {
        fields: [
          "id", "name", "rental_status", "is_rental_order",
          "rental_start_date", "rental_return_date",
          "start_date", "return_date",
        ],
        limit: 3,
      }
    );

    return res.status(200).json({
      note: "DELETE this file after confirming field names",
      sale_order_line_relevant_fields: relevantLineFields,
      sale_order_relevant_fields:      relevantOrderFields,
      sample_order_lines:              sampleLines,
      sample_orders:                   sampleOrders,
    });

  } catch (err) {
    return res.status(500).json({
      error:   err.message,
      odoo_url: process.env.ODOO_URL ? "set" : "MISSING",
      api_key:  process.env.ODOO_API_KEY ? "set" : "MISSING",
    });
  }
}
