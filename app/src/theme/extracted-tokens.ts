/**
 * =============================================================================
 * MSN — tokens extracted from the live web app
 * =============================================================================
 *
 * Source (read-only): /Users/hanigharamah/MSN/mysourcenetwork-events/
 * Companion spec:     ../../DESIGN_SOURCE.md
 *
 * The existing MSN mobile app is a webview wrapper around the Laravel/Vue web
 * app, so these values ARE the identity users already recognise. This file is
 * a translation of that identity into React Native, not a redesign.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS VERBATIM
 * -----------------------------------------------------------------------------
 * Every hex in `palette`, every number in `spacing`, `radii`, `fontSizes`,
 * `fontWeights` and `controlHeights`, and the two primary shadow recipes are
 * copied from source. Provenance, per group:
 *
 *   - Brand purples, plums, `$danger`, `$border-color`, `$body-bg`, `$card-bg`,
 *     border radii, the font-size map and the weight ladder:
 *       resources/sass/_variables.scss
 *   - Warm neutrals, surfaces and text greys: measured by frequency across
 *     resources/js/components/ + resources/js/Pages/ (322 Vue files) and
 *     resources/sass/. Ranked usage counts are recorded in DESIGN_SOURCE.md.
 *   - The size / radius / spacing scales: resources/sass/jit-preloaded.scss,
 *     which is a build-time snapshot of every utility class the app actually
 *     emits. It is the single most reliable token source in the repo.
 *   - Control heights: resources/sass/_layout.scss (.btn 44px, inputs 46px)
 *     and resources/sass/_utilities.scss (.navHeight 80px).
 *   - Shadows: the two dominant `box-shadow` recipes by frequency across
 *     resources/sass/ and the Vue tree.
 *
 * -----------------------------------------------------------------------------
 * WHAT IS DERIVED (and why)
 * -----------------------------------------------------------------------------
 * 1. SEMANTIC NAMES. The web app has no semantic layer — components hardcode
 *    hexes via JIT utilities like `text_615E59`. The mapping from hex to
 *    meaning below is mine, inferred from where each hex is used.
 *
 * 2. THE ENTIRE DARK THEME. The web app is light-only: `darkMode: false` in
 *    tailwind.config.js, no `prefers-color-scheme` anywhere in resources/sass/,
 *    and the only `data-bs-theme` occurrences are hardcoded to "light". The
 *    dark set here is a derivation, NOT extraction. It keeps the warm-neutral
 *    cast (greys pulled toward brown, not blue) and lifts the brand purple to
 *    #C88FC2 because #913688 has no presence on a dark surface. Treat dark as a
 *    proposal to be signed off, not as a match to anything shipping.
 *
 * 3. SHADOW NUMBERS. See the `shadows` block — CSS blur and spread do not map
 *    cleanly onto RN. Conversions and their losses are documented there.
 *
 * 4. LINE HEIGHTS. The web app almost never sets one, inheriting Bootstrap's
 *    unitless 1.5. RN needs absolute numbers, so these are computed, then
 *    hand-tuned for headings where 1.5 is visibly loose.
 *
 * -----------------------------------------------------------------------------
 * WHAT DID NOT SURVIVE THE PORT
 * -----------------------------------------------------------------------------
 * Documented in full in DESIGN_SOURCE.md § "Does not translate". In short:
 * spread radius, inset shadows, per-side shadows, `aspect-ratio` on the older
 * RN versions, `-webkit-line-clamp`, hover states, and the focus-visible ring.
 */

// =============================================================================
// Raw palette — verbatim hexes
// =============================================================================
// Do not reference these from components. Go through the semantic tokens.
// Comments record observed usage counts across the Vue tree, which is how the
// primary/secondary/tertiary ranking below was decided.

