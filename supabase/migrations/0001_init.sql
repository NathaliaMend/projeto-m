-- Plataforma de Avaliação de Compreensão (metáforas)
-- Rode este script no SQL Editor do seu projeto Supabase (uma única vez).

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
-- questions: banco de perguntas (seed a partir dos documentos)
-- ==========================================================================
create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  bank text not null check (bank in ('A1', 'A2', 'B')),
  metaphor_number int not null,
  step text,
  order_index int not null,
  metaphor text,
  context text,
  image_key text,
  question_text text not null,
  options jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists questions_bank_order_idx
  on public.questions (bank, order_index);

alter table public.questions enable row level security;

-- Qualquer usuário autenticado (o aplicador) pode ler as perguntas.
drop policy if exists "questions_select_authenticated" on public.questions;
create policy "questions_select_authenticated" on public.questions
  for select to authenticated using (true);

-- ==========================================================================
-- tests: uma tentativa de avaliação de um aluno (o que o dashboard lista)
-- ==========================================================================
create table if not exists public.tests (
  id uuid primary key default gen_random_uuid(),
  applicator_id uuid not null references auth.users (id) on delete cascade,
  student_name text not null,
  student_birth_date date,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  current_phase text not null default 'A' check (current_phase in ('A', 'B', 'C')),
  current_index int not null default 0,
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
-- answers: respostas por fase (permite retomar de onde parou)
-- ==========================================================================
create table if not exists public.answers (
  id uuid primary key default gen_random_uuid(),
  test_id uuid not null references public.tests (id) on delete cascade,
  phase text not null check (phase in ('A', 'B', 'C')),
  question_id uuid not null references public.questions (id),
  selected_key text not null,
  is_correct boolean not null,
  answered_at timestamptz not null default now(),
  unique (test_id, phase, question_id)
);

create index if not exists answers_test_idx on public.answers (test_id);

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
