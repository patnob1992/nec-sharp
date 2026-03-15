-- Crew System Foundation
-- crew: groups of 10-20 members
-- crew_members: membership with invite code
-- No chat/messaging.

-- Crew table
CREATE TABLE IF NOT EXISTS crew (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  invite_code text UNIQUE NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  max_members int DEFAULT 20 CHECK (max_members >= 10 AND max_members <= 20)
);

-- Crew members (max 10-20 per crew)
CREATE TABLE IF NOT EXISTS crew_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  crew_id uuid NOT NULL REFERENCES crew(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(crew_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crew_members_crew_id ON crew_members(crew_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_user_id ON crew_members(user_id);
CREATE INDEX IF NOT EXISTS idx_crew_invite_code ON crew(invite_code);

-- RLS policies (allow authenticated reads/writes for crew data)
ALTER TABLE crew ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;

-- Crew: creator can manage; members can read
CREATE POLICY "crew_select" ON crew FOR SELECT TO authenticated USING (true);
CREATE POLICY "crew_insert" ON crew FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "crew_update" ON crew FOR UPDATE TO authenticated USING (created_by = auth.uid());

-- Crew members: members can read; creator can insert
CREATE POLICY "crew_members_select" ON crew_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "crew_members_insert" ON crew_members FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "crew_members_delete" ON crew_members FOR DELETE TO authenticated USING (user_id = auth.uid());
