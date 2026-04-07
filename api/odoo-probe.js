// api/odoo-probe.js
// TEMPORARY — delete after field names are confirmed.
// GET https://littlejunkers-messenger-bot.vercel.app/api/odoo-probe

async function odooCall(model, method, args, kwargs = {}) {
  const url = `${process.env.ODOO_URL}/web/dataset/call_kw`;

  // Odoo 18 Online: Basic auth with login:api_key
  const credentials = Buffer.from(
    `${process.env.ODOO_USER}:${process.env.ODOO_API_KEY}`
  ).toString("base64");

  const body = {
    jsonrpc: "2.0",
    method:  "call",
    id:      1,
    params:  {
      model,
      method,
      args,
      kwargs: { context: {}, ...kwargs },
    },
  };

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": `Basic ${credentials}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.data?.message || JSON.stringify(json.error));
  return json.result;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    // 1. Relevant fields on sale.order.line
    const allFields = await odooCall("sale.order.line", "fields_get", [], {
      attributes: ["string", "type"],
    });

    const lineFields = Object.entries(allFields)
      .filter(([k]) =>
        k.includes("rental") || k.includes("return") ||
        k.includes("date")   || k.includes("pickup") ||
        k.includes("start")
      )
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce((acc, [k, v]) => { acc[k] = `(${v.type}) ${v.string}`; return acc; }, {});

    // 2. Relevant fields on sale.order
    const orderAllFields = await odooCall("sale.order", "fields_get", [], {
      attributes: ["string", "type"],
    });

    const orderFields = Object.entries(orderAllFields)
      .filter(([k]) =>
        k.includes("rental") || k.includes("return") ||
        k.includes("pickup") || k.includes("start")
      )
      .sort(([a], [b]) => a.localeCompare(b))
      .reduce((acc, [k, v]) => { acc[k] = `(${v.type}) ${v.string}`; return acc; }, {});

    // 3. Sample active rental lines for 11-Yard (product template 60)
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
          "pickup_date",
        ],
        limit: 3,
      }
    );

    // 4. Sample active sale.orders with rental_status
    const sampleOrders = await odooCall(
      "sale.order",
      "search_read",
      [[
        ["is_rental_order", "=", true],
        ["rental_status", "in", ["pickup", "pickedup"]],
      ]],
      {
        fields: [
          "id", "name", "rental_status",
          "rental_start_date", "rental_return_date",
          "start_date", "return_date",
        ],
        limit: 3,
      }
    );

    return res.status(200).json({
      note:                    "DELETE this file after confirming field names",
      sale_order_line_fields:  lineFields,
      sale_order_fields:       orderFields,
      sample_lines:            sampleLines,
      sample_orders:           sampleOrders,
    });

  } catch (err) {
    return res.status(500).json({
      error:    err.message,
      odoo_url: process.env.ODOO_URL      ? "set" : "MISSING",
      api_key:  process.env.ODOO_API_KEY  ? "set" : "MISSING",
      odoo_user: process.env.ODOO_USER    ? "set" : "MISSING",
    });
  }
}
