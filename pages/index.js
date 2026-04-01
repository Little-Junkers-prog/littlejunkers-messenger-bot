export default function Home() {
  return (
    <div style={{ padding: 40, fontFamily: "sans-serif" }}>
      <h1>Little Junkers Funnel</h1>
      <p>Funnel is live.</p>

      <a href="/rent-a-dumpster">
        <button style={{
          padding: 15,
          background: "#545454",
          color: "white",
          border: "none",
          cursor: "pointer"
        }}>
          Start Booking
        </button>
      </a>
    </div>
  );
}
