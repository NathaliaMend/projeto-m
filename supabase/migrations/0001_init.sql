-- Plataforma de Avaliação de Compreensão (metáforas)
-- Schema completo. Rode no SQL Editor do Supabase, UMA VEZ, num projeto novo e
-- ANTES de `npm run seed`. Não há CLI de migração configurada.
--
-- ATENÇÃO: usa `create table if not exists`. Se você já rodou uma versão
-- ANTERIOR deste arquivo, as tabelas existentes são mantidas como estão e as
-- colunas novas NÃO são criadas — em silêncio, sem erro. O app só quebra depois,
-- em runtime. Nesse caso, apague as tabelas antes e rode de novo:
--
--   drop table if exists public.answers, public.tests,
--                        public.questions, public.applicators cascade;

-- ==========================================================================
-- applicators: perfil 1:1 com auth.users (o aplicador que faz login)
-- ==========================================================================
create table if not exists public.applicators (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  email text,
  created_at timestamptz not null default now()
);

alter table public.applicators enable row level security;

drop policy if exists "applicators_select_own" on public.applicators;
create policy "applicators_select_own" on public.applicators
  for select using (auth.uid() = id);

drop policy if exists "applicators_insert_own" on public.applicators;
create policy "applicators_insert_own" on public.applicators
  for insert with check (auth.uid() = id);

drop policy if exists "applicators_update_own" on public.applicators;
create policy "applicators_update_own" on public.applicators
  for update using (auth.uid() = id);

-- Cria o perfil automaticamente quando um usuário se cadastra no Auth.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.applicators (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ==========================================================================
-- questions: banco de perguntas (populado por `npm run seed`)
-- ==========================================================================
-- `code` é a CHAVE NATURAL ("A1B01", "A1B01-E2-EQ3") e o seed faz upsert por
-- ela. Sem `code`, o seed precisaria apagar e reinserir, gerando UUIDs novos e
-- quebrando a FK answers.question_id — re-semear depois do go-live destruiria
-- os dados coletados. Não volte para delete+insert.
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  bank text not null check (bank in ('A1', 'A2', 'B')),
  metaphor_number int not null,
  -- Só no banco B: a metáfora da A1 que este item treina. É também o id da
  -- ETAPA de aplicação (ver lib/stages.ts). Em A1/A2 é sempre null.
  parent_metaphor_code text,
  etapa int,          -- só no banco B: 1 Causalidade, 2 Semelhança, 3 Compreensão
  etapa_label text,   -- NÃO confundir com a ETAPA de aplicação (lib/stages.ts)
  step text,          -- proveniência da planilha, ex. "causalidade_veiculo1"
  order_index int not null,
  metaphor text,
  context text,       -- história / frases de contexto (é o texto que vira áudio)
  phrases jsonb,      -- etapa 2 da B: as frases separadas, para exibir em linhas
  image_key text,     -- ex.: "faseA/01.jpg" (relativo a /images)
  question_text text not null,
  options jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists questions_bank_order_idx
  on public.questions (bank, order_index);

create index if not exists questions_parent_metaphor_idx
  on public.questions (parent_metaphor_code)
  where parent_metaphor_code is not null;

alter table public.questions enable row level security;

-- Qualquer usuário autenticado (o aplicador) pode ler as perguntas.
drop policy if exists "questions_select_authenticated" on public.questions;
create policy "questions_select_authenticated" on public.questions
  for select to authenticated using (true);

-- ==========================================================================
-- tests: uma avaliação de um aluno (o que o dashboard lista)
-- ==========================================================================
-- current_stage: em qual ETAPA de aplicação o teste parou. As 6 fases viram 9
-- etapas porque a Fase B é aplicada uma metáfora por dia:
--
--   A → A1B01 → A1B03 → A1B05 → AR1 → A1B07 → A1B09 → AR2 → C
--
-- A fase não responde isso: dentro da B1 ela fica em 'B1' do primeiro ao último
-- dia de treino. Ver STAGES em lib/stages.ts.
--
-- É CACHE PURO, derivado de `answers` — a fonte de verdade é sempre `answers`, e
-- quem escreve aqui é só recomputeProgress (app/tests/actions.ts). Serve ao
-- badge do dashboard, para ele não ter que ler as respostas de todo mundo.
--
-- SEM CHECK dos 9 valores, de propósito: os ids de treino são códigos de
-- metáfora vindos das planilhas. Um CHECK faria uma mudança de protocolo
-- (treinar A1B02, digamos) virar erro no meio da aplicação, na frente da
-- criança, até alguém rodar um ALTER à mão — em troca de proteger o texto de um
-- badge. E nem pegaria typo: Test.current_stage é `string`, porque STAGES é
-- derivado de PHASES em runtime.
create table if not exists public.tests (
  id uuid primary key default gen_random_uuid(),
  applicator_id uuid not null references auth.users (id) on delete cascade,
  student_name text not null,
  student_birth_date date,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'completed')),
  current_stage text not null default 'A',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists tests_applicator_created_idx
  on public.tests (applicator_id, created_at desc);

