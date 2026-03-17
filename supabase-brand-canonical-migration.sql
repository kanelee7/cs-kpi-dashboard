BEGIN;

-- 1) voc_insights: canonical brand calculation + duplicate cleanup
WITH mapped AS (
  SELECT
    id,
    week_start_date,
    generated_at,
    CASE
      WHEN brand IN ('brand-a', 'league of kingdoms', 'lok', 'lok_global') THEN 'league-of-kingdoms'
      WHEN brand IN ('brand-b', 'lok chronicle', 'lokc', 'chronicle') THEN 'lok-chronicle'
      WHEN brand IN ('brand-c', 'lok hunters', 'lokh', 'hunters') THEN 'lok-hunters'
      WHEN brand IN ('brand-d', 'arena-z', 'arena_z', '[az]', 'az') THEN 'arena-z'
      WHEN brand IN ('brand-e', 'the new order', 'new order', 'tno') THEN 'the-new-order'
      WHEN brand IS NULL OR TRIM(brand) = '' THEN 'unknown'
      ELSE LOWER(TRIM(brand))
    END AS canonical_brand,
    ROW_NUMBER() OVER (
      PARTITION BY
        CASE
          WHEN brand IN ('brand-a', 'league of kingdoms', 'lok', 'lok_global') THEN 'league-of-kingdoms'
          WHEN brand IN ('brand-b', 'lok chronicle', 'lokc', 'chronicle') THEN 'lok-chronicle'
          WHEN brand IN ('brand-c', 'lok hunters', 'lokh', 'hunters') THEN 'lok-hunters'
          WHEN brand IN ('brand-d', 'arena-z', 'arena_z', '[az]', 'az') THEN 'arena-z'
          WHEN brand IN ('brand-e', 'the new order', 'new order', 'tno') THEN 'the-new-order'
          WHEN brand IS NULL OR TRIM(brand) = '' THEN 'unknown'
          ELSE LOWER(TRIM(brand))
        END,
        week_start_date
      ORDER BY generated_at DESC, id DESC
    ) AS rn
  FROM voc_insights
),
to_delete AS (
  SELECT id FROM mapped WHERE rn > 1
)
DELETE FROM voc_insights v
USING to_delete d
WHERE v.id = d.id;

WITH mapped AS (
  SELECT
    id,
    CASE
      WHEN brand IN ('brand-a', 'league of kingdoms', 'lok', 'lok_global') THEN 'league-of-kingdoms'
      WHEN brand IN ('brand-b', 'lok chronicle', 'lokc', 'chronicle') THEN 'lok-chronicle'
      WHEN brand IN ('brand-c', 'lok hunters', 'lokh', 'hunters') THEN 'lok-hunters'
      WHEN brand IN ('brand-d', 'arena-z', 'arena_z', '[az]', 'az') THEN 'arena-z'
      WHEN brand IN ('brand-e', 'the new order', 'new order', 'tno') THEN 'the-new-order'
      WHEN brand IS NULL OR TRIM(brand) = '' THEN 'unknown'
      ELSE LOWER(TRIM(brand))
    END AS canonical_brand
  FROM voc_insights
)
UPDATE voc_insights v
SET brand = m.canonical_brand
FROM mapped m
WHERE v.id = m.id;

-- 2) ticket_overview_cache canonical brand update
UPDATE ticket_overview_cache
SET brand = CASE
  WHEN brand IN ('brand-a', 'league of kingdoms', 'lok', 'lok_global') THEN 'league-of-kingdoms'
  WHEN brand IN ('brand-b', 'lok chronicle', 'lokc', 'chronicle') THEN 'lok-chronicle'
  WHEN brand IN ('brand-c', 'lok hunters', 'lokh', 'hunters') THEN 'lok-hunters'
  WHEN brand IN ('brand-d', 'arena-z', 'arena_z', '[az]', 'az') THEN 'arena-z'
  WHEN brand IN ('brand-e', 'the new order', 'new order', 'tno') THEN 'the-new-order'
  WHEN brand IS NULL OR TRIM(brand) = '' THEN 'unknown'
  ELSE LOWER(TRIM(brand))
END;

COMMIT;
