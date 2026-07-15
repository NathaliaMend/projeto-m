# Avaliação de Compreensão (metáforas)

Plataforma para avaliar a compreensão de metáforas em crianças, através de um
questionário em 3 fases (A → B → C). Construída com **Next.js 16 (App Router, SSR)**,
**Supabase** (Auth + Postgres, sem backend próprio) e **Tailwind CSS**. A interface do
questionário é responsiva (celular/tablet) e inspirada no Duolingo, com reprodução de
áudio das perguntas e opções via TTS do navegador (Web Speech API, pt-BR).

## Personas

- **Aplicador** — faz login, cadastra alunos, acompanha os testes, exporta CSV.
- **Aluno** — responde o questionário no dispositivo entregue pelo aplicador (não faz login).

## Fases da avaliação

- **Fase A** — 10 metáforas (história + pergunta + imagem). Sem feedback por pergunta;
  tela de "Parabéns" ao final da fase.
- **Fase B** — ~60 perguntas em etapas (Causalidade → Semelhança → Compreensão), com
  frases/história de contexto e **feedback "acertou/errou"** por pergunta.
- **Fase C** — repete as 10 perguntas da Fase A.

As alternativas são **embaralhadas de forma estável** por pergunta (a correta não cai
sempre na mesma posição). O teste **retoma de onde parou**; é possível **recomeçar do zero**
ou **excluir** o teste.

## Configuração

### 1. Crie um projeto no Supabase

Em <https://supabase.com>, crie um projeto. Em **Project Settings → API**, copie:
`Project URL`, a chave `anon` e a chave `service_role`.

### 2. Variáveis de ambiente

```bash
cp .env.local.example .env.local
# preencha NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY
```

### 3. Crie as tabelas

No **SQL Editor** do Supabase, rode o conteúdo de
[`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql).

> Para facilitar os testes, em **Authentication → Providers → Email**, você pode
> desativar "Confirm email" — assim a conta do aplicador já entra direto após o cadastro.

### 4. Popule as perguntas

```bash
npm run seed
```

Isso lê `data/questions.json` (gerado a partir dos documentos originais) e insere as
perguntas das fases. As imagens da Fase A já estão em `public/images/faseA/`.

### 5. Rode o app

```bash
npm run dev
```

Acesse <http://localhost:3000>, crie a conta do aplicador em **/login** e comece.

## Estrutura

- `app/` — páginas (dashboard, login, cadastro, detalhes e runner do questionário) e a
  rota de exportação CSV (`app/api/tests/export`).
- `lib/` — clientes Supabase (`lib/supabase`), tipos, configuração das fases, embaralhamento
  determinístico e utilitários da avaliação.
- `proxy.ts` — protege as rotas do aplicador e renova a sessão (antigo `middleware`, renomeado no Next 16).
- `supabase/migrations/` — schema SQL + RLS.
- `scripts/seed.mjs` — popula a tabela `questions`.
- `data/questions.json` — perguntas extraídas dos documentos (bancos `A1`, `A2` e `B`).

## Notas

- As imagens da **Fase B** ainda não existem: o runner só mostra imagem quando a pergunta
  tem `image_key`. Para adicioná-las, coloque os arquivos e preencha `image_key` nas
  perguntas do banco `B`.
- O banco `A2` (teste de generalização) já está carregado para uso futuro, mas a Fase C
  atualmente repete o banco `A1`.
