-- Fase B: repetir a pergunta ATÉ a criança acertar
-- ============================================================================
-- Rode no SQL Editor do Supabase (não há CLI). Depende de 0001.
--
-- Antes: `answers.attempts` tinha CHECK (between 1 and 3) e a Fase B parava em 3
-- tentativas. Agora a pergunta se repete até o acerto, e `attempts` guarda o
-- TOTAL de tentativas até acertar (sem teto). Só mantemos attempts >= 1.
-- (Fases A/AR/C continuam com 1 tentativa — isso é regra do app, não do banco.)
alter table public.answers drop constraint if exists answers_attempts_check;
alter table public.answers
  add constraint answers_attempts_check check (attempts >= 1);
