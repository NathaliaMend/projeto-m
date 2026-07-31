-- Escrita compartilhada: a equipe aplica/continua QUALQUER teste
-- ============================================================================
-- Rode no SQL Editor do Supabase (não há CLI). Depende de 0001 + 0002.
--
-- 0002 liberou a LEITURA de tudo, mas a ESCRITA seguia restrita ao dono. Isso
-- deixou um buraco: um avaliador abre um teste de outro (agora visível), toca em
-- "Confirmar" e o INSERT em `answers` bate na RLS —
--   "new row violates row-level security policy for table answers"
-- e a aplicação trava na mesma pergunta. Como a avaliação é de uma EQUIPE (a
-- Fase C, por exemplo, é aplicada duas semanas depois, possivelmente por outro
-- avaliador), aplicar/continuar precisa ser compartilhado, não só ver.
--
-- `applicator_id` continua gravando QUEM criou o aluno/teste (é o que alimenta o
-- filtro "Meus alunos"), mas deixa de RESTRINGIR a escrita: qualquer avaliador
-- autenticado pode registrar respostas, atualizar o progresso, reiniciar, editar
-- e apagar. É o modelo de equipe de confiança, todos atrás de login.

-- answers: qualquer autenticado registra/atualiza/apaga respostas.
drop policy if exists "answers_write_own" on public.answers;
drop policy if exists "answers_write_authenticated" on public.answers;
create policy "answers_write_authenticated" on public.answers
  for all to authenticated using (true) with check (true);

-- tests: qualquer autenticado cria/atualiza (cache de progresso)/reinicia/apaga.
-- (O SELECT já é liberado por 0002; esta política também o cobre.)
drop policy if exists "tests_write_own" on public.tests;
drop policy if exists "tests_write_authenticated" on public.tests;
create policy "tests_write_authenticated" on public.tests
  for all to authenticated using (true) with check (true);

-- students: qualquer autenticado cadastra/edita/apaga aluno.
drop policy if exists "students_write_own" on public.students;
drop policy if exists "students_write_authenticated" on public.students;
create policy "students_write_authenticated" on public.students
  for all to authenticated using (true) with check (true);
