"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getBanks } from "@/lib/questions.server";
import {
  buildSteps,
  progressFromAnswers,
  shuffleStep,
  type AnsweredKey,
  type Step,
} from "@/lib/assessment";
import { phaseConfig } from "@/lib/phases";
import type { Phase, PresentedQuestion } from "@/lib/types";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

/** Cadastra um aluno novo e já abre a primeira aplicação. */
export async function createTest(formData: FormData) {
  const { supabase, user } = await requireUser();
  const name = String(formData.get("student_name") ?? "").trim();
  const birth = String(formData.get("student_birth_date") ?? "").trim();
  if (!name) return;

  const { data: student, error: sErr } = await supabase
    .from("students")
    .insert({ applicator_id: user.id, name, birth_date: birth || null })
    .select("id")
    .single();
  if (sErr || !student) {
    throw new Error(sErr?.message ?? "Falha ao cadastrar o aluno.");
  }

  redirect(`/tests/${await newTestId(supabase, user.id, student.id)}/run`);
}

/** Abre uma NOVA aplicação para um aluno já cadastrado (reaplicação). */
export async function createTestForStudent(formData: FormData) {
  const { supabase, user } = await requireUser();
  const studentId = String(formData.get("student_id") ?? "");
  if (!studentId) return;

  // Confirma que o aluno existe antes de criar o teste — não confiar só no id
  // vindo do formulário. A visibilidade é compartilhada (qualquer avaliador
  // pode reaplicar num aluno da equipe); o teste criado fica sob quem o abriu.
  const { data: student } = await supabase
    .from("students")
    .select("id")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) throw new Error("Aluno não encontrado.");

  redirect(`/tests/${await newTestId(supabase, user.id, studentId)}/run`);
}

/** Insere um teste e devolve o id (usado pelos dois fluxos de criação). */
async function newTestId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  applicatorId: string,
  studentId: string
): Promise<string> {
  const { data, error } = await supabase
    .from("tests")
    .insert({ applicator_id: applicatorId, student_id: studentId })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Falha ao criar teste.");
  return data.id as string;
}

/**
 * Recalcula current_stage/status de um teste a partir das respostas. Recebe os
 * `steps` prontos porque quem chama já os montou — remontá-los aqui seria um
 * getBanks/buildSteps a mais por resposta gravada.
 */
async function recomputeProgress(
  supabase: Awaited<ReturnType<typeof createClient>>,
  testId: string,
  steps: Step[]
) {
  // Só (fase, pergunta): `select("*")` traria a foto `presented` de cada
  // resposta — até 100 por teste — a cada resposta gravada, só para contar.
  const { data: answers } = await supabase
    .from("answers")
    .select("phase, question_id")
    .eq("test_id", testId);

  const { completed, currentStage } = progressFromAnswers(
    steps,
    (answers ?? []) as AnsweredKey[]
  );

  await supabase
    .from("tests")
    .update({
      current_stage: currentStage,
      status: completed ? "completed" : "in_progress",
      completed_at: completed ? new Date().toISOString() : null,
    })
    .eq("id", testId);

  return { completed };
}

export interface SubmitResult {
  /** Se a escolha desta vez foi a correta. */
  isCorrect: boolean;
  /** Tentativas usadas até agora (Fase B: total até acertar; demais: 1). */
  attempts: number;
  /** Ainda pode tentar de novo? (só na Fase B, se errou e sobrou tentativa) */
  canRetry: boolean;
  /** A alternativa correta — só depois de a pergunta se encerrar. */
  correctKey: string | null;
  completed: boolean;
  /**
   * Mensagem de erro quando o salvamento FALHA. Devolvida como dado (não
   * lançada) de propósito: em produção o Next.js apaga a mensagem de um erro
   * LANÇADO num server action (o cliente só recebe "An error occurred..."), mas
   * o VALOR retornado chega inteiro — então a tela consegue mostrar o motivo
   * real (ex.: "violates row-level security policy"). O detalhe também vai para
   * os logs (Vercel) via console.error abaixo.
   */
  error?: string;
}

/**
 * Registra a resposta de uma pergunta.
 *
 * Na Fase B a pergunta se repete até a criança acertar (sem teto). A contagem de
 * tentativas é feita **no servidor**, a partir da linha já gravada — o cliente
 * não manda o número da tentativa, senão bastaria mentir para contar diferente.
 *
 * O que fica gravado:
 *   is_correct    acertou na PRIMEIRA tentativa — nunca é sobrescrito
 *   solved        chegou na correta dentro do limite
 *   attempts      quantas tentativas usou
 *   selected_key  a primeira escolha; selected_keys, todas em ordem
 *   presented     a pergunta como a criança viu — a foto do momento
 */
