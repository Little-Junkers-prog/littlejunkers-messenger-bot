import { useEffect, useMemo, useState } from "react";
import Funnel from "./rent-a-dumpster";

function getSearchParam(name) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) || "";
}

function normalizeSize(value) {
  const yards = String(value || "").match(/\d+/)?.[0];
  if (!["11", "16", "21"].includes(yards)) return "";
  return `${yards} Yard`;
}

function visibleButtons() {
  return Array.from(document.querySelectorAll("button"));
}

function clickButtonByText(pattern) {
  const button = visibleButtons().find((btn) => pattern.test((btn.textContent || "").trim()));
  if (!button) return false;
  button.click();
  return true;
}

function RandyAutoAdvance() {
  const [status, setStatus] = useState("Preparing your Randy booking handoff…");

  const handoff = useMemo(() => {
    const source = getSearchParam("source");
    const sizeLabel = normalizeSize(getSearchParam("size"));
    const zip = getSearchParam("zip");
    const sessionId = getSearchParam("randy_session");
    return {
      enabled: source === "randy" && Boolean(sizeLabel) && /^\d{5}$/.test(zip || ""),
      source,
      sizeLabel,
      zip,
      sessionId,
    };
  }, []);

  useEffect(() => {
    if (!handoff.enabled) return undefined;

    let cancelled = false;
    let attempts = 0;

    const timer = setInterval(() => {
      if (cancelled) return;
      attempts += 1;

      const bodyText = document.body?.innerText || "";

      if (/How do you want to proceed\?/i.test(bodyText)) {
        setStatus("Randy already picked your size — skipping the extra sizing question…");
        clickButtonByText(/^Quick Select/i);
        return;
      }

      if (/Choose your rental size/i.test(bodyText)) {
        setStatus(`Selecting the ${handoff.sizeLabel} Randy recommended…`);
        clickButtonByText(new RegExp(`^${handoff.sizeLabel.replace(" ", "\\\\s+")}`, "i"));
        return;
      }

      if (/When do you want your dumpster\?/i.test(bodyText) || /Checking availability/i.test(bodyText)) {
        setStatus("Ready — choose the delivery window that works best for you.");
        clearInterval(timer);
        return;
      }

      if (attempts > 60) {
        setStatus("Randy passed your details in. Please choose the matching size to continue.");
        clearInterval(timer);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [handoff]);

  if (!handoff.enabled) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        bottom: 16,
        transform: "translateX(-50%)",
        zIndex: 2000,
        maxWidth: 520,
        width: "calc(100% - 32px)",
        background: "#1a1a1a",
        color: "#ffffff",
        borderRadius: 14,
        padding: "12px 16px",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 13,
        fontWeight: 700,
        boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
        textAlign: "center",
      }}
    >
      {status}
    </div>
  );
}

export default function RandyBookingPage() {
  return (
    <>
      <Funnel />
      <RandyAutoAdvance />
    </>
  );
}
