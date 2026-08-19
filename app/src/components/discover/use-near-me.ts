import { useMutation } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useCallback, useState } from 'react';

/** 20 miles, the radius the filter offers, in the kilometres the API takes. */
export const NEAR_ME_RADIUS_KM = 32;

export type NearMeStatus = 'off' | 'asking' | 'on' | 'denied' | 'unavailable';

export interface NearMe {
  status: NearMeStatus;
  coords: { latitude: number; longitude: number } | null;
  enable: () => void;
  disable: () => void;
}

/**
 * The seeker's location, for the "near me" filter.
 *
 * ## Asked for late, and only once it buys something
 *
 * Nothing requests location at launch. The prompt appears when somebody turns
 * the filter on, which is the one moment the reason for it is self-evident —
 * Apple's HIG asks for exactly this, and a permission sheet on first open is
 * the fastest way to a permanent no.
 *
 * ## A refusal is a state, not an error
 *
 * `denied` renders as an explanation next to the control rather than an alert.
 * The rest of Discover works without it, so a refusal costs the seeker one
 * filter, not the screen.
 *
 * ## Why a mutation and not an effect
 *
 * `useMutation` rather than an async effect with `setState` in it: the React
 * Compiler is on for this app and `react-hooks/purity` rejects the effect
 * form. The mutation also gives the in-flight state the button needs for free.
 */
export function useNearMe(): NearMe {
  const [status, setStatus] = useState<NearMeStatus>('off');
  const [coords, setCoords] = useState<NearMe['coords']>(null);

  const ask = useMutation({
    mutationFn: async () => {
      const services = await Location.hasServicesEnabledAsync();
      if (!services) return { outcome: 'unavailable' as const };

      const { status: permission } = await Location.requestForegroundPermissionsAsync();
      if (permission !== 'granted') return { outcome: 'denied' as const };

      // `Balanced` rather than `High`: this filter is a 20-mile circle, so
      // street-level precision would cost battery and a GPS fix to answer a
      // question a cell-tower estimate already answers.
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      return {
        outcome: 'on' as const,
        coords: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        },
      };
    },
    onMutate: () => setStatus('asking'),
    onSuccess: (result) => {
      setStatus(result.outcome);
      setCoords(result.outcome === 'on' ? result.coords : null);
    },
    // A failed fix is not a refusal — the seeker may simply be indoors — so it
    // lands on `unavailable`, which offers a retry rather than sending them to
    // Settings to change a permission they already granted.
    onError: () => {
      setStatus('unavailable');
      setCoords(null);
    },
  });

  const enable = useCallback(() => ask.mutate(), [ask]);

  const disable = useCallback(() => {
    setStatus('off');
    setCoords(null);
  }, []);

  return { status, coords, enable, disable };
}
