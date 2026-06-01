// SOURCE: littlejunkers-messenger-bot/api/inventory-counts.js (extracted + hardened)
// Reads from admin_unit_inventory view — canonical source for unit status in admin app.
// DEBT NOTE: Sync with dumpster_units table changes in booking app.

import { supabase } from '../supabase'

export const READINESS_LABELS = {
  ready: 'Ready',
  deployed: 'On Rent',
  needs_emptying: 'Needs Emptying',
  maintenance: 'Maintenance',
  reserved: 'Reserved',
  needs_service: 'Needs Service',
  staging: 'Staging',
}

export const READINESS_COLORS = {
  ready: 'green',
  deployed: 'blue',
  needs_emptying: 'amber',
  maintenance: 'red',
  reserved: 'purple',
  needs_service: 'orange',
  staging: 'gray',
}

export async function getAllUnits() {
  // FIX: Explicit column list prevents legacy units.id from shadowing dumpster_units.id
  // The admin_unit_inventory view joins two tables both with an 'id' column.
  // select('*') returned units.id last, breaking updateUnitStatus which needs dumpster_units.id.
  const { data, error } = await supabase
    .from('admin_unit_inventory')
    .select(`
      id, unit_code, size_yards, size_code,
      lifecycle_status, readiness_status, notes, updated_at,
      display_name, current_rental_id, legacy_return_date,
      active_rental_id, active_customer_id,
      dropoff_date, scheduled_return, delivery_address,
      customer_name, customer_phone
    `)
    .order('size_yards', { ascending: true })

  if (error) throw error
  return data
}

export async function getInventoryCounts() {
  const units = await getAllUnits()

  const counts = {
    total: units.length,
    ready: units.filter(u => u.readiness_status === 'ready').length,
    deployed: units.filter(u => u.readiness_status === 'deployed').length,
    maintenance: units.filter(u => ['maintenance', 'needs_service'].includes(u.readiness_status)).length,
    bySize: {
      11: units.filter(u => u.size_yards === 11),
      16: units.filter(u => u.size_yards === 16),
      21: units.filter(u => u.size_yards === 21),
    }
  }

  return { units, counts }
}

export async function updateUnitStatus(unitId, readinessStatus, notes) {
  const { data, error } = await supabase
    .from('dumpster_units')
    .update({
      readiness_status: readinessStatus,
      ...(notes !== undefined && { notes }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', unitId)
    .select()
    .single()

  if (error) throw error
  return data
}
