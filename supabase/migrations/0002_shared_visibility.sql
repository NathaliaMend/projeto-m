-- Visibilidade compartilhada entre avaliadores
-- ============================================================================
-- Rode no SQL Editor do Supabase (não há CLI). Depende de 0001_init.sql.
--
-- Antes: cada avaliador só enxergava os PRÓPRIOS alunos/testes/respostas
-- (política `*_all_own`). Agora a equipe toda LÊ tudo (pesquisa colaborativa) e
-- o dashboard oferece o filtro "Meus alunos". A ESCRITA continua restrita ao
-- dono: quem cadastrou o aluno/criou o teste é quem pode editar/apagar.
--
-- Como funciona: políticas permissivas são combinadas com OR. Mantemos uma
-- política de escrita restrita ao dono (`for all ... using(dono)`) e ADICIONAMOS
-- uma de leitura para todo autenticado (`for select ... using(true)`). No SELECT
-- as duas se somam -> todos leem; no insert/update/delete só vale a do dono.

-- applicators: liberar leitura do nome/e-mail dos colegas, para o dashboard
-- rotular de quem é cada aluno. Escrita continua só do próprio perfil.
drop policy if exists "applicators_select_own" on public.applicators;
drop policy if exists "applicators_select_authenticated" on public.applicators;
create policy "applicators_select_authenticated" on public.applicators
  for select to authenticated using (true);

-- students: leitura para todos; escrita só do dono.
drop policy if exists "students_all_own" on public.students;
drop policy if exists "students_select_authenticated" on public.students;
create policy "students_select_authenticated" on public.students
  for select to authenticated using (true);
drop policy if exists "students_write_own" on public.students;
create policy "students_write_own" on public.students
  for all to authenticated
  using (auth.uid() = applicator_id)
  with check (auth.uid() = applicator_id);

-- tests: leitura para todos; escrita só do dono.
drop policy if exists "tests_all_own" on public.tests;
drop policy if exists "tests_select_authenticated" on public.tests;
create policy "tests_select_authenticated" on public.tests
  for select to authenticated using (true);
drop policy if exists "tests_write_own" on public.tests;
create policy "tests_write_own" on public.tests
  for all to authenticated
  using (auth.uid() = applicator_id)
  with check (auth.uid() = applicator_id);

-- answers: leitura para todos (relatórios e CSV da equipe); escrita só de quem
-- é dono do teste.
drop policy if exists "answers_all_own" on public.answers;
drop policy if exists "answers_select_authenticated" on public.answers;
create policy "answers_select_authenticated" on public.answers
  for select to authenticated using (true);
drop policy if exists "answers_write_own" on public.answers;
create policy "answers_write_own" on public.answers
  for all to authenticated
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
