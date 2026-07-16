# Plano — snapshot da pergunta no momento da aplicação

## Contexto

Hoje `answers.selected_key` guarda só uma letra (`"a"`, `"c"`). O significado
dela mora em `questions.options`, e o seed faz **upsert por `code`, no lugar**
(`scripts/seed.mjs:82`). Corrigir um typo numa planilha e re-semear reescreve,
em silêncio, o sentido de respostas já coletadas — e o CSV
(`app/api/tests/export/route.ts:62`) resolve `selected_key` → texto lendo a
tabela `questions` **atual**, então o mesmo dado histórico passa a exportar
outro texto.

O motivo mais forte, porém, é outro: **o que a criança viu não está gravado em
lugar nenhum — é derivado.** A ordem das alternativas sai de
`shuffleOptions(optionSeed(testId, phase, questionId))` e a condição sem suporte
contextual (`hideContext`) sai de `orderSeed(testId, phase)`. Há duas pendências
abertas no `AGENTS.md` que mexem exatamente nesse sorteio (quais 5 metáforas vão
sem contexto; a Fase C sem `randomize`/`withoutContext`). No dia em que isso
mudar, deixa de ser possível reconstruir o que uma criança já avaliada viu —
inclusive **em qual condição experimental ela estava**.

O snapshot transforma um fato derivado em fato registrado. Para um experimento,
é a diferença entre reprodutível e não.

Tamanho é irrelevante: ~100 linhas × ~1 KB por criança.

## Decisões

- **Coluna `answers.presented jsonb not null`.** JSON porque o formato acompanha
  a pergunta, não o schema.
- **Gravado no servidor**, dentro de `submitAnswer`. O cliente não manda nada —
  mesmo princípio que o `AGENTS.md` já defende para `attempts` ("senão bastaria
  mentir para ganhar tentativas extras").
- **Só na primeira tentativa, nunca sobrescrito** — mesma regra de `is_correct`
  e `selected_key`.
- **`hide_context` explícito.** É o único campo que não dá para derivar depois, e
  carrega a condição experimental. Sem ele, `context: null` é ambíguo entre
  "escondido pela condição" e "esta pergunta nunca teve história" (os itens da
  Fase B marcados *"(Apenas a pergunta)"* nascem com `context` nulo).
- **Sem backfill.** Para uma linha antiga a informação está genuinamente
  perdida; inventar `'{}'` faria foto vazia passar por foto boa.
- **O export passa a ler o snapshot**, não a tabela viva — senão o snapshot vira
  enfeite.

### A chave da implementação

`submitAnswer` não precisa de query nova nem de dado do cliente:
`shuffleStep(step, testId)` (`lib/assessment.ts:88`) é **a mesma função** que
montou a tela em `app/tests/[id]/run/page.tsx:61`. Chamá-la no servidor
reproduz exatamente o que a criança viu — ordem sorteada das alternativas e
`context`/`phrases`/`image_key` já zerados na condição sem contexto. E
`recomputeProgress` já chama `getBanks` + `buildSteps`, então os dados já estão
à mão.

## Mudanças

1. **`supabase/migrations/0002_fases_e_tentativas.sql`** — seção 4 nova:
   ```sql
   alter table public.answers add column if not exists presented jsonb;
   alter table public.answers alter column presented set not null;
   ```
   Com a tabela vazia passa; com dados, falha alto — que é a resposta certa,
   é decisão de pesquisa, não de schema.

2. **`lib/types.ts`** — `PresentedQuestion` + `presented` em `Answer`. Campos:
   `code`, `metaphor`, `parent_metaphor_code`, `etapa`, `etapa_label`,
   `question_text`, `options` (na ordem exibida, com `is_correct`), `context`,
   `phrases`, `image_key`, `hide_context`.

3. **`app/tests/actions.ts`** — em `submitAnswer`, trocar a query direta a
   `questions` por `getBanks` → `buildSteps` → `find` do passo → `shuffleStep`.
   Deriva `correctKey` do resultado e monta o snapshot. `prev` passa a
   selecionar `presented`; upsert grava `prev?.presented ?? snapshot`.
   `recomputeProgress` recebe `steps` prontos (elimina um `getBanks`/`buildSteps`
   duplicado). Ganho extra: responder pergunta fora do protocolo passa a ser
   rejeitado.

4. **`app/api/tests/export/route.ts`** — ler de `a.presented`; `getBanks` e
   `questionById` saem, e o CSV deixa de depender de `questions`. Coluna nova
   `sem_contexto` (`hide_context`) — é o retorno prático do snapshot na análise.

5. **`app/tests/[id]/page.tsx:139-143`** — mesma troca. `questionById` sai;
   `byBank` continua, para o `buildSteps` do `phaseTotals`.

## Verificação

- `npx tsc --noEmit` e `npm run lint` (há 1 erro pré-existente em
  `app/preview/audio/page.tsx`, do commit inicial — não é regressão).
- Sem credenciais do Supabase não dá para exercitar `submitAnswer` de ponta a
  ponta. O que dá para verificar de graça: `/preview?phase=A` usa o mesmo
  `buildSteps`/`shuffleStep` e prova que o passo é encontrado e a ordem das
  alternativas é estável entre recarregamentos.
- Teste de mesa do ponto central: para um passo com `hideContext: true`,
  conferir que o snapshot sai com `context: null` **e** `hide_context: true`,
  e que `options` está na ordem sorteada (≠ ordem do banco).

## Fora de escopo (registrar, não fazer)

O snapshot resolve *"o registro continua interpretável para sempre"*. Não
resolve *"a criança vê o mesmo teste ao longo das semanas"*: re-semear no meio
do estudo muda o sorteio das etapas **ainda não aplicadas**, e a Fase C só
acontece 2 semanas depois. Isso exigiria congelar o plano inteiro em `tests` na
criação — decisão maior.
