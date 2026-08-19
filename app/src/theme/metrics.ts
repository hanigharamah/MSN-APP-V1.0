import { controlHeights, layout } from './extracted-tokens';

/**
 * Platform metrics that are behaviour rather than brand — they do not change
 * when the brand tokens are swapped, so they live outside `extracted-tokens.ts`.
 */

/**
 * Minimum interactive size. Apple's HIG says 44pt, Material says 48dp; 44 plus
 * `touchSlop` satisfies both. The web app already targets it —
 * `_layout.scss` sets `.btn { height: 44px }` — so this is not a new constraint.
 */
export const MIN_TOUCH_TARGET = controlHeights.button;

/**
 * Expands the touch area of a visually small control up to `MIN_TOUCH_TARGET`
 * without changing its layout footprint.
 *
 *   <Pressable hitSlop={touchSlop(24)} />   // a 24pt icon gets a 44pt target
 */
export function touchSlop(renderedSize: number): number {
  return Math.max(0, Math.ceil((MIN_TOUCH_TARGET - renderedSize) / 2));
}

/** Horizontal gutter for every screen. Keeps content aligned across tabs. */
export const SCREEN_GUTTER = layout.screenPadding;
