<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# O que é este projeto

Plataforma de avaliação de compreensão de metáforas em crianças (pt-BR). Um
**aplicador** faz login, cadastra um **aluno** e aplica a avaliação num
tablet/celular. Next.js 16 + React 19 + Supabase (sem backend próprio).
Visual inspirado no Duolingo. `definir.md` tem o briefing original.

# O protocolo (a parte que mais custa redescobrir)

Fonte de verdade: **`Planejamento.xlsx`** (ordem de aplicação),
**`Perguntas da fase A1 e A2.xlsx`** e **`Planilha de itens Fase B.xlsx`**
(conteúdo). Os `.docx` na raiz são a versão ANTIGA — ignore, estão superados
pelas planilhas.

6 fases, 100 passos, definidas em `lib/phases.ts`:

```
A    A1  10  Linha de Base (LB): 10 metáforas, sem feedback
B1   B   36  treino de A1B01, A1B03, A1B05  (3 etapas × 4 perguntas cada)
AR1  A1  10  reaplicação da LB depois de A1B05
B2   B   24  treino de A1B07, A1B09
AR2  A1  10  reaplicação da LB depois de A1B09
C    A2  10  Generalização/manutenção — aplicada 2 SEMANAS depois (banco A2)
```

- **A, AR1, AR2 usam o mesmo banco (A1).** O que separa as respostas é a chave
  `(test_id, phase, question_id)` em `answers`.
- **As metáforas treinadas são as ímpares** (A1B01/03/05/07/09). As pares
  (02/04/06/08/10) nunca são treinadas — são o **grupo controle**. Qualquer
  mexida no sorteio precisa levar isso em conta.
- **Nas fases A1 e A2: ordem sorteada, 5 primeiras SEM história/imagem**
  (condição sem suporte contextual), 5 últimas com. `withoutContext: 5`.
- O sorteio é **determinístico por teste** (semente derivada do `testId`), nunca
  `Math.random()` — senão "continuar de onde parou" quebra e não dá para
  reproduzir o que a criança viu.
- Fase B: a pergunta **se repete até a criança acertar** (sem teto), com feedback
  em tela separada. `attempts` guarda o **total de tentativas até o acerto**.
- `"Não tenho certeza da resposta correta."` é sempre a **última** alternativa e
  **conta como erro**.

## O dado gravado em `answers` (semântica escolhida de propósito)

| coluna | significado |
|---|---|
| `is_correct` | acertou na **primeira** tentativa — **é esta a medida**; nunca sobrescrita |
| `attempts` | tentativas usadas (Fase B: total até acertar; demais: 1) |
| `solved` | chegou na correta dentro do limite |
| `selected_key` | a **primeira** escolha |
| `selected_keys` | todas as escolhas, em ordem |

Se as tentativas seguintes sobrescrevessem `is_correct`, todo mundo acertaria
100% na Fase B e o dado perderia o valor. A contagem de tentativas é feita **no
servidor** (`submitAnswer` lê a linha já gravada) — o cliente não manda o número
da tentativa, senão bastaria mentir para ganhar tentativas extras.

# Pipeline de dados

```
*.xlsx  →  npm run build-questions  →  data/questions.json  →  npm run seed  →  Supabase
                    ↑                          ↓
    data/gabarito-a1-a2.json          npm run gen-audio:openai → Storage question-media/audio/*.mp3
    data/correcoes.json
```

- **`data/gabarito-a1-a2.json`** — a planilha A1/A2 **não tem coluna de resposta
  correta** (só a da Fase B marca com `✔️` na coluna "Alternativa A"). O
  gabarito mora neste arquivo, mapeando código → coluna da planilha (F/G/H).
- **`data/correcoes.json`** — camada fina de correção de erros de digitação das
  planilhas (havia "because" no meio de um texto em português, travessão no
  lugar de aspas, etc.). O build **falha** se o trecho `de` não aparecer
  exatamente 1×, ou seja, avisa quando a planilha foi corrigida na origem e a
  entrada virou obsoleta.
- `scripts/build_questions.py` usa **só a biblioteca padrão** (`zipfile` +
  `xml.etree`) para ler `.xlsx` — não adicione dependência npm de xlsx. Um
  `.xlsx` é um zip; os textos ficam em `xl/sharedStrings.xml` e as células de
  `xl/worksheets/sheet1.xml` apontam para lá por índice (`t="s"`).

