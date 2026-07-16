import Link from "next/link";
import questionsData from "@/data/questions.json";
import { PHASES, phaseConfig } from "@/lib/phases";
import { buildSteps, shuffleStep } from "@/lib/assessment";
import type { Phase, Question } from "@/lib/types";
import { PreviewRunner } from "./PreviewRunner";
import type { RunnerStep } from "@/app/tests/[id]/run/Runner";

/**
 * O JSON não tem `id` (é o Postgres que gera no seed), mas buildSteps/shuffleStep
 * trabalham com Question. Usamos o `code` como id sintético — é justamente a
 * chave natural e estável de cada pergunta.
 */
const byBank: Record<string, Question[]> = Object.fromEntries(
  Object.entries(questionsData as Record<string, Omit<Question, "id">[]>).map(
    ([bank, qs]) => [bank, qs.map((q) => ({ ...q, id: q.code }) as Question)]
  )
);

type Selection = Phase | "all";

const isSelection = (v: string | undefined): v is Selection =>
  v === "all" || PHASES.some((p) => p.phase === v);

/**
 * Monta a demonstração com o MESMO buildSteps da avaliação real, para o preview
 * mostrar o sorteio das metáforas e a condição sem contexto de verdade.
 * `seed` faz o papel do testId — fixo, para a demonstração ser reproduzível.
 */
function buildPreview(sel: Selection, metaphor?: string) {
  const seed = "preview";
  const all = buildSteps(byBank, seed);
  const chosen = all.filter(
    (s) =>
      (sel === "all" || s.phase === sel) &&
      (!metaphor || s.question.parent_metaphor_code === metaphor)
  );

  const phaseTotals = new Map<Phase, number>();
  for (const s of chosen) {
    phaseTotals.set(s.phase, (phaseTotals.get(s.phase) ?? 0) + 1);
  }

  const correctKeys: Record<string, string> = {};
  const steps: RunnerStep[] = chosen.map((s, i) => {
    const cfg = phaseConfig(s.phase);
    const q = shuffleStep(s, seed);
    const correct = q.options.find((o) => o.is_correct);
    if (correct) correctKeys[q.id] = correct.key;

    return {
      phase: s.phase,
      phaseLabel: cfg.label,
      feedback: cfg.feedbackPerQuestion,
      // Ao ver uma fase isolada, o índice do passo dentro dela recomeça do zero.
      indexInPhase: sel === "all" && !metaphor ? s.indexInPhase : i,
      phaseTotal: phaseTotals.get(s.phase) ?? 0,
      question: {
        id: q.id,
        context: q.context,
        phrases: q.phrases,
        image_key: q.image_key,
        etapa_label: q.etapa_label,
        question_text: q.question_text,
        options: q.options.map((o) => ({ key: o.key, text: o.text })),
      },
    };
  });

  return { steps, correctKeys };
}

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ phase?: string; metaphor?: string }>;
}) {
  const { phase, metaphor } = await searchParams;

  if (isSelection(phase)) {
    const { steps, correctKeys } = buildPreview(phase, metaphor);
    return <PreviewRunner steps={steps} correctKeys={correctKeys} />;
  }

  const counts = new Map<Phase, number>();
  for (const s of buildSteps(byBank, "preview")) {
    counts.set(s.phase, (counts.get(s.phase) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);

  const emoji: Record<Phase, string> = {
    A: "🌱",
    B1: "🚀",
    AR1: "🌿",
    B2: "🛸",
    AR2: "🌳",
    C: "🏆",
  };
  const desc: Record<Phase, string> = {
    A: "história + imagem, sem feedback",
    B1: "metáforas A1B01, A1B03, A1B05 · 3 etapas, com feedback",
    AR1: "reaplicação da Fase A depois de A1B05",
    B2: "metáforas A1B07, A1B09 · 3 etapas, com feedback",
    AR2: "reaplicação da Fase A depois de A1B09",
    C: "metáforas novas (banco A2)",
  };

  // Quantos passos cada metáfora da Fase B tem — para as entradas do submenu.
  const metaphorCounts = new Map<string, number>();
  for (const s of buildSteps(byBank, "preview")) {
    const code = s.question.parent_metaphor_code;
    if (code) metaphorCounts.set(code, (metaphorCounts.get(code) ?? 0) + 1);
  }

  const cards: {
    sel: Selection;
    title: string;
    desc: string;
    emoji: string;
    metaphors?: string[];
  }[] = [
    ...PHASES.map((p) => ({
      sel: p.phase as Selection,
      title: p.label,
      desc: `${counts.get(p.phase) ?? 0} perguntas · ${desc[p.phase]}`,
      emoji: emoji[p.phase],
      metaphors: p.metaphors,
    })),
    {
      sel: "all",
      title: "Tudo (A → B1 → AR1 → B2 → AR2 → C)",
      desc: `${total} perguntas · avaliação completa`,
      emoji: "✨",
    },
  ];

  return (
    <main className="min-h-screen bg-[var(--blue-soft)] flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🧠</div>
          <h1 className="text-2xl font-black">Demonstração do questionário</h1>
          <p className="text-[var(--muted)] font-semibold mt-1">
            Escolha o que quer visualizar. Nada é salvo — não precisa de login nem
            de banco de dados.
          </p>
        </div>

        <Link
          href="/tutorial"
          className="flex items-center gap-4 bg-white rounded-2xl p-4 mb-3 border-2 border-[var(--blue)] hover:bg-[var(--blue-soft)] transition-colors"
        >
          <span className="text-3xl">👋</span>
          <span className="min-w-0">
            <span className="block font-black text-lg">Tutorial guiado</span>
            <span className="block text-sm font-semibold text-[var(--muted)]">
              3 exemplos · ensina a usar o app antes da Fase A
            </span>
          </span>
          <span className="ml-auto text-[var(--blue)] font-black text-xl">→</span>
        </Link>

        <ul className="flex flex-col gap-3">
          {cards.map((c) => (
            <li key={c.sel}>
              <Link
                href={`/preview?phase=${c.sel}`}
                className="flex items-center gap-4 bg-white rounded-2xl p-4 border-2 border-transparent hover:border-[var(--blue)] transition-colors"
              >
                <span className="text-3xl">{c.emoji}</span>
                <span className="min-w-0">
                  <span className="block font-black text-lg">{c.title}</span>
                  <span className="block text-sm font-semibold text-[var(--muted)]">
                    {c.desc}
                  </span>
                </span>
                <span className="ml-auto text-[var(--blue)] font-black text-xl">
                  →
                </span>
              </Link>

              {/* Uma entrada por metáfora: é assim que a Fase B é aplicada, no
                  máximo uma metáfora por dia. */}
              {c.metaphors && (
                <ul className="mt-1.5 ml-6 flex flex-col gap-1.5">
                  {c.metaphors.map((code) => (
                    <li key={code}>
                      <Link
                        href={`/preview?phase=${c.sel}&metaphor=${code}`}
                        className="flex items-center gap-3 bg-white/70 rounded-xl px-3 py-2 border-2 border-transparent hover:border-[var(--blue)] transition-colors"
                      >
                        <span className="font-bold text-sm">{code}</span>
                        <span className="text-xs font-semibold text-[var(--muted)]">
                          {metaphorCounts.get(code) ?? 0} perguntas
                        </span>
                        <span className="ml-auto text-[var(--muted)] font-black">
                          →
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>

        <p className="text-center text-xs font-semibold text-[var(--muted)] mt-8">
          Dica: no celular/tablet, toque no 🔊 para ouvir a pergunta e as opções.
        </p>
      </div>
    </main>
  );
}
