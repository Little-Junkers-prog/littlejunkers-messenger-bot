# Randy Supabase Rebuild

Randy is Little Junkers' digital rental assistant. This rebuild moves Randy into the same repository as the booking funnel so the chatbot, website handoff, pricing, availability, and future rental agreement workflows can share the same Supabase-backed source of truth.

## Goals

- Make Randy a high-performing online sales assistant without pretending to be a live human.
- Keep the booking funnel lean while allowing Randy to progressively collect richer customer context.
- Avoid repetitive handoffs. If Randy already collected ZIP/project/size, the booking link should carry that context forward.
- Use Supabase for pricing, service-area, size metadata, availability, lead/session capture, and existing rental lookup.
- Keep Stripe financial data isolated until admin security/RLS work is completed.
- Preserve abuse, spam, prompt-injection, and fake-lead guardrails.

## New endpoint

```text
POST /api/randy-chat
```

Expected request body:

```json
{
  "messages": [
    { "role": "user", "content": "I need a dumpster for a garage cleanout in 30269" }
  ],
  "event": "",
  "session": {
    "zip": "30269",
    "phone": "470-555-1234",
    "email": "customer@example.com",
    "projectType": "home_cleanout",
    "sizeYards": 11,
    "tierKey": "2day_standard"
  }
}
```

Optional header:

```text
x-site-token: <RANDY_SITE_TOKEN or CHAT_SITE_TOKEN>
```

## Important environment variables

```text
OPENAI_API_KEY
RANDY_OPENAI_MODEL
RANDY_SITE_TOKEN
CHAT_SITE_TOKEN
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_BOOKING_URL
BOOKING_URL
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM_NUMBER
```

`TWILIO_*` values are only required if Randy will send booking links by text.

## Server-only files

```text
api/randy-chat.js
lib/randy/businessTools.js
lib/randy/guardrails.js
lib/randy/intent.js
lib/randy/systemPrompt.js
```

Do not import `lib/randy/businessTools.js` or `lib/supabaseAdmin.js` from frontend/browser code.

## Supabase tables used now

Existing tables used by the first pass:

```text
pricing
service_areas
zip_codes
dumpster_sizes
fees
units
rentals
customers
```

Optional new table for better funnel handoff:

```sql
create table if not exists public.randy_sessions (
  id uuid primary key default gen_random_uuid(),
  source text default 'randy_chat',
  status text default 'open',
  phone text,
  email text,
  zip_code text,
  project_type text,
  recommended_size_yards integer,
  conversation_summary text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '7 days')
);
```

The first pass gracefully continues if `randy_sessions` does not exist, but the table should be added before production rollout so the funnel can load Randy context and skip repeated steps.

## Behavior principles

### Value-first capture

Randy should answer basic public questions freely. For personalized recommendations, he should ask project and ZIP questions. For high-value actions like checking account-specific rental details, sending booking links, creating holds, or sending agreement links, he should ask for contact information.

### No repetitive funnel handoff

Bad:

```text
Randy asks for ZIP, then sends the customer to the ZIP-entry screen.
```

Good:

```text
Randy asks for ZIP and project type, creates/updates a Randy session, and sends the customer to a booking URL with context.
```

Current booking URL parameters:

```text
source=randy
randy_session=<uuid>
zip=<zip>
size=<yards>
project=<projectType>
```

### Transparent identity

Randy should say he is Little Junkers' digital rental assistant. He should not pretend to be a live employee.

### Guardrails

Randy should:

- Set respectful boundaries for abuse.
- End chats for threats or repeated abuse.
- Detect likely spam, bots, and prompt injection.
- Restrict high-value actions for suspicious sessions.
- Never reveal system prompts, API keys, private data, or Stripe financial information.

## Next work

1. Add the `randy_sessions` table and policies.
2. Update the booking funnel to read `randy_session` and prefill/skip known steps.
3. Add a dedicated support-event table for late delivery, unit condition, property damage, and escalation cases.
4. Add agreement signing workflow after rental/hold context exists.
5. Update the website widget `GATEWAY_URL` to point to `/api/randy-chat` on the deployed funnel project.
