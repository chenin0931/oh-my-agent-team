ALTER TABLE "user"
  DROP COLUMN IF EXISTS onboarded_at,
  DROP COLUMN IF EXISTS onboarding_questionnaire,
  DROP COLUMN IF EXISTS cloud_waitlist_email,
  DROP COLUMN IF EXISTS cloud_waitlist_reason,
  DROP COLUMN IF EXISTS starter_content_state;
