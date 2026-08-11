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
  inkFaint: "#b8b0a6",
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
    // The bridge must show the standard base rate only. Promotional tiers
    // remain available to the booking flow but never determine this display.
    .filter((tier) => tier?.tierKey === "2day_standard")
    .map((tier) => Number(tier?.prices?.[String(size)] || 0))
    .filter((price) => price > 0);
  return prices.length ? Math.min(...prices) : null;
}

function splitPayment(value) {
  if (!value) return null;
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value / 4);
}

function Header() {
  const [open, setOpen] = useState(false);
  const links = [
    ["Home", HOMEPAGE],
    ["Get Exact Pricing", `${HOMEPAGE}/pricing`],
    ["Service Areas", `${HOMEPAGE}/service-areas`],
    ["What Can I Put in a Dumpster", `${HOMEPAGE}/what-can-i-put-in-a-dumpster`],
    ["About Us", `${HOMEPAGE}/about-us`],
    ["FAQ", `${HOMEPAGE}/dumpster-rental-faq`],
    ["Contact Us", `${HOMEPAGE}/contactus`],
    ["Blog", `${HOMEPAGE}/blog`],
    ["Shop", `${HOMEPAGE}/shop`],
  ];

  return (
    <header className="bridge-header">
      <div className="bridge-header-inner">
        <button type="button" className="bridge-mobile-toggle" aria-label="Toggle navigation menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          <span />
          <span />
          <span />
        </button>
        <a href={HOMEPAGE} className="bridge-logo-link" aria-label="Little Junkers home">
          <img src="/little-junkers-logo.png" alt="Little Junkers" className="bridge-logo" />
        </a>
        <span className="bridge-header-spacer" aria-hidden="true" />
      </div>
      {open ? <nav className="bridge-mobile-nav" aria-label="Site navigation">
        {links.map(([label, href]) => <a key={href} href={href} onClick={() => setOpen(false)}>{label}</a>)}
      </nav> : null}
      <style jsx>{`
        .bridge-header {
          background: ${C.heroBg};
          color: ${C.cardBg};
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .bridge-header-inner {
          max-width: 1120px;
          margin: 0 auto;
          padding: 16px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: relative;
        }
        .bridge-logo-link {
          display: inline-flex;
          align-items: center;
          left: 50%;
          position: absolute;
          transform: translateX(-50%);
        }
        .bridge-logo {
          display: block;
          width: 82px;
          height: 50px;
          object-fit: contain;
        }
        .bridge-header-spacer {
          display: block;
          height: 40px;
          width: 40px;
        }
        .bridge-mobile-toggle {
          background: transparent;
          border: 0;
          cursor: pointer;
          display: grid;
          gap: 4px;
          padding: 8px;
        }
        .bridge-mobile-toggle span {
          background: ${C.cardBg};
          display: block;
          height: 2px;
          width: 24px;
        }
        .bridge-mobile-nav {
          background: ${C.surface};
          color: ${C.ink};
          display: grid;
          gap: 14px;
          padding: 20px 24px;
        }
        .bridge-mobile-nav a {
          color: ${C.ink};
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          font-size: 16px;
          font-weight: 800;
          text-decoration: none;
        }
        .bridge-mobile-nav a:hover,
        .bridge-mobile-nav a:focus-visible {
          color: ${C.pinkText};
        }
      `}</style>
    </header>
  );
}