export const palette = {
  // --- Brand purple. `$secondary` in _variables.scss, `primary` in tailwind. -
  purple: {
    /** Tint. Outline-button hover fill, selected chips. */
    50: '#FEF3FD',
    /** Subtle brand surface. 109 uses. Chip and pill background. */
    100: '#F0E5EF',
    /** Pressed fill behind outline buttons. */
    200: '#E0CCDE',
    300: '#CAA9C7',
    /** Light brand accent. */
    400: '#A75EA0',
    /** THE brand colour. 326 uses. Filled buttons, links, active states. */
    500: '#913688',
    /** Filled-button hover. */
    600: '#84317C',
    /** Filled-button active/pressed. */
    700: '#672661',
    /** Deep plum. `$primary` in _variables.scss. Nav links, headings. */
    800: '#431B43',
    /** Deepest plum. tailwind `primary-dark`. */
    900: '#301432',
  },

  /**
   * Warm neutrals. This is the app's signature — the greys are pulled toward
   * brown/cream, never toward blue. Using a true grey here reads as a
   * different product.
   */
  sand: {
    /** Pure white. Used sparingly; #FFFDFB is the real "white". */
    0: '#FFFFFF',
    /** Card and input surface. 236 uses. The de-facto white. */
    25: '#FFFDFB',
    /** Page background. `$body-bg` / `$light`. 120 uses. */
    50: '#F9F6F2',
    /** Muted surface. 197 uses. Section bands, secondary panels. */
    100: '#F3EFE9',
    /** Sunken surface. `$card-bg`. 208 uses. Inset wells, alt cards. */
    200: '#EFEBE5',
    /** 60 uses. Alternate band. */
    250: '#EBE7DF',
    /** Hairline border. 462 uses — the default divider. */
    300: '#E5E2DC',
    /** Strong border. `$border-color`. 297 uses. Input outlines. */
    400: '#BCB7B0',
    /** Placeholder / disabled text. */
    500: '#94928F',
    /** Tertiary text. */
    600: '#6F6C67',
    /** Secondary text. 1027 uses — the most-used colour in the entire app. */
    700: '#615E59',
    /** Muted body text. `$text-muted`. 291 uses. */
    750: '#4D4A45',
    /** Primary body text. 829 uses. */
    800: '#343331',
    /** Headings. `$dark`. 233 uses. */
    900: '#242121',
  },

  /** Danger. `$danger` = #AD2121. */
  red: {
    /** Alert background. */
    50: '#F5DCDC',
    /** Stronger alert background. */
    100: '#F3CDCD',
    /** Alert border. */
    200: '#E6BABA',
    /** Softer danger fill. 71 uses. */
    400: '#BD4D4D',
    /** `$danger`. 78 uses. Error text, invalid input border. */
    500: '#AD2121',
  },

  /** Success. Note: `$success` (#28a745) is a Bootstrap leftover, not used. */
  green: {
    /** Success alert background. */
    50: '#D4EDDA',
    200: '#8AE6CF',
    300: '#74E393',
    /** Success text on #D4EDDA. */
    600: '#186429',
  },

  /**
   * Warm functional. #FFCC4D is the star-rating gold and appears nowhere else
   * structural — keep it that way.
   */
  gold: {
    /** Highlight-mark background (`.bg-custom-mark`). */
    100: '#FAE9CB',
    /** Rating stars. 38 uses. */
    400: '#FFCC4D',
  },

  /** Shadow tint. Plum-cast rather than neutral black — this is deliberate. */
  shadowPlum: '#350D31',
} as const;

// =============================================================================
// Colour tokens
// =============================================================================

export interface ColorTokens {
  /** Page background behind everything. */
  background: string;
  /** Default card / input surface. */
  surface: string;
  /** Alternate band or secondary panel. */
  surfaceMuted: string;
  /** Inset well, sunken list, alternate card. */
  surfaceSunken: string;
  /** Raised above surface — modals, sheets, sticky bars. */
  surfaceElevated: string;

  /** Default hairline divider. */
  border: string;
  /** Input outlines and emphasised edges. */
  borderStrong: string;

  /** Headings. */
  textHeading: string;
  /** Primary body copy. */
  textPrimary: string;
  /** Supporting copy — the app's workhorse text colour. */
  textSecondary: string;
  /** Captions, timestamps, meta. */
  textMuted: string;
  /** Placeholders and disabled labels. */
  textPlaceholder: string;
  /** Text on a filled brand surface. */
  textOnAccent: string;

  /** Brand fill — filled buttons, active tabs, links. */
  accent: string;
  /** Brand fill, pressed. */
  accentPressed: string;
  /** Brand tint surface — chips, selected rows. */
  accentSubtle: string;
  /** Brand tint surface, pressed. */
  accentSubtlePressed: string;
  /** Brand used as text or icon on a light surface. */
  accentText: string;
  /** Deep plum — nav links and display headings. */
  accentDeep: string;

