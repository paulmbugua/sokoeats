ALTER TABLE org_fee_structures
  ADD COLUMN IF NOT EXISTS scope_type text,
  ADD COLUMN IF NOT EXISTS scope_value text;

-- Backfill from description " ... | Scope: <type> <value>"
UPDATE org_fee_structures
SET
  scope_type = LOWER(SPLIT_PART(TRIM(SPLIT_PART(description, 'Scope:', 2)), ' ', 1)),
  scope_value = NULLIF(
    BTRIM(SUBSTR(
      TRIM(SPLIT_PART(description, 'Scope:', 2)),
      LENGTH(SPLIT_PART(TRIM(SPLIT_PART(description, 'Scope:', 2)), ' ', 1)) + 2
    )),
    ''
  ),
  description = BTRIM(REGEXP_REPLACE(description, '\s*\|\s*Scope:.*$', '', 'i'))
WHERE
  description ILIKE '%Scope:%'
  AND (scope_type IS NULL OR scope_value IS NULL);

CREATE INDEX IF NOT EXISTS idx_org_fee_structures_scope
  ON org_fee_structures(org_id, is_active, scope_type, scope_value);
