-- =============================================================================
-- MSN — 0009 · Reference data: the category tree
-- =============================================================================
-- Reference data only. No users, no events, no bookings — a migration runs in
-- production, and fake rows in a marketplace are indistinguishable from real
-- ones the moment someone searches. Demo content lives in
-- supabase/seed/demo_data.sql and is never applied by `db push`.
--
-- Two passes so children can resolve their parent by slug: parents first, then
-- a join against the rows that now exist. Both `on conflict (slug) do nothing`,
-- so re-running the file is a no-op and an admin's later edits to a name or
-- sort_order are never clobbered.
--
-- Categories are a two-level tree by design. The app's browse UI is a top-level
-- row of chips with a second-level sheet; a third level would have nowhere to
-- render. categories.parent_id permits deeper nesting if that changes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Top level
-- -----------------------------------------------------------------------------
insert into categories (slug, name, sort_order) values
  ('healing-bodywork',     'Healing & Bodywork',     10),
  ('movement',             'Movement',               20),
  ('mind-meditation',      'Mind & Meditation',      30),
  ('nutrition-lifestyle',  'Nutrition & Lifestyle',  40),
  ('ceremony-ritual',      'Ceremony & Ritual',      50),
  ('coaching',             'Coaching',               60),
  ('retreats',             'Retreats',               70),
  ('community',            'Community',              80)
on conflict (slug) do nothing;

-- -----------------------------------------------------------------------------
-- Second level
-- -----------------------------------------------------------------------------
-- sort_order restarts within each parent; it is only ever compared between
-- siblings.
insert into categories (slug, name, parent_id, sort_order)
select c.slug, c.name, p.id, c.sort_order
from (values
  -- Healing & Bodywork ------------------------------------------------------
  ('massage-therapy',        'Massage Therapy',            'healing-bodywork',    10),
  ('acupuncture',            'Acupuncture',                'healing-bodywork',    20),
  ('energy-healing',         'Reiki & Energy Healing',     'healing-bodywork',    30),
  ('sound-healing',          'Sound Healing',              'healing-bodywork',    40),
  ('reflexology',            'Reflexology',                'healing-bodywork',    50),
  ('craniosacral',           'Craniosacral Therapy',       'healing-bodywork',    60),
  ('chiropractic-osteopathy','Chiropractic & Osteopathy',  'healing-bodywork',    70),
  ('somatic-therapy',        'Somatic & Trauma Release',   'healing-bodywork',    80),

  -- Movement ----------------------------------------------------------------
  ('yoga',                   'Yoga',                       'movement',            10),
  ('pilates',                'Pilates',                    'movement',            20),
  ('qigong-tai-chi',         'Qigong & Tai Chi',           'movement',            30),
  ('dance-ecstatic',         'Dance & Ecstatic Movement',  'movement',            40),
  ('martial-arts',           'Martial Arts',               'movement',            50),
  ('mobility-stretch',       'Mobility & Stretching',      'movement',            60),
  ('strength-conditioning',  'Strength & Conditioning',    'movement',            70),
  ('outdoor-fitness',        'Outdoor & Nature Fitness',   'movement',            80),

  -- Mind & Meditation -------------------------------------------------------
  ('meditation',             'Meditation',                 'mind-meditation',     10),
  ('breathwork',             'Breathwork',                 'mind-meditation',     20),
  ('mindfulness',            'Mindfulness & MBSR',         'mind-meditation',     30),
  ('yoga-nidra-rest',        'Yoga Nidra & Deep Rest',     'mind-meditation',     40),
  ('hypnotherapy',           'Hypnotherapy',               'mind-meditation',     50),
  ('sound-meditation',       'Sound Meditation',           'mind-meditation',     60),
  ('integration-support',    'Integration Support',        'mind-meditation',     70),

  -- Nutrition & Lifestyle ---------------------------------------------------
  ('nutrition-diet',         'Nutrition & Diet',           'nutrition-lifestyle', 10),
  ('herbalism',              'Herbalism',                  'nutrition-lifestyle', 20),
  ('ayurveda',               'Ayurveda',                   'nutrition-lifestyle', 30),
  ('traditional-chinese',    'Traditional Chinese Medicine','nutrition-lifestyle',40),
  ('fasting-cleansing',      'Fasting & Cleansing',        'nutrition-lifestyle', 50),
  ('sleep-recovery',         'Sleep & Recovery',           'nutrition-lifestyle', 60),
  ('cooking-workshops',      'Cooking & Food Workshops',   'nutrition-lifestyle', 70),

  -- Ceremony & Ritual -------------------------------------------------------
  ('cacao-ceremony',         'Cacao Ceremony',             'ceremony-ritual',     10),
  ('shamanic-journeying',    'Shamanic Journeying',        'ceremony-ritual',     20),
  ('sweat-lodge',            'Sweat Lodge & Temazcal',     'ceremony-ritual',     30),
  ('seasonal-rituals',       'Seasonal & Lunar Rituals',   'ceremony-ritual',     40),
  ('rites-of-passage',       'Rites of Passage',           'ceremony-ritual',     50),
  ('ancestral-work',         'Ancestral & Lineage Work',   'ceremony-ritual',     60),
  ('astrology-divination',   'Astrology & Divination',     'ceremony-ritual',     70),

  -- Coaching ----------------------------------------------------------------
  ('life-coaching',          'Life Coaching',              'coaching',            10),
  ('wellness-coaching',      'Health & Wellness Coaching', 'coaching',            20),
  ('career-purpose',         'Career & Purpose',           'coaching',            30),
  ('relationship-intimacy',  'Relationship & Intimacy',    'coaching',            40),
  ('grief-transition',       'Grief & Life Transition',    'coaching',            50),
  ('parenting-family',       'Parenting & Family',         'coaching',            60),
  ('creative-coaching',      'Creativity & Expression',    'coaching',            70),
  ('financial-wellbeing',    'Financial Wellbeing',        'coaching',            80),

  -- Retreats ----------------------------------------------------------------
  ('day-retreats',           'Day Retreats',               'retreats',            10),
  ('weekend-retreats',       'Weekend Retreats',           'retreats',            20),
  ('residential-retreats',   'Residential Retreats',       'retreats',            30),
  ('silent-retreats',        'Silent Retreats',            'retreats',            40),
  ('wilderness-retreats',    'Wilderness & Nature',        'retreats',            50),
  ('detox-retreats',         'Detox & Reset',              'retreats',            60),
  ('teacher-training',       'Teacher Training',           'retreats',            70),

  -- Community ---------------------------------------------------------------
  ('circles-sharing',        'Circles & Sharing',          'community',           10),
  ('workshops-talks',        'Workshops & Talks',          'community',           20),
  ('support-groups',         'Support Groups',             'community',           30),
  ('markets-fairs',          'Markets & Wellness Fairs',   'community',           40),
  ('volunteering-service',   'Volunteering & Service',     'community',           50),
  ('youth-family',           'Youth & Family',             'community',           60),
  ('online-community',       'Online Gatherings',          'community',           70)
) as c(slug, name, parent_slug, sort_order)
join categories p on p.slug = c.parent_slug
on conflict (slug) do nothing;

comment on table categories is
  'Two-level tree seeded by 0009. Top-level rows have parent_id null. Slugs are the stable identifier — names and sort_order are editable by admins, slugs are not.';