alter table public.tests enable row level security;

drop policy if exists "tests_all_own" on public.tests;
create policy "tests_all_own" on public.tests
  for all using (auth.uid() = applicator_id)
  with check (auth.uid() = applicator_id);

-- ==========================================================================
-- answers: uma linha por pergunta respondida
-- ==========================================================================
-- A, AR1 e AR2 aplicam AS MESMAS perguntas (banco A1). O que separa as três
-- medições é a chave (test_id, phase, question_id) — por isso `phase` faz parte
-- do unique.
--
-- Semântica, escolhida para o dado continuar medindo compreensão:
--   is_correct    acertou na PRIMEIRA tentativa  <- é ESTA a medida
--   attempts      quantas tentativas usou (1..3; fora da Fase B é sempre 1)
--   solved        chegou na correta dentro do limite
--   selected_key  a PRIMEIRA escolha
--   selected_keys todas as escolhas, em ordem
--   presented     a pergunta como a criança VIU (ver abaixo)
-- Se as tentativas seguintes sobrescrevessem is_correct, todo mundo acertaria
-- 100% na Fase B e o dado perderia o valor.
create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests (id) on delete cascade,
  phase text not null check (phase in ('A', 'B1', 'AR1', 'B2', 'AR2', 'C')),
  question_id uuid not null references public.questions (id),
  -- A foto do momento da aplicação. Não é cópia redundante de `questions`: o
  -- que a criança viu é DERIVADO — a ordem das alternativas sai de
  -- shuffleOptions(optionSeed(...)) e a condição sem suporte contextual sai de
  -- orderSeed(...), ambos semeados pelo test_id; e o seed reescreve `questions`
  -- por `code`, NO LUGAR. Sem esta foto, mexer no sorteio ou corrigir o typo de
  -- uma planilha muda em silêncio o significado de respostas já coletadas.
  -- Conteúdo: PresentedQuestion, em lib/types.ts. Gravada só na PRIMEIRA
  -- tentativa e nunca sobrescrita.
  presented jsonb not null,
  selected_key text not null,
  selected_keys jsonb,
  is_correct boolean not null,
  -- Sem default, de propósito: obriga quem escreve a ser explícito.
  solved boolean not null,
  attempts int not null default 1 check (attempts between 1 and 3),
  answered_at timestamptz not null default now(),
  unique (test_id, phase, question_id)
);

-- Sem índice separado por test_id: o `unique` acima já cria um índice com
-- test_id como coluna líder, que atende todo `where test_id = ?` do app. Um
-- índice a mais seria só custo de escrita.

alter table public.answers enable row level security;

drop policy if exists "answers_all_own" on public.answers;
create policy "answers_all_own" on public.answers
  for all
  using (
    exists (
      select 1 from public.tests t
      where t.id = answers.test_id and t.applicator_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.tests t
      where t.id = answers.test_id and t.applicator_id = auth.uid()
    )
  );

-- RLS decide quais linhas podem ser acessadas, mas os papéis também precisam
-- ter privilégios SQL nas tabelas. O service_role é usado pelo seed; o papel
-- authenticated é usado pelo aplicador no app.
grant usage on schema public to authenticated, service_role;
grant select, insert, update on public.applicators to authenticated;
grant select on public.questions to authenticated;
grant select, insert, update, delete on public.tests, public.answers to authenticated;
grant all on public.questions, public.tests, public.answers to service_role;
