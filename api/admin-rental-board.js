// api/admin-rental-board.js
// Fetches rentals joined with customer data for the CSR rental board.
// Also handles status transitions with the paid = confirmed rule enforced.
import { getSupabaseAdmin, assertServerOnly } from "../lib/supabaseAdmin";

const ALLOWED_ORIGINS = new Set([
  "https://book.littlejunkersllc.com",
  "https://www.littlejunkersllc.com",
]);

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function hasAllowedOrigin(req) {
  const origin = req.headers.origin;
  return !origin || ALLOWED_ORIGINS.has(origin);
}

// Rule: any rental with amount_paid > 0 OR payment_source = 'funnel'
// is considered paid and must be confirmed, never pending.
function resolveStatus(rental) {
  if (
    rental.status === "pending" &&
    (rental.amount_paid > 0 || rental.payment_source === "funnel")
  ) {
    return "confirmed";
  }
  return rental.status;
}

export default async function handler(req, res) {
  applyCors(req, res);

  if (req.method === "OPTIONS") {
    return hasAllowedOrigin(req)
      ? res.status(200).end()
      : res.status(403).json({ error: "Forbidden" });
  }

  if (!hasAllowedOrigin(req)) {
    return res.status(403).json({ error: "Forbidden" });
  }

  assertServerOnly();
  const supabase = getSupabaseAdmin();

  // ── GET: fetch rental board data ──────────────────────────────────────────
  if (req.method === "GET") {
    try {
      // Fetch rentals with customer data joined, exclude very old completed ones
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data: rentals, error } = await supabase
        .from("rentals")
        .select(`
          id, status, size_yards, delivery_address, zone,
          dropoff_date, scheduled_return, actual_return,
          rental_days, amount_paid, payment_source, notes,
          created_at, updated_at,
          customers ( id, name, phone, email )
        `)
        .or(
          `status.in.(pending,awaiting_date,confirmed,active),` +
          `and(status.in.(returned,cancelled),updated_at.gte.${thirtyDaysAgo.toISOString()})`
        )
        .order("dropoff_date", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Auto-heal: any paid rental still sitting as pending gets confirmed in DB
      const toHeal = (rentals || []).filter(
        (r) => r.status === "pending" &&
          (r.amount_paid > 0 || r.payment_source === "funnel")
      );

      if (toHeal.length > 0) {
        await supabase
          .from("rentals")
          .update({ status: "confirmed" })
          .in("id", toHeal.map((r) => r.id));

        toHeal.forEach((r) => { r.status = "confirmed"; });
      }

      // Bucket into lanes
      const lanes = {
        pending:   [],
        confirmed: [],
        active:    [],
        completed: [],
      };

      for (const rental of rentals || []) {
        const status = resolveStatus(rental);
        if (status === "pending" || status === "awaiting_date") {
          lanes.pending.push({ ...rental, status });
        } else if (status === "confirmed") {
          lanes.confirmed.push({ ...rental, status });
        } else if (status === "active") {
          lanes.active.push({ ...rental, status });
        } else {
          lanes.completed.push({ ...rental, status });
        }
      }

      return res.status(200).json({ success: true, lanes });
    } catch (err) {
      console.error("[admin-rental-board] GET failed:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  // ── POST: status transition ───────────────────────────────────────────────
  if (req.method === "POST") {
    try {
      const { rentalId, action } = req.body || {};

      if (!rentalId || !action) {
        return res.status(400).json({ success: false, error: "rentalId and action required" });
      }

      // Fetch current rental
      const { data: rental, error: fetchError } = await supabase
        .from("rentals")
        .select("id, status, amount_paid, payment_source, size_yards")
        .eq("id", rentalId)
        .single();

      if (fetchError || !rental) {
        return res.status(404).json({ success: false, error: "Rental not found" });
      }

      let newRentalStatus = null;
      let unitStatusUpdate = null; // { size_yards, status }
      let eventType = null;
      const today = new Date().toISOString().slice(0, 10);

      if (action === "confirm") {
        // Manually confirm a pending/awaiting rental
        if (!["pending", "awaiting_date"].includes(rental.status)) {
          return res.status(400).json({ success: false, error: "Rental is not in a confirmable state" });
        }
        newRentalStatus = "confirmed";
        eventType = "rental_confirmed";

      } else if (action === "deliver") {
        // Mark as delivered — move to active, one available unit of this size → deployed
        if (!["confirmed", "pending", "awaiting_date"].includes(rental.status)) {
          return res.status(400).json({ success: false, error: "Rental cannot be marked delivered from current status" });
        }
        newRentalStatus = "active";
        unitStatusUpdate = { size_yards: rental.size_yards, fromStatus: "available", toStatus: "deployed" };
        eventType = "dropoff_completed";

      } else if (action === "return") {
        // Mark as returned — move to returned, one deployed unit of this size → available
        if (rental.status !== "active") {
          return res.status(400).json({ success: false, error: "Only active rentals can be marked returned" });
        }
        newRentalStatus = "returned";
        unitStatusUpdate = { size_yards: rental.size_yards, fromStatus: "deployed", toStatus: "available" };
        eventType = "return_completed";

      } else if (action === "cancel") {
        if (["returned", "cancelled"].includes(rental.status)) {
          return res.status(400).json({ success: false, error: "Rental is already closed" });
        }
        // If unit was deployed for this rental, return it
        if (rental.status === "active") {
          unitStatusUpdate = { size_yards: rental.size_yards, fromStatus: "deployed", toStatus: "available" };
        }
        newRentalStatus = "cancelled";
        eventType = "rental_confirmed"; // reuse closest event type

      } else {
        return res.status(400).json({ success: false, error: `Unknown action: ${action}` });
      }

      // Update rental status
      const rentalUpdate = { status: newRentalStatus };
      if (action === "deliver") rentalUpdate.dropoff_date = rental.dropoff_date || today;
      if (action === "return") rentalUpdate.actual_return = today;

      const { error: rentalError } = await supabase
        .from("rentals")
        .update(rentalUpdate)
        .eq("id", rentalId);

      if (rentalError) throw rentalError;

      // Flip one unit of the right size (no specific unit assignment in v1)
      if (unitStatusUpdate) {
        const { data: units } = await supabase
          .from("units")
          .select("id")
          .eq("size_yards", unitStatusUpdate.size_yards)
          .eq("status", unitStatusUpdate.fromStatus)
          .limit(1);

        if (units && units.length > 0) {
          await supabase
            .from("units")
            .update({ status: unitStatusUpdate.toStatus })
            .eq("id", units[0].id);
        }
        // If no matching unit found we don't hard-fail —
        // status counts may be manually mismatched, operator can correct via Update Unit panel
      }

      // Log event
      await supabase.from("events").insert({
        event_type: eventType,
        source: "admin",
        rental_id: rentalId,
        payload: { action, newStatus: newRentalStatus, triggeredBy: "csr_rental_board" },
      });

      return res.status(200).json({ success: true, rentalId, newStatus: newRentalStatus });
    } catch (err) {
      console.error("[admin-rental-board] POST failed:", err);
      return res.status(500).json({ success: false, error: err.message });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
