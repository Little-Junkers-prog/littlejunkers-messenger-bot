import { createComparisonSession, recordComparisonEvent, resolveComparisonMarket, updateComparisonSession } from "../lib/comparisonFunnelService";

const SIZES = new Set([11, 16, 21]);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ success: false, error: "Method not allowed" });
  try {
    const body = req.body || {};
    const action = String(body.action || "start");

    if (action === "start") {
      const session = await createComparisonSession({ locationInput: body.locationInput });
      return res.status(201).json({ success: true, session });
    }

    const sessionId = String(body.sessionId || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(sessionId)) return res.status(400).json({ success: false, error: "Valid sessionId required" });

    if (action === "location") {
      const resolved = resolveComparisonMarket(body.locationInput);
      if (!resolved.market) return res.status(400).json({ success: false, error: "We currently compare Peachtree City, Fayetteville, and Newnan." });
      const session = await updateComparisonSession(sessionId, { locationInput: resolved.input, marketCity: resolved.market.city, marketState: resolved.market.state, marketZip: resolved.market.zip });
      await recordComparisonEvent({ sessionId, eventName: "comparison_location_resolved", context: { marketCity: resolved.market.city, marketZip: resolved.market.zip } });
      return res.status(200).json({ success: true, session });
    }

    if (action === "size") {
      const size = Number(body.size);
      if (!SIZES.has(size)) return res.status(400).json({ success: false, error: "size must be 11, 16, or 21" });
      const session = await updateComparisonSession(sessionId, { selectedSizeYards: size });
      await recordComparisonEvent({ sessionId, eventName: "comparison_size_selected", context: { sizeYards: size } });
      return res.status(200).json({ success: true, session });
    }

    if (action === "event") {
      await recordComparisonEvent({ sessionId, eventName: String(body.eventName || ""), providerId: body.providerId || null, context: body.context || {} });
      return res.status(200).json({ success: true });
    }

    return res.status(400).json({ success: false, error: "Unknown action" });
  } catch (error) {
    console.error("[comparison-session] FAILED", error);
    return res.status(500).json({ success: false, error: "Comparison session request failed" });
  }
}
