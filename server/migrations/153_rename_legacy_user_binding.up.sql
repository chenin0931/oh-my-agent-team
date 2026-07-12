DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'channel_user_binding'
          AND column_name = 'multica_user_id'
    ) AND NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'channel_user_binding'
          AND column_name = 'omat_user_id'
    ) THEN
        ALTER TABLE channel_user_binding
            RENAME COLUMN multica_user_id TO omat_user_id;
    END IF;
END $$;