## Depois do import, o BANCO é a fonte de verdade do conteúdo
As planilhas + `build-questions` + `seed` são o **import inicial**. A partir daí,
o painel **`/questions`** edita o enunciado e as alternativas **direto no banco**
(`updateQuestion` em `app/questions/actions.ts`, RLS de update para autenticados).
Consequências:
- **Não rode `npm run seed` depois de começar a editar** — ele sobrescreveria as
  edições com o `data/questions.json` das planilhas. Só re-semeie num import
  proposital (e, aí, exportando antes o banco de volta para o JSON, se quiser
  manter o backup versionado).
- Editar só altera as aplicações **futuras**. Respostas já registradas guardam a
  foto `answers.presented` e não mudam — `submitAnswer` re-deriva a correção da
  tabela viva, então perguntas ainda-não-respondidas passam a valer a versão nova.
- Depois de editar o texto de uma pergunta, gere o áudio novo pelo botão
  **"Regerar áudio"** na tela `/questions` (`regenerateQuestionAudio` em
  `app/questions/actions.ts`): ele sintetiza na OpenAI e sobe para o Storage
  (`question-media/audio/<id>.mp3`, `upsert`). **Exige `OPENAI_API_KEY` no
  servidor** — o navegador não pode guardar a chave secreta. Até gerar, aquela
  pergunta toca na voz do navegador (o texto novo aponta para um mp3 que ainda
  não existe → fallback do `speech.tsx`).
- Para gerar/subir tudo de uma vez, use o script `npm run gen-audio:openai`
  (lê os textos do **banco**; sobe os mp3 locais de `public/audio/` e gera pela
  OpenAI só os que faltam; `FORCE=1` regenera tudo).
- O `/preview` continua lendo `data/questions.json` estático — **não** reflete
  edições do banco.

# Armadilhas que já custaram caro

## Áudio é endereçado pelo CONTEÚDO
`audioId(text)` = slug(50 chars) + hash. Os mp3 vivem no **Storage** (bucket
`question-media`, sob `audio/<id>.mp3`); `audioSrc(text)` (em `lib/audio.ts`)
monta a URL pública a partir de `NEXT_PUBLIC_SUPABASE_URL` (sem a variável — ex.:
`/preview` sem Supabase — cai para o estático `/public/audio`). **Mudar o texto
de uma pergunta aponta para um mp3 que não existe** e o app cai calado no TTS do
navegador — sem erro de build. Depois de editar, gere o áudio novo (botão
"Regerar áudio" ou `npm run gen-audio:openai`).

- `audioId` está **duplicado** em `lib/audio.ts` e `scripts/gen-audio-openai.mjs`
  (e o `INTRO_SPEECH`, em `Runner.tsx` + o script; a voz/modelo/instruções do TTS,
  em `lib/tts.ts` + o script). Divergir = áudio órfão silencioso ou voz diferente.
  Para conferir o `audioId` de verdade, transpile o `.ts` e compare a **saída**
  nos textos reais — comparar o código-fonte dá falso negativo por causa dos tipos.
- O hash é de **8 dígitos hex**. Era 4, mas com ~340 textos a chance de colisão
  passava de 50% (aniversário) — e colisão faz duas perguntas dividirem o mesmo
  áudio, em silêncio. Se aumentar de novo, **renomeie** os arquivos existentes
  em vez de regerar (economiza a API da OpenAI).
- O bucket `question-media` guarda **imagens e áudios** (imagens na raiz, áudios
  em `audio/`). Leitura pública (a criança não faz login), escrita só para
  autenticados. Ver `supabase/migrations/0004_question_media_bucket.sql`.

## Replicar `audioId` em Python dá errado
Em JS, `a ^ b` devolve **int32 com sinal**, então `h.toString(16)` pode gerar
`"-1a2b3c4d"` e o nome do arquivo fica com hash negativo (`...-bem---6ed.mp3`).
Uma réplica ingênua em Python (unsigned) produz IDs diferentes e faz parecer que
faltam centenas de áudios. **Para qualquer conta de áudio, rode em Node.**

## Reprodução automática em tablet
Tablets bloqueiam áudio disparado por timer — a fala precisa sair **de dentro do
gesto de toque**. É para isso que existe o par `suppressAuto`/`speakNow` em
`useGatedSpeech` (`speech.tsx`): quem fala no handler de clique marca o ref, e o
efeito de autoplay se cala para não tocar 2×. Não "simplifique" isso.

