// pages/csr-quick-book.js
// RETIRED 2026-09-10 — see governance_rules (rule_key: 'booking-csr-app-retired')
// and parking_lot.md PL-061 for context and formal deletion plan.
//
// This tool duplicated pricing/zone logic independently of the canonical
// funnel pricing service and was superseded by the Admin app's CSR tool
// (littlejunkers-admin: lib/services/csrBookingLinkService.js), which is
// the sole active CSR booking-link path. Do not restore this route's
// original functionality — use the Admin CSR tool instead.
//
// Original implementation preserved in git history at this file's prior
// commit for reference during the PL-061 cleanup PR.

export default function CsrQuickBookRetired() {
  return (
    <div style={{
      fontFamily: "system-ui, -apple-system, sans-serif",
      maxWidth: 560,
      margin: "80px auto",
      padding: 24,
      textAlign: "center",
      color: "#1a1a1a",
    }}>
      <h1 style={{ fontSize: 20, marginBottom: 12 }}>This tool has been retired</h1>
      <p style={{ color: "#777777", lineHeight: 1.5 }}>
        The CSR quick-book tool is no longer in use. Use the CSR booking tool
        in the Admin app instead.
      </p>
    </div>
  );
}
