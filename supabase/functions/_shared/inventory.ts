// =============================================================================
// Ticket inventory
// =============================================================================
// `ticket_types.quantity_sold` has to move without a lost update, and the
// schema exposes no RPC to do it (there is no `increment_quantity_sold`
// function in 0003_catalog.sql). A read-modify-write would silently undercount
// under concurrency, so this does an optimistic compare-and-swap instead:
//
//     update ticket_types set quantity_sold = <old + n>
//     where id = <id> and quantity_sold = <old>
//
// If another request got there first the WHERE matches nothing, we re-read and
// try again. Bounded retries, no locks, no lost updates.
//
// See the README's "Schema gaps" section — a `select ... for update` RPC in a
// future migration would be strictly better than this.

import type { Admin } from "./supabase.ts";
import { ApiError, conflict } from "./errors.ts";

const MAX_ATTEMPTS = 6;

export interface SoldResult {
  applied: number;
  clamped: boolean;
  quantity: number | null;
  quantity_sold: number;
}

/**
 * Raises quantity_sold by `by`.
 *
 * `allowOversell` matters: at checkout time an oversell must block the sale,
 * but at fulfilment time the customer has already been charged, so refusing to
 * record the sale would be worse than recording it. In that case we clamp to
 * `quantity` (the `ticket_not_oversold` check constraint would reject anything
 * higher) and report it so the caller can alert the host.
 */
export async function increaseQuantitySold(
  admin: Admin,
  ticketTypeId: string,
  by: number,
  opts: { allowOversell?: boolean } = {},
): Promise<SoldResult> {
  if (by <= 0) {
    const { data } = await admin
      .from("ticket_types")
      .select("quantity, quantity_sold")
      .eq("id", ticketTypeId)
      .single();
    return { applied: 0, clamped: false, quantity: data?.quantity ?? null, quantity_sold: data?.quantity_sold ?? 0 };
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: current, error } = await admin
      .from("ticket_types")
      .select("id, name, quantity, quantity_sold")
      .eq("id", ticketTypeId)
      .single();
    if (error) throw error;

    const capacity = current.quantity as number | null;
    const sold = current.quantity_sold as number;
    let target = sold + by;
    let clamped = false;

    if (capacity !== null && target > capacity) {
      if (!opts.allowOversell) {
        throw conflict(
          "insufficient_inventory",
          `Only ${Math.max(0, capacity - sold)} of "${current.name}" remain, but ${by} were requested.`,
          "Re-read the ticket type, show the customer the true remaining count, and let them reduce the quantity.",
          { ticket_type_id: ticketTypeId, remaining: Math.max(0, capacity - sold), requested: by },
        );
      }
      target = capacity;
      clamped = true;
    }

    const { data: updated, error: updateError } = await admin
      .from("ticket_types")
      .update({ quantity_sold: target })
      .eq("id", ticketTypeId)
      .eq("quantity_sold", sold) // compare-and-swap
      .select("id, quantity, quantity_sold");
    if (updateError) throw updateError;

    if (updated && updated.length === 1) {
      return {
        applied: target - sold,
        clamped,
        quantity: updated[0].quantity as number | null,
        quantity_sold: updated[0].quantity_sold as number,
      };
    }
    // Lost the race — back off a touch and re-read.
    await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
  }

  throw new ApiError(
    503,
    "inventory_contention",
    `Could not update the sold count for ticket type ${ticketTypeId} after ${MAX_ATTEMPTS} attempts.`,
    "This ticket type is under heavy concurrent load. Retry the request. If it persists, add a database-side increment function so the update happens in one statement.",
  );
}

/** Mirror of the above, used when a paid order is reversed. */
export async function decreaseQuantitySold(
  admin: Admin,
  ticketTypeId: string,
  by: number,
): Promise<void> {
  if (by <= 0) return;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const { data: current, error } = await admin
      .from("ticket_types")
      .select("quantity_sold")
      .eq("id", ticketTypeId)
      .single();
    if (error) throw error;
    const sold = current.quantity_sold as number;
    const target = Math.max(0, sold - by);
    const { data: updated, error: updateError } = await admin
      .from("ticket_types")
      .update({ quantity_sold: target })
      .eq("id", ticketTypeId)
      .eq("quantity_sold", sold)
      .select("id");
    if (updateError) throw updateError;
    if (updated && updated.length === 1) return;
    await new Promise((r) => setTimeout(r, 25 * (attempt + 1)));
  }
  console.error(`decreaseQuantitySold gave up on ${ticketTypeId}`);
}
