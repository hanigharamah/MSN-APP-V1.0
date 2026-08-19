# MSN — Design source of truth

Extracted from the live web app so the React Native rebuild matches the product
users already recognise through the webview wrapper.

- **Source (read-only):** `/Users/hanigharamah/MSN/mysourcenetwork-events/`
- **Token file:** `/Users/hanigharamah/MSN/msn-app/app/src/theme/extracted-tokens.ts`

Every claim below cites the file it came from. Where the web app contradicts
itself — and it does, constantly — the conflict is marked **⚠️ CONFLICT** with a
recommendation.

---

## 0. Read this first: where the design system actually lives

The brief pointed at `tailwind.config.js` as the primary token source. **It is
not. Tailwind is dead code in this repo.** Three independent proofs:

1. `/Users/hanigharamah/MSN/mysourcenetwork-events/resources/css/app.css` — the
   only file that ever contained `@tailwind` directives — is **100% commented
   out**, including the directives themselves.
2. `/Users/hanigharamah/MSN/mysourcenetwork-events/webpack.mix.js` compiles
   `resources/sass/frontend.scss` and `resources/js/app.js`. It never compiles
   `app.css`, and there is no PostCSS/Tailwind step.
3. `/Users/hanigharamah/MSN/mysourcenetwork-events/resources/views/frontend/master.blade.php:113`
   links `css/frontend.css` (the Sass build). The `app.css` link on line 112 is
   commented out.

`tailwind.config.js` also fails a sniff test: its palette is a cool blue-grey
set (`gray: #404F65`, `gray-100: #8896AB`, `blue: #3B82F6`) that appears nowhere
in the shipped UI, and its font is Poppins, which the frontend does not load.
It is leftover from a purchased template. **Ignore it.** Taking its palette
would have produced an app that looks nothing like MSN.

The real system is three layers:

| Layer | File | Role |
| --- | --- | --- |
| Bootstrap 5.2.3 + SCSS overrides | `resources/sass/_variables.scss` | Brand colours, radii, font scale, weight ladder |
| ~15k lines of hand-written SCSS | `resources/sass/_base.scss` (3683 lines), `_layout.scss`, `_home.scss`, `_chat.scss`, `_dashboard.scss` | Component skins |
| A bespoke runtime JIT utility generator | `resources/js/jit-colors.js` | Per-element overrides written inline in Vue templates |

**The single most valuable file in the repo is
`/Users/hanigharamah/MSN/mysourcenetwork-events/resources/sass/jit-preloaded.scss`.**
It is a build-time snapshot of every utility class the app actually emits —
roughly 235 rules. Because it is generated from real usage rather than authored,
it is the most honest statement of the design system that exists. The spacing,
radius and size scales in `extracted-tokens.ts` come from it.

### The JIT utility grammar

You need this to read any Vue template in the repo.
Source: `/Users/hanigharamah/MSN/mysourcenetwork-events/resources/js/jit-colors.js`.
Separator is `_`; every rule emits `!important`.

| Class | Compiles to |
| --- | --- |
| `bg_FFFDFB`, `bg_#FFFDFB` | `background-color: #FFFDFB` (the `#` is optional) |
| `text_615E59` | `color: #615E59` |
| `fs_16` / `fw_600` / `lh_10` | `font-size: 16px` / `font-weight: 600` / `line-height` |
| `p_16`, `px_12`, `mt_24`, `ms_4` | padding / margin, bare number ⇒ `px` |
| `w_40`, `h_40`, `minw_89`, `maxw_600` | sizing |
| `rounded_8` | `border-radius: 8px` |
| `border_1px_solid_E5E2DC` | full border shorthand; `border_top_…` also works |
| `fs_md_20` | same rule wrapped in `@media (min-width: 768px)` |

Breakpoints (`jit-colors.js:19-25`): `sm` 576, `md` 768, **`lg` 1199**, `xl`
1200, `xxl` 1400. Note `lg` is 1199px, off by one from Bootstrap's 992 — a bug
the app has absorbed. Irrelevant to RN, but it explains odd layout jumps if you
compare against the web at tablet widths.

---

## 1. Colour palette

Light only. There is no dark mode: `darkMode: false` in the (dead) Tailwind
config, **zero** `prefers-color-scheme` queries anywhere in `resources/sass/`,
and the only `data-bs-theme` attributes in the codebase are hardcoded to
`"light"` (`resources/views/frontend/dashboard/header.blade.php:70`,
`resources/js/components/Shared/DashboardNavbar.vue:2`).

The defining characteristic is that **the neutrals are warm**. They are browns
and creams, not greys. Substituting a conventional cool grey ramp is the single
fastest way to make the RN app feel like a different product.

Usage counts below are occurrences across the 322 Vue files in
`resources/js/components/` + `resources/js/Pages/`, which is how the
primary/secondary ranking was decided.

### Brand

| Hex | Uses | Role | Source |
| --- | --- | --- | --- |
| `#913688` | 326 | **The brand purple.** Filled buttons, links, active tabs, checked controls | `_variables.scss:20` (`$secondary`) |
| `#923688` | 26 | ⚠️ Near-duplicate of the above, off by one digit | `_variables.scss:131-146` |
| `#84317C` | — | Filled button hover | `_variables.scss:154` |
| `#672661` | — | Filled button active/pressed | `_variables.scss:158` |
| `#A75EA0` | 9 | Light brand accent, badge borders | `_base.scss:2885` |
| `#431B43` | 21 | **Footer background** — distinct from `$primary` | `frontend/layout/footer.blade.php` |
| `#301432` | 53 | **Deep plum.** Nav links, `.multiselect` selected option | `_variables.scss:19` (`$primary`) |
| `#F0E5EF` | 109 | Brand tint surface — chips, outline-button hover | `_variables.scss:135` |
| `#E0CCDE` | — | Brand tint pressed | `_variables.scss:139` |
| `#FEF3FD` | 10 | Lightest brand tint | Vue tree |
| `#9652AD` | — | `$info` — declared, effectively unused | `_variables.scss:21` |
| `#a442b2` | — | Range-slider fill only | `master.blade.php:166-171` |

⚠️ **CONFLICT — `#913688` vs `#923688`.** Bootstrap's `.btn-secondary` and
`.btn-outline-secondary` overrides in `_variables.scss:130-163` use `#923688`,
while the `:focus-visible` rules 15 lines below (`:171-188`) and all 326 Vue
call-sites use `#913688`. The two are visually indistinguishable but they defeat
every find-and-replace. **Standardise on `#913688`.** That is what
`extracted-tokens.ts` uses.

### Warm neutrals — surfaces, borders, text

| Hex | Uses | Role | Source |
| --- | --- | --- | --- |
| `#FFFFFF` | 20 | True white. Used sparingly | — |
| `#FFFDFB` | 236 | **Card / input surface.** The de-facto "white" | `EventCard.vue:3`, `_elements.scss:150` |
| `#F9F6F2` | 120 | **Page background.** `$body-bg` and `$light` | `_variables.scss:27` |
| `#F3EFE9` | 197 | Muted surface — chips, section bands, input-group addons | `_base.scss:1039` |
| `#EFEBE5` | 208 | Sunken surface. `$card-bg` | `_variables.scss:112` |
| `#EBE7DF` | 60 | Alternate band | `jit-preloaded.scss` |
| `#E5E2DC` | 462 | **Default hairline border.** The standard divider | `EventCard.vue:3` |
| `#BCB7B0` | 297 | **Strong border.** `$border-color`. Input outlines | `_variables.scss:34` |
| `#94928F` | 11 | Placeholder, scrollbar thumb | `_base.scss:3095` |
| `#6F6C67` | 35 | Tertiary text, checkbox borders | `_layout.scss:1210-1219` |
| `#615E59` | **1027** | **Secondary text — the most-used colour in the entire app** | Vue tree |
| `#4D4A45` | 291 | Muted body text. `$text-muted` | `_variables.scss:31` |
| `#343331` | 829 | **Primary body text** | Vue tree |
| `#242121` | 233 | **Headings.** `$dark` / `$body-color` | `_variables.scss:25` |

