/**
 * Why someone reports another person or listing.
 *
 * A fixed list rather than a free-text box, for three reasons: a moderator can
 * sort a queue by reason and cannot sort prose; a person under stress picks
 * faster than they write; and it sets the boundary of what MSN will act on, so
 * nobody files a complaint about a practitioner running late expecting a ban.
 *
 * `detail` stays open underneath — the reason routes it, the words explain it.
 *
 * The wording is deliberately about BEHAVIOUR, not about the person. "Made me
 * feel unsafe" is something a reporter can be sure of; "is dangerous" is a
 * verdict only the moderator gets to reach.
 *
 * Stored as the `reason` text column on `reports`, so these strings ARE the
 * data. Renaming one silently splits the history for that reason in two —
 * change the label and the moderator's view of the past changes with it. Add
 * new ones freely; edit existing ones only on purpose.
 */
export interface ReportReason {
  /** Written to `reports.reason`. Stable — see above. */
  value: string;
  /** What the reporter reads. */
  label: string;
  /** One line, so the list can be scanned without guessing. */
  hint: string;
}

export const PERSON_REPORT_REASONS: readonly ReportReason[] = [
  {
    value: 'Off platform payment',
    label: 'Asked me to pay outside the app',
    hint: 'Offered a discount for cash, a bank transfer or a personal link.',
  },
  {
    value: 'Made me feel unsafe',
    label: 'Made me feel unsafe',
    hint: 'Anything in a session or a message that crossed a line.',
  },
  {
    value: 'Misleading claims',
    label: 'Claims that are not true',
    hint: 'Qualifications, training or results that do not hold up.',
  },
  {
    value: 'Did not happen',
    label: 'The session never happened',
    hint: 'They did not turn up, or cancelled and kept the money.',
  },
  {
    value: 'Spam or scam',
    label: 'Spam or a scam',
    hint: 'Repeated unwanted messages, or an attempt to defraud.',
  },
  {
    value: 'Something else',
    label: 'Something else',
    hint: 'Tell us in your own words below.',
  },
] as const;

export const LISTING_REPORT_REASONS: readonly ReportReason[] = [
  {
    value: 'Misleading claims',
    label: 'The description is misleading',
    hint: 'It promises something the session does not deliver.',
  },
  {
    value: 'Inappropriate content',
    label: 'Inappropriate content',
    hint: 'Words or images that do not belong on MSN.',
  },
  {
    value: 'Not a real listing',
    label: 'This is not a real listing',
    hint: 'A test, a duplicate, or an advert for something else.',
  },
  {
    value: 'Unsafe',
    label: 'It looks unsafe',
    hint: 'A health, safety or safeguarding concern about what is offered.',
  },
  {
    value: 'Something else',
    label: 'Something else',
    hint: 'Tell us in your own words below.',
  },
] as const;
