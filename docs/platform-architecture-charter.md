# Little Junkers Platform Architecture Charter

**Status:** Active Architectural Standard  
**Version:** 1.0  
**Last Updated:** July 4, 2026  
**Applies To:** Little Junkers Customer Experience Platform and Operations Platform

---

## Purpose

This document defines the ownership boundaries between the two software platforms that make up the Little Junkers operating system.

Every feature, workflow, API endpoint, automation, customer communication, and database write must have a single business owner.

This charter exists to prevent duplicated functionality, conflicting business logic, broken customer workflows, and architectural drift as the Little Junkers platform continues to grow.

---

## Platform Overview

Little Junkers consists of two separate platform business units that share data but must not duplicate business logic.

```text
                    Customers
                        |
                        v
        Customer Experience Platform
              Booking Funnel
                        |
                        v
                  Supabase
             Shared System of Record
                        ^
                        |
          Operations Platform
               Admin OS
                        ^
                        |
                    Employees
```

Supabase stores information.

Supabase does not own business processes.

Supabase does not decide business behavior.

Business behavior belongs to the platform business unit that owns the process.

---

## Business Unit 1: Customer Experience Platform

The Customer Experience Platform is the customer-facing side of the business.

This platform owns everything a customer interacts with before, during, or after a rental.

### Customer Experience Platform owns

- Online booking
- CSR-generated booking links
- Prefilled booking links
- Pricing presentation
- Availability checks shown to customers
- Booking holds
- Customer information collection
- Quote requests
- Checkout
- Stripe payment collection
- Rental agreement signing
- Customer SMS notifications
- Customer email notifications
- Customer-facing rental timeline
- Delivery reminders
- Pickup reminders
- Customer self-service
- Review requests
- Any workflow requiring customer action

### Rule

If a customer clicks it, receives it, signs it, pays through it, replies to it, or is expected to interact with it, it belongs in the Customer Experience Platform.

---

## Business Unit 2: Operations Platform

The Operations Platform is the internal business operations side of the company.

This platform owns everything employees use to operate, monitor, manage, and improve the business.

### Operations Platform owns

- Mission Control
- Rental Board
- Dispatch workflows
- Driver and internal operations workflows
- Customer Command Center
- Customer support tools
- CSR workspace
- Fleet management
- Asset management
- Pricing management interfaces
- Financial dashboards
- Business reporting
- Internal monitoring
- Analytics
- Operational alerts
- Management workflows

### Rule

If an employee uses it to run, monitor, maintain, or manage Little Junkers, it belongs in the Operations Platform.

---

## Core Architectural Rules

### Rule 1: Every business process has one owner

Each business process must have exactly one authoritative platform owner.

There should not be two independent workflows creating the same business outcome.

### Rule 2: Business logic is not duplicated

The same business logic should not be recreated in both platforms.

This includes, but is not limited to:

- Booking creation
- Pricing calculation
- Availability calculation
- Booking holds
- Checkout
- Payment collection
- Rental agreement generation
- Customer communication sequencing
- Review request sequencing

### Rule 3: Admin OS is never customer-facing

The Admin OS may support employees who help customers, but customers should not be routed into Admin OS screens, Admin OS URLs, Admin OS checkout paths, or Admin OS-only workflows.

### Rule 4: Booking Funnel is not an employee operations system

The Customer Experience Platform may collect data needed by operations, but it should not become the internal dispatch board, management dashboard, reporting center, or employee operations workspace.

### Rule 5: Admin may initiate customer workflows, but customer action flows through the Customer Experience Platform

The Operations Platform may trigger or prepare customer workflows.

Examples:

- Generate a booking link
- Prefill known customer information
- Trigger a rental agreement resend
- Trigger a customer reminder
- Trigger a review request

However, the customer-facing action must execute through the Customer Experience Platform.

### Rule 6: Supabase is the shared system of record, not the business owner

Supabase stores the outcome of business processes.

Supabase should not be forced to resolve conflicts caused by two platforms writing duplicate or competing versions of the same workflow.

Every write path into Supabase should have a known owner.

---

## Ownership Examples

### Booking creation

**Owner:** Customer Experience Platform

Admin OS may:

- Capture partial customer context
- Generate a prefilled booking link
- Send a booking invitation by SMS or email
- View the resulting rental after completion

Admin OS may not:

- Create a duplicate customer-facing booking engine
- Duplicate checkout
- Duplicate booking holds
- Duplicate customer-facing availability logic
- Send customers to Admin OS URLs

---

### CSR booking links

**Owner:** Shared workflow with clear boundaries

Admin OS owns:

- CSR data capture
- Internal link generation action
- Internal recordkeeping that a link was sent

Customer Experience Platform owns:

- The customer-facing booking page
- Prefilled form behavior
- Pricing presentation
- Availability
- Booking holds
- Checkout
- Rental creation after completed checkout

### Required pattern

CSR sends a link to the production booking funnel with prefilled context.

CSR does not create a parallel booking path inside Admin OS.

---

### Payments

**Owner:** Customer Experience Platform

Admin OS may:

- View payment status
- Reconcile payments
- Report on payments
- Support refunds if implemented through the correct payment owner

Admin OS may not:

- Recreate payment collection logic
- Create alternate checkout flows

---

### Rental agreements

**Owner:** Customer Experience Platform

Admin OS may:

- View agreement status
- View signed agreement links
- Resend agreement requests
- Verify whether an agreement is on file

Admin OS may not:

- Create an alternate signing workflow that competes with the Customer Experience Platform

---

### Customer communications

**Owner:** Customer Experience Platform

Admin OS may:

- Trigger an approved communication
- View communication history
- Surface communication status to CSR or management users

Customer-facing SMS and email sequences should originate from the Customer Experience Platform.

---

## Feature Review Checklist

Before implementation, every feature must answer these questions:

1. Which platform business unit owns this process?
2. Does this duplicate business logic that already exists elsewhere?
3. Does this require customer action?
4. If customer action is required, does the action flow through the Customer Experience Platform?
5. Is employee-only work staying inside the Operations Platform?
6. Is Supabase being used as the shared system of record rather than as a conflict resolver between duplicate workflows?
7. Is this legacy fallback functionality, and if so, is it clearly marked as temporary or deprecated?

If ownership is unclear, implementation should pause until the correct owner is identified.

---

## Deprecated and Transitional Functionality

Some existing functionality may violate this charter because it was built before the ownership boundary was formalized.

Those features may remain temporarily for operational continuity, especially if they are still needed as fallback tools.

However:

- They should be marked as deprecated or transitional.
- They should not receive new feature expansion.
- They should be audited and triaged.
- They should be migrated or retired in future architecture cleanup sprints.

---

## Audit Requirement

Both repositories should maintain visibility into ownership drift.

A platform ownership audit should identify:

- What currently lives in each repo
- Which platform should own it
- Whether the current location is correct
- Whether the implementation duplicates business logic
- Whether it creates operational risk
- Whether it should be fixed now, deprecated, migrated, or parked for a future sprint

Recommended audit artifact:

```text
docs/platform-ownership-audit.md
```

---

## Success Criteria

The target architecture is:

```text
One Customer Experience Platform
+
One Operations Platform
+
One Shared System of Record
=
One coordinated business
```

The two platforms may see each other through shared data.

They should not become each other.

They should not compete with each other.

They should not create duplicate sources of business behavior.
