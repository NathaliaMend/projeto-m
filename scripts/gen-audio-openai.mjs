/**
 * Gera os áudios (voz neural da OpenAI) de todas as histórias, perguntas e opções,
 * salvando em public/audio/<id>.mp3. Textos idênticos viram um único arquivo.
 *
 * Uso:
 *   1. Em .env.local, defina OPENAI_API_KEY=sk-...
 *   2. npm run gen-audio:openai
 *
 * Variáveis opcionais:
 *   OPENAI_TTS_VOICE   voz (padrão: "coral"). Opções: alloy, ash, ballad, coral,
 *                      echo, fable, nova, onyx, sage, shimmer, verse.
 *   OPENAI_TTS_MODEL   modelo (padrão: "gpt-4o-mini-tts").
 *   OPENAI_TTS_INSTRUCTIONS  instruções de tom (só no gpt-4o-mini-tts).
 *   FORCE=1            regera mesmo os arquivos que já existem.
 *   CONCURRENCY        requisições em paralelo (padrão: 5).
 */
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outDir = join(root, "public", "audio");

// --- Carrega .env.local (sem dependências) ---
function loadEnv() {
  try {
    const raw = readFileSync(join(root, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
  } catch {}
}
loadEnv();

const API_KEY = process.env.OPENAI_API_KEY;
if (!API_KEY) {
  console.error("Faltou OPENAI_API_KEY (defina em .env.local).");
  process.exit(1);
}

const VOICE = process.env.OPENAI_TTS_VOICE || "coral";
const MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const INSTRUCTIONS =
  process.env.OPENAI_TTS_INSTRUCTIONS ||
  "Fale em português do Brasil, com tom caloroso, amigável e claro, " +
    "como quem conta uma história para uma criança. Ritmo calmo e boa dicção.";
const CONCURRENCY = Number(process.env.CONCURRENCY || 5);

// --- ID de áudio: DEVE ser idêntico a lib/audio.ts ---
function fnv(str, seed) {
  let h = seed >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
const normalize = (t) => t.replace(/\s+/g, " ").trim();
function slugify(text) {
  return normalize(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}
function audioId(text) {
  const n = normalize(text);
  const h = fnv(n, 0x811c9dc5) ^ fnv(n.split("").reverse().join(""), 0x01000193);
  return `${slugify(text)}-${h.toString(16).padStart(8, "0")}`;
}

// Texto das instruções faladas — DEVE bater com INTRO_SPEECH em Runner.tsx.
const INTRO_SPEECH =
  "Nós vamos brincar de descobrir o que algumas frases significam! " +
  "Primeiro: você vai ler uma história ou uma frase. " +
  "Depois: vamos fazer uma pergunta. " +
  "Lembre-se: você pode usar o botão de som para ouvir quantas vezes quiser!";

const banks = ["A1", "A2", "B"]; // A1 = Fases A/AR1/AR2; B = Fases B1/B2; A2 = Fase C.

/**
 * As perguntas vêm do BANCO, não de data/questions.json: o painel /questions
 * edita direto no Supabase, então é o banco que reflete o texto vigente — e é
 * dele que o áudio precisa sair. Sem credenciais do Supabase, cai para o JSON
 * (import inicial, antes de qualquer edição).
 */
async function loadQuestions() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && serviceKey) {
    const supabase = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase
      .from("questions")
      .select("context, question_text, options")
      .in("bank", banks);
    if (error) {
      console.error(`Erro ao ler perguntas do banco: ${error.message}`);
      process.exit(1);
    }
    console.log(`Fonte: banco Supabase (${data.length} perguntas).`);
    return data;
  }
  // Fallback: JSON do import inicial.
  const json = JSON.parse(
    readFileSync(join(root, "data/questions.json"), "utf8")
  );
  console.log("Fonte: data/questions.json (sem credenciais do Supabase).");
  return banks.flatMap((b) => json[b] ?? []);
}

const texts = new Set([INTRO_SPEECH]);
for (const q of await loadQuestions()) {
  if (q.context && q.context.trim()) texts.add(q.context);
  texts.add(q.question_text);
  for (const o of q.options) texts.add(o.text);
}

mkdirSync(outDir, { recursive: true });

// Só gera o que ainda não existe (a menos que FORCE).
const jobs = [...texts]
  .map((text) => ({ text, out: join(outDir, `${audioId(text)}.mp3`) }))
  .filter((j) => process.env.FORCE || !existsSync(j.out));

console.log(
  `${texts.size} textos únicos · ${jobs.length} a gerar · voz "${VOICE}" · modelo ${MODEL}`
);

async function synthesize(text, attempt = 1) {
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      voice: VOICE,
      input: text,
      response_format: "mp3",
      instructions: INSTRUCTIONS,
    }),
  });

  if (res.status === 429 || res.status >= 500) {
    if (attempt <= 5) {
      const wait = 1000 * 2 ** (attempt - 1);
      await new Promise((r) => setTimeout(r, wait));
      return synthesize(text, attempt + 1);
    }
  }
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

let done = 0;
let failed = 0;
async function worker(queue) {
  for (;;) {
    const job = queue.pop();
    if (!job) return;
    try {
      const buf = await synthesize(job.text);
      writeFileSync(job.out, buf);
      done++;
      if (done % 20 === 0) console.log(`  ${done}/${jobs.length}...`);
    } catch (e) {
      failed++;
      console.error(`Falha: "${job.text.slice(0, 45)}..." → ${e.message}`);
    }
  }
}

const queue = jobs.slice();
await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, () =>
    worker(queue)
  )
);

// Grava um marcador com a voz usada (informativo).
writeFileSync(
  join(outDir, ".voice"),
  `provider=openai voice=${VOICE} model=${MODEL}\n`
);

console.log(`Pronto! ${done} gerados, ${failed} falhas.`);
if (failed) process.exit(1);
