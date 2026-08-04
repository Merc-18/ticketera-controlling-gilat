-- ============================================================
-- FIX SEGURIDAD SUPABASE: Habilitar RLS en todas las tablas
-- Proyecto ID: qbxbwolimraldscbpax
-- Ejecutar en Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qbxbwolimraldscbpax/sql/new
-- ============================================================

-- 1. HABILITAR RLS EN TODAS LAS TABLAS DEL ESQUEMA PÚBLICO
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tags') THEN
    EXECUTE 'ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;';
  END IF;
END $$;


-- 2. POLÍTICAS DE ACCESO PARA CADA TABLA

-- ── 2.1 USERS ──
DROP POLICY IF EXISTS "Authenticated users can read users" ON public.users;
CREATE POLICY "Authenticated users can read users" ON public.users FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can update any user" ON public.users;
CREATE POLICY "Admins can update any user" ON public.users FOR UPDATE TO authenticated USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'superadmin'))
);

DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "Allow user creation" ON public.users;
CREATE POLICY "Allow user creation" ON public.users FOR INSERT TO authenticated WITH CHECK (true);


-- ── 2.2 REQUESTS ──
DROP POLICY IF EXISTS "Public select requests" ON public.requests;
CREATE POLICY "Public select requests" ON public.requests FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert requests" ON public.requests;
CREATE POLICY "Public insert requests" ON public.requests FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update requests" ON public.requests;
CREATE POLICY "Authenticated update requests" ON public.requests FOR UPDATE TO authenticated USING (true);


-- ── 2.3 PROJECTS ──
DROP POLICY IF EXISTS "Public and auth select projects" ON public.projects;
CREATE POLICY "Public and auth select projects" ON public.projects FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated modify projects" ON public.projects;
CREATE POLICY "Authenticated modify projects" ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ── 2.4 PROJECT FLOWS ──
DROP POLICY IF EXISTS "Public and auth select project_flows" ON public.project_flows;
CREATE POLICY "Public and auth select project_flows" ON public.project_flows FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated modify project_flows" ON public.project_flows;
CREATE POLICY "Authenticated modify project_flows" ON public.project_flows FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ── 2.5 CHECKLIST ITEMS ──
DROP POLICY IF EXISTS "Public and auth select checklist_items" ON public.checklist_items;
CREATE POLICY "Public and auth select checklist_items" ON public.checklist_items FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated modify checklist_items" ON public.checklist_items;
CREATE POLICY "Authenticated modify checklist_items" ON public.checklist_items FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ── 2.6 COMMENTS ──
DROP POLICY IF EXISTS "Authenticated select comments" ON public.comments;
CREATE POLICY "Authenticated select comments" ON public.comments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated modify comments" ON public.comments;
CREATE POLICY "Authenticated modify comments" ON public.comments FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ── 2.7 ACTIVITY LOGS ──
DROP POLICY IF EXISTS "Authenticated select activity_logs" ON public.activity_logs;
CREATE POLICY "Authenticated select activity_logs" ON public.activity_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated insert activity_logs" ON public.activity_logs;
CREATE POLICY "Authenticated insert activity_logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (true);


-- ── 2.8 NOTIFICATIONS ──
DROP POLICY IF EXISTS "Users view own notifications" ON public.notifications;
CREATE POLICY "Users view own notifications" ON public.notifications FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Authenticated users insert notifications" ON public.notifications;
CREATE POLICY "Authenticated users insert notifications" ON public.notifications FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (auth.uid() = user_id);


SELECT 'Row Level Security (RLS) habilitado exitosamente en todas las tablas.' AS resultado;
