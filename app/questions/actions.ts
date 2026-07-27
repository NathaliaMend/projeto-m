"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateOptions } from "@/lib/questions";
import { audioObjectPath } from "@/lib/audio";
import { ttsToMp3 } from "@/lib/tts";
import type { QuestionOption } from "@/lib/types";

const MEDIA_BUCKET = "question-media";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

export interface UpdateQuestionInput {
  id: string;
  question_text: string;
  /** Caminho da imagem em /public/images (ex.: "faseA/01.jpg"); vazio = sem imagem. */
  image_key: string;
  /** História (itens sem frases). Ignorado quando `phrases` vem preenchido. */
  context: string;
  /** Frases da Etapa 2 — reconstroem o `context` (o texto que vira áudio). */
  phrases: string[] | null;
  options: QuestionOption[];
}

export interface UpdateQuestionResult {
  ok: boolean;
  error?: string;
}

/**
 * Edita o texto e as alternativas de uma pergunta. A edição vale para as
 * PRÓXIMAS aplicações — respostas já registradas guardam a própria foto
 * (answers.presented) e não mudam. Ver o plano em .claude/plans.
 *
 * A validação é a autoridade: o cliente também valida (para desabilitar o botão),
 * mas quem grava confere de novo, com as mesmas regras de build_options.
 */
export async function updateQuestion(
  input: UpdateQuestionInput
): Promise<UpdateQuestionResult> {
  const { supabase } = await requireUser();

  const question_text = input.question_text.trim();
  if (!question_text) return { ok: false, error: "A pergunta não pode ficar em branco." };

  // Autoridade: as `key`s, a quantidade e a opção fixa vêm da linha atual, não
  // do que o cliente mandou — o cliente só pode mexer em `text` e `is_correct`.
  const { data: current, error: readErr } = await supabase
    .from("questions")
    .select("options")
    .eq("id", input.id)
    .single();
  if (readErr || !current) return { ok: false, error: "Pergunta não encontrada." };

  const original = current.options as QuestionOption[];
  const byKey = new Map(original.map((o) => [o.key, o]));

  // Reconstrói as opções a partir das originais, aceitando só `text`/`is_correct`.
  const options: QuestionOption[] = input.options.map((o) => {
    const base = byKey.get(o.key);
    return {
      key: o.key,
      // A opção fixa nunca muda de texto; as demais recebem o texto editado.
      text: base?.is_fixed ? base.text : o.text.trim(),
      is_correct: o.is_correct,
      is_fixed: base?.is_fixed ?? false,
    };
  });

  const invalid = validateOptions(options, original);
  if (invalid) return { ok: false, error: invalid };

  // Caminho relativo dentro de /public/images. Vazio grava null (sem imagem);
  // uma barra inicial quebraria o src, então tiramos.
  const image_key = input.image_key.trim().replace(/^\/+/, "") || null;

  // Frases (Etapa 2) e história compartilham a coluna `context` — é ele que vira
  // áudio. Quando há frases, o `context` é RECONSTRUÍDO delas no mesmo formato
  // do build ("Frase 1: … Frase 2: …"), para display e áudio não divergirem.
  let context: string | null;
  let phrases: string[] | null;
  if (input.phrases && input.phrases.length > 0) {
    const clean = input.phrases.map((p) => p.trim());
    if (clean.some((p) => !p)) {
      return { ok: false, error: "As frases não podem ficar em branco." };
    }
    phrases = clean;
    context = clean.map((p, i) => `Frase ${i + 1}: ${p}`).join(" ");
  } else {
    context = input.context.trim() || null;
    phrases = null;
  }

  const { error: upErr } = await supabase
    .from("questions")
    .update({ question_text, options, image_key, context, phrases })
    .eq("id", input.id);
  if (upErr) return { ok: false, error: upErr.message };

  revalidatePath("/questions");
  return { ok: true };
}

export interface RegenerateAudioResult {
  ok: boolean;
  /** Quantos textos tiveram o mp3 (re)gerado e enviado. */
  generated: number;
  /** Quantos falharam (geração ou upload). */
  failed: number;
  error?: string;
}

/**
 * (Re)gera os áudios de uma pergunta e os sobe para o Storage (question-media),
 * sobrescrevendo (`upsert`). Lê os textos do BANCO — o estado salvo, não o do
 * formulário —, então salve a edição antes de chamar.
 *
 * O nome do objeto vem do CONTEÚDO (audioObjectPath = audio/<audioId>.mp3): um
 * texto editado gera um arquivo novo; o antigo fica órfão (inofensivo), igual ao
 * resto do pipeline. Exige OPENAI_API_KEY no servidor — o navegador não pode
 * guardar a chave. É best-effort: uma falha num texto não derruba os outros.
 */
export async function regenerateQuestionAudio(
  questionId: string
): Promise<RegenerateAudioResult> {
  const { supabase } = await requireUser();

  const { data: q, error: readErr } = await supabase
    .from("questions")
    .select("context, question_text, options")
    .eq("id", questionId)
    .single();
  if (readErr || !q) {
    return { ok: false, generated: 0, failed: 0, error: "Pergunta não encontrada." };
  }

  // Mesmos textos que viram fala na aplicação: história/frases (context),
  // enunciado e cada alternativa. Set remove repetições (ex.: a opção fixa).
  const texts = new Set<string>();
  if (typeof q.context === "string" && q.context.trim()) texts.add(q.context);
  texts.add(q.question_text);
  for (const o of (q.options as QuestionOption[]) ?? []) texts.add(o.text);

  let generated = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const text of texts) {
    try {
      const buf = await ttsToMp3(text);
      const { error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(audioObjectPath(text), buf, {
          upsert: true,
          contentType: "audio/mpeg",
        });
      if (error) throw error;
      generated++;
    } catch (e) {
      failed++;
      if (!firstError) firstError = e instanceof Error ? e.message : "erro";
    }
  }

  return { ok: failed === 0, generated, failed, error: firstError };
}
