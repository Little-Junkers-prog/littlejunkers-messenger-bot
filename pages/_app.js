// pages/_app.js
import { useEffect } from "react";
import Script from "next/script";

const GTM_ID = "GTM-KQRXVZ4F";
const LJ_HOMEPAGE = "https://www.littlejunkersllc.com";

export default function App({ Component, pageProps }) {
  useEffect(() => {
    function handleExitModalDismiss(event) {
      if (window.location.pathname !== "/rent-a-dumpster") return;
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

  useEffect(() => {
    function patchElevenYardFourDayDisplay() {
      if (window.location.pathname !== "/rent-a-dumpster") return;
      if (!document.body?.innerText?.includes("11 Yard")) return;

      const priceNodes = Array.from(document.querySelectorAll("body *")).filter((node) => {
        return node.children.length === 0 && node.textContent?.trim() === "$285";
      });

      for (const node of priceNodes) {
        const card = node.closest("button, div");
        const nearbyText = card?.innerText || node.parentElement?.innerText || "";
        if (nearbyText.includes("WEEKEND OPTION") || nearbyText.includes("4-Day Rental") || nearbyText.includes("4-day rental")) {
          node.textContent = "$335";
        }
      }
    }

    patchElevenYardFourDayDisplay();
    const observer = new MutationObserver(patchElevenYardFourDayDisplay);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
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