### Semantic

| Role | Hex | Source |
| --- | --- | --- |
| Danger / error text, invalid border | `#AD2121` (78 uses) | `_variables.scss:24` (`$danger`) |
| Danger, softer fill | `#BD4D4D` (71 uses) | inline on `.btn-danger` call-sites |
| Danger subtle bg | `#F3CDCD`, `#F5DCDC` | `jit-preloaded.scss` |
| Danger border | `#E6BABA` | `jit-preloaded.scss` |
| Success bg | `#D4EDDA` | `ContactUs.vue:102` |
| Success text | `#186429` | `EventDetail.vue:2792` |
| Rating gold | `#FFCC4D` (38 uses) | `Healers/HealerCard.vue:38` |
| Highlight-mark bg | `#FAE9CB` | `_base.scss` `.bg-custom-mark` |
| Disabled fill / label | `#C4C1BD` / `#7B7A78` | `_variables.scss:165-170` |

⚠️ **CONFLICT — `$success: #28a745` is declared** (`_variables.scss:23`) but is
Bootstrap's default green, never used in the UI. The real success pair is
`#D4EDDA` background with `#186429` text, applied via inline styles. Likewise
`$warning` is **never overridden**, so any `text-warning` in the codebase renders
Bootstrap's `#ffc107` — which is how a fourth star colour got in (see §7).
**Recommendation:** adopt `#186429`/`#D4EDDA` for success and `#FFCC4D` for
warning/rating; delete `$success` and stop using `text-warning`.

⚠️ **CONFLICT — danger is two reds.** `.btn-danger` inherits `#AD2121` from
`$danger`, but call-sites repaint it inline with `bg_#BD4D4D`
(e.g. `class="btn btn-danger fw-lighter rounded-1 bg_#BD4D4D"`, 5 occurrences).
**Recommendation:** `#AD2121` for text and borders (it has the contrast),
`#BD4D4D` for large filled surfaces (it is less alarming at scale). That split is
encoded as `danger` / `dangerSoft` in the token file.

### Dark mode

**The web app has none.** The dark set in `extracted-tokens.ts` is *derived*, not
extracted, and is flagged as such in the file header. It preserves the warm cast
(neutrals stay brown at low lightness) and lifts the brand purple to `#C88FC2`,
because `#913688` has no presence against a dark surface. Treat it as a proposal
requiring design sign-off, not as a match to anything shipping.

---

## 2. Typography

### Family

**DM Sans**, loaded as a variable font from Google Fonts:

```
resources/views/frontend/master.blade.php:106-108
https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000
```

Also set as `$font-family-sans-serif` in `_variables.scss:3`, and vendored at
`public/frontend/fonts/dm_sans/` (the full static family, ~40 files).

**Licensing — no problem.** DM Sans is SIL Open Font License 1.1. It ships in a
mobile app with no restriction and needs no substitute. Use
`@expo-google-fonts/dm-sans`.

**One RN caveat:** DM Sans on the web is a *variable* font. React Native cannot
interpolate a variable axis, and Android will not synthesise weights from
`fontWeight` alone. You must load discrete static instances and reference them by
family name. `fontFamilies` in the token file is keyed for exactly that
(`DMSans_300Light` … `DMSans_700Bold`).

**Poppins is dead.** `public/fonts/Poppins-*.ttf` exists and
`tailwind.config.js` declares it, but the only live references are two legacy
auth blades (`resources/views/frontend/auth/app.blade.php:22`,
`verifiy_access.blade.php:19`). Do not ship it.

### Weight ladder — read this carefully

`_variables.scss:5-10` **remaps Bootstrap's weight names one step lighter than
convention**:

| Bootstrap class | Normally | **In MSN** |
| --- | --- | --- |
| `fw-lighter` | 200 | **300** |
| `fw-light` | 300 | **400** |
| `fw-normal` | 400 | **500** |
| `fw-semibold` | 600 | 600 |
| `fw-bold` | 700 | 700 |
| `fw-bolder` | 900 | 900 |

This matters because `fw-lighter` is sprayed across the app — including on
buttons — and it means **300**, not 200. Body copy renders at 400–500. If you
read the templates assuming Bootstrap defaults you will build the whole app one
weight too heavy.

### Size scale

From `jit-preloaded.scss`, ordered by real frequency:

| Size | Uses | Role |
| --- | --- | --- |
| **16px** | 1095 | Base — body, inputs, nav, button labels |
| **14px** | 536 | Secondary copy, meta, helper text |
| **24px** | 327 | Section heading (the most common heading) |
| 20px | 105 | Subsection heading, card title |
| 28px | 96 | Page title |
| 18px | 82 | Lead / card title |
| 12px | 77 | Captions |
| 11px | 44 | Micro labels |
| 40px | 19 | Display |

Bootstrap's `fs-*` classes are also remapped (`_variables.scss:44-51`):
`fs-1`=22, `fs-2`=20, `fs-3`=18, `fs-4`=16, `fs-5`=14, `fs-6`=12. So `fs-1` is
**not** the largest heading — another trap when reading templates.

**Responsive compression.** The app routinely writes `fs_11 fs_md_14` — 11px on
phone, 14px from 768px up. Since RN targets phones, take the smaller value.
Confirmed at `frontend.scss:118-131`: `.fs_28` → 24px and `.fs_40` → 30px below
768px, and `.rating-font` 64px → 50px.

### Line height

⚠️ The web app **almost never sets one**, inheriting Bootstrap's unitless 1.5.
RN requires absolute numbers, so `lineHeights` in the token file is computed:
body sizes at ~1.5 rounded even, headings tightened toward 1.25 because 1.5 on a
28px title is visibly loose on a phone. The only explicit small-text value in
source is `line-height: 20px` (17 occurrences), which matches the token.

**No letter-spacing is set anywhere.** Kept at 0 deliberately.

---

## 3. Spacing and layout

The step values that appear in `jit-preloaded.scss`: 4, 8, 10, 12, 16, 20, 24,
32, 40, 48, 80 — plus one-offs (3, 5, 7, 11, 22, 26, 33, 34, 35, 63) that are
drift rather than intent and are dropped from the token scale.

**Responsive collapse** (`resources/sass/_utilities.scss:52-79`) is the clearest
statement of mobile intent, and it is consistent:

```scss
.gap-32 { gap: 32px; @media (max-width: 575.98px) { gap: 16px } }
.mb-32  { margin-bottom: 32px; @media (max-width: 575.98px) { 16px } }
.p-32   { padding: 32px; @media (max-width: 1199.98px) { 16px 16px 80px 16px } }
```

**On mobile, 32 becomes 16.** So the RN app's screen padding and card gap are
both **16**, not 32. That is `layout.screenPadding` and `layout.cardGap`.

The trailing `padding-bottom: 80px` in `.p-32` is clearance for the fixed mobile
bottom menu — in RN that becomes safe-area inset plus tab bar height, not a
literal 80.

### Container widths

Bootstrap defaults, unmodified (`_variables.scss:74-80`): sm 540, md 720, lg 960,
xl 1200, xxl 1320. `_layout.scss:159-172` caps `.container-xl`/`.container-xxl`
at 1200. Largely irrelevant to phones; `layout.contentMaxWidth` is set to 600 for
tablet and landscape, matching the `maxw_600` / `maxw_md_600` utilities that
already exist in `jit-preloaded.scss`.

### Control heights

| Element | Height | Source |
| --- | --- | --- |
| Button | **44px** | `_layout.scss:15-20` |
| Input / select / multiselect | **46px** | `_layout.scss:82-84`, `_elements.scss:143` |
| Web header | 80px | `_utilities.scss:1-3` (`.navHeight`) |

