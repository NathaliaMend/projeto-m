-- Tempo por tentativa e historico de recomeços de sub-etapa.
-- Rode no SQL Editor do Supabase depois das migracoes anteriores.
--
-- O indice ativo e parcial: o upsert com onConflict nao e inferivel para este
-- indice. O app deve atualizar a linha ativa ou inserir explicitamente.
alter table public.answers
  add column if not exists durations_ms int[] not null default '{}',
  add column if not exists history boolean not null default false,
  add column if not exists attempt_round int not null default 1;

alter table public.answers
  drop constraint if exists answers_test_id_phase_question_id_key;

create unique index if not exists answers_active_unique
  on public.answers (test_id, phase, question_id)
  where not history;
