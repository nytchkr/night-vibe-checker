ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

DO $$
BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_role_check CHECK (role IN ('user', 'admin'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS profiles_role_idx
  ON public.profiles(role);
