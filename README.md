# Little Junkers Admin

Private internal operations app for Little Junkers LLC. Mobile-first responsive web app for rental management, fleet tracking, customer records, charge capture, and financial KPIs.

**Not indexed. Not public. Access requires PIN.**

---

## Stack

- **Framework**: Next.js 14 (Pages Router)
- **Database**: Supabase (project: `lj-booking-prod`)
- **Hosting**: Vercel (`admin.littlejunkersllc.com`)
- **Auth**: Shared PIN (env var `ADMIN_PASSCODE`)

---

## Sprint Status

| Sprint | Scope | Status |
|--------|-------|--------|
| 0 | Repo scaffold, auth, shell, service layer | ✅ Done |
| 1 | Manual booking (new rental form) | 🔨 Next |
| 2 | Expenses tracking, margin KPIs | Planned |
| 3 | Pricing/settings editor | Planned |

---

## Local Setup

```bash
# 1. Clone
git clone https://github.com/Little-Junkers-prog/littlejunkers-admin.git
cd littlejunkers-admin

# 2. Install
npm install

# 3. Environment
cp .env.example .env.local
# Fill in .env.local with real values (see Vercel project for values)

# 4. Run
npm run dev
# Opens at http://localhost:3000
```

---

## Environment Variables

| Variable | Where to find it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API (secret) |
| `ADMIN_PASSCODE` | You set this — 6-digit PIN, stored in Vercel env vars |

---

## Vercel Deployment

1. Connect this repo to Vercel project under `marcus-projects-e11d4e96`
2. Add all env vars in Vercel → Project → Settings → Environment Variables
3. Add custom domain: `admin.littlejunkersllc.com`
4. In your DNS (wherever `littlejunkersllc.com` is managed), add a CNAME record:
   - **Name**: `admin`
   - **Value**: `cname.vercel-dns.com`

---

## Architecture Notes

### Canonical data sources
- **Units/Fleet**: `dumpster_units` table → `admin_unit_inventory` view
- **Rentals**: `rentals` table joined with `customers`
- **Pricing**: `pricing` table (no hardcoded prices anywhere in this repo)
- **Service areas / ZIP codes**: `service_areas` + `zip_codes` tables

### Known technical debt
- `lib/services/` files marked `SOURCE: littlejunkers-messenger-bot` are copied from the booking app. If availability or pricing logic changes in that repo, sync here. Future: extract to shared npm package.
- `units` table (legacy) is deprecated. Do not write new records. See `dumpster_units`.
- `rentals.unit_id` FK still points to legacy `units` table. `rentals.dumpster_unit_id` is canonical. See migration `resolve_unit_table_conflict`.

### Revenue data integrity note
- 5 returned rentals have `amount_paid` on `rentals` but no record in `payments` table (Stripe webhook bug in booking app — pre-existing). Revenue KPI reads from `rentals.amount_paid` which is correct. Payments table reconciliation is a booking app backlog item.

---

## Screens

| Route | Screen |
|-------|--------|
| `/login` | PIN entry |
| `/` | Dashboard / KPIs |
| `/rentals` | Rental board (tabs: On Rent, Today, Upcoming, Attention, Done) |
| `/rentals/new` | New manual rental (Sprint 1) |
| `/rentals/[id]` | Rental detail + actions |
| `/inventory` | Fleet status — all 7 units |
| `/customers` | Customer search + open balances |
| `/customers/[id]` | Customer detail + history |
| `/charges` | Open charges list |
| `/charges/new` | Add charge |
| `/expenses` | Expense log + MTD summary |
| `/expenses/new` | Log expense |