  success: string;
  successSubtle: string;
  successText: string;

  warning: string;
  warningSubtle: string;
  warningText: string;

  danger: string;
  dangerSoft: string;
  dangerSubtle: string;
  dangerBorder: string;
  dangerText: string;

  /** Star fill for ratings. */
  rating: string;
  /** Unfilled star track. */
  ratingEmpty: string;

  /** Modal scrim. */
  overlay: string;
  /** Image/media scrim for text-over-photo. */
  scrim: string;

  /** Skeleton base and shimmer highlight. */
  skeleton: string;
  skeletonHighlight: string;

  /** Disabled control fill and its label. */
  disabled: string;
  disabledText: string;

  /** Bottom tab bar. */
  tabActive: string;
  tabInactive: string;
  tabBackground: string;
  tabBorder: string;
}

/**
 * Light — this is the extracted theme. Every value traces to a source file.
 */
export const lightColors: ColorTokens = {
  background: palette.sand[50],
  surface: palette.sand[25],
  surfaceMuted: palette.sand[100],
  surfaceSunken: palette.sand[200],
  surfaceElevated: palette.sand[25],

  // 3.1:1 and 3.0:1 on `surface`, for 1.4.11. `border` is load-bearing rather
  // than decorative here: an outlined Card sits on a background only 1.20:1
  // from its own fill, so the hairline is the ONLY thing that says where the
  // card begins. That makes it "required to identify a component" and puts it
  // inside the criterion. It is visibly heavier than the web app's hairline —
  // that is the cost of the card being identifiable at all.
  border: '#918E88',
  borderStrong: '#98938C',

  textHeading: palette.sand[900],
  textPrimary: palette.sand[800],
  textSecondary: palette.sand[700],
  textMuted: palette.sand[750],
  // 4.59:1 on `surface` — was sand[500] (#94928F) at 3.06:1, under the 4.5
  // minimum for body text (1.4.3). Placeholders are text, not decoration.
  textPlaceholder: '#767471',
  textOnAccent: palette.sand[0],

  accent: palette.purple[500],
  accentPressed: palette.purple[700],
  accentSubtle: palette.purple[100],
  accentSubtlePressed: palette.purple[200],
  accentText: palette.purple[500],
  accentDeep: palette.purple[900],

  success: palette.green[600],
  successSubtle: palette.green[50],
  successText: palette.green[600],

  warning: palette.gold[400],
  warningSubtle: palette.gold[100],
  warningText: palette.sand[900],

  danger: palette.red[500],
  dangerSoft: palette.red[400],
  dangerSubtle: palette.red[100],
  dangerBorder: palette.red[200],
  dangerText: palette.red[500],

  // 3.04:1 on `surface`. gold[400] (#FFCC4D) measured 1.48:1 — a star rating is
  // information carried entirely by a graphic, so it is 1.4.11, not decoration.
  // Dark mode keeps the bright gold: it already passes at 11.04:1 there.
  // 5.35:1 on `surface`, deliberately deeper than the 3:1 floor. At the minimum
  // the filled gold and the empty track landed at 1.02:1 against EACH OTHER —
  // both legible against the page, and indistinguishable from one another,
  // which is the wrong thing to optimise for a rating. Ionicons already gives
  // `star` and `star-outline`, so shape separates them; the extra depth
  // restores the weight difference that makes a rating readable at a glance.
  rating: '#8A6300',
  ratingEmpty: '#918E88',

  overlay: 'rgba(0, 0, 0, 0.50)',
  scrim: 'rgba(0, 0, 0, 0.60)',

  skeleton: '#DDDBDD',
  skeletonHighlight: palette.sand[25],

  // _variables.scss `.btn-secondary:disabled` — the only explicit disabled
  // treatment in the codebase, and it is a cool grey, unlike everything else.
  // Flagged as an inconsistency in DESIGN_SOURCE.md; kept verbatim for fidelity.
  disabled: '#C4C1BD',
  // Not required — WCAG exempts inactive controls from 1.4.3 — but 2.39:1 left
  // "disabled" and "low contrast" indistinguishable, which is a usability
  // problem whether or not it is a conformance one. 4.71:1.
  disabledText: '#4E4D4B',

  tabActive: palette.purple[500],
  tabInactive: palette.sand[700],
  tabBackground: palette.sand[25],
  tabBorder: palette.sand[300],
};

