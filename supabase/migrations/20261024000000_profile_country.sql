-- Country on the profile. Sellers and buyers declare where they are based; listings default to
-- that country's marketplace, and sellers may add international destinations separately.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country CHAR(2) NOT NULL DEFAULT 'HU';

-- Backfill anyone who picked a country in their profile/sign-up metadata before this landed.
UPDATE public.profiles p
SET country = upper(u.raw_user_meta_data->>'country')
FROM auth.users u
WHERE p.id = u.id
  AND u.raw_user_meta_data->>'country' ~ '^[A-Za-z]{2}$';

-- New accounts get the country they picked at sign-up (passed in the auth metadata) instead of
-- always defaulting to Hungary.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, display_name, avatar_url, role, is_admin, country)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        'user',
        false,
        COALESCE(NULLIF(upper(NEW.raw_user_meta_data->>'country'), ''), 'HU')
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
