-- Reports: record WHAT was decided, not just that someone decided.
--
-- `resolved_at` and `resolved_by` say a moderator closed the report. They do
-- not say whether the report was upheld. After resolution, "we suspended this
-- practitioner" and "we looked and this was nothing" are indistinguishable —
-- so the second report about the same person cannot be weighed against the
-- first, which is exactly when that history matters most. A pattern of five
-- dismissed reports and a pattern of five upheld ones look identical.

create type report_outcome as enum (
  'upheld',      -- the report was right; we acted on the subject
  'dismissed',   -- we looked; there was nothing to act on
  'duplicate'    -- already handled under another report
);

alter table reports
  add column outcome         report_outcome,
  add column resolution_note text;

-- Resolution is all-or-nothing: a closed report must say what was decided, and
-- an open one must not carry a verdict. Without this, a moderator could stamp
-- `resolved_at` and leave `outcome` null, which is the state this migration
-- exists to eliminate.
alter table reports
  add constraint report_resolution_is_complete check (
    (resolved_at is null and outcome is null)
    or (resolved_at is not null and outcome is not null)
  );

comment on column reports.outcome is
  'What was decided. Null while the report is open. Enforced complete by report_resolution_is_complete.';
comment on column reports.resolution_note is
  'Moderator''s reasoning, for whoever reads the next report about this person. Internal — never shown to the reporter or the subject.';

-- The history lookup this is all for: prior reports about the same subject.
create index reports_subject_profile_resolved_idx
  on reports (subject_profile_id, resolved_at desc nulls first)
  where subject_profile_id is not null;
