import { getSupabaseAdmin } from "../lib/supabaseAdmin";

function requiredString(value, name) {
  const result = String(value || "").trim();
  if (!result) throw new Error(name + " is required");
  return result;
}

function positiveAmount(value, name) {
  const result = Number(value);
  if (!Number.isFinite(result) || result <= 0) throw new Error(name + " must be greater than zero");
  return Math.round(result * 100) / 100;
}

function dateOnly(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

async function findTransactionByStripeId(supabase, column, value) {
  const { data, error } = await supabase.from("financial_transactions").select("id, total_amount, type, stripe_payment_id, stripe_balance_transaction_id").eq(column, value).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function insertTransactionWithAllocation(supabase, { transaction, allocation }) {
  const { data: created, error: transactionError } = await supabase.from("financial_transactions").insert(transaction).select("id, total_amount, type, stripe_payment_id, stripe_balance_transaction_id").single();
  if (transactionError) throw transactionError;
  const { data: createdAllocation, error: allocationError } = await supabase.from("financial_transaction_allocations").insert({ transaction_id: created.id, allocated_amount: allocation.allocated_amount, rental_id: allocation.rental_id, customer_id: allocation.customer_id, dumpster_unit_id: null, expense_category: allocation.expense_category }).select("*").single();
  if (allocationError) throw allocationError;
  return { transaction: created, allocation: createdAllocation };
}

/**
 * Amounts are major currency units, not Stripe cents.
 * payment.stripePaymentId is the Stripe PaymentIntent ID.
 */
export async function recordStripeRevenueLedgerEntry(payment, rental, balanceTransactionFee = null) {
  const supabase = getSupabaseAdmin();
  const stripePaymentId = requiredString(payment?.stripePaymentId || payment?.payment_intent || payment?.id, "Stripe payment ID");
  const rentalId = requiredString(rental?.id, "Rental ID");
  const customerId = requiredString(rental?.customer_id || payment?.customerId, "Customer ID");
  const grossAmount = positiveAmount(payment?.amount ?? payment?.amountPaid, "Gross payment amount");
  const existingRevenue = await findTransactionByStripeId(supabase, "stripe_payment_id", stripePaymentId);
  let revenue;
  if (existingRevenue) {
    revenue = { transaction: existingRevenue, allocation: null };
  } else {
    revenue = await insertTransactionWithAllocation(supabase, {
    transaction: { transaction_date: dateOnly(payment?.paidAt || payment?.created), type: "revenue", total_amount: grossAmount, vendor_or_customer_name: payment?.customerName || null, stripe_payment_id: stripePaymentId },
    allocation: { allocated_amount: grossAmount, rental_id: rentalId, customer_id: customerId, expense_category: "rental_revenue" },
    }).catch(async (error) => {
      if (error?.code !== "23505") throw error;
      const racedRevenue = await findTransactionByStripeId(supabase, "stripe_payment_id", stripePaymentId);
      if (racedRevenue) return { transaction: racedRevenue, allocation: null };
      throw error;
    });
  }
  let feeResult = null;
  const feeAmount = Number(balanceTransactionFee?.fee);
  const balanceTransactionId = String(balanceTransactionFee?.id || balanceTransactionFee?.balance_transaction || "").trim();
  if (Number.isFinite(feeAmount) && feeAmount > 0 && balanceTransactionId) {
    const existingFee = await findTransactionByStripeId(supabase, "stripe_balance_transaction_id", balanceTransactionId);
    if (existingFee) feeResult = { transaction: existingFee, alreadyRecorded: true };
    else {
      feeResult = await insertTransactionWithAllocation(supabase, {
        transaction: { transaction_date: dateOnly(balanceTransactionFee.created ? Number(balanceTransactionFee.created) * 1000 : payment?.paidAt || payment?.created), type: "expense", total_amount: positiveAmount(feeAmount, "Stripe processing fee"), vendor_or_customer_name: "Stripe", stripe_balance_transaction_id: balanceTransactionId },
        allocation: { allocated_amount: positiveAmount(feeAmount, "Stripe processing fee"), rental_id: rentalId, customer_id: customerId, expense_category: "payment_fee" },
      });
      feeResult.alreadyRecorded = false;
    }
  }
  return { revenueTransaction: revenue.transaction, revenueAllocation: revenue.allocation, revenueAlreadyRecorded: Boolean(existingRevenue), feeTransaction: feeResult?.transaction || null, feeAllocation: feeResult?.allocation || null, feeAlreadyRecorded: Boolean(feeResult?.alreadyRecorded) };
}