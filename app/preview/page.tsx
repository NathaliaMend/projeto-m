import Link from "next/link";
import questionsData from "@/data/questions.json";
import { PHASES, phaseConfig } from "@/lib/phases";
import { shuffleOptions } from "@/lib/shuffle";
import type { Phase, QuestionOption } from "@/lib/types";
import { PreviewRunner } from "./PreviewRunner";
import type { RunnerStep } from "@/app/tests/[id]/run/Runner";

interface RawQuestion {
  bank: string;
  order_index: number;
  context: string | null;
  image_key: string | null;
  question_text: string;
  options: QuestionOption[];
}

const banks = questionsData as unknown as Record<string, RawQuestion[]>;

type Selection = Phase | "all";

function isSelection(v: string | undefined): v is Selection {
  return v === "A" || v === "B" || v === "C" || v === "all";
}

/** ID sintético e estável para a demonstração (o JSON não tem ids). */
function qid(q: RawQuestion) {
  return `${q.bank}-${q.order_index}`;
}

function buildPreview(sel: Selection) {
  const chosen =
    sel === "all" ? PHASES : PHASES.filter((p) => p.phase === sel);

  const steps: RunnerStep[] = [];
  const correctKeys: Record<string, string> = {};

  for (const cfg of chosen) {
    const qs = banks[cfg.bank] ?? [];
    qs.forEach((q, i) => {
      const id = qid(q);
      const correct = q.options.find((o) => o.is_correct);
      if (correct) correctKeys[id] = correct.key;

      const shuffled = shuffleOptions(q.options, `preview:${cfg.phase}:${id}`);
      steps.push({
        phase: cfg.phase,
        phaseLabel: cfg.label,
        feedback: cfg.feedbackPerQuestion,
        indexInPhase: i,
        phaseTotal: qs.length,
        question: {
          id,
          context: q.context || null,
          image_key: q.image_key,
          question_text: q.question_text,
          options: shuffled.map((o) => ({ key: o.key, text: o.text })),
        },
      });
    });
  }
  return { steps, correctKeys };
}

export default async function PreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ phase?: string }>;
}) {
  const { phase } = await searchParams;

  if (isSelection(phase)) {
    const { steps, correctKeys } = buildPreview(phase);
    return <PreviewRunner steps={steps} correctKeys={correctKeys} />;
  }

  const cards: { sel: Selection; title: string; desc: string; emoji: string }[] =
    [
      {
        sel: "A",
        title: "Fase A",
        desc: `${banks.A1?.length ?? 0} perguntas · história + imagem, sem feedback`,
        emoji: "🌱",
      },
      {
        sel: "B",
        title: "Fase B",
        desc: `${banks.B?.length ?? 0} perguntas · etapas, com feedback por pergunta`,
        emoji: "🚀",
      },
      {
        sel: "C",
        title: "Fase C",
        desc: `${banks.A1?.length ?? 0} perguntas · repete a Fase A`,
        emoji: "🏆",
      },
      {
        sel: "all",
        title: "Tudo (A → B → C)",
        desc: `${
          (banks.A1?.length ?? 0) * 2 + (banks.B?.length ?? 0)
        } perguntas · avaliação completa`,
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
