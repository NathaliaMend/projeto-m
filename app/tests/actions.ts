"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBanks } from "@/lib/questions.server";
import { buildSteps, progressFromAnswers } from "@/lib/assessment";
import { phaseConfig } from "@/lib/phases";
import { MAX_ATTEMPTS_B } from "@/lib/config";
import type { Answer, Phase } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Cria uma nova avaliação (cadastro do aluno) e abre o questionário. */
export async function createTest(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("student_name") ?? "").trim();
  const birth = String(formData.get("student_birth_date") ?? "").trim();
  if (!name) return;

  const { data, error } = await supabase
    .from("tests")
    .insert({
      applicator_id: user.id,
      student_name: name,
      student_birth_date: birth || null,
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Falha ao criar teste.");
  redirect(`/tests/${data.id}/run`);
}

/** Recalcula current_phase/current_index/status de um teste a partir das respostas. */
async function recomputeProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  testId: string
) {
  const byBank = await getBanks(supabase);
  const steps = buildSteps(byBank, testId);
  const { data: answers } = await supabase
    .from("answers")
    .select("*")
    .eq("test_id", testId);

  const { completed, currentPhase, currentIndex } = progressFromAnswers(
    steps,
    (answers ?? []) as Answer[]
  );

  await supabase
    .from("tests")
    .update({
      current_phase: currentPhase,
      current_index: currentIndex,
      status: completed ? "completed" : "in_progress",
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", testId);

  return { completed };
}

export interface SubmitResult {
  /** Se a escolha desta vez foi a correta. */
  isCorrect: boolean;
  /** Tentativas usadas até agora (1..MAX_ATTEMPTS_B). */
  attempts: number;
  /** Ainda pode tentar de novo? (só na Fase B, se errou e sobrou tentativa) */
  canRetry: boolean;
  /** A alternativa correta — só depois de a pergunta se encerrar. */
  correctKey: string | null;
  completed: boolean;
}

/**
 * Registra a resposta de uma pergunta.
 *
 * Na Fase B a criança tenta até MAX_ATTEMPTS_B vezes. A contagem de tentativas
 * é feita **no servidor**, a partir da linha já gravada — o cliente não manda o
 * número da tentativa, senão bastaria mentir para ganhar tentativas extras.
 *
 * O que fica gravado:
 *   is_correct    acertou na PRIMEIRA tentativa — nunca é sobrescrito
 *   solved        chegou na correta dentro do limite
 *   attempts      quantas tentativas usou
 *   selected_key  a primeira escolha; selected_keys, todas em ordem
 */
export async function submitAnswer(input: {
  testId: string;
  phase: Phase;
  questionId: string;
  selectedKey: string;
}): Promise<SubmitResult> {
  const { supabase } = await requireUser();

  // Autoridade do servidor: descobre a opção correta a partir do banco.
  const { data: question, error } = await supabase
    .from("questions")
    .select("options")
    .eq("id", input.questionId)
    .single();
  if (error || !question) throw new Error("Pergunta não encontrada.");

  const options = question.options as { key: string; is_correct: boolean }[];
  const correctKey = options.find((o) => o.is_correct)?.key ?? null;
  const isCorrect = input.selectedKey === correctKey;

  const { data: prev } = await supabase
    .from("answers")
    .select("id, attempts, is_correct, solved, selected_key, selected_keys")
    .eq("test_id", input.testId)
    .eq("phase", input.phase)
    .eq("question_id", input.questionId)
    .maybeSingle();

  const retriable = phaseConfig(input.phase).feedbackPerQuestion;
  const attempts = Math.min(
    (prev?.attempts ?? 0) + 1,
    retriable ? MAX_ATTEMPTS_B : 1
  );
  const keys = [...((prev?.selected_keys as string[] | null) ?? []), input.selectedKey];

  if (prev && prev.solved) {
    // Já resolvida: nada a gravar (só chega aqui em corrida de duplo clique).
    return { isCorrect: true, attempts: prev.attempts, canRetry: false, correctKey, completed: false };
  }

  const { error: upErr } = await supabase.from("answers").upsert(
    {
      test_id: input.testId,
      phase: input.phase,
      question_id: input.questionId,
      // A primeira escolha e o acerto de primeira são a medida — preservados.
      selected_key: prev?.selected_key ?? input.selectedKey,
      is_correct: prev ? prev.is_correct : isCorrect,
      selected_keys: keys,
      solved: isCorrect,
      attempts,
    },
    { onConflict: "test_id,phase,question_id" }
  );
  if (upErr) throw new Error(upErr.message);

  const canRetry = retriable && !isCorrect && attempts < MAX_ATTEMPTS_B;
  const { completed } = await recomputeProgress(supabase, input.testId);
  revalidatePath("/");
  revalidatePath(`/tests/${input.testId}`);

  return {
    isCorrect,
    attempts,
    canRetry,
    // Só revela a correta quando a pergunta acabou, para não vazar na retentativa.
    correctKey: canRetry ? null : correctKey,
    completed,
  };
}

/** Recomeça o teste do zero (apaga todas as respostas). */
export async function restartTest(testId: string) {
  const { supabase } = await requireUser();
  await supabase.from("answers").delete().eq("test_id", testId);
  await supabase
    .from("tests")
    .update({
      current_phase: "A",
      current_index: 0,
      status: "in_progress",
      completed_at: null,
    })
    .eq("id", testId);
  revalidatePath("/");
  revalidatePath(`/tests/${testId}`);
}

/** Exclui o teste e suas respostas. */
export async function deleteTest(testId: string) {
  const { supabase } = await requireUser();
  await supabase.from("tests").delete().eq("id", testId);
  revalidatePath("/");
}
