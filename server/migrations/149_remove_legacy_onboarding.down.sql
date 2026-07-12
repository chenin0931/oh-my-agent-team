ALTER TABLE "user"
  ADD COLUMN onboarded_at TIMESTAMPTZ,
  ADD COLUMN onboarding_questionnaire JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN cloud_waitlist_email VARCHAR(254),
  ADD COLUMN cloud_waitlist_reason TEXT,
  ADD COLUMN starter_content_state TEXT;