44px happens to be exactly Apple's minimum tap target. Keep it.

⚠️ **CONFLICT:** `.btn { height: 44px }` is unconditional, so **no button size
variants are possible** — `.btn-sm` and `.btn-lg` are overridden to 44px too.
The RN app should define real `sm` (36) and `md` (44) sizes;
`controlHeights.buttonSmall` is there for that.

### Image aspect ratios

`resources/sass/_utilities.scss:9-46` — the one genuinely well-factored part of
the stylesheet:

- `.event-img-landscape` — `aspect-ratio: 2/1`, `object-fit: cover`. Listing card thumbnails.
- `.event-img-portrait` — `aspect-ratio: 2/3`, height 250px. Carousel/spotlight cards.
- `.event-img-banner` — 100%/100% cover. Detail hero.
- `.event-img-gallery` — cover, `border-radius: 8px`.

⚠️ `Cards/EventCard.vue:11` writes `class="event-img-landscape h_170"` — the
`h_170` overrides the 2:1 ratio. Use the ratio, drop the fixed height.

---

## 4. Radii, borders, shadows

### Radii

`_variables.scss:36-41`: `sm` 4, base 6, `lg` 8, `xl` 16, `2xl` 40, `pill` 200px.

Real usage from the Vue tree: **`rounded_8` 250 uses**, `rounded_16` 100,
`rounded_4` 81, then 12/14/6/10 in single digits.

- **8px is the default** — cards, images, dropdowns.
- **4px** — buttons, inputs, selects, small badges.
- **16px** — modals (`_base.scss:3279`), list-row cards.
- **120px / 200px / 50rem** — pills and status badges. In RN, use `radii.pill` (999).
- **50%** — avatars. In RN, `radii.full`.

⚠️ **CONFLICT — button radius is declared three ways.** `_base.scss:1788` sets
`.btn-secondary { border-radius: 4px }`, but call-sites add `rounded-1` (4px) or
`rounded-3` (16px) at random, and the `:focus-visible` rules
(`_variables.scss:178, 187`) set **8px** — so a keyboard-focused button visibly
changes shape. **Standardise on 4px everywhere,** including focus.

### Borders

Only two widths exist: **1px** (default) and **2px** (invalid input, focus ring).
Two colours: `#E5E2DC` (hairline divider, 462 uses) and `#BCB7B0` (input outline,
297 uses).

### Shadows

⚠️ The app is **mostly flat** — `box-shadow: none` appears 68 times, more than any
actual shadow. Only two recipes matter:

| Recipe | Uses | Role |
| --- | --- | --- |
| `0px 2px 4px -1px #350D311A` | 25 | Resting card |
| `0px 5px 12px -1px #350D3133` | 24 | Hover / raised card, dropdowns |

Both are tinted **plum (`#350D31`)**, not black. That warmth is deliberate and is
preserved in `shadows.card` / `shadows.raised`.

Card hover is applied via `.card-hover-state:hover` (`_base.scss:1836-1838`),
which stacks both recipes. RN has no hover — apply `shadows.raised` on press
instead, or skip it.

---

## 5. Component conventions

### Buttons

Base: `_layout.scss:15-20` — `height: 44px`, `padding: 10px 0`.
`_base.scss:1788-1791` — `.btn-secondary { font-weight: 300; border-radius: 4px }`.

**Primary CTA — `.btn-secondary`** (`_variables.scss:149-179`). Yes, the primary
action uses Bootstrap's *secondary* slot, because `$primary` is the deep plum.

| State | Fill | Text | Border |
| --- | --- | --- | --- |
| Default | `#913688` | `#FFFFFF` | `#913688` |
| Hover | `#84317C` | `#FFFFFF` | `#84317C` |
| Active | `#672661` | `#FFFFFF` | + `inset 0 3px 5px rgba(0,0,0,.125)` |
| Disabled | `#C4C1BD` | `#7B7A78` | none, `opacity: 1` |
| Focus | `#913688` | `#FFFFFF` | 2px white + `outline: 2px solid #913688` |

**Secondary — `.btn-outline-secondary`** (`_variables.scss:130-148`). Note the
fill is **`#F9F6F2`, not transparent**: text/border `#913688`, hover fill
`#F0E5EF`, active fill `#E0CCDE`. Context variants swap only the base fill —
`.btn-sec-alt` → `#FFFDFB`, `.btn-sec-alt-2` → `#F3EFE9` (`_variables.scss:189-198`).

**Destructive — `.btn-danger`**: `#AD2121` by default, repainted `#BD4D4D` inline
at several call-sites. See the danger conflict in §1.

**Icon buttons** (all in `_base.scss`):
- `.btn-cross` (`:2658`) — 40×40 circle, `1px solid #BCB7B0`, fill `#F9F6F2`, icon `#615E59` 24px; hover → `#913688` fill, white icon.
- `.btn-for-close` (`:3395`) — 28×28 circle, transparent; hover `#F0CCCC`.
- `.edit-btn-gallery` (`:3510`) — 20×20 circle, `#F9F6F2`, `1px solid #E5E2DC`.

⚠️ **CONFLICT — button class strings are chaotic.** Counted across
`resources/js/components/`: bare `btn btn-secondary` 104×;
`btn fw-lighter rounded-1 w-mobile-100 w-100 btn-secondary` 44×;
`btn btn-secondary fw-lighter rounded-1 w-100` 21×;
`btn btn-secondary w-100 fw-lighter rounded-1` 17× — the last two are the *same
four tokens in a different order*. Plus 8 occurrences of
`btn btn-secondary text-secondary bg-transparent`, i.e. a filled button hollowed
out with utilities rather than using the outline variant.

**Recommendation for RN:** exactly two variants (`primary`, `outline`) plus
`danger`, two sizes (44 / 36), and `fullWidth` as a prop. Nothing else.

⚠️ **Label weight.** `.btn-secondary` is `font-weight: 300` and call-sites add
`fw-lighter` (also 300) on top. 300-weight DM Sans at 16px on a saturated purple
fill is thin on a phone in daylight. `textStyles.button` is faithful to 300, but
**bumping to 500 is a defensible deviation** — a call for design to make.

### Cards

**Canonical** — `resources/js/components/Cards/EventCard.vue:3`:

```html
<div class="card card-hover-state bg_#FFFDFB rounded_8 border_1px_solid_E5E2DC w-100 p-0">
```

Surface `#FFFDFB`, radius 8, border `1px solid #E5E2DC`, body padding 16
(`p_16`), hover shadow via `.card-hover-state`.

Content stack (`EventCard.vue:61-97`): avatar 32 circle → "Hosted by" 14/300
`#615E59` → organiser name 16/300 `line-clamp-1` → price badge (right-aligned,
same row) → **title** 18/600 with `mb_12` → meta rows 14/300 `#343331` with 16px
inline SVG icons, `gap_8 mb_8`.

`Cards/HealerCard.vue:3-4` follows the same shell with a 64px circular avatar,
name at 20/600, and language chips.

**List-row cards** (`Cards/BookedEventCardListView.vue:3`): radius **16**, body
padding 12, thumbnail `w_104 h_125` with `1px solid #BCB7B0` radius 8, title
16/600 `line-clamp-2`, meta 14/300 `#615E59`, status pill bottom-left.
Skin: `.card-manage-content` (`_base.scss:2863`) — `#FFFDFB`, `1px #E5E2DC`,
hover `#F5F1EB`, focus `2px solid #913688`, active `#F0EBE4`.

