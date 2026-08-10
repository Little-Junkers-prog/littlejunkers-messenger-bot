import { useEffect, useMemo, useState } from "react";

const C = {
  pageBg: "#edeae4",
  cardBg: "#ffffff",
  cardBorder: "#e5e0d8",
  heroBg: "#1e1c19",
  pink: "#ffcee4",
  pinkBar: "#ffb3d4",
  pinkText: "#c2587a",
  ink: "#1a1a1a",
  inkMid: "#555555",
  inkMuted: "#999999",
  surface: "#faf8f5",
};

const HOMEPAGE = "https://www.littlejunkersllc.com";
const BOOKING_PATH = "/rent-a-dumpster";

const productNames = {
  11: "The Little Junker",
  16: "The Mighty Middler",
  21: "The Big Junker",
};

function money(value) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

function getStartingPrice(pricing, size) {
  const prices = (pricing || [])
    .map((tier) => Number(tier?.prices?.[String(size)] || 0))
    .filter((price) => price > 0);
  return prices.length ? Math.min(...prices) : null;
}

function Header() {
  const [open, setOpen] = useState(false);
  const links = [
    ["Home", HOMEPAGE],
    ["Service Areas", `${HOMEPAGE}/service-areas`],
    ["What Can I Put in a Dumpster", `${HOMEPAGE}/what-can-i-put-in-a-dumpster`],
    ["About Us", `${HOMEPAGE}/about-us`],
    ["FAQ", `${HOMEPAGE}/dumpster-rental-faq`],
    ["Contact Us", `${HOMEPAGE}/contactus`],
  ];

  return (
    <header style={{ background: C.heroBg, color: C.cardBg, position: "sticky", top: 0, zIndex: 10 }}>
      <div style={{ maxWidth: 1120, margin: "0 auto", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <a href={HOMEPAGE} style={{ color: C.cardBg, textDecoration: "none", fontWeight: 900, fontSize: 20 }}>
          Little Junkers
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/" style={{ background: C.pink, color: C.ink, textDecoration: "none", padding: "10px 18px", borderRadius: 10, fontWeight: 800 }}>
            Book Now
          </a>
          <button type="button" aria-label="Toggle navigation menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} style={{ background: "transparent", border: 0, cursor: "pointer", padding: 8, display: "grid", gap: 4 }}>
            <span style={{ display: "block", width: 24, height: 2, background: C.cardBg }} />
            <span style={{ display: "block", width: 24, height: 2, background: C.cardBg }} />
            <span style={{ display: "block", width: 24, height: 2, background: C.cardBg }} />
          </button>
        </div>
      </div>
      {open ? <nav style={{ background: C.surface, color: C.ink, padding: "20px 24px", display: "grid", gap: 14 }}>
        {links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)} style={{ color: C.ink, fontWeight: 800, textDecoration: "none" }}>{label}</a>)}
      </nav> : null}
    </header>
  );
}

