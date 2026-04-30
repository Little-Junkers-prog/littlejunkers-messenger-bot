// pages/_app.js
import { useEffect } from "react";
import Script from "next/script";

const GTM_ID = "GTM-KQRXVZ4F";
const LJ_HOMEPAGE = "https://www.littlejunkersllc.com";
const RENTAL_FUNNEL_PATH = "/rent-a-dumpster";
const EXIT_IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const SAFER_IDLE_TIMEOUT_MS = 12 * 60 * 1000;

function installRentalExitGuards() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__ljRentalExitGuardsInstalled) return;

  window.__ljRentalExitGuardsInstalled = true;
  window.__ljCheckoutStarted = false;

  const isRentalFunnel = () => window.location.pathname === RENTAL_FUNNEL_PATH;

  // Hotfix: tab switches / app switches should never count as abandonment.
  // The rent-a-dumpster page registers a visibilitychange listener that can open
  // the exit modal when a customer briefly leaves the tab and returns. Block that
  // listener on the rental funnel only.
  const originalDocumentAddEventListener = Document.prototype.addEventListener;
  Document.prototype.addEventListener = function patchedDocumentAddEventListener(type, listener, options) {
    if (this === document && type === "visibilitychange" && isRentalFunnel()) {
      return undefined;
    }
    return originalDocumentAddEventListener.call(this, type, listener, options);
  };

  // Hotfix: stretch the current 3-minute idle timer to 12 minutes without touching
  // unrelated timers. This preserves the recovery modal but makes it less aggressive.
  const originalSetTimeout = window.setTimeout.bind(window);
  window.setTimeout = function patchedSetTimeout(handler, timeout, ...args) {
    const delay = isRentalFunnel() && Number(timeout) === EXIT_IDLE_TIMEOUT_MS
      ? SAFER_IDLE_TIMEOUT_MS
      : timeout;
    return originalSetTimeout(handler, delay, ...args);
  };

  // Checkout/availability guardrails for the customer funnel.
  const originalFetch = window.fetch.bind(window);
  window.fetch = function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    let nextInput = input;

    if (isRentalFunnel() && String(url).includes("/api/create-checkout")) {
      window.__ljCheckoutStarted = true;
    }

    // Emergency fallback: the customer page currently points at /api/availability-v2,
    // which depends on the newer Supabase inventory snapshot. If that snapshot fails
    // or returns empty windows, checkout can stall. Route customer availability calls
    // to the older /api/availability endpoint for now; that endpoint already has a
    // permissive degraded fallback and keeps checkout moving.
    if (isRentalFunnel() && String(url).includes("/api/availability-v2")) {
      if (typeof input === "string") {
        nextInput = input.replace("/api/availability-v2", "/api/availability");
      } else if (input instanceof Request) {
        const nextUrl = input.url.replace("/api/availability-v2", "/api/availability");
        nextInput = new Request(nextUrl, input);
      }
    }

    return originalFetch(nextInput, init);
  };

  // Safety net: if an exit overlay slips through after checkout has started,
  // remove it from the DOM so it cannot block the redirect/resume path.
  const removeLateCheckoutExitModal = () => {
    if (!isRentalFunnel() || !window.__ljCheckoutStarted) return;
    const modalText = "Want us to text you this quote?";
    const candidates = Array.from(document.querySelectorAll("body > div"));
    for (const node of candidates) {
      if (node.textContent?.includes(modalText)) {
        node.remove();
      }
    }
  };

  const observer = new MutationObserver(removeLateCheckoutExitModal);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export default function App({ Component, pageProps }) {
  installRentalExitGuards();

  useEffect(() => {
    function handleExitModalDismiss(event) {
      if (window.location.pathname !== RENTAL_FUNNEL_PATH) return;
      if (!document.body?.innerText?.includes("Want us to text you this quote?")) return;

      const button = event.target?.closest?.("button");
      if (!button) return;

      const label = (button.getAttribute("aria-label") || "").trim().toLowerCase();
      const text = (button.textContent || "").trim().toLowerCase();
      const isDismissAction = label === "close" || text === "no thanks";

      if (!isDismissAction) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      window.location.href = LJ_HOMEPAGE;
    }

    document.addEventListener("click", handleExitModalDismiss, true);
    return () => document.removeEventListener("click", handleExitModalDismiss, true);
  }, []);

  return (
    <>
      <Script id="gtm-loader" strategy="afterInteractive">
        {`
          (function(w,d,s,l,i){
            w[l]=w[l]||[];
            w[l].push({'gtm.start': new Date().getTime(), event:'gtm.js'});
            var f=d.getElementsByTagName(s)[0],
                j=d.createElement(s),
                dl=l!='dataLayer'?'&l='+l:'';
            j.async=true;
            j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
            f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','${GTM_ID}');
        `}
      </Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: "none", visibility: "hidden" }}
        />
      </noscript>
      <Component {...pageProps} />
    </>
  );
}