⚠️ **CONFLICT — three unrelated healer-card implementations:**
1. `Cards/HealerCard.vue` — modern: `#FFFDFB` / 8px / `#E5E2DC` / 64px circular avatar / Bootstrap-icon stars.
2. `Healers/HealerCard.vue` — `border-0 bg-transparent`, a **218px rectangular** image at `rounded-2`, `#FFCC4D` inline star. Its router link is commented out at `:4` and `:45`, so it may already be dead.
3. `Businesses/BusinessCard.vue` — `rounded-3` (16px) over `.custom-card` (10px), centre-aligned, `<star-rating>` component, absolutely-positioned badge stack.

⚠️ The five content cards (`ArchiveCard`, `BlogCard`, `BroadcastCard`,
`PostCard`, `PodcastCard` — all at `:2` or `:3`) use `bg-white` (#FFFFFF) +
`rounded-3` (16px), diverging from the `#FFFDFB` + 8px standard.

⚠️ Three near-clone skins differing by a single hex digit:
`.card-manage-content` (hover `#F5F1EB`) / `.card-service-content` (hover
`#F5F0EB`) / `.card-assign-ticket` (hover `#F6F4F0`).

**Recommendation:** one card token — surface `#FFFDFB`, border `1px solid
#E5E2DC`, radius **8** for grid cards and **16** for list rows.

### Inputs

`_layout.scss:21-36, 82-95` and `:1187-1219`:

- Height **46px**, radius **4px**, fill `#FFFDFB`, border `1px solid #BCB7B0`
- Text `#4D4A45`, size 16, weight 500
- Placeholder — ⚠️ **declared three times, differently**: `#4D4A45`
  (`_layout.scss:93`), then `#6F6C67` at 16/300 (`_layout.scss:1210-1219`, which
  wins), then `#301432` at 15px scoped to `.register` (`_layout.scss:428-431`).
  **Standardise on `#6F6C67`.**

⚠️ **CONFLICT, and it is an accessibility bug: inputs have no visible focus
state.** `_layout.scss:29-35` sets `box-shadow: none` on `:focus` *and* forces
`border-color` back to `#BCB7B0` on `:focus-within`, and `_base.scss:1-5` adds a
global `input:focus { box-shadow: none !important }`. The intended treatment
exists but is orphaned at `_base.scss:3668-3673`:

```scss
.form-control-focus:focus { border: 2px solid #913688 !important; box-shadow: 0 2px 4px 0 rgba(0,0,0,.20) }
```

It is wired to only a handful of call-sites. **The RN app must implement focus
properly: 2px `#913688` border on focus. Do not replicate the web's suppression.**

**Multiselect** (`@vueform/multiselect`, `_elements.scss:139-258`): 46px, radius
4, `1px solid #BCB7B0`, fill `#FFFDFB`; options 16px with `1px solid #EFEBE5`
dividers and 56px rows; selected → text `#301432` on `#BCB7B0`. The clear button
is globally hidden (`:178`).

**Checkboxes / radios:** checked fill is `#913688` with a white `bi-check2` at
12×12 (`_dashboard.scss:613-624`, `_elements.scss:315-317`).
⚠️ **Four sizes in production** — 18, 19, 20, 22px — and four border colours
(`#A4A09C`, `#6F6C67`, `#615E59`, `#BCB7B0`). **Standardise on 20×20, `1px solid
#6F6C67`, radius 4, checked `#913688`.**

**Labels:** there is no global `.form-label` rule. Call-sites use at least five
different combinations. **Recommendation:** 16px / 600 / `#343331` /
`margin-bottom: 4`.

**Errors:** the dominant pattern is manual, not `.invalid-feedback`
(`ContactUs.vue:65-71`) — a 2px `border-danger` on the field plus
`<i class="bi bi-exclamation-circle">` and text in `#AD2121`.
⚠️ `InputError.vue` exists and is used almost nowhere. Counted variants:
`border-danger` 104×, `border-danger border-2` 63×, `text-danger` 285×,
`text-danger fw-semibold` 99×, and five more. **Build one `FieldError`
component.**

### Badges, chips, pills

| Token | Source | Treatment |
| --- | --- | --- |
| `.small-pill` | `_base.scss:1038` | `#F3EFE9`, `1px #E5E2DC`, 4px 12px, 14/400, radius 50rem |
| `.badge-event-card` | `_base.scss:1805` | `#F3EFE9`, `1px #E5E2DC`, 5px 15px, 14/500, radius 120px |
| `.price-badge` | `_base.scss:1821` | `#F3EFE9`, `1px #E5E2DC`, 4px 12px, 16/600, radius 120px |
| `.event-pill` | `_base.scss:2463` | white, `1px #BCB7B0`, 16/300; hover `#F0E5EF` + `#913688` |
| `.status-dot` | `_base.scss:2726` | 8×8 circle, `#913688` / `#BCB7B0` unavailable |

⚠️ **Four grey-chip tokens** share `#F3EFE9` + `#E5E2DC` and differ only in
radius, padding and type scale. **Collapse to one `Chip` with `sm`/`md`.**

**Status badges** (`_base.scss:2883-2932`) — all radius 120px, padding 4px 8px, 14/300:

| Status | Fill | Border | Text |
| --- | --- | --- | --- |
| Published | `#913688` | `#A75EA0` | `#FFFFFF` |
| Drafted | `#F0E5EF` | `#A75EA0` | `#343331` |
| Cancelled | `#BD4D4D` | `#BD4D4D` | `#FFFFFF` |
| Past | `#F3EFE9` | `#E5E2DC` | `#343331` |

⚠️ **Bugs to not port:** `.drafted` is declared **twice** — the first block
(`:2893-2901`) sets `color: #FFF` on a `#F0E5EF` fill, i.e. white on near-white,
unreadable. Class names are inconsistent (`.Published` capitalised, `.pasted` a
typo for "past"), and `statusBadgeClass()` returns lowercase `'published'` as its
fallback (`Cards/BookedEventCardListView.vue:1127`), which matches **no
selector** — fallback badges render unstyled.

⚠️ **Four different status→colour maps exist**, so "confirmed" renders lilac in
one dashboard and beige in another, and "cancelled" uses an `#A75EA0` border in
one place and `#BD4D4D` in another
(`Cards/Dashboard/ServiceCardListView.vue:164-175` vs
`Cards/Dashboard/HealerServiceCardListView.vue:337-352`). Legacy screens use a
wholly separate palette — `#FFCC4D` pending / `#74E393` confirmed at radius 4
(`Customers/AppointmentLogs/CustomerAppointment.vue:104`).
**Build one `StatusBadge` with the four-row table above.**

### Avatars

Always circular (`rounded-circle`). No shared component; sizes come from JIT
utilities. Observed: 20, 32, 40, 44, 46, 52, 64, 80, and 206
(`.img-container2`, `_layout.scss:1017`). Ring is `1px solid #BCB7B0`.

⚠️ **Three different fallback assets**: `/images/avatar.svg`
(`Cards/HealerCard.vue:7`), `@/images/account/profile-photo.svg`
(`Healers/HealerCard.vue:15`), `images/profile-photo.svg`
(`Cards/Dashboard/ServiceCardListView.vue:9`).
⚠️ And a real bug at `ServiceCardListView.vue:8-9` — the `v-if`/`v-else` is
**inverted**, so real avatars never render. Do not port that.

Initials: `#913688` circle with white text at 14px. No dedicated treatment beyond
that.

### Modals

Wrapper: `resources/js/components/Modal.vue`. Size map `sm|md|lg|xl`;
`$modal-sm: 484px`, `$modal-xl: 1320px` (`_variables.scss:105, 102`).

- **Radius 16px** — but achieved four ways: `$modal-content-border-radius: 4px` (`_variables.scss:118`, **dead**), `.modal-content { border-radius: 16px }` (`_base.scss:3279`), the same again with `background: #F9F6F2` (`_layout.scss:1206`), and per-instance `style="border-radius: 16px"` on nearly every modal.
- **Padding 20px** on header/body/footer (`_dashboard.scss:419-425`), which overrides the dead `$modal-header-padding: 40px 40px`.
- **Backdrop** `#00000080` — applied to `.modal` itself, not `.modal-backdrop` (`_base.scss:3106`).
- **Close button** is a hand-rolled 24px SVG: `rx="12"` circle filled `#EFEBE5`, stroke `#4D4A45` at 1.5 (`Healers/Podcasts/DeletePodcastModal.vue:8-13`).
- **Title** `fs_24 fw-semibold`.
- **Max height** `calc(100dvh - 80px)` (`_base.scss:3204`).

**Mobile button order matters** (`frontend.scss:150-204`): below 768px the footer
becomes a full-width column and **the primary/danger button moves to the top**
(`order: -1`), outline below. Replicate that in RN — it is the mobile convention
users already have.

### Tabs

**Segmented control — `.my-booking-tabs` (`_base.scss:3208-3257`) is the best
pattern in the codebase.** Use it as the RN model:

```
track:  #F3EFE9, padding 4, radius 120px, 1px solid #E5E2DC
item:   padding 8/16, #343331, 14/300, radius 120px
active: #FFFDFB fill, #913688 text, 14/600, 1px solid #E5E2DC,
        box-shadow 0 1px 4px 0 #0000001A
```

**Underline tabs** (`_dashboard.scss:269-315`): idle `#301432` at 500 with a
transparent 2px bottom border; active `#913688` + `2px solid #913688`; container
`border-bottom: .5px solid #BCB7B0`.

⚠️ That block is **copy-pasted five times** with five different border and idle
colours: `_home.scss:496-528` (identical), `_home.scss:1967-1998` (`#4D4A45` /
`#75726D` / 400), `_layout.scss:789-810` (`#5c505b`), `_dashboard.scss:339-359`
(`#C7BDC2` / `#5C505B`). **Standardise on the `_dashboard.scss:269` values.**

⚠️ Three pill-tab treatments too (`.my-booking-tabs` 14px, `.custom-pills-tab`
12px at radius 200px, `.nav-pills`). Standardise on `.my-booking-tabs`.

### Pagination

`.page-link` 40×40, radius 4, no border, `#4B4A47`; active →
`rgba(145,54,136,.25)` fill with `#913688` text (`_base.scss:227-256`).

⚠️ Disabled arrows are set to `#FFFDFB` on a `#F9F6F2` background
(`_base.scss:259-266`) — effectively invisible. **Use `#BCB7B0`.**
⚠️ Three separate pagination components exist; only
`Shared/DataTable/HealerListingPagination.vue` has ellipsis windowing and correct
disabled handling. RN should use infinite scroll instead.

### Empty states

Four near-identical files (`Cards/EmptyEvents.vue:3`, `EmptyStateEventCard.vue:3`,
`EmptyStateBookedEventCard.vue:3`, `ComingSoonEventCard.vue:3`):

```
min-height 440px, background #F2EFEA, radius 4, no border
logo images/Symbol_Logo_P.png at 158×115
heading 22/600 centred, body 16/400 centred
```

⚠️ They disagree on background (`#F9F6F2` vs `#F2EFEA`), heading size (22 vs 18),
and body weight (400 vs 300); only one has a CTA. There are also copy typos
("will **sow** up here"). **Build one `EmptyState`:** `#F2EFEA`, min-height 440,
radius 8, heading 18/600, body 16/300, optional primary button.

### Skeletons

`resources/sass/_skelton.scss`: base `#DDDBDD` with a white-gradient shimmer
sweep. Presets — icon 20 (sm 10, xl 36), heading 170×20, text 70%×20, label
20%×15, input 100%×25, button 100×30, avatar 40×40 circle.

⚠️ The shimmer animation is **5 seconds** (`:29`) — far too slow to read as
loading; 1.5s is conventional. ⚠️ The avatar preset uses `#E0E0E0` while every
other box uses `#DDDBDD`. ⚠️ `Cards/EventCardSkelton.vue:8` has a typo —
`class="skelton-box"`, missing the `e` — so that placeholder renders as an
invisible void. **Use `#DDDBDD` throughout and a 1.5s shimmer.**

### Star ratings

⚠️ **Four different golds ship simultaneously:**

| Colour | Where |
| --- | --- |
| `#FFD055` | `vue-star-rating` library default — no override exists in `resources/sass/` |
| `#FFC107` | Bootstrap `text-warning`, because `$warning` was never overridden (`Cards/HealerCard.vue:25-34`) |
| `#FFCC4D` | Inline style (`Healers/HealerCard.vue:38`) |
| `#F5D812` | Inline on the *parent* of `<star-rating>` — a no-op, it cannot reach the SVG fills (`Businesses/BusinessCard.vue:28`) |

Five sizes: 14, 18, 20, 25, 30. Empty star is `#BCB7B0`.

**Recommendation:** one `Rating` component. Single gold token **`#FFCC4D`** (the
warm brand-consistent one, closest to the library default), empty `#BCB7B0`,
three sizes — 14 (compact), 20 (card), 25 (interactive).

---

## 6. Screen patterns

### ⚠️ Before anything else: `resources/js/Pages/` is dead code

The brief pointed at `resources/js/Pages/` as the screen-level layouts. **It is an
abandoned Inertia-era tree.** `resources/js/Pages/Healers/Listing.vue` imports
`@/Layouts/AppLayout.vue`, `@/Layouts/AppIncludes/Navbar.vue` and
`@/components/PageHeader.vue` — **none of those files exist**
(`resources/js/Layouts/` is absent; `@` resolves to `resources/js` per
`webpack.mix.js:28`). Only four files under `Pages/` are actually imported by
`resources/js/app.js` (the `*Inertia.vue` create/edit forms, which are ordinary
Vue components despite the name).

**The live frontend is Blade views mounting globally-registered Vue components.**
`resources/js/app.js:265-341` registers ~120 of them; the Blade view is a
ten-line wrapper. Example — `resources/views/frontend/events.blade.php` is just
`<events-listing-page :categories=… :event_max_price=… >`.

**Mirror the components listed below, not the `Pages/` tree.**

### 6.1 Listing / search — `resources/js/components/EventsListing.vue` (3,952 lines)

Mounted at `/all-events`. **This one screen is the entire marketplace search** —
healers are not a separate listing. `main_tabs` (`:2287`) is
`Events | Practitioners | Organizers | Businesses`.

Top to bottom:

1. **Full-bleed hero carousel** (`:3-37`) — `vue3-carousel`, wrap-around, image
   height **148 / 152 (≥768) / 176 (≥1199)**, `object-fit: cover`. Overlaid title
   block vertically centred, padding 16 (32 ≥1199). Heading
   36 / 48 (≥768) / 64 (≥1199) at weight 300, colour `#F9F6F2`; sub 16 / 18.
2. **Main tab strip** — rendered **three times** for different viewports
   (`:57-89` mobile, `:90-101` desktop). Track `#F3EFE9` with `1px solid #E5E2DC`;
   each tab 40px tall, padding 8/16, 14px (13px below 768)
   (`_base.scss:2409+` `.radio-input-event`).
   On mobile a **44×44 circular filter button** sits left of a horizontally
   scrolling tab strip; when filters are active it gains a `border-secondary`
   ring plus a 16px `#913688` dot badge.
3. **Two-column body** (`:103`) — `<aside class="col-md-4 col-xl-3">` filters
   (`d-none d-md-block`) + `<main class="col-md-8 col-xl-9">` results.
   **Below 768px the sidebar is hidden entirely.**
4. **Filter sidebar order** (`:106-1039`): header row `Filter` (24/700) +
   `Clear all` (`#913688`, 400) → segmented pill `All / In-person / Online` →
   accordions: Event type → Date → Business type → Sort by → Price (incl. Free)
   → Distance (Km/Miles) → Profile badges → Language → Categories (with
   Show More truncation and a keyword box). Checkboxes are **24×24** here.
5. **Sort** — ⚠️ the desktop "Sort by:" row above the grid (`:1042-1105`) is
   **entirely commented out**. Live sort is the multiselect *inside* the sidebar
   (`:460`) and its duplicate in the mobile offcanvas (`:1514`). Default
   `'upcoming'` for events, `'default'` elsewhere.
6. **Result grid** (`:1108-1141`) — Events tab `col-lg-4` (**1 col < 992px,
   3 cols ≥ 992px**); Practitioner/Organizer/Business tabs `col-lg-6` (**1 col,
   then 2**). Gutters are Bootstrap default **24px horizontal**, `mb-4` = 24px
   vertical. Skeletons: 6 tiles for events, 12 for people. Empty state at 440px
   min-height.
   **For RN: single column, 16px gutters** — the phone case is already 1-up.
7. **Pagination, not infinite scroll** (`:1146`) — a centred row *below* the
   two-column row. Page size **6** (`mixins/PaginationMixin.vue:14`).
   ⚠️ `Shared/TablePagination.vue` renders **every** page number with no
   windowing. **RN should use infinite scroll** — `PaginationMixin` already
   exposes an unused `loadMore()`.
8. **Mobile filters = full-height left offcanvas** (`:1152`) — `offcanvas-start`,
   100% height, header `#F9F6F2` with a 28px title and a 24×24 SVG close on an
   `#EFEBE5` rounded-square. ⚠️ It **duplicates the entire sidebar tree**
   (`:1152-2020`, ~870 lines) rather than sharing a component. Build it once in RN.

### 6.2 Detail — `resources/js/components/TempEventDetail.vue` (5,805 lines)

⚠️ **Use `TempEventDetail.vue`, not `EventDetail.vue`.** `app.js:212` has the
`EventDetail` import **commented out** in favour of `TempEventDetail` on `:213`.
The two are near-identical 5,700-line files and edits have been landing in both.

1. **Back button** (`:4`) — above everything, outside the container. Transparent,
   18×15 left-arrow SVG in `#913688`, label 16/300.
2. **Hero — a single image, no gallery** (`:11-58`). Radius 6 (32 ≥768),
   height **200px mobile / 461px ≥768px**, `object-fit: cover`, fallback
   `images/event_default.webp`. (An image gallery *does* exist, but on the
   **profile** page, not here.)
3. **Two-column body** (`:139`) — `col-md-8` main / `col-md-4` rail.
   **Single column below 768px**; no `lg`/`xl` refinement, so the rail stays ⅓
   even at 1400px.
4. **Section order**, each in `.card.event-detail-card`
   (`_event_single.scss:22` → `#FFFDFB`, `1px solid #E5E2DC`, radius 16):
   Title (24, 28 ≥1199, weight 600) → Refund & Cancellation → Details → Where +
   map → Host block → Reviews (heading 40/600, summary tile + **3-up grid of the
   first 6**) → Your host → Language → Age requirement → When → Where *again* →
   Instructions.
   ⚠️ "Where" appears twice (`:363` and `:744`) and peer section headings use
   20 / 28 / 40 inconsistently. **Standardise on 24.**
5. **Sticky booking panel** (`:791-929`) — this is the most important pattern to
   port:
   - **Desktop:** `position: sticky; top: 115px` (`_base.scss:2404`) — 80px
     header + 35px.
   - **≤667px:** becomes a **floating bottom bar** —
     `position: fixed; bottom: 49px; width: 94%; left: 13px` — sitting 49px up to
     clear the mobile tab bar (`_mobresponsive.scss:338`).
   - Contents: left = date line (14/300 `#4D4A45`) or a status string
     (`Event sold out` / `Choose a date:` / `No upcoming events` /
     `Ticket sales have ended`); right = `Free` / `Free + Paid` / `From $X`;
     below, one full-width primary button with **eight mutually exclusive
     states**.
   ⚠️ Its inline style contains **four sequential `box-shadow:` declarations** —
   only the last (`0px 5px 9px 0px #0000001F`) applies. Do not port the dead three.
6. **Related items** — "More events from this host", 3-up. ⚠️ **The entire block
   is commented out** in the live file, so related events currently do not render.
7. **No top-level tabs** on the detail page. Bootstrap tabs appear only inside modals.
8. **Everything transactional is a modal, not a route.** `#ticketModal` (`:1672`)
   is a five-screen wizard driven by an `activeScreen` variable:
   `select-ticket` → `select-recurring-dates` → `review-and-confirm` →
   `payment-info` → `ticket-info`. Plus review, message, report, ticket-assign
   ×4, purchase-success and share modals. **In RN these should become real
   navigation screens**, not modals — the wizard is exactly what a native stack
   navigator is for.

### 6.3 Profile — `resources/js/components/Organizers/OrganizerProfile.vue` (3,830 lines)

One component serves **organizers, healers and businesses**
(`FrontendController.php:3625` → `frontend/orgDetail.blade.php:91`). The consumer
profile is the much smaller `Seekers/SeekerProfile.vue` (509 lines).

1. **Cover** (`:73`) — height **120 / 200 (≥768) / 280 (≥1199)**, `cover`,
   centred, default `#F9F6F2` (`_profile.scss:10`).
2. **Overlapping avatar** — two separate elements, desktop and mobile:
   - Desktop (`:96`): 120 / 160 (≥768) / **240 (≥1199)**, radius 16, white 4px
     pad, `shadow`, inline `margin-top: -20%`.
   - Mobile (`:121`): 120px, radius 16, inline `margin-top: -11%`.
   ⚠️ **Four competing overlap systems**, and the inline percentages lose:
   `_base.scss:180-194` sets `.avatar-2 { margin-top: -100px !important }` below
   991px and `-75px !important` below 576px, and `!important` in a stylesheet
   beats a non-important inline style. `_profile.scss:333`
   (`.custom-avatar-width` → 288px avatar, `-125px` / `-70px`) and
   `_profile.scss:407` (`.upgrade-profile-info`, `-180px` / `-94px`) are two more.
   **For RN: avatar 120px, overlapping the cover by 75px** — i.e. the cover is
   120 tall and the avatar's centre sits on its bottom edge. That is the ≤576px
   rule, which is the phone case.
3. **Header meta** — location (`bi-geo-alt`), gender, language chips (`#EFEBE5`,
   padding 3/8, 11px, `#4D4A45`), star row (`#FFCC4D`) + review count, then
   `profile-tags`: `Certified | Co-Creation | Energy exchange` separated by
   `border-right: 2px solid #E5E2DC` (`_profile.scss:131`).
4. **Actions** — Edit (own profile) / Follow ↔ Following (toggles primary ↔
   outline) / Message / Share. ≤768px these become **42×42 circular buttons
   absolutely positioned** at the cover's bottom-right
   (`_profile.scss:36` `.mobile-fixed-icons`).
5. **Tabs — rendered three times again** (`:180`, `:201`, `:214`):
   `Overview | Offerings | Events | Reviews | Media`.
   ⚠️ **These are scroll-spy anchors, not tab panes** — every section is in the
   DOM simultaneously and clicking scrolls to it (`:3242-3300`).
   **Recommendation for RN: make them real tabs.** Rendering five full sections
   at once is exactly the thing that will make a native list feel slow.
   Visual style (`_profile.scss:236`): idle `#75726D` at 500 with a transparent
   2px bottom border; active `#913688` + `2px solid #913688`; container
   `border-bottom: 1px solid #E5E2DC`; disabled `opacity: .2`.
6. **Sections:** `#overview-section` (About, address, languages; 32px vertical
   margin, 16 below 1199) → `#media-section` (the real image gallery) →
   `#offering-section` (services, with a **Morning / Afternoon / Evening** slot
   picker at `:1835-1895` and a payment pill group at `:2136`) →
   `#events-section` → `#reviews-section`. Review cards: `#FFFDFB`, radius 16,
   `1px solid #E5E2DC` (`_profile.scss:398`).
7. **Mobile sticky CTA** — `.mobile-fixed-bottom` (`_profile.scss:60`), ≤768px:
   fixed to the bottom, full width, **min-height 82px**, `#FFFDFB`,
   `border-top: 1px solid #BCB7B0`, centred. A `.mobile-fixed-expand` variant
   stacks a second bar at `bottom: 82px`.

### 6.4 Global chrome

**Header** (`resources/views/frontend/layout/header.blade.php`, `_navbar.scss:171`):
`position: fixed`, **80px tall at every breakpoint**, background `#FFFDFB`,
`shadow-sm`, `z-index: 10`. Body offset `.main { padding-top: 80px }`
(`_layout.scss:895`). Horizontal padding 16 (30 ≥1200, 0 ≤375).

Logo sits left. ⚠️ `.logo { width: 210px }` but **259px below 576px** — the logo
gets *bigger* on phones (`_navbar.scss:185`). Source is a DB setting with
`/images/logo.png` as fallback.

⚠️ **The mobile "hamburger" is the user's avatar**, not a menu icon
(`header.blade.php:110`) — a 40×40 circle with `1px solid #6F6C67` opening the
offcanvas. A `.navbar-toggler-icon` with a three-line SVG is defined
(`_navbar.scss:16`) but its markup is commented out.

Logged out, the right rail is **Log In** (text) + **Sign Up** (primary button).
Logged in, a 42×42 circular bell with a `#913688` unread badge (20px, 11px text,
offset `-5px/-5px`) plus a user dropdown. Dropdown panels: min-width 320, radius
8, no border, header 16/600 with a `#BCB7B0` underline, items 16/500 at 6px 15px.

**Mobile bottom tab bar** — this is what the RN tab bar must match:

```html
<div class="mobile-bottom-menu d-xl-none w-100 bg-white border-top py-2 position-fixed bottom-0" style="z-index:100">
```

Each item is an icon over a label: `<i class="bi fs-1">` (22px) over
`<span class="fs-6 fw-light text-muted">` (12px/400). Items for a seeker:
**Home** (`bi-house-door`, filled when active), **Wishlist** (`bi-heart`),
**Bookings**. Explore (`bi-search`) and Dashboard (`bi-speedometer2`) exist but
are commented out.

⚠️ **Only rendered when authenticated.** ⚠️ **Defined six times** across the
frontend and dashboard footers, with two different breakpoints (`d-xl-none` =
1200px in the frontend, `d-lg-none` = 992px in the dashboard). ⚠️ Its body
clearance class `.bottom-nav-enabled { margin-bottom: 50px }` is **commented out
at every call site**, so screens compensate ad hoc — which is why `.card-position`
hardcodes `bottom: 49px` and `.p-32` adds `padding-bottom: 80px`. In RN, use the
tab bar height plus safe-area inset and delete all of that.

**Offcanvas menu** (`_offcanvas.scss`): slides from the **right**, 400px wide,
background `#F9F6F2`, left corners radius 8. Header 80px with a bottom border;
identity block = 48×48 avatar (`1px solid #BCB7B0`) + display name (600,
truncated at 180px) + an account-switcher collapse. Items are 8px-padded flex
rows with a fixed **40px icon column** (`bi` at 22px, `#343331`) and a 16px label.

**Footer** (`frontend/layout/footer.blade.php`): background **`#431B43`** — a
plum distinct from `$primary`. Brand block uses `images/new_msn.svg` at 275px
(85% below 1199) with a white 300-weight tagline. Column headings 18px, links
16/300.

⚠️ `resources/views/frontend/profile.blade.php` still contains **Tailwind**
classes (`pb-20 bg-scroll min-h-screen object-cover w-full`) from an even earlier
stack. Ignore it.

---

## 7. Iconography

**Bootstrap Icons 1.11.3** is the dominant set — **1142 `bi bi-*` usages** across
`resources/js/components/` and `resources/js/Pages/`. Loaded from CDN:

```
resources/views/frontend/layout/header.blade.php:1
https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css
```

Most-used: `exclamation-circle-fill` (171), `info-circle` (138),
`exclamation-circle` (67), `chevron-right` (44), `star-fill` (39), `trash` (31),
`check-circle` (30), `geo-alt-fill` (28), `people` (26), `chevron-left` (26),
`clock` (25), `calendar-check` (22), `search` (19), `pencil` (18).

**Also loaded, effectively unused on the frontend:**
- **FontAwesome 6.1.1** from CDN (`master.blade.php:126`) — **0 frontend usages**.
  Its ~550 hits are all under `resources/views/admin/**`, plus one leak at
  `frontend/eventDetail.blade.php:127`. Not needed in the app.
- **Ionicons** — `public/frontend/fonts/ionicons.woff/woff2` (116 KB) and
  `ionicons.min.css` ship and are still `<link>`ed from three legacy templates,
  with **zero `ion-*` usages anywhere**. Fully dead weight.

**Inline SVG** — 759 `<svg>` occurrences in the Vue tree (a further 113 in Blade
views), used for anything Bootstrap Icons lacks and for multi-colour marks. The
split is generational: older code reaches for `bi`, the newest code
(`TempEventDetail.vue`, `EventsListing.vue`, `Cards/EventCard.vue`, the offcanvas
close buttons) reaches for inline SVG. Both appear in the same file — 
`Cards/HealerCard.vue` uses `bi-star-fill` for ratings but `<img>` SVGs for badges.

⚠️ **There is no icon component anywhere in the codebase.** No `Icon.vue`, no
`SvgIcon.vue`, no sprite. Every inline SVG is hand-pasted with literal
`width`/`height`/`viewBox`, and fills are **hard-coded hex** (`fill="#913688"`,
`stroke="#913688"`, `fill="#4D4A45"`) rather than `currentColor` — so they cannot
inherit text colour or respond to state. The same share-icon path is duplicated
verbatim across three files.

**This is the highest-value thing to fix in the port: build one
`<Icon name size color />` and drive fills from a prop.**

### Where assets live

| Path | Contents |
| --- | --- |
| `resources/js/images/` | 125 files (54 SVG). Subdirs `account/`, `common/`, `flags/`, `home/`, `icons/`. Webpack-bundled, referenced `@/images/…` |
| `resources/js/images/icons/` | **47 files — the de-facto icon library.** `healer_icon.svg`, `event_icon.svg`, `business_icon.svg`, `retreat_icon.svg`, `experience_icon.svg`, `badge-verified.svg`, socials, payment marks |
| `public/images/` | **207 files — the live runtime assets**, served via the `$asset()` global (`app.js:143`) |
| `public/frontend/` | Legacy theme drop. Mostly inert |
| `resources/js/components/images/` | ⚠️ **A byte-for-byte duplicate of `resources/js/images/`.** Dead tree from a bad copy — do not migrate it |

⚠️ **There is no naming convention; five styles coexist** in `public/images/`:
`PascalCase_With_Underscores` (`Logo_Horizontal.png`), `snake_case`
(`new_msn.svg`), `kebab-case` (`msn-logo.svg`), bare lowercase (`avatar.svg`),
and — critically — **literal spaces, parentheses and ampersands**:
`Vector (Stroke) (1).png`, `Eventright Background.png`, `Logo_Vertical_B&P.png`.
**Those will break `require()` in a React Native bundler.** Rename on import.

Also expect numeric-suffix cruft (`avatar.png / avatar1.svg / avatar2.svg`,
`logo.png / logo1.png / logo123.png`) and three near-duplicate MSN marks
(`msn-icon.png`, `msn-icon.svg`, `msn_icon.svg` — two SVGs differing only by a
hyphen).

**Logos — six-plus competing marks.** The one that matters:

| File | Role |
| --- | --- |
| `public/images/new_msn.svg` | **The current wordmark** — footer, 275px |
| `public/images/Symbol_Logo_P.png` | The symbol glyph, used in empty states at 158×115 |
| `public/images/Symbol_Logo_W.png`, `Symbol_Round_W.png` | White / reversed symbol |
| `public/images/logo.png` | Header + favicon *fallback* only |
| `Logo_Horizontal*.png`, `Logo_Vertical*.png`, `msn-logo.*`, `logo1.png`, `logo123.png` | Unreferenced brand-kit dump and orphans — ignore |

⚠️ The runtime header logo is **not** a file at all by default — it is
`getSettingValue('logo')`, a DB setting, with `/images/logo.png` as fallback. The
RN app should ship `new_msn.svg` and `Symbol_Logo_P.png` as static assets rather
than replicate the DB indirection.

"Eventright" in several filenames is the white-label product this was forked from.

**Recommendation for RN:** `react-native-bootstrap-icons` or an SVG sprite
generated from the Bootstrap Icons set, so the icon vocabulary matches the web
1:1. Bring the 47 local SVGs across via `react-native-svg-transformer`. Drop
FontAwesome and Ionicons entirely.

---

## 8. Does not translate to React Native

Honest accounting of what cannot come across:

| Web treatment | Problem | What to do instead |
| --- | --- | --- |
| `box-shadow` spread radius (`-1px` in both card shadows) | RN has no spread | Trim `shadowRadius` slightly; the RN shadow reads marginally wider |
| CSS blur radius | iOS `shadowRadius` is a Gaussian sigma, ≈ half the CSS blur | `shadowRadius = blur / 2`, already applied in the token file |
| Android shadows | `elevation` ignores colour, offset and radius | The plum tint is **lost on Android**. Values are eyeballed matches; consider a 1px border instead of a shadow for parity |
| `inset` shadow on `.btn-secondary:active` | No RN equivalent | Use `opacities.pressed` or the darker `accentPressed` fill |
| Multiple shadows on `.card-hover-state:hover` | RN takes one shadow per view | Use `shadows.raised` alone |
| `:hover` on cards, buttons, pills | No hover on touch | Map to pressed state |
| `:focus-visible` ring (`outline: 2px solid #913688`) | RN has no outline; no keyboard focus on phones | Preserve as the **focused input border** — 2px `#913688` |
| `-webkit-line-clamp` (`.line-clamp-1/2/3`) | Not a style in RN | `numberOfLines` prop on `<Text>` |
| `aspect-ratio` | Supported in modern RN, but not identically | `aspectRatio` style prop; values in `aspectRatios` |
| `backdrop-filter: blur(4px)` (`.backdrop-filter-color`, `_base.scss:966`) | No CSS filters | `expo-blur` `<BlurView>`, or a flat `overlay` scrim |
| CSS variables (`--primary_color`, `--bs-btn-*`) | No cascade in RN | Resolved to literals in the token file |
| `rem` / `%` / `vh` / `dvh` units | RN is unitless density-independent pixels | Numbers; `Dimensions` / `useWindowDimensions` for viewport maths |
| Media-query breakpoints (`fs_11 fs_md_14`) | No media queries | Phone value chosen; `useWindowDimensions` if tablet support is needed |
| `!important` (every JIT rule) | No specificity system | Style array order |
| Variable-font weight axis (DM Sans `wght 100..1000`) | RN cannot interpolate axes | Discrete static instances via `fontFamilies` |
| Sticky positioning (sticky booking panel, sticky header) | No `position: sticky` | The web already solves this below 667px — the booking panel becomes `position: fixed; bottom: 49px`. Port **that** treatment: an absolutely-positioned bottom bar above the tab bar |
| `scrollbar` styling (`::-webkit-scrollbar`) | Not applicable | Native indicators |

---

## 9. Judgement calls made

Summary of every place the source was ambiguous and a decision was required.

1. **Ignored `tailwind.config.js` entirely.** It is dead code with a palette that
   appears nowhere in the shipped UI. Following the brief literally here would
   have produced the wrong product.
2. **`#913688` over `#923688`** — 326 usages beat 26, and the focus rules already
   agree with the majority.
3. **Danger split** — `#AD2121` for text/borders, `#BD4D4D` for large fills.
   Both ship; this preserves contrast where it matters.
4. **Success is `#186429` on `#D4EDDA`**, not the declared-but-unused
   `$success: #28a745`.
5. **Rating gold is `#FFCC4D`**, chosen from the four that ship because it is the
   warmest and closest to the library default.
6. **Kept the shifted weight ladder** (300/400/500 for lighter/light/normal).
   Normalising it would change the app's texture everywhere.
7. **Preserved 300-weight button labels** for fidelity, but flagged 500 as a
   recommended deviation for phone legibility. Design should decide.
8. **Button radius 4px**, resolving the 4 / 8 / 16 three-way conflict in favour
   of the SCSS declaration over ad-hoc call-site utilities.
9. **Card radius 8px** (250 usages) over the 16px used by the five content cards.
10. **Screen padding and card gap are 16, not 32** — following the app's own
    `@media (max-width: 575.98px)` collapse in `_utilities.scss`.
11. **Line heights computed**, since the source almost never declares them.
12. **Dark theme fully derived** and labelled as such. Not extraction.
13. **Ignored `resources/js/Pages/` entirely** — like `tailwind.config.js`, it was
    named in the brief but is dead code importing files that do not exist. The
    live screens are the globally-registered Vue components in
    `resources/js/components/`.
14. **Took `TempEventDetail.vue` as the canonical detail screen**, since
    `app.js:212` has the `EventDetail.vue` import commented out — despite the
    "Temp" name suggesting otherwise.
15. **Avatar overlap resolved to 120px avatar / 75px overlap** — the `!important`
    stylesheet rule beats the inline `-11%`, and 576px is the phone case. Four
    competing systems existed.
16. **Recommended real tabs over the web's scroll-spy** on the profile screen.
    Faithful would mean rendering five full sections at once, which is exactly
    what makes a native list feel slow. This is a deliberate divergence.
17. **Recommended infinite scroll over numbered pagination**, and real navigation
    screens over the five-step modal wizard. Both are places where copying the
    web would produce a worse native app; both are flagged rather than silently
    changed.
18. **Did not port known bugs:** the suppressed input focus ring, the
    unreadable duplicate `.drafted` badge, the invisible disabled pagination
    arrows, the inverted avatar `v-if`, the `skelton-box` typo, the 5s shimmer,
    the four-declaration `box-shadow`, or the `borde_top_…` typo that silently
    kills nine dividers in the event-detail files.

---

## 10. Fastest path to visual parity

If you only implement five things, implement these — they carry most of the
recognition:

1. **Warm neutrals.** `#F9F6F2` page, `#FFFDFB` cards, `#E5E2DC` borders,
   `#615E59` secondary text. Never a cool grey.
2. **`#913688` purple** on filled buttons, active tabs and links.
3. **DM Sans** at 16 base / 14 secondary / 24 section heading, with the shifted
   weight ladder.
4. **Card shell:** `#FFFDFB`, `1px #E5E2DC`, radius 8, padding 16, plum-tinted
   shadow.
5. **44px buttons at radius 4**, and **46px inputs at radius 4**.

And structurally, the three screens the app is actually made of:

- **Search** — one screen with four tabs (Events / Practitioners / Organizers /
  Businesses), a segmented tab track on `#F3EFE9`, single-column cards at 16px
  gutters, filters behind a 44×44 circular button that gains a `#913688` dot when
  active.
- **Detail** — 200px hero, stacked `#FFFDFB` section cards at radius 16, and a
  fixed bottom booking bar above the tab bar.
- **Profile** — 120px cover with a 120px avatar overlapping it by 75px, meta row,
  five tabs, `#FFFDFB` section cards, fixed bottom CTA at 82px.
