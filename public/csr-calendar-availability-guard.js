(() => {
  if (typeof window === "undefined") return;
  if (window.__ljCsrCalendarGuardLoaded) return;
  window.__ljCsrCalendarGuardLoaded = true;

  const CSR_PATH = "/csr-quick-book";
  const SIZE_LABELS = ["11 Yard", "16 Yard", "21 Yard"];
  const cache = new Map();
  let inflight = null;
  let observer = null;
  let lastSize = "";
  let lastApply = 0;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);
    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      if (url.includes("/api/complete-manual-booking")) {
        const clone = response.clone();
        const json = await clone.json();
        if (json && json.success && json.rental && !json.booking) {
          const headers = new Headers(response.headers);
          headers.set("Content-Type", "application/json");
          return new Response(JSON.stringify({ ...json, booking: json.rental }), {
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        }
      }
    } catch (_) {
      // Leave the original response untouched if it is not JSON or cannot be cloned.
    }
    return response;
  };

  function isCsrPage() {
    return window.location.pathname.replace(/\/$/, "") === CSR_PATH;
  }

  function text(el) {
    return (el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function getSelectedSize() {
    const buttons = Array.from(document.querySelectorAll("button"));
    const selectedButton = buttons.find((button) => /selected/i.test(text(button)) && /(?:11|16|21)\s*yard/i.test(text(button)));
    const selectedText = text(selectedButton);
    const selectedMatch = selectedText.match(/(11|16|21)\s*yard/i);
    if (selectedMatch) return `${selectedMatch[1]} Yard`;

    const summaryCandidates = Array.from(document.querySelectorAll("div,span"));
    const summaryText = summaryCandidates.map(text).join(" | ");
    const summaryMatch = summaryText.match(/Size\s*\|?\s*(11|16|21)\s*Yard/i);
    if (summaryMatch) return `${summaryMatch[1]} Yard`;

    return "16 Yard";
  }

  function getVisibleMonth() {
    const labels = Array.from(document.querySelectorAll("div,span"))
      .map((el) => text(el))
      .filter((value) => /^[A-Za-z]+\s+\d{4}$/.test(value));
    const label = labels[0];
    if (!label) return null;
    const parsed = new Date(`${label} 1, 12:00:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return { year: parsed.getFullYear(), month: parsed.getMonth(), label };
  }

  function dateStr(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  async function loadAvailability(size) {
    const cached = cache.get(size);
    if (cached && Date.now() - cached.loadedAt < 30000) return cached;

    const response = await originalFetch("/api/availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ size }),
    });
    const json = await response.json();
    if (!response.ok || !json || !Array.isArray(json.blockedDates)) {
      throw new Error(json?.error || "Availability unavailable");
    }
    const entry = {
      blockedDates: new Set(json.blockedDates),
      loadedAt: Date.now(),
      size,
    };
    cache.set(size, entry);
    return entry;
  }

  function markButton(button, blocked, reason) {
    if (blocked) {
      button.disabled = true;
      button.dataset.ljCsrBlocked = "1";
      button.title = reason || "Unavailable";
      button.style.opacity = "0.28";
      button.style.cursor = "not-allowed";
      button.style.textDecoration = "line-through";
      button.style.pointerEvents = "none";
      return;
    }

    if (button.dataset.ljCsrBlocked === "1") {
      delete button.dataset.ljCsrBlocked;
      button.disabled = false;
      button.title = "";
      button.style.opacity = "";
      button.style.cursor = "";
      button.style.textDecoration = "";
      button.style.pointerEvents = "";
    }
  }

  function dateButtons() {
    return Array.from(document.querySelectorAll("button"))
      .filter((button) => /^\d{1,2}$/.test(text(button)))
      .filter((button) => Number(text(button)) >= 1 && Number(text(button)) <= 31);
  }

  function renderStatus(message, tone = "info") {
    const calendarHeading = Array.from(document.querySelectorAll("div"))
      .find((el) => text(el) === "Select rental type and date");
    if (!calendarHeading) return;
    const card = calendarHeading.closest("div[style]");
    if (!card) return;

    let banner = document.getElementById("lj-csr-availability-guard-status");
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "lj-csr-availability-guard-status";
      calendarHeading.insertAdjacentElement("afterend", banner);
    }

    banner.textContent = message;
    banner.style.margin = "0 0 10px";
    banner.style.padding = "10px 12px";
    banner.style.borderRadius = "12px";
    banner.style.fontSize = "12px";
    banner.style.fontWeight = "700";
    if (tone === "error") {
      banner.style.background = "#fff1f1";
      banner.style.border = "1px solid #fca5a5";
      banner.style.color = "#b91c1c";
    } else {
      banner.style.background = "#eff9f1";
      banner.style.border = "1px solid #bde3c4";
      banner.style.color = "#1d6a34";
    }
  }

  function clearOldDegradedBanner() {
    Array.from(document.querySelectorAll("span,div"))
      .filter((el) => /all dates shown as open/i.test(text(el)))
      .forEach((el) => {
        const box = el.closest("div");
        if (box) box.style.display = "none";
      });
  }

  async function applyAvailability() {
    if (!isCsrPage()) return;
    const now = Date.now();
    if (now - lastApply < 200) return;
    lastApply = now;

    const month = getVisibleMonth();
    const buttons = dateButtons();
    if (!month || buttons.length === 0) return;

    const size = getSelectedSize();
    if (size !== lastSize) {
      lastSize = size;
      buttons.forEach((button) => {
        if (button.dataset.ljCsrBlocked === "1") markButton(button, false);
      });
    }

    try {
      if (!inflight) inflight = loadAvailability(size);
      const availability = await inflight;
      inflight = null;
      clearOldDegradedBanner();
      renderStatus(`Live availability active for ${size}. Fully committed dates are locked.`, "info");

      dateButtons().forEach((button) => {
        const day = Number(text(button));
        const key = dateStr(month.year, month.month, day);
        markButton(button, availability.blockedDates.has(key), "Unavailable: capacity is already committed");
      });
    } catch (error) {
      inflight = null;
      renderStatus("Live availability is unavailable. Calendar dates are locked until the service responds.", "error");
      dateButtons().forEach((button) => markButton(button, true, "Availability unavailable"));
    }
  }

  function scheduleApply() {
    if (!isCsrPage()) return;
    window.setTimeout(applyAvailability, 250);
  }

  function start() {
    if (!isCsrPage()) return;
    scheduleApply();
    document.addEventListener("click", (event) => {
      const label = text(event.target);
      if (SIZE_LABELS.some((size) => label.includes(size)) || label === "‹" || label === "›" || /Check ZIP/i.test(label)) {
        cache.clear();
        scheduleApply();
      }
    }, true);

    observer = new MutationObserver(scheduleApply);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
