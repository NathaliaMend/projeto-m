"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useVoice, SpeakButton } from "./speech";
import { submitAnswer } from "@/app/tests/actions";
import type { Phase } from "@/lib/types";

export interface RunnerOption {
  key: string;
  text: string;
}
export interface RunnerStep {
  phase: Phase;
  phaseLabel: string;
  feedback: boolean; // mostra "acertou/errou" por pergunta
  indexInPhase: number;
  phaseTotal: number;
  question: {
    id: string;
    context: string | null;
    image_key: string | null;
    question_text: string;
    options: RunnerOption[];
  };
}

type Screen = "intro" | "question" | "phaseComplete" | "done";

const INTRO_SPEECH =
  "Nós vamos brincar de descobrir o que algumas frases significam! " +
  "Primeiro: você vai ler uma história ou uma frase. " +
  "Depois: vamos fazer uma pergunta. " +
  "Lembre-se: você pode usar o botão de som para ouvir quantas vezes quiser!";

const PHASE_EMOJI: Record<Phase, string> = { A: "🌱", B: "🚀", C: "🏆" };

export interface SubmitFn {
  (input: {
    testId: string;
    phase: Phase;
    questionId: string;
    selectedKey: string;
  }): Promise<{ isCorrect: boolean; completed: boolean }>;
}

