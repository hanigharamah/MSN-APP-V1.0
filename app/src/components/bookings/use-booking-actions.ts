import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import {
  cancelBooking,
  confirmBooking,
  declineBooking,
  markBookingCompleted,
  markBookingNoShow,
} from '@/lib/queries/bookings';
import { requestRefund, type RequestRefundResponse } from '@/lib/queries/functions';
import { qk } from '@/lib/queries/keys';
import { startDirectConversation } from '@/lib/queries/messages';
import type { Booking } from '@/types/database';

/**
 * The writes the booking screens can perform, in one place.
 *
 * Every one of them invalidates `qk.bookings.all`, which by the prefix rule in
 * `keys.ts` clears the detail *and* both list windows — a booking the provider
 * just declined must not still be sitting in "Upcoming" behind the back button.
 *
 * None of them retry. `query-client.ts` disables mutation retries globally for
 * exactly this shape of call: a retried "confirm" is harmless, but a retried
 * "cancel" that actually succeeded the first time races the refetch, and a
 * retried refund request opens two.
 */

type BookingMutation = UseMutationResult<Booking, Error, void>;

export interface BookingActions {
  confirm: BookingMutation;
  decline: BookingMutation;
  cancel: BookingMutation;
  complete: BookingMutation;
  noShow: BookingMutation;
  refund: UseMutationResult<RequestRefundResponse, Error, string>;
  /** True while any of them is in flight — for disabling the whole action group. */
  isBusy: boolean;
}

export function useBookingActions(
  bookingId: string,
  viewerRole: 'seeker' | 'provider',
): BookingActions {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.bookings.all });
  }, [queryClient]);

  const confirm = useMutation({
    mutationFn: () => confirmBooking(bookingId),
    onSuccess: invalidate,
  });

  const decline = useMutation({
    mutationFn: () => declineBooking(bookingId),
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: () => cancelBooking(bookingId, viewerRole),
    onSuccess: invalidate,
  });

  const complete = useMutation({
    mutationFn: () => markBookingCompleted(bookingId),
    onSuccess: invalidate,
  });

  const noShow = useMutation({
    mutationFn: () => markBookingNoShow(bookingId),
    onSuccess: invalidate,
  });

  const refund = useMutation({
    // Goes through the `request-refund` Edge Function rather than
    // `createRefundRequest`, because the function is the thing that knows the
    // policy clocks it reports back and rejects store rails outright. Callers
    // must still check `refundRouteFor` first — a 409 here creates nothing, and
    // showing the customer a failed request is worse than telling them upfront
    // that Apple owns the refund.
    mutationFn: (reason: string) => requestRefund({ bookingId, reason }),
    onSuccess: () => {
      invalidate();
      void queryClient.invalidateQueries({ queryKey: qk.refunds.all });
    },
  });

  return {
    confirm,
    decline,
    cancel,
    complete,
    noShow,
    refund,
    isBusy:
      confirm.isPending ||
      decline.isPending ||
      cancel.isPending ||
      complete.isPending ||
      noShow.isPending ||
      refund.isPending,
  };
}

/**
 * Opens the thread for a booking, creating it only if there is not one already.
 *
 * All of it — the block check, the reuse lookup and the creation — happens in
 * `start_direct_conversation` (migrations 0029/0030), in one atomic call. The
 * client version could not work: the participants policy only ever allowed
 * inserting your OWN row, so the second insert was refused and "Message" failed
 * for everybody.
 *
 * Reuse order is preserved in SQL: a thread already tied to this booking wins,
 * then any direct thread with the same person, because messaging someone you
 * are already talking to should continue that conversation rather than open a
 * parallel one.
 */
export function useOpenBookingConversation(
  booking: Pick<Booking, 'id' | 'seeker_id' | 'provider_id'>,
  viewerId: string,
): UseMutationResult<string, Error, void> {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (): Promise<string> => {
      const otherId = viewerId === booking.seeker_id ? booking.provider_id : booking.seeker_id;
      return startDirectConversation(otherId, booking.id);
    },
    onSuccess: (conversationId) => {
      void queryClient.invalidateQueries({ queryKey: qk.conversations.all });
      router.push({ pathname: '/conversation/[id]', params: { id: conversationId } });
    },
  });
}