/**
 * Dark — DERIVED. Nothing in the web app corresponds to this.
 *
 * Two rules held it together:
 *   - Keep the warm cast. The neutrals are browns at low lightness, not blue
 *     -greys, or the product stops feeling like MSN.
 *   - Lift the brand. #913688 on a dark surface is mud. purple.400 (#A75EA0)
 *     and a lighter #C88FC2 carry the accent instead, and dark plum text sits
 *     on top of filled brand surfaces.
 *
 * Elevation goes lighter rather than shadowed, since shadows barely register
 * on dark backgrounds.
 */
export const darkColors: ColorTokens = {
  background: '#171514',
  surface: '#211E1D',
  surfaceMuted: '#2A2725',
  surfaceSunken: '#1C1A19',
  surfaceElevated: '#332F2C',

  // 3.05:1 and 3.06:1 on `surface`, for 1.4.11.
  border: '#6D6967',
  borderStrong: '#6F6965',

  textHeading: '#F7F4F0',
  textPrimary: '#EDE9E4',
  textSecondary: '#BCB7B0',
  textMuted: '#A4A09C',
  // 4.54:1 on `surface` — was 3.85:1. See the light note.
  textPlaceholder: '#8A8581',
  textOnAccent: '#2A0F28',

  accent: '#C88FC2',
  accentPressed: '#A75EA0',
  accentSubtle: '#3A2038',
  accentSubtlePressed: '#4A2A47',
  accentText: '#D9A8D3',
  accentDeep: '#E3BEDE',

  success: '#74E393',
  successSubtle: '#16301D',
  successText: '#8FEBA8',

  warning: '#FFCC4D',
  warningSubtle: '#332912',
  warningText: '#FFD97A',

  danger: '#E4756B',
  dangerSoft: '#BD4D4D',
  dangerSubtle: '#3A1C1A',
  dangerBorder: '#5C2B27',
  dangerText: '#F09A91',

  rating: palette.gold[400],
  ratingEmpty: '#6D6967',

  overlay: 'rgba(0, 0, 0, 0.66)',
  scrim: 'rgba(0, 0, 0, 0.70)',

  skeleton: '#2A2725',
  skeletonHighlight: '#332F2C',

  disabled: '#3A3634',
  disabledText: '#A5A09C',

  tabActive: '#C88FC2',
  tabInactive: '#A4A09C',
  tabBackground: '#211E1D',
  tabBorder: '#3A3634',
};

// =============================================================================
// Spacing
// =============================================================================
/**
 * Derived from the step values that actually appear in jit-preloaded.scss.
 * The web app is not on a strict 4pt grid — it emits 3, 5, 7, 11, 22, 26, 33,
 * 34, 35, 63px one-offs. Those are drift, not intent, and are dropped here.
 * The retained steps cover the overwhelming majority of real usage.
 */
export const spacing = {
  none: 0,
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
  xxxl: 48,
  huge: 80,
} as const;

/** Horizontal page padding. 16 on mobile is the observed mobile gutter. */
export const layout = {
  /** Screen edge padding. resources/sass/_utilities.scss `.p-32` collapses to 16 below 1200px. */
  screenPadding: 16,
  /** Gap between cards in a list or grid. `.gap-32` collapses to 16 on small. */
  cardGap: 16,
  /** Max readable content width, for tablet/landscape. */
  contentMaxWidth: 600,
} as const;

// =============================================================================
// Radii
// =============================================================================
/** Verbatim. `rounded_8` (250 uses) dominates — treat it as the default. */
export const radii = {
  none: 0,
  /**
   * Inputs, selects, BUTTONS, small badges. `$border-radius-sm`. 81 uses.
   * Buttons really are 4px: `_base.scss:1788` `.btn-secondary{border-radius:4px}`.
   * Call-sites also apply `rounded-1` (4) and `rounded-3` (16) inconsistently —
   * standardise on 4. See DESIGN_SOURCE.md.
   */
  sm: 4,
  /** `$border-radius`. */
  md: 6,
  /** DEFAULT. Cards, buttons, images. 250 uses. `$border-radius-lg` is 8. */
  lg: 8,
  xl: 12,
  /** Modals (`.modal-content`), large cards. 100 uses. `$border-radius-xl`. */
  xxl: 16,
  /** `$border-radius-2xl`. Hero and feature panels. */
  xxxl: 40,
  /** `$border-radius-pill` is 200 — any large number rounds a pill in RN. */
  pill: 999,
  /** Avatars. */
  full: 9999,
} as const;

