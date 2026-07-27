/**
 * Publica os áudios (voz neural da OpenAI) de histórias, perguntas e opções no
 * Supabase Storage, no bucket `question-media`, sob `audio/<id>.mp3`. Textos
 * idênticos viram um único objeto.
 *
 * Estratégia (barata por padrão):
 *   1. lista o que já existe no bucket e PULA esses (a menos que FORCE);
 *   2. para o que falta: se houver o mp3 correspondente em public/audio/, SOBE
 *      esse arquivo (sem gastar OpenAI); senão, GERA pela OpenAI e sobe.
 *   FORCE=1 regenera tudo pela OpenAI e sobrescreve.
 *
 * Uso:
 *   1. Em .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e
 *      (para gerar) OPENAI_API_KEY=sk-...
 *   2. npm run gen-audio:openai
 *
 * Variáveis opcionais:
 *   OPENAI_TTS_VOICE   voz (padrão: "coral"). Opções: alloy, ash, ballad, coral,
 *                      echo, fable, nova, onyx, sage, shimmer, verse.
 *   OPENAI_TTS_MODEL   modelo (padrão: "gpt-4o-mini-tts").
 *   OPENAI_TTS_INSTRUCTIONS  instruções de tom (só no gpt-4o-mini-tts).
 *   FORCE=1            regera tudo pela OpenAI, ignorando bucket e locais.
 *   CONCURRENCY        requisições em paralelo (padrão: 5).
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const localDir = join(root, "public", "audio");
const BUCKET = "question-media";
const PREFIX = "audio";

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

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Faltam NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (em .env.local)."
  );
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const API_KEY = process.env.OPENAI_API_KEY; // só é exigida se houver o que gerar
const VOICE = process.env.OPENAI_TTS_VOICE || "coral";
const MODEL = process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts";
const INSTRUCTIONS =
  process.env.OPENAI_TTS_INSTRUCTIONS ||
  "Fale em português do Brasil, com tom caloroso, amigável e claro, " +
    "como quem conta uma história para uma criança. Ritmo calmo e boa dicção.";
const CONCURRENCY = Number(process.env.CONCURRENCY || 5);
const FORCE = !!process.env.FORCE;

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
    .replace(/[̀-ͯ]/g, "")
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

/** Textos vêm do BANCO — é ele que reflete as edições do painel /questions. */
async function loadQuestions() {
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

/** Nomes dos objetos já presentes em audio/ no bucket (uma passada, paginada). */
async function listExisting() {
  const names = new Set();
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(PREFIX, { limit: pageSize, offset });
    if (error) {
      console.error(`Erro ao listar o bucket: ${error.message}`);
      process.exit(1);
    }
    for (const o of data) names.add(o.name);
    if (data.length < pageSize) break;
  }
  return names;
}

const texts = new Set([INTRO_SPEECH]);
for (const q of await loadQuestions()) {
  if (q.context && q.context.trim()) texts.add(q.context);
  texts.add(q.question_text);
  for (const o of q.options) texts.add(o.text);
}

const existing = FORCE ? new Set() : await listExisting();

// Monta a fila do que falta: cada job sabe se pode subir um arquivo local ou se
// precisa gerar pela OpenAI.
const jobs = [];
for (const text of texts) {
  const name = `${audioId(text)}.mp3`;
  if (existing.has(name)) continue;
  const localPath = join(localDir, name);
  const canUploadLocal = !FORCE && existsSync(localPath);
  jobs.push({ text, name, localPath, canUploadLocal });
}

const toGenerate = jobs.filter((j) => !j.canUploadLocal).length;
if (toGenerate > 0 && !API_KEY) {
  console.error(
    `Há ${toGenerate} áudio(s) para GERAR e falta OPENAI_API_KEY (em .env.local).`
  );
  process.exit(1);
}

console.log(
  `${texts.size} textos únicos · ${jobs.length} a publicar ` +
    `(${jobs.length - toGenerate} de arquivos locais, ${toGenerate} pela OpenAI) · ` +
    `voz "${VOICE}" · modelo ${MODEL}${FORCE ? " · FORCE" : ""}`
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

async function upload(name, buf) {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${PREFIX}/${name}`, buf, {
      upsert: true,
      contentType: "audio/mpeg",
    });
  if (error) throw new Error(error.message);
}

let done = 0;
let failed = 0;
async function worker(queue) {
  for (;;) {
    const job = queue.pop();
    if (!job) return;
    try {
      const buf = job.canUploadLocal
        ? readFileSync(job.localPath)
        : await synthesize(job.text);
      await upload(job.name, buf);
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

console.log(`Pronto! ${done} publicados, ${failed} falhas.`);
if (failed) process.exit(1);
