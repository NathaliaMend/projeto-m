-- Reestruturação do protocolo de aplicação. Rode no SQL Editor do Supabase,
-- depois de 0001_init.sql e antes de `npm run seed`.
--
-- Três mudanças:
--   1. `questions.code` — chave natural estável ("A1B01", "A1B01-E2-EQ3").
--   2. Novas fases — a A1 é reaplicada depois de A1B05 e de A1B09.
--   3. `answers` guarda as tentativas — na Fase B a criança tenta até 3 vezes.

-- ==========================================================================
-- 1. questions: chave natural + campos da estrutura de etapas
-- ==========================================================================
-- Sem `code`, o seed precisa apagar e reinserir tudo, gerando UUIDs novos a
-- cada vez — o que quebra a FK answers.question_id. Com `code` único, o seed
-- vira upsert e re-semear passa a ser seguro.
alter table public.questions add column if not exists code text;
alter table public.questions add column if not exists etapa int;
alter table public.questions add column if not exists etapa_label text;
alter table public.questions add column if not exists parent_metaphor_code text;
alter table public.questions add column if not exists phrases jsonb;

-- Linhas antigas (semeadas antes desta migração) não têm `code` e serão
-- substituídas pelo seed novo. Como ainda não há dados de produção, apagamos.
delete from public.questions where code is null;

alter table public.questions alter column code set not null;

do $$ begin
  alter table public.questions add constraint questions_code_key unique (code);
exception when duplicate_table then null;
end $$;

create index if not exists questions_parent_metaphor_idx
  on public.questions (parent_metaphor_code)
  where parent_metaphor_code is not null;

-- ==========================================================================
-- 2. Fases: A → B1 → AR1 → B2 → AR2 → C
-- ==========================================================================
--   A    banco A1  10 perguntas   (linha de base)
--   B1   banco B   36             (metáforas A1B01, A1B03, A1B05 × 3 etapas)
--   AR1  banco A1  10             (reaplicação depois de A1B05)
--   B2   banco B   24             (metáforas A1B07, A1B09 × 3 etapas)
--   AR2  banco A1  10             (reaplicação depois de A1B09)
--   C    banco A2  10             (banco novo, metáforas diferentes)
--                 ---
--                 100 passos
alter table public.tests drop constraint if exists tests_current_phase_check;
alter table public.tests add constraint tests_current_phase_check
  check (current_phase in ('A', 'B1', 'AR1', 'B2', 'AR2', 'C'));

alter table public.answers drop constraint if exists answers_phase_check;
alter table public.answers add constraint answers_phase_check
  check (phase in ('A', 'B1', 'AR1', 'B2', 'AR2', 'C'));

-- Testes em andamento apontam para fases que não existem mais ('B').
delete from public.answers where phase not in ('A', 'B1', 'AR1', 'B2', 'AR2', 'C');
update public.tests
   set current_phase = 'A', current_index = 0, status = 'in_progress', completed_at = null
 where current_phase not in ('A', 'B1', 'AR1', 'B2', 'AR2', 'C');

-- ==========================================================================
-- 3. answers: tentativas (Fase B permite até 3)
-- ==========================================================================
-- Semântica, escolhida para o dado continuar medindo compreensão:
--   is_correct    acertou na PRIMEIRA tentativa  <- a medida
--   attempts      quantas tentativas usou (1..3)
--   solved        chegou na correta dentro do limite
--   selected_key  a PRIMEIRA escolha (mantido: o export CSV já usa)
--   selected_keys todas as escolhas, em ordem
-- Nas fases sem repetição (A/AR/C) attempts é sempre 1 e solved = is_correct.
alter table public.answers add column if not exists attempts int not null default 1;
alter table public.answers add column if not exists solved boolean;
alter table public.answers add column if not exists selected_keys jsonb;

alter table public.answers drop constraint if exists answers_attempts_check;
alter table public.answers add constraint answers_attempts_check
  check (attempts between 1 and 3);

update public.answers set solved = is_correct where solved is null;
alter table public.answers alter column solved set not null;