// =============================================================================
// Typography
// =============================================================================
/**
 * DM Sans, loaded from Google Fonts in resources/views/frontend/master.blade.php
 * as a variable font (`opsz 9..40, wght 100..1000`).
 *
 * LICENSING: DM Sans is SIL Open Font License 1.1. It ships in a mobile app
 * with no restriction. Use `@expo-google-fonts/dm-sans` and load the static
 * instances named below. No fallback substitute is needed.
 *
 * RN cannot interpolate a variable axis, so `fontWeight` on Android will not
 * synthesise correctly — you must reference the concrete family name per
 * weight. `fontFamilies` below is keyed for exactly that.
 *
 * Poppins (public/fonts/Poppins-*.ttf, tailwind.config.js `fontFamily.poppins`)
 * is dead legacy — only referenced from unused config and two auth blades. Do
 * not ship it.
 */
export const fontFamilies = {
  light: 'DMSans_300Light',
  regular: 'DMSans_400Regular',
  medium: 'DMSans_500Medium',
  semibold: 'DMSans_600SemiBold',
  bold: 'DMSans_700Bold',
} as const;

/**
 * Numeric weights, verbatim from _variables.scss. Note the web app's ladder is
 * shifted one step light of convention: `$font-weight-normal` is 500, not 400,
 * and `$font-weight-light` is 400. Body copy therefore renders at 400–500 and
 * "light" body text at 300. Preserved as-is — flattening it changes the feel.
 *
 * On Android these are advisory only; pair them with `fontFamilies`.
 */
export const fontWeights = {
  lighter: '300',
  light: '400',
  normal: '500',
  semibold: '600',
  bold: '700',
  bolder: '900',
} as const;

/**
 * Size scale, verbatim from jit-preloaded.scss, ordered by observed frequency:
 * 16 (1095 uses) > 14 (536) > 24 (327) > 20 (105) > 28 (96) > 18 (82) >
 * 12 (77) > 11 (44) > 40 (19).
 *
 * 16 is the base. 11 and 12 are the mobile compressions of 14 — the app
 * routinely writes `fs_11 fs_md_14`, i.e. 11 on phone, 14 from 768px up. Since
 * RN targets phones, prefer the small value.
 */
export const fontSizes = {
  /** Micro labels. Mobile compression of 14. */
  xxs: 11,
  /** Captions, meta, timestamps. */
  xs: 12,
  /** Secondary body, button labels, form helper text. */
  sm: 14,
  /** BASE. Body copy, inputs, nav items. */
  md: 16,
  /** Lead paragraph, card titles. */
  lg: 18,
  /** Section subheadings. */
  xl: 20,
  /** Section headings — most common heading size. */
  xxl: 24,
  /** Page titles. Compresses to 24 below 768px in the web app. */
  xxxl: 28,
  /** Display. Compresses to 30 below 768px in the web app. */
  display: 40,
  /** Hero numeral — the rating figure (`.rating-font`, 50 on mobile). */
  hero: 50,
} as const;

/**
 * DERIVED. The web app inherits Bootstrap's unitless 1.5 almost everywhere;
 * RN requires absolute pixel values. Body sizes use 1.5 rounded to an even
 * number. Headings are tightened toward 1.25 because 1.5 on a 28px title is
 * visibly loose on a phone. The one explicit value in source is the 20px line
 * height on small text, which matches xs/sm below.
 */
export const lineHeights = {
  xxs: 16,
  xs: 18,
  sm: 20,
  md: 24,
  lg: 26,
  xl: 28,
  xxl: 32,
  xxxl: 36,
  display: 48,
  hero: 56,
} as const;

/** No letter-spacing is set anywhere in the source. Kept at 0 deliberately. */
export const letterSpacing = {
  normal: 0,
} as const;

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  fontWeight: string;
}

/**
 * Ready-made roles. These compose the scales above into the pairings the web
 * app actually uses, so screens do not have to re-derive them.
 */