export function Runner({
  testId,
  studentName,
  steps,
  startIndex,
  submit,
  exitHref = "/",
  resultHref,
  resultLabel = "Ver resultado",
  demoBadge,
}: {
  testId: string;
  studentName: string;
  steps: RunnerStep[];
  startIndex: number;
  /** Substitui o registro no servidor (usado no modo demonstração, sem Supabase). */
  submit?: SubmitFn;
  /** Destino do botão de sair (✕). Padrão: "/". */
  exitHref?: string;
  /** Destino do botão da tela final. Padrão: /tests/{testId}. */
  resultHref?: string;
  resultLabel?: string;
  /** Texto opcional exibido como selo de "demonstração". */
  demoBadge?: string;
}) {
  const doSubmit: SubmitFn = submit ?? submitAnswer;
  const finalHref = resultHref ?? `/tests/${testId}`;
  const total = steps.length;
  const beginDone = startIndex >= total;

  // Mostra a tela de instruções ao iniciar a Fase A do zero (não ao retomar).
  const showIntro = !beginDone && startIndex === 0 && steps[0]?.phase === "A";

  const [cur, setCur] = useState(Math.min(startIndex, Math.max(0, total - 1)));
  const [screen, setScreen] = useState<Screen>(
    beginDone ? "done" : showIntro ? "intro" : "question"
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<null | { correct: boolean }>(null);
  const [pending, setPending] = useState(false);
  const [completedPhase, setCompletedPhase] = useState<Phase | null>(null);

  const { play, cancel, ready } = useVoice();
  const step = steps[cur];

  // Fala o contexto + a pergunta de um passo.
  const suppressAutoRef = useRef(false);
  const stepText = useCallback((idx: number) => {
    const s = steps[idx];
    if (!s) return "";
    return [s.question.context, s.question.question_text]
      .filter(Boolean)
      .join(". ");
  }, [steps]);

  // Fala imediatamente (dentro do gesto de toque) — funciona em tablets/iPad,
  // onde a reprodução automática por timer é bloqueada.
  const speakStep = useCallback(
    (idx: number) => {
      suppressAutoRef.current = true; // evita o efeito falar de novo
      play(stepText(idx));
    },
    [play, stepText]
  );

  // Reprodução automática ao abrir cada pergunta (aguarda as vozes carregarem).
  // No desktop toca sozinho; em tablets serve de melhor esforço.
  useEffect(() => {
    if (screen !== "question" || !step) return;
    if (suppressAutoRef.current) {
      suppressAutoRef.current = false;
      return;
    }
    // Fala assim que as vozes carregarem; se demorarem, tenta mesmo assim.
    // A limpeza do timeout a cada re-execução evita fala duplicada.
    const delay = ready ? 250 : 700;
    const t = window.setTimeout(() => play(stepText(cur)), delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, screen, ready]);

  // Fala automática das instruções ao abrir a tela de intro.
  useEffect(() => {
    if (screen !== "intro") return;
    const delay = ready ? 300 : 700;
    const t = window.setTimeout(() => play(INTRO_SPEECH), delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, ready]);

  useEffect(() => () => cancel(), [cancel]);

  const optionLetters = ["A", "B", "C", "D"];

  // Sai da intro e lê a primeira pergunta dentro do gesto (toque).
  function startAssessment() {
    setScreen("question");
    speakStep(cur);
  }

  async function onConfirm() {
    if (selected == null || pending || !step) return;
    setPending(true);
    try {
      const res = await doSubmit({
        testId,
        phase: step.phase,
        questionId: step.question.id,
        selectedKey: selected,
      });
      if (step.feedback) {
        setResult({ correct: res.isCorrect });
      } else {
        advance();
      }
    } finally {
      setPending(false);
    }
  }

  function advance() {
    cancel();
    const isLast = cur + 1 >= total;
    const phaseChanges = !isLast && steps[cur + 1].phase !== step.phase;
    setSelected(null);
    setResult(null);
    if (isLast) {
      setCompletedPhase(step.phase);
      setScreen("done");
    } else if (phaseChanges) {
      setCompletedPhase(step.phase);
      setScreen("phaseComplete");
    } else {
      setCur(cur + 1);
      speakStep(cur + 1); // lê a próxima pergunta dentro do gesto (toque)
    }
  }

  function goNextPhase() {
    setCur(cur + 1);
    setScreen("question");
    speakStep(cur + 1);
  }

  const progressPct = useMemo(() => {
    if (!step) return 100;
    return Math.round(((step.indexInPhase + (result ? 1 : 0)) / step.phaseTotal) * 100);
  }, [step, result]);

  // ---------- Tela de instruções (início da Fase A) ----------
  if (screen === "intro") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-5 py-8 bg-[var(--blue-soft)]">
        <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full">
          <div className="flex items-start gap-2 mb-6">
            <SpeakButton
              text={INTRO_SPEECH}
              speak={play}
              label="Ouvir as instruções"
            />
            <h1 className="text-xl sm:text-2xl font-black leading-snug">
              Nós vamos brincar de descobrir o que algumas frases significam!
            </h1>
          </div>

          <ol className="flex flex-col gap-3">
            <li className="flex items-start gap-3 bg-[var(--blue-soft)] rounded-2xl p-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--blue)] text-white font-black flex items-center justify-center">
                1
              </span>
              <span>
                <span className="block font-black">Primeiro:</span>
                <span className="font-semibold">
                  Você vai ler uma história ou uma frase.
                </span>
              </span>
            </li>
            <li className="flex items-start gap-3 bg-[var(--green-soft)] rounded-2xl p-4">
              <span className="flex-shrink-0 w-8 h-8 rounded-full bg-[var(--green)] text-white font-black flex items-center justify-center">
                2
              </span>
              <span>
                <span className="block font-black">Depois:</span>
                <span className="font-semibold">Vamos fazer uma pergunta.</span>
              </span>
            </li>
            <li className="flex items-start gap-3 bg-[#fff3c4] rounded-2xl p-4">
              <span className="flex-shrink-0 text-2xl">💡</span>
              <span>
                <span className="block font-black">Lembre-se:</span>
                <span className="font-semibold">
                  Você pode usar o botão de som{" "}
                  <span className="inline-flex align-middle text-[var(--blue-dark)]">
                    🔊
                  </span>{" "}
                  para ouvir quantas vezes quiser!
                </span>
              </span>
            </li>
          </ol>

          <button
            onClick={startAssessment}
            className="btn3d btn3d-green w-full mt-6"
          >
            Começar
          </button>
        </div>
      </div>
    );
  }

  // ---------- Telas de encerramento ----------
  if (screen === "done") {
    return (
      <CenterCard>
        <div className="text-6xl mb-3">🎉</div>
        <h1 className="text-2xl font-black mb-2">Parabéns, {studentName}!</h1>
        <p className="text-[var(--muted)] font-semibold mb-6">
          Você concluiu toda a avaliação. Muito bem!
        </p>
        <Link href={finalHref} className="btn3d btn3d-green">
          {resultLabel}
        </Link>
      </CenterCard>
    );
  }

  if (screen === "phaseComplete" && completedPhase) {
    return (
      <CenterCard>
        <div className="text-6xl mb-3">{PHASE_EMOJI[completedPhase]}</div>
        <h1 className="text-2xl font-black mb-2">
          Fase {completedPhase} concluída!
        </h1>
        <p className="text-[var(--muted)] font-semibold mb-6">
          Você foi muito bem! Vamos para a próxima parte.
        </p>
        <button onClick={goNextPhase} className="btn3d btn3d-green">
          Continuar
        </button>
      </CenterCard>
    );
  }

  if (!step) return null;

  // ---------- Tela de pergunta ----------
  return (
    <div className="h-[100dvh] flex flex-col bg-white">
      {/* Cabeçalho: progresso da fase */}
      <div className="shrink-0 px-4 pt-4 pb-2 max-w-2xl w-full mx-auto">
        <div className="flex items-center gap-3">
          <Link
            href={exitHref}
            className="text-2xl leading-none text-[var(--muted)]"
            aria-label="Sair"
            title="Sair"
          >
            ✕
          </Link>
          <div className="progressbar flex-1">
            <div style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-sm font-black text-[var(--muted)] whitespace-nowrap">
            {step.phaseLabel}
          </span>
        </div>
        {demoBadge && (
          <p className="text-center text-xs font-bold text-[var(--muted)] mt-1">
            {demoBadge}
          </p>
        )}
      </div>

      {/* Conteúdo (rola apenas esta área) */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 max-w-2xl w-full mx-auto flex flex-col gap-4">
        {step.question.image_key && (
          <div className="relative w-full aspect-[16/9] rounded-2xl overflow-hidden bg-[#f0f4f8]">
            <Image
              src={`/images/${step.question.image_key}`}
              alt=""
              fill
              sizes="(max-width: 640px) 100vw, 640px"
              className="object-contain"
              priority
            />
          </div>
        )}

        {step.question.context && (
          <div className="bg-[#f7f9fc] rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-1.5">
              <SpeakButton
                text={step.question.context}
                speak={play}
                label="Ouvir a história"
              />
              <span className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">
                História
              </span>
            </div>
            <p className="font-semibold text-[var(--foreground)] leading-snug">
              {step.question.context}
            </p>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <SpeakButton
              text={step.question.question_text}
              speak={play}
              label="Ouvir a pergunta"
            />
            <span className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">
              Pergunta
            </span>
          </div>
          <h2 className="text-xl font-black leading-snug">
            {step.question.question_text}
          </h2>
        </div>

        <div className="flex flex-col gap-3 mt-1">
          {step.question.options.map((opt, i) => {
            const isSel = selected === opt.key;
            const locked = !!result || pending;
            let cls = `choice opt-${i % 4}`;
            if (result) {
              // Só a Fase B mostra feedback: destaca a escolhida.
              if (isSel) cls += result.correct ? " correct" : " wrong";
            } else if (isSel) {
              cls += " selected";
            }
            function select() {
              if (locked) return;
              setSelected(opt.key);
              play(opt.text);
            }
            return (
              // Contêiner clicável (div) para poder conter o botão de áudio
              // sem aninhar <button> dentro de <button>.
              <div
                key={opt.key}
                role="button"
                tabIndex={locked ? -1 : 0}
                aria-pressed={isSel}
                className={cls}
                onClick={select}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select();
                  }
                }}
              >
                <span className="flex-1">{opt.text}</span>
                <SpeakButton
                  text={opt.text}
                  speak={play}
                  label={`Ouvir opção ${optionLetters[i]}`}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Rodapé: feedback (Fase B) + botão (sempre visível) */}
      <div
        className={`shrink-0 border-t-2 ${
          result
            ? result.correct
              ? "border-[var(--green)] bg-[var(--green-soft)]"
              : "border-[var(--red)] bg-[var(--red-soft)]"
            : "border-[var(--border)] bg-white"
        }`}
      >
        <div className="max-w-2xl w-full mx-auto px-4 py-4 flex items-center justify-between gap-3">
          {result ? (
            <span
              className={`font-black text-lg ${
                result.correct
                  ? "text-[var(--green-dark)]"
                  : "text-[var(--red-dark)]"
              }`}
            >
              {result.correct ? "Acertou! 🎉" : "Ops, não foi dessa vez."}
            </span>
          ) : (
            <span />
          )}
          {result ? (
            <button onClick={advance} className="btn3d btn3d-green">
              Continuar
            </button>
          ) : (
            <button
              onClick={onConfirm}
              disabled={selected == null || pending}
              className="btn3d btn3d-green"
            >
              {pending ? "..." : "Confirmar"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CenterCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-[var(--blue-soft)]">
      <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full">
        {children}
      </div>
    </div>
  );
}
