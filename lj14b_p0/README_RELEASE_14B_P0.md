# Little Junkers Release 14B-P0

## Scope
Production booking-link recovery for the customer-facing funnel repo.

This release keeps the ownership boundary intact:

- Admin OS creates the booking hold and sends the customer to book.littlejunkersllc.com.
- The book.littlejunkersllc.com funnel owns customer-facing confirmation, detail completion, Stripe checkout, and customer flow.

## Changed file

Replace this file in the funnel repo:

```text
littlejunkers-messenger-bot/api/update-booking-hold.js
```

## Root cause addressed

The funnel already had `/api/get-booking-hold` reading `booking_holds`, but `/api/update-booking-hold` still only looked in the legacy `rentals` table. A CSR-generated hold exists in `booking_holds`, not `rentals`, so the customer could load a handoff but then fail at confirmation with `Booking hold not found`.

## What this patch does

- Updates canonical `booking_holds` first.
- Keeps the old `rentals` fallback for legacy links.
- Saves customer-confirmed contact information into top-level hold columns.
- Saves a clean flattened delivery address into `metadata.deliveryAddress`.
- Preserves structured address detail in `metadata.deliveryAddressObject`.
- Adds `metadata.handoffStage` values:
  - `start_funnel`
  - `complete_missing_details`
  - `confirm_and_pay`
- Logs a non-blocking `booking_hold_updated` event when possible.
- Keeps checkout in the funnel repo; no checkout logic is added to Admin.

## Deploy checklist

1. Upload/replace `api/update-booking-hold.js` in `Little-Junkers-prog/littlejunkers-messenger-bot`.
2. Commit to `main`.
3. Let Vercel deploy the funnel project.
4. Confirm `book.littlejunkersllc.com` points to the production deployment and does not require Vercel access.
5. Generate a CSR booking link from Admin.
6. Open the link in an incognito/private browser.
7. Confirm customer details can be saved and Stripe checkout starts.

## Acceptance test

A CSR-generated booking link should:

1. Open at `book.littlejunkersllc.com`.
2. Load the booking hold from `booking_holds`.
3. Let the customer confirm or complete details.
4. Save customer-confirmed details back to the same hold.
5. Continue to Stripe checkout.
6. Keep Admin out of the customer-facing checkout flow.