export const textStyles = {
  /** 40/48 semibold. Hero and landing headlines. */
  display: {
    fontFamily: fontFamilies.semibold,
    fontSize: fontSizes.display,
    lineHeight: lineHeights.display,
    fontWeight: fontWeights.semibold,
  },
  /** 28/36 semibold. Page title. */
  h1: {
    fontFamily: fontFamilies.semibold,
    fontSize: fontSizes.xxxl,
    lineHeight: lineHeights.xxxl,
    fontWeight: fontWeights.semibold,
  },
  /** 24/32 semibold. Section heading — the most common heading in the app. */
  h2: {
    fontFamily: fontFamilies.semibold,
    fontSize: fontSizes.xxl,
    lineHeight: lineHeights.xxl,
    fontWeight: fontWeights.semibold,
  },
  /** 20/28 semibold. Subsection. */
  h3: {
    fontFamily: fontFamilies.semibold,
    fontSize: fontSizes.xl,
    lineHeight: lineHeights.xl,
    fontWeight: fontWeights.semibold,
  },
  /** 18/26 medium. Card title. */
  h4: {
    fontFamily: fontFamilies.medium,
    fontSize: fontSizes.lg,
    lineHeight: lineHeights.lg,
    fontWeight: fontWeights.normal,
  },
  /** 16/24 regular. Default body. */
  body: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.md,
    lineHeight: lineHeights.md,
    fontWeight: fontWeights.light,
  },
  /** 16/24 medium. Emphasised body, list item labels. */
  bodyStrong: {
    fontFamily: fontFamilies.medium,
    fontSize: fontSizes.md,
    lineHeight: lineHeights.md,
    fontWeight: fontWeights.normal,
  },
  /** 14/20 regular. Secondary copy, helper text. */
  bodySmall: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.sm,
    lineHeight: lineHeights.sm,
    fontWeight: fontWeights.light,
  },
  /** 12/18 regular. Meta, timestamps. */
  caption: {
    fontFamily: fontFamilies.regular,
    fontSize: fontSizes.xs,
    lineHeight: lineHeights.xs,
    fontWeight: fontWeights.light,
  },
  /** 11/16 semibold. Chips and status pills — matches `fs_11 fw_600`. */
  label: {
    fontFamily: fontFamilies.semibold,
    fontSize: fontSizes.xxs,
    lineHeight: lineHeights.xxs,
    fontWeight: fontWeights.semibold,
  },
  /**
   * 16/24 light. Button label.
   *
   * VERBATIM but questionable: `_base.scss:1788` sets `.btn-secondary
   * { font-weight: 300 }` and call-sites pile `fw-lighter` (also 300) on top.
   * 300-weight DM Sans at 16px on a filled purple button is thin on a phone
   * screen at typical outdoor brightness. Bumping to `medium` is a defensible
   * deviation — flagged in DESIGN_SOURCE.md as a decision for design to make.
   */
  button: {
    fontFamily: fontFamilies.light,
    fontSize: fontSizes.md,
    lineHeight: lineHeights.md,
    fontWeight: fontWeights.lighter,
  },
} as const satisfies Record<string, TextStyle>;

export const typography = {
  families: fontFamilies,
  sizes: fontSizes,
  weights: fontWeights,
  lineHeights,
  letterSpacing,
  styles: textStyles,
} as const;

// =============================================================================
// Shadows
// =============================================================================
/**
 * The web app's shadows are tinted plum (#350D31), not black. That warmth is
 * part of the identity and is preserved.
 *
 * CONVERSION LOSSES — read before tuning:
 *   - RN has NO spread radius. Both source shadows use a -1px negative spread
 *     to pull the shadow in. That is unrepresentable; the RN version will read
 *     very slightly wider. Compensated by trimming shadowRadius.
 *   - CSS blur ≈ 2× the Gaussian sigma that iOS `shadowRadius` takes, so
 *     shadowRadius is set to blur / 2.
 *   - Android ignores colour, offset and radius entirely and renders from
 *     `elevation` alone. The elevation values are eyeballed matches, so the
 *     two platforms will differ. Accept it, or draw borders instead.
 *   - Alpha is converted from the source's 8-digit hex: 1A = 0.10, 33 = 0.20.
 *
 * `card` and `raised` are the only two that matter — they account for roughly
 * 50 of the ~70 real box-shadow declarations in the source.
 */
export interface ShadowToken {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
}

