"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBanks } from "@/lib/questions.server";
import { buildSteps, progressFromAnswers } from "@/lib/assessment";
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
  const steps = buildSteps(byBank);
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

/** Registra a resposta de uma pergunta. Retorna se acertou (para o feedback da Fase B). */
export async function submitAnswer(input: {
  testId: string;
  phase: Phase;
  questionId: string;
  selectedKey: string;
}): Promise<{ isCorrect: boolean; completed: boolean }> {
  const { supabase } = await requireUser();

  // Autoridade do servidor: descobre a opção correta a partir do banco.
  const { data: question, error } = await supabase
    .from("questions")
    .select("options")
    .eq("id", input.questionId)
    .single();
  if (error || !question) throw new Error("Pergunta não encontrada.");

  const options = question.options as {
    key: string;
    is_correct: boolean;
  }[];
  const isCorrect = options.some(
    (o) => o.key === input.selectedKey && o.is_correct
  );

  const { error: upErr } = await supabase.from("answers").upsert(
    {
      test_id: input.testId,
      phase: input.phase,
      question_id: input.questionId,
      selected_key: input.selectedKey,
      is_correct: isCorrect,
    },
    { onConflict: "test_id,phase,question_id" }
  );
  if (upErr) throw new Error(upErr.message);

  const { completed } = await recomputeProgress(supabase, input.testId);
  revalidatePath("/");
  revalidatePath(`/tests/${input.testId}`);
  return { isCorrect, completed };
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