function ProductCard({ product, onSelect }) {
  const price = getStartingPrice(product.pricing, product.size);
  const tons = Number(product.meta?.includedTons || 0);
  return (
    <article style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: 22, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
      {product.size === 16 ? <span style={{ alignSelf: "flex-start", background: C.pinkBar, color: C.ink, borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 800 }}>Most Popular</span> : null}
      <p style={{ color: C.pinkText, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", margin: 0, textTransform: "uppercase" }}>{product.size}-yard dumpster</p>
      <h2 style={{ fontSize: 26, margin: 0 }}>{productNames[product.size]}</h2>
      <p style={{ color: C.inkMid, lineHeight: 1.5, margin: 0 }}>{product.meta?.shortDesc || product.meta?.bestUse || "A practical option for your cleanup."}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <span style={{ background: "#fff5fb", border: `1px solid ${C.pinkBar}`, borderRadius: 999, color: C.pinkText, fontSize: 12, fontWeight: 800, padding: "6px 10px" }}>
          Includes {tons || "included"} ton{tons === 1 ? "" : "s"}
        </span>
        {product.meta?.truckLoads ? <span style={{ background: "#fff5fb", border: `1px solid ${C.pinkBar}`, borderRadius: 999, color: C.pinkText, fontSize: 12, fontWeight: 800, padding: "6px 10px" }}>{product.meta.truckLoads}</span> : null}
      </div>
      <div style={{ borderTop: `1px solid ${C.cardBorder}`, marginTop: "auto", paddingTop: 14 }}>
        <p style={{ color: C.inkMuted, fontSize: 12, margin: "0 0 3px" }}>Starting at</p>
        <p style={{ fontSize: 34, fontWeight: 900, margin: "0 0 14px" }}>{price ? money(price) : "See current rate"}</p>
        <button type="button" onClick={() => onSelect(product.size)} style={{ background: C.ink, border: 0, borderRadius: 10, color: C.cardBg, cursor: "pointer", fontSize: 15, fontWeight: 800, padding: "14px 16px", width: "100%" }}>
          Reserve This Dumpster
        </button>
      </div>
    </article>
  );
}

export default function Home() {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetch("/api/get-pricing")
      .then((response) => response.json())
      .then((json) => {
        if (!active) return;
        if (!json?.success) throw new Error(json?.error || "Unable to load pricing.");
        setConfig(json);
      })
      .catch((reason) => active && setError(reason.message || "Unable to load pricing."))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  const products = useMemo(() => {
    const sizes = Object.values(config?.sizes || {})
      .map((meta) => ({ size: Number(meta.sizeYards), meta, pricing: config?.pricing || [] }))
      .filter((product) => productNames[product.size])
      .sort((a, b) => a.size - b.size);
    return sizes;
  }, [config]);

  function selectSize(size) {
    window.location.href = `${BOOKING_PATH}?size=${size}`;
  }

  return (
    <div style={{ background: C.pageBg, color: C.ink, minHeight: "100vh", fontFamily: "Questrial, system-ui, sans-serif" }}>
      <Header />
      <main>
        <section style={{ background: C.heroBg, color: C.cardBg, padding: "72px 24px 64px" }}>
          <div style={{ maxWidth: 1120, margin: "0 auto" }}>
            <p style={{ color: C.pink, fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", margin: "0 0 14px", textTransform: "uppercase" }}>Dumpster rental pricing</p>
            <h1 style={{ fontSize: "clamp(38px, 7vw, 68px)", lineHeight: 1.03, margin: "0 0 20px", maxWidth: 760 }}>Transparent pricing. <span style={{ color: C.pink }}>No hidden fees.</span></h1>
            <p style={{ color: C.inkFaint, fontSize: 18, lineHeight: 1.55, margin: 0, maxWidth: 680 }}>Choose your dumpster size, then see live delivery availability and rental options before you reserve.</p>
          </div>
        </section>

        <section style={{ padding: "58px 24px", background: C.pageBg }}>
          <div style={{ maxWidth: 1120, margin: "0 auto" }}>
            <div style={{ marginBottom: 28 }}>
              <p style={{ color: C.pinkText, fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", margin: "0 0 8px", textTransform: "uppercase" }}>Start here</p>
              <h2 style={{ fontSize: 34, margin: "0 0 10px" }}>Pick the size that fits your project.</h2>
              <p style={{ color: C.inkMid, lineHeight: 1.5, margin: 0 }}>Every rental starts with a quick size choice. You can go back or call us if you are unsure.</p>
            </div>
            {loading ? <div style={{ background: C.cardBg, borderRadius: 14, padding: 24 }}>Loading current pricing…</div> : null}
            {error ? <div style={{ background: "#fff8eb", border: "1px solid #f2cf7a", borderRadius: 14, padding: 24 }}>We could not load current pricing. Please call or text <a href="tel:+14705484733">(470) 548-4733</a>.</div> : null}
            {!loading && !error ? <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>{products.map((product) => <ProductCard key={product.size} product={product} onSelect={selectSize} />)}</div> : null}
          </div>
        </section>

        <section style={{ background: C.surface, padding: "46px 24px" }}>
          <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexWrap: "wrap", gap: 24, alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ maxWidth: 700 }}>
              <p style={{ color: C.pinkText, fontSize: 12, fontWeight: 800, letterSpacing: "0.1em", margin: "0 0 8px", textTransform: "uppercase" }}>Another option</p>
              <h2 style={{ fontSize: 28, margin: "0 0 10px" }}>Only have a few bulky items?</h2>
              <p style={{ color: C.inkMid, lineHeight: 1.5, margin: 0 }}>Bulk haul-away may cost less than renting a dumpster when your items are already staged outside. We can help you choose the right service.</p>
            </div>
            <a href={`${HOMEPAGE}/contactus?service=bulk-haul-away`} style={{ background: C.pink, color: C.ink, borderRadius: 10, fontWeight: 800, padding: "13px 18px", textDecoration: "none" }}>Explore bulk haul-away</a>
          </div>
        </section>
      </main>
    </div>
  );
}