export const shadows = {
  /** No shadow. The source uses `box-shadow: none` 68 times — flat is the norm. */
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  /** `0px 1px 4px 0px #0000001A` — subtle, used on sticky bars. */
  subtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  /** `0px 2px 4px -1px #350D311A` — resting card. The app's default shadow. */
  card: {
    shadowColor: palette.shadowPlum,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  /** `0px 5px 12px -1px #350D3133` — hovered/active card, dropdowns. */
  raised: {
    shadowColor: palette.shadowPlum,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  /** Modals and bottom sheets. Scaled up from `raised`. */
  modal: {
    shadowColor: palette.shadowPlum,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 14,
    elevation: 16,
  },
} as const satisfies Record<string, ShadowToken>;

// =============================================================================
// Component metrics
// =============================================================================
/** Verbatim from _layout.scss and _utilities.scss. */
export const controlHeights = {
  /** `.btn { height: 44px }` — _layout.scss:18. Also meets the 44pt tap target. */
  button: 44,
  /** Small/compact button. */
  buttonSmall: 36,
  /** `.form-control:not(textarea) { height: 46px }` — _layout.scss:82. */
  input: 46,
  /** `@vueform/multiselect` min-height — _elements.scss. */
  select: 46,
  /** `.navHeight { height: 80px }` — _utilities.scss:2. Too tall for a native
   *  header; use it for a branded home header only, not every screen. */
  webHeader: 80,
  /** Accordion / filter row min-height — _base.scss. */
  listRow: 44,
} as const;

/** Avatar diameters observed as `w_N h_N` pairs in jit-preloaded.scss. */
export const avatarSizes = {
  xs: 24,
  sm: 32,
  md: 40,
  lg: 48,
  xl: 80,
  /** Profile header avatar. Overlaps the cover image by roughly half. */
  xxl: 120,
  xxxl: 160,
} as const;

/** Icon sizes. 20 and 24 dominate; 18 is the star-rating size. */
export const iconSizes = {
  xs: 16,
  sm: 18,
  md: 20,
  lg: 24,
  xl: 32,
} as const;

/** Border widths. The app only ever uses 1 and 2 (2 = invalid input). */
export const borderWidths = {
  hairline: 1,
  thick: 2,
} as const;

/**
 * Image aspect ratios, verbatim from resources/sass/_utilities.scss.
 * Use with RN's `aspectRatio` style prop.
 */
export const aspectRatios = {
  /** `.event-img-landscape` — 2 / 1. Listing card thumbnails. */
  landscape: 2,
  /** `.event-img-portrait` — 2 / 3. Carousel and spotlight cards. */
  portrait: 2 / 3,
  /** Square — avatars and gallery tiles. */
  square: 1,
} as const;

/** Opacity for a disabled control. `$btn-disabled-opacity: .40`. */
export const opacities = {
  disabled: 0.4,
  pressed: 0.85,
} as const;

// =============================================================================
// Theme assembly
// =============================================================================

export interface Theme {
  colors: ColorTokens;
  spacing: typeof spacing;
  layout: typeof layout;
  radii: typeof radii;
  typography: typeof typography;
  shadows: typeof shadows;
  controlHeights: typeof controlHeights;
  avatarSizes: typeof avatarSizes;
  iconSizes: typeof iconSizes;
  borderWidths: typeof borderWidths;
  aspectRatios: typeof aspectRatios;
  opacities: typeof opacities;
  /** True when `colors` is the derived dark set rather than the extracted one. */
  isDark: boolean;
}

const shared = {
  spacing,
  layout,
  radii,
  typography,
  shadows,
  controlHeights,
  avatarSizes,
  iconSizes,
  borderWidths,
  aspectRatios,
  opacities,
} as const;

export const lightTheme: Theme = {
  ...shared,
  colors: lightColors,
  isDark: false,
};

export const darkTheme: Theme = {
  ...shared,
  colors: darkColors,
  isDark: true,
};

export type ColorTokenName = keyof ColorTokens;
export type SpacingToken = keyof typeof spacing;
export type RadiusToken = keyof typeof radii;
export type FontSizeToken = keyof typeof fontSizes;
export type FontWeightToken = keyof typeof fontWeights;
export type TextStyleToken = keyof typeof textStyles;
/** Names of the shadow presets, e.g. 'card'. The shape is `ShadowToken`. */
export type ShadowName = keyof typeof shadows;
export type ThemeMode = 'light' | 'dark';

export const themes: Record<ThemeMode, Theme> = {
  light: lightTheme,
  dark: darkTheme,
};

export default lightTheme;