export async function submitAnswer(input: {
  testId: string;
  phase: Phase;
  questionId: string;
  selectedKey: string;
  /** Aparelho da resposta (tablet/notebook/celular), classificado no cliente. */
  device?: string;
}): Promise<SubmitResult> {
  // requireUser fica FORA do try: se não há sessão ele faz redirect(), que
  // "lança" NEXT_REDIRECT de propósito — não é erro para capturar.
  const { supabase } = await requireUser();
  try {
    return await submitAnswerInner(supabase, input);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Log BEM visível para achar no Vercel (Deployments → Functions → Logs).
    console.error(
      `\n🚨🚨🚨 [submitAnswer] FALHA AO SALVAR RESPOSTA 🚨🚨🚨\n` +
        `mensagem: ${msg}\n` +
        `test=${input.testId} phase=${input.phase} question=${input.questionId} ` +
        `selected=${input.selectedKey}\n`,
      e instanceof Error ? e.stack : e
    );
    // Devolve o motivo como DADO para a tela mostrar (em prod o erro lançado
    // teria a mensagem apagada). Não avança: os campos ficam "vazios".
    return {
      isCorrect: false,
      attempts: 0,
      canRetry: false,
      correctKey: null,
      completed: false,
      error: msg,
    };
  }
}

async function submitAnswerInner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  input: {
    testId: string;
    phase: Phase;
    questionId: string;
    selectedKey: string;
    device?: string;
  }
): Promise<SubmitResult> {
  // Autoridade do servidor: reconstrói o passo com as MESMAS funções que
  // montaram a tela (run/page.tsx faz buildSteps + shuffleStep). É o que faz a
  // foto gravada bater com o que a criança viu, sem o cliente mandar nada —
  // mandar seria forjável, como seria o número da tentativa.
  const byBank = await getBanks(supabase);
  const steps = buildSteps(byBank, input.testId);
  const step = steps.find(
    (s) => s.phase === input.phase && s.question.id === input.questionId
  );
  if (!step) throw new Error("Pergunta não pertence a esta fase do protocolo.");

  const shown = shuffleStep(step, input.testId);
  const correctKey = shown.options.find((o) => o.is_correct)?.key ?? null;
  const isCorrect = input.selectedKey === correctKey;

  const presented: PresentedQuestion = {
    code: shown.code,
    metaphor: shown.metaphor,
    parent_metaphor_code: shown.parent_metaphor_code,
    etapa: shown.etapa,
    etapa_label: shown.etapa_label,
    question_text: shown.question_text,
    options: shown.options,
    context: shown.context,
    phrases: shown.phrases,
    image_key: shown.image_key,
    hide_context: step.hideContext,
  };

  const { data: prev } = await supabase
    .from("answers")
    .select(
      "id, attempts, is_correct, solved, selected_key, selected_keys, presented, device"
    )
    .eq("test_id", input.testId)
    .eq("phase", input.phase)
    .eq("question_id", input.questionId)
    .maybeSingle();

  const retriable = phaseConfig(input.phase).feedbackPerQuestion;
  // Fase B repete até acertar, sem teto: attempts guarda o TOTAL de tentativas
  // até o acerto. Fases sem feedback (A/AR/C) são sempre 1 tentativa.
  const attempts = retriable ? (prev?.attempts ?? 0) + 1 : 1;
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
      // A foto é da PRIMEIRA vez que a pergunta apareceu; a retentativa mostra
      // a mesma tela, então regravar só criaria chance de divergir.
      presented: (prev?.presented as PresentedQuestion | null) ?? presented,
      // Aparelho da PRIMEIRA resposta — como a foto, não é sobrescrito.
      device: (prev?.device as string | null) ?? input.device ?? null,
    },
    { onConflict: "test_id,phase,question_id" }
  );
  if (upErr) throw new Error(upErr.message);

  // Repete enquanto não acertou (Fase B). Sem teto: a pergunta volta até o acerto.
  const canRetry = retriable && !isCorrect;
  const { completed } = await recomputeProgress(supabase, input.testId, steps);
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
      current_stage: "A",
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
