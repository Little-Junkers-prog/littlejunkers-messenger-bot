// api/health.js
export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: "Little Junkers Messenger Bot",
    message: "API is alive and ready to connect to Facebook."
  });
}
