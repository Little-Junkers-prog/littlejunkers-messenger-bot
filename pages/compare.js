import Head from "next/head";
import { useEffect, useMemo, useState } from "react";

const SIZES = [
  { yards: 11, title: "11 Yard", note: "Small projects & dense debris" },
  { yards: 16, title: "16 Yard", note: "Cleanouts & renovations" },
  { yards: 21, title: "21 Yard", note: "Larger renovations & cleanouts" },
];

async function post(body) {
  const response = await fetch("/api/comparison-session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Request failed");
  return json;
}

export default function ComparePage() {
  const [step, setStep] = useState(1);
  const [sessionId, setSessionId] = useState(null);
  const [location, setLocation] = useState("");
  const [market, setMarket] = useState(null);
  const [size, setSize] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [contact, setContact] = useState({ firstName: "", mobile: "", email: "", marketingSmsOptIn: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    post({ action: "start" }).then((r) => setSessionId(r.session.id)).catch(() => setError("We couldn't start the comparison. Please try again."));
  }, []);

  const preview = useMemo(() => {
    const providers = comparison?.providers || [];
    const competitors = providers.filter((p) => !p.isLittleJunkers);
    return { total: providers.length, publicPrices: competitors.filter((p) => p.price != null).length, quote: competitors.filter((p) => p.price == null).length };
  }, [comparison]);

  async function chooseLocation(e) {
    e.preventDefault(); if (!sessionId) return;
    setBusy(true); setError("");
    try {
      const r = await post({ action: "location", sessionId, locationInput: location });
      setMarket(r.session); setStep(2);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function chooseSize(yards) {
    setBusy(true); setError("");
    try {
      await post({ action: "size", sessionId, size: yards });
      setSize(yards);
      const response = await fetch(`/api/compare-dumpsters?zip=${market.market_zip}&size=${yards}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Comparison unavailable");
      setComparison(data);
      await post({ action: "event", sessionId, eventName: "comparison_preview_viewed", context: { providerCount: data.providers?.length || 0 } });
      setStep(3);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function unlock(e) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/comparison-unlock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, ...contact }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to unlock comparison");
      setStep(5);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <>
    <Head><title>Compare Dumpster Prices | Little Junkers</title><meta name="robots" content="noindex,nofollow"/><meta name="viewport" content="width=device-width, initial-scale=1"/></Head>
    <main className="page">
      <header className="hero"><div className="brand">LITTLE JUNKERS</div><h1>Compare dumpster rental prices near you.</h1><p>See recently checked local pricing and rental terms before you book.</p></header>
      <section className="shell">
        <div className="progress"><span className={step >= 1 ? "on" : ""}/><span className={step >= 2 ? "on" : ""}/><span className={step >= 3 ? "on" : ""}/><span className={step >= 4 ? "on" : ""}/></div>
        {error && <div className="alert">{error}</div>}

        {step === 1 && <form className="card" onSubmit={chooseLocation}><div className="eyebrow">STEP 1 OF 4</div><h2>Where do you need a dumpster?</h2><label>City or ZIP</label><input value={location} onChange={(e)=>setLocation(e.target.value)} placeholder="Peachtree City or 30269" autoComplete="postal-code"/><div className="hint">Currently comparing Peachtree City, Fayetteville and Newnan.</div><button disabled={busy || !location.trim()}>Continue</button></form>}

        {step === 2 && <section className="card"><div className="eyebrow">STEP 2 OF 4</div><h2>What size dumpster do you need?</h2><p className="muted">We'll compare nearby sizes while always showing each provider's actual container size.</p><div className="sizeGrid">{SIZES.map((s)=><button className="size" key={s.yards} disabled={busy} onClick={()=>chooseSize(s.yards)}><strong>{s.title}</strong><small>{s.note}</small><span>Compare this size →</span></button>)}</div></section>}

        {step === 3 && <section className="card"><div className="eyebrow">LOCAL MARKET PREVIEW</div><h2>{market?.market_city}: {preview.total} options found</h2><div className="marketStats"><div><strong>{preview.publicPrices}</strong><span>competitor prices published</span></div><div><strong>{preview.quote}</strong><span>competitors require a quote</span></div></div><div className="previewList">{(comparison?.providers || []).map((p)=><div className="previewRow" key={`${p.provider.slug}-${p.product.name}`}><div><strong>{p.provider.name}</strong><small>{p.product.actualSizeYards} yd {p.product.containerType === "roll_off" ? "roll-off" : "container"}</small></div><span>{p.price != null ? "Publishes pricing" : "Quote required"}</span></div>)}</div><button onClick={()=>setStep(4)}>See Prices & Details</button><p className="privacy">We'll ask for your name and mobile number before showing the full comparison. Marketing texts are optional.</p></section>}

        {step === 4 && <form className="card" onSubmit={unlock}><div className="eyebrow">STEP 4 OF 4</div><h2>Unlock the full comparison</h2><p className="muted">See prices, rental days, included weight and verified source details.</p><label>First name</label><input value={contact.firstName} onChange={(e)=>setContact({...contact,firstName:e.target.value})}/><label>Mobile number</label><input type="tel" value={contact.mobile} onChange={(e)=>setContact({...contact,mobile:e.target.value})}/><label>Email <span className="optional">optional</span></label><input type="email" value={contact.email} onChange={(e)=>setContact({...contact,email:e.target.value})}/><label className="check"><input type="checkbox" checked={contact.marketingSmsOptIn} onChange={(e)=>setContact({...contact,marketingSmsOptIn:e.target.checked})}/><span>Send me occasional Little Junkers offers by text. Optional.</span></label><button disabled={busy || !contact.firstName || !contact.mobile}>Show Me the Comparison</button></form>}

        {step === 5 && <section><div className="resultHead"><div><div className="eyebrow">{market?.market_city?.toUpperCase()} · {size} YARD CLASS</div><h2>Your local comparison</h2></div><button className="linkBtn" onClick={()=>setStep(2)}>Change size</button></div><div className="results">{(comparison?.providers || []).map((p)=><article className={`resultCard ${p.isLittleJunkers ? "lj" : ""}`} key={`${p.provider.slug}-${p.product.name}`}><div className="resultTop"><div><div className="provider">{p.provider.name}</div><div className="actual">{p.product.actualSizeYards} Yard {p.product.containerType === "roll_off" ? "Roll-Off" : "Container"}</div></div>{p.isLittleJunkers && <span className="badge">LITTLE JUNKERS</span>}</div><div className="price">{p.price != null ? `$${Math.round(p.price)}` : "Quote required"}</div><div className="terms"><span>{p.durationDays ? `${p.durationDays} days` : "Days not published"}</span><span>{p.includedTons ? `${p.includedTons} tons included` : "Weight not published"}</span></div>{p.isLittleJunkers ? <a className="cta" href={`https://book.littlejunkersllc.com/rent-a-dumpster?size=${size}&zip=${market.market_zip}&comparison_session=${sessionId}`} onClick={()=>post({action:"event",sessionId,eventName:"comparison_lj_booking_clicked",context:{sizeYards:size,marketZip:market.market_zip}})}>Book Online</a> : <button className="details" onClick={()=>post({action:"event",sessionId,eventName:"comparison_provider_detail_viewed",context:{providerSlug:p.provider.slug}})}>View details</button>}<small className="verified">{p.verifiedAt ? `Checked ${new Date(p.verifiedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}` : "Current Little Junkers pricing"}</small></article>)}</div></section>}
      </section>
      <footer>Public prices checked from provider information. Terms can change; confirm final details before booking.</footer>
    </main>
    <style jsx>{`
      :global(*){box-sizing:border-box} :global(body){margin:0;background:#EDEAE4;color:#1A1A1A;font-family:system-ui,-apple-system,sans-serif}.page{min-height:100vh}.hero{background:#1E1C19;color:#FAF8F5;padding:42px 20px 50px;text-align:center}.brand{font-size:12px;font-weight:900;letter-spacing:.18em;color:#FFCEE4}.hero h1{font-size:34px;line-height:1.05;max-width:640px;margin:14px auto 12px}.hero p{margin:0 auto;max-width:520px;color:#ddd6cd;font-size:16px}.shell{width:min(680px,calc(100% - 28px));margin:-20px auto 40px}.progress{display:flex;gap:6px;margin:0 auto 14px;width:140px}.progress span{height:5px;flex:1;border-radius:9px;background:#c9c3ba}.progress .on{background:#FFCEE4}.card,.resultCard{background:#FAF8F5;border:1px solid #ded8cf;border-radius:16px;padding:22px;box-shadow:0 10px 30px rgba(30,28,25,.06)}.eyebrow{font-size:11px;font-weight:850;letter-spacing:.12em;color:#6b655d;margin-bottom:8px}h2{font-size:25px;line-height:1.15;margin:0 0 12px}.muted,.hint,.privacy{color:#6b655d}.hint,.privacy{font-size:13px;margin-top:8px}label{display:block;font-size:13px;font-weight:750;margin:16px 0 7px}input{width:100%;padding:15px 14px;border:1px solid #bdb6ac;border-radius:12px;background:#fff;font:inherit;color:#1A1A1A}input:focus{outline:2px solid #FFCEE4;border-color:#1E1C19}button,.cta{border:0;border-radius:12px;background:#FFCEE4;color:#1A1A1A;font:inherit;font-weight:850;padding:15px 18px;width:100%;margin-top:18px;cursor:pointer;text-align:center;text-decoration:none;display:block}button:disabled{opacity:.5}.alert{background:#FFF8EB;border:1px solid #F2CF7A;border-radius:12px;padding:12px;margin-bottom:12px}.sizeGrid{display:grid;gap:10px}.size{background:#FAF8F5;border:1px solid #cbc4ba;text-align:left;margin:0;padding:16px}.size strong,.size small,.size span{display:block}.size strong{font-size:19px}.size small{font-size:13px;font-weight:500;color:#6b655d;margin:4px 0 10px}.size span{font-size:13px}.marketStats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:18px 0}.marketStats div{border:1px solid #ddd6cd;border-radius:12px;padding:14px}.marketStats strong,.marketStats span{display:block}.marketStats strong{font-size:25px}.marketStats span{font-size:12px;color:#6b655d}.previewList{border-top:1px solid #e2dcd3}.previewRow{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:13px 0;border-bottom:1px solid #e2dcd3}.previewRow strong,.previewRow small{display:block}.previewRow small{color:#6b655d;margin-top:2px}.previewRow>span{font-size:12px;font-weight:750;text-align:right}.check{display:flex;align-items:flex-start;gap:9px;font-weight:500}.check input{width:auto;margin-top:3px}.optional{font-weight:500;color:#6b655d}.resultHead{display:flex;justify-content:space-between;align-items:end;margin:20px 2px 12px}.linkBtn{width:auto;background:transparent;padding:4px;margin:0;text-decoration:underline}.results{display:grid;gap:12px}.resultCard{padding:18px}.resultCard.lj{border:2px solid #FFCEE4}.resultTop{display:flex;justify-content:space-between;gap:12px}.provider{font-size:18px;font-weight:850}.actual{font-size:13px;color:#6b655d;margin-top:3px}.badge{background:#FFCEE4;border-radius:999px;font-size:10px;font-weight:900;padding:7px 9px;height:max-content}.price{font-size:31px;font-weight:900;margin:17px 0 10px}.terms{display:flex;gap:8px;flex-wrap:wrap}.terms span{background:#EDEAE4;border-radius:999px;padding:7px 9px;font-size:12px}.details{background:transparent;border:1px solid #1E1C19}.verified{display:block;color:#6b655d;margin-top:11px}footer{text-align:center;color:#6b655d;font-size:12px;padding:0 20px 30px}@media(min-width:700px){.hero{padding-top:58px}.hero h1{font-size:44px}.sizeGrid{grid-template-columns:repeat(3,1fr)}.size{min-height:150px}.results{grid-template-columns:1fr 1fr}}
    `}</style>
  </>;
}
