ALTER TABLE issue_subscriber DROP CONSTRAINT issue_subscriber_reason_check;
ALTER TABLE issue_subscriber ADD CONSTRAINT issue_subscriber_reason_check
    CHECK (reason IN ('creator', 'assignee', 'commenter', 'mentioned', 'manual', 'autopilot'));

DROP TABLE IF EXISTS issue_advisor_invocation;
