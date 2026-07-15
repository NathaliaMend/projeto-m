/**
 * Popula a tabela `questions` a partir de data/questions.json.
 *
 * Uso:
 *   1. Configure .env.local com NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY
 *   2. node scripts/seed.mjs
 *
 * A service role key ignora o RLS — nunca a exponha no cliente/browser.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Carrega variáveis de .env.local (sem dependências externas).
function loadEnv() {
  try {
    const raw = readFileSync(join(root, ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let value = m[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = value;
    }
  } catch {
    // .env.local pode não existir se as variáveis já vierem do ambiente.
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Faltam variáveis: NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (em .env.local)."
  );
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false },
});

const data = JSON.parse(readFileSync(join(root, "data/questions.json"), "utf8"));

function toRows(bank) {
  return data[bank].map((q) => ({
    code: q.code,
    bank: q.bank,
    metaphor_number: q.metaphor_number,
    parent_metaphor_code: q.parent_metaphor_code ?? null,
    etapa: q.etapa ?? null,
    etapa_label: q.etapa_label ?? null,
    step: q.step ?? null,
    order_index: q.order_index,
    metaphor: q.metaphor ?? null,
    context: q.context ? q.context : null,
    phrases: q.phrases ?? null,
    image_key: q.image_key ?? null,
    question_text: q.question_text,
    options: q.options,
  }));
}

async function main() {
  const banks = ["A1", "A2", "B"];
  const rows = banks.flatMap(toRows);

  // Upsert por `code` (chave natural) em vez de delete+insert: os UUIDs das
  // perguntas são preservados, então as respostas já gravadas continuam
  // apontando para a pergunta certa. Re-semear vira operação segura.
  const { error } = await supabase
    .from("questions")
    .upsert(rows, { onConflict: "code" });
  if (error) {
    console.error("Erro ao gravar perguntas:", error.message);
    process.exit(1);
  }
  for (const bank of banks) {
    console.log(`  ${bank}: ${data[bank].length} perguntas.`);
  }

  // Perguntas que sumiram do JSON (ex.: itens antigos da Fase B) ficariam
  // órfãs no banco e apareceriam no teste. Só apaga as que ninguém respondeu —
  // se alguém respondeu, avisa em vez de destruir o dado.
  const codes = rows.map((r) => r.code);
  const { data: extra, error: exErr } = await supabase
    .from("questions")
    .select("id, code")
    .not("code", "in", `(${codes.map((c) => `"${c}"`).join(",")})`);
  if (exErr) {
    console.error("Erro ao procurar perguntas obsoletas:", exErr.message);
    process.exit(1);
  }

  for (const q of extra ?? []) {
    const { count } = await supabase
      .from("answers")
      .select("id", { count: "exact", head: true })
      .eq("question_id", q.id);
    if (count) {
      console.warn(
        `  ! ${q.code}: não está mais no JSON, mas tem ${count} resposta(s). Mantida — apague à mão se for intencional.`
      );
      continue;
    }
    await supabase.from("questions").delete().eq("id", q.id);
    console.log(`  - ${q.code}: obsoleta, removida.`);
  }

  console.log(`Pronto! ${rows.length} perguntas no banco.`);
}

main();