`useGatedSpeech` guarda **qual texto** já terminou (`spokenFor`), não um
booleano: com booleano, ao trocar de pergunta o `done` do passo anterior valeria
durante os ~250ms até a fala começar e a tela liberaria sozinha por um instante.
Tem uma trava de segurança por tempo (`speechTimeoutMs`) porque, se o áudio
falhar, a criança ficaria presa na tela para sempre.

## Segredo não pode chegar ao cliente
`run/page.tsx` tira `is_correct` das opções antes de hidratar, e `shuffleStep`
zera `context`/`phrases`/`image_key` **no servidor** nos passos sem contexto —
se fosse só esconder no CSS, a história viajaria no HTML e a condição
experimental estaria comprometida. `submitAnswer` re-deriva a correção do banco.
Ao mexer nisso, confira o HTML cru (`curl`), não a tela.

## Seed
`questions.code` é a chave natural (`A1B01`, `A1B01-E2-EQ3`) e o seed faz
**upsert por `code`**. Antes ele apagava e reinseria, gerando UUIDs novos e
quebrando a FK `answers.question_id` — re-semear depois do go-live destruiria os
dados. Não volte para delete+insert.

# Comandos

```bash
npm run build-questions    # .xlsx -> data/questions.json (valida e falha alto)
npm run seed               # data/questions.json -> Supabase (upsert por code)
npm run gen-audio:openai   # publica os mp3 no Storage: sobe os locais + gera os que faltam (FORCE=1 regera tudo)
npm run dev                # http://localhost:3000
npm run lint               # ver nota abaixo
```

`/preview?phase=A|B1|AR1|B2|AR2|C|all` roda o questionário **sem Supabase e sem
login** — é o caminho mais barato para testar o fluxo. `/tests/[id]/menu` é o
menu do aplicador (pular para uma fase ou metáfora).

# Notas de tecnologia

- **Migrações**: `supabase/migrations/*.sql` são rodadas **à mão** no SQL Editor
  do Supabase. Não há CLI configurada.
- **Lint (React 19 / Next 16)**: `react-hooks/set-state-in-effect` e
  "Cannot call impure function during render" são **erros**, não avisos. Nada de
  `setState` síncrono no corpo de efeito, nem `Math.random()` durante o render
  (sorteie num handler de evento). Existe 1 erro pré-existente em
  `app/preview/audio/page.tsx`, do commit inicial — não é regressão.
- **Testar o app de verdade**: não há Playwright/Puppeteer instalado, mas o
  Chrome está em `/Applications/Google Chrome.app`. Dá para dirigir com
  `npm i puppeteer-core --no-save` num diretório temporário e
  `executablePath` apontando para ele. No headless não há mp3 nem TTS, então
  quem libera as telas é a trava de tempo — isso é útil: testa justamente o
  caminho de falha de áudio. Clique **por índice via `page.evaluate`**, não com
  handles: o React re-renderiza e os handles ficam "detached".
- Não existe tabela de resultados; as pontuações são calculadas na hora.

# Pendências

- **Emojis do "Parabéns"**: hoje são unicode em `FEEDBACK_EMOJIS`
  (`lib/config.ts`). A usuária vai enviar um banco de imagens — trocar a lista
  pelos caminhos e ajustar o `<span>` em `FeedbackScreen` (`Runner.tsx`).
- **Fase C (A2) está sem `randomize`/`withoutContext`**, mas o `Planejamento.xlsx`
  pede "as 5 primeiras devem ser sem contexto" para A201–A210 também. Corrigir.
- **Decisão em aberto — quais 5 metáforas vão sem contexto.** Hoje a semente é
  `${testId}:${phase}:order`, então o conjunto **muda** entre A, AR1 e AR2. O
  `"Teste das 5 sem contexto (LB)"` do `Planejamento.xlsx` sugere que deveriam
  ser as **mesmas 5 da linha de base** nos retestes (senão a comparação
  antes/depois confunde aprendizado com condição). Há também a questão de
  balancear o sorteio entre metáforas treinadas (ímpares) e controle (pares).
  **Perguntar antes de mexer** — é decisão de desenho experimental, não técnica.
- `npm run seed` e `npm run gen-audio:openai` ainda não foram rodados após a
  reestruturação (exigem credenciais da usuária). O `gen-audio:openai` agora
  publica no Storage (`question-media/audio/`), subindo os mp3 que já existem em
  `public/audio/` e gerando só os que faltam.
- **Migração `0004_question_media_bucket.sql` pendente** de rodar no Supabase
  (renomeia o bucket para `question-media`). Se já houver imagens customizadas
  enviadas pelo painel, mover os objetos do bucket antigo — ver o comentário na
  migração.