function ProductCard({ product, onSelect }) {
  const price = getStartingPrice(product.pricing, product.size);
  const tons = Number(product.meta?.includedTons || 0);
  const imageBySize = {
    11: "/11 -yard image.png",
    16: "/16 -yard image.png",
    21: "/21 -yard image.png",
  };
  return (
    <article style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}`, borderRadius: 14, padding: 22, display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}>
      {product.size === 16 ? <span style={{ alignSelf: "flex-start", background: C.pinkBar, color: C.ink, borderRadius: 999, padding: "5px 10px", fontSize: 12, fontWeight: 800 }}>Most Popular</span> : null}
      <img src={imageBySize[product.size]} alt={`${product.size}-yard dumpster`} style={{ width: "100%", height: 180, objectFit: "contain", borderRadius: 10 }} />
      <p style={{ color: C.pinkText, fontSize: 12, fontWeight: 800, letterSpacing: "0.08em", margin: 0, textTransform: "uppercase" }}>{product.size}-yard dumpster</p>
      <h2 style={{ fontSize: 26, margin: 0 }}>{productNames[product.size]}</h2>
      <p style={{ color: C.inkMid, lineHeight: 1.5, margin: 0 }}>{product.meta?.shortDesc || product.meta?.bestUse || "A practical option for your cleanup."}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <span style={{ background: "#fff5fb", border: `1px solid ${C.pinkBar}`, borderRadius: 999, color: C.pinkText, fontSize: 12, fontWeight: 800, padding: "6px 10px" }}>
          Includes {tons || "included"} ton{tons === 1 ? "" : "s"}
        </span>
        {product.meta?.truckLoads ? <span style={{ background: "#fff5fb", border: `1px solid ${C.pinkBar}`, borderRadius: 999, color: C.pinkText, fontSize: 12, fontWeight: 800, padding: "6px 10px" }}>{product.meta.truckLoads}</span> : null}
      </div>
      <ul style={{ color: C.inkMid, fontSize: 14, lineHeight: 1.6, margin: 0, paddingLeft: 20 }}>
        {product.size === 11 ? (
          <>
            <li>12' L x 7.5' W x 3.5' H</li>
            <li>Holds 4-5 pickup truck loads</li>
            <li>Best for garage cleanouts, roofing, and dense debris</li>
          </>
        ) : product.size === 16 ? (
          <>
            <li>Holds 6-7 pickup truck loads</li>
            <li>Best for moving, decluttering, and mixed cleanup</li>
            <li>Driveway-safe and HOA-friendly</li>
          </>
        ) : (
          <>
            <li>Holds 8-10 pickup truck loads</li>
            <li>Best for renovations, demo, and bulky cleanouts</li>
            <li>Driveway-safe and HOA-friendly</li>
          </>
        )}
      </ul>
      <div style={{ borderTop: `1px solid ${C.cardBorder}`, marginTop: "auto", paddingTop: 14 }}>
        <p style={{ color: C.inkMuted, fontSize: 12, margin: "0 0 3px" }}>Starting at</p>
        <p style={{ fontSize: 34, fontWeight: 900, margin: "0 0 2px" }}>{price ? money(price) : "See current rate"}</p>
        {price ? <p style={{ color: C.inkMuted, fontSize: 13, margin: "0 0 14px" }}>or 4 interest-free payments of {splitPayment(price)}</p> : null}
        <button type="button" onClick={() => onSelect(product.size)} style={{ background: C.ink, border: 0, borderRadius: 10, color: C.cardBg, cursor: "pointer", fontSize: 15, fontWeight: 800, padding: "14px 16px", width: "100%" }}>
          Reserve This Dumpster
        </button>
      </div>
    </article>
  );
}

function Footer() {
  const localMarkets = ["Peachtree City", "Newnan", "Fayetteville", "Tyrone", "Senoia"];
  return (
    <footer style={{ background: C.heroBg, color: C.cardBg, padding: "56px 24px 24px" }}>
      <div style={{ maxWidth: 1120, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 36 }}>
          <div>
            <h2 style={{ fontSize: 22, margin: "0 0 14px" }}>Little Junkers LLC</h2>
            <p style={{ color: C.inkFaint, lineHeight: 1.6, margin: "0 0 14px" }}>Family-owned dumpster rental with clear pricing and driveway-safe delivery throughout south Atlanta.</p>
            <p style={{ margin: "0 0 7px" }}><a href="tel:+14705484733" style={{ color: C.cardBg }}>470-548-4733</a></p>
            <p style={{ margin: "0 0 7px" }}><a href="mailto:info@littlejunkersllc.com" style={{ color: C.cardBg }}>info@littlejunkersllc.com</a></p>
            <a href="https://www.google.com/search?q=Little+Junkers+LLC+Google+reviews" target="_blank" rel="noreferrer" style={{ color: C.pink }}>Leave us a Google review</a>
          </div>
          <div>
            <h3 style={{ fontSize: 16, margin: "0 0 14px" }}>Local Markets</h3>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 9 }}>
              {localMarkets.map((market) => <li key={market}><a href={`${HOMEPAGE}/service-areas/${market.toLowerCase().replaceAll(" ", "-")}`} style={{ color: C.inkFaint, textDecoration: "none" }}>{market}</a></li>)}
            </ul>
          </div>
          <div>
            <h3 style={{ fontSize: 16, margin: "0 0 14px" }}>Hours & Coverage</h3>
            <p style={{ color: C.inkFaint, lineHeight: 1.6, margin: "0 0 10px" }}>Online booking is open 24/7.<br />Local support available Monday-Saturday.<br />Serving Peachtree City and nearby south Atlanta communities.</p>
            <a href={`${HOMEPAGE}/contactus`} style={{ background: C.pink, borderRadius: 10, color: C.ink, display: "inline-block", fontWeight: 800, padding: "12px 16px", textDecoration: "none" }}>Book Your Pink Bin</a>
          </div>
        </div>
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.14)", color: C.inkFaint, fontSize: 12, marginTop: 42, paddingTop: 18 }}>&copy; 2026 Little Junkers LLC. All rights reserved.</div>
      </div>
    </footer>
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
            <p style={{ border: `1px solid ${C.pink}`, borderRadius: 999, color: C.pink, display: "inline-block", fontSize: 11, fontWeight: 800, letterSpacing: "0.1em", margin: "0 0 18px", padding: "8px 14px", textTransform: "uppercase" }}>LOCALLY OWNED • SERVING PEACHTREE CITY &amp; NEARBY NEIGHBORHOODS</p>
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
      <Footer />
    </div>
  );
}
