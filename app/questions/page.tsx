import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getBanks } from "@/lib/questions.server";
import type { Question } from "@/lib/types";
import { QuestionsEditor } from "./QuestionsEditor";

/**
 * Painel de perguntas: lista todas, filtra por fase e metáfora, e permite editar
 * o enunciado e as alternativas. As edições valem para as próximas aplicações;
 * respostas já registradas guardam a própria foto (answers.presented) e não
 * mudam. O banco é a fonte de verdade do conteúdo — depois de editar aqui, não
 * rode `npm run seed`, que sobrescreveria com as planilhas.
 */
export default async function QuestionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [byBank, { data: answerRows }] = await Promise.all([
    getBanks(supabase),
    supabase.from("answers").select("question_id"),
  ]);

  // Ordem de exibição: A1 (Fase A), B (treino), A2 (Fase C).
  const questions: Question[] = [
    ...(byBank["A1"] ?? []),
    ...(byBank["B"] ?? []),
    ...(byBank["A2"] ?? []),
  ];

  // Quais perguntas já têm resposta — informativo, para a pesquisadora saber o
  // que já "congelou" em answers.presented.
  const answeredIds = Array.from(
    new Set((answerRows ?? []).map((r) => r.question_id as string))
  );

  return (
    <main className="min-h-screen bg-[#f7f9fc]">
      <header className="bg-white border-b-2 border-[var(--border)]">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-[var(--muted)] font-black">
            ←
          </Link>
          <div className="min-w-0">
            <h1 className="font-black text-lg">Perguntas</h1>
            <p className="text-sm font-semibold text-[var(--muted)]">
              Editar enunciados e alternativas
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        <QuestionsEditor questions={questions} answeredIds={answeredIds} />
      </div>
    </main>
  );
}
