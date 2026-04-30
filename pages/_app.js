// pages/_app.js
import { useEffect } from "react";
import Script from "next/script";

const GTM_ID = "GTM-KQRXVZ4F";
const LJ_HOMEPAGE = "https://www.littlejunkersllc.com";
const RENTAL_FUNNEL_PATH = "/rent-a-dumpster";

export default function App({ Component, pageProps }) {
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
