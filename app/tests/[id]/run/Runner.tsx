"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useVoice, useGatedSpeech, SpeakButton } from "./speech";
import { submitAnswer } from "@/app/tests/actions";
import {
  BLANK_SCREEN_MS,
  FEEDBACK_EMOJIS,
  FEEDBACK_SCREEN_MS,
  speechTimeoutMs,
} from "@/lib/config";
import type { Phase } from "@/lib/types";
import { imageSrc } from "@/lib/images";

export interface RunnerOption {
  key: string;
  text: string;
}
export interface RunnerStep {
  phase: Phase;
  /** Rótulo do que está sendo aplicado — a etapa (ver lib/stages.ts). */
  stageLabel: string;
  feedback: boolean; // Fase B: feedback e novas tentativas
  indexInPhase: number;
  phaseTotal: number;
  question: {
    id: string;
    context: string | null;
    phrases: string[] | null;
    image_key: string | null;
    etapa_label: string | null;
    question_text: string;
    options: RunnerOption[];
  };
}

/**
 * Cada tela tem um papel só:
 *   context   história/frases + imagem (pulada quando o passo não tem contexto)
 *   question  pergunta e alternativas
 *   feedback  "Parabéns" / "Tente novamente" (só Fase B)
 *   blank     respiro entre uma pergunta e outra
 */
type Screen =
  | "intro"
  | "context"
  | "question"
  | "feedback"
  | "blank"
  | "phaseComplete"
  | "done";

const INTRO_SPEECH =
  "Nós vamos brincar de descobrir o que algumas frases significam! " +
  "Primeiro: você vai ler uma história ou uma frase. " +
  "Depois: vamos fazer uma pergunta. " +
  "Lembre-se: você pode usar o botão de som para ouvir quantas vezes quiser!";

const PHASE_EMOJI: Record<Phase, string> = {
  A: "🌱",
  B1: "🚀",
  AR1: "🌿",
  B2: "🚀",
  AR2: "🌳",
  C: "🏆",
};

export interface SubmitFn {
  (input: {
    testId: string;
    phase: Phase;
    questionId: string;
    selectedKey: string;
  }): Promise<{
    isCorrect: boolean;
    attempts: number;
    canRetry: boolean;
    correctKey: string | null;
    completed: boolean;
  }>;
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
  doneMessage = "Você concluiu toda a avaliação. Muito bem!",
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
  /** Texto da tela final. Padrão: fim de toda a avaliação. */
  doneMessage?: string;
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
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<null | {
    correct: boolean;
    canRetry: boolean;
    retryInContext: boolean;
    correctKey: string | null;
    emoji: string;
  }>(null);
  const [pending, setPending] = useState(false);
  const [completedPhase, setCompletedPhase] = useState<Phase | null>(null);

  const step: RunnerStep | undefined = steps[cur];
  // A tela de contexto só serve para a HISTÓRIA. Na Etapa 2 da Fase B o contexto
  // são as frases, que agora aparecem JUNTO da pergunta (na tela da pergunta) —
  // então esses passos pulam a tela de contexto para não mostrar as frases
  // sozinhas primeiro.
  const hasStoryScreen = (s: RunnerStep | undefined): boolean =>
    !!s?.question.context && !s.question.phrases;
  const firstScreen = (s: RunnerStep | undefined): Screen =>
    hasStoryScreen(s) ? "context" : "question";

  const [screen, setScreen] = useState<Screen>(
    beginDone ? "done" : showIntro ? "intro" : firstScreen(steps[startIndex])
  );

  const { play, cancel, ready } = useVoice();
  const router = useRouter();

  // Sair (Esc ou toque longo no ✕) não navega direto: abre um popup de
  // confirmação. O progresso já está salvo — cada resposta é gravada na hora
  // (submitAnswer) —, então confirmar só navega embora.
  const [confirmExit, setConfirmExit] = useState(false);
  const askExit = useCallback(() => {
    cancel();
    setConfirmExit(true);
  }, [cancel]);
  const doExit = useCallback(() => {
    cancel();
    router.push(exitHref);
  }, [cancel, exitHref, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      askExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [askExit]);

  // Toque longo no ✕ para abrir o popup (evita disparo com um toque solto).
  const [exitHolding, setExitHolding] = useState(false);
  const exitHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearExitHoldTimer = () => {
    if (exitHoldTimer.current) {
      clearTimeout(exitHoldTimer.current);
      exitHoldTimer.current = null;
    }
  };
  const startExitHold = () => {
    setExitHolding(true);
    clearExitHoldTimer();
    exitHoldTimer.current = setTimeout(askExit, 700);
  };
  const cancelExitHold = () => {
    setExitHolding(false);
    clearExitHoldTimer();
  };
  useEffect(() => clearExitHoldTimer, []);

  const exitModal = confirmExit ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar saída"
      onClick={() => setConfirmExit(false)}
    >
      <div
        className="bg-white rounded-3xl p-6 max-w-sm w-full text-center shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-black mb-2">Deseja sair?</h2>
        <p className="text-[var(--muted)] font-semibold mb-6">
          O progresso já está salvo. Você pode continuar depois de onde parou.
        </p>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => setConfirmExit(false)}
            className="btn3d btn3d-green w-full"
          >
            Continuar aqui
          </button>
          <button
            onClick={doExit}
            className="font-bold text-[var(--muted)] py-2"
          >
            Sair
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // A história tem que terminar antes de liberar o "Continuar"...
  const ctx = useGatedSpeech(
    play,
    ready,
    step?.question.context ?? null,
    screen === "context",
    speechTimeoutMs
  );
  // ...e a pergunta antes de liberar as alternativas. O texto gated é só a
  // pergunta (o áudio é endereçado pelo conteúdo — ver lib/audio.ts —, então
  // cada fala precisa casar exatamente com o texto que gerou o mp3).
  const qst = useGatedSpeech(
    play,
    ready,
    step?.question.question_text ?? null,
    screen === "question",
    speechTimeoutMs
  );

  /**
   * Fala a pergunta ao abrir a tela. Na Etapa 2 da Fase B, toca ANTES o áudio
   * das frases e, ao terminar, o da pergunta — DOIS mp3 separados, nunca um
   * texto concatenado (que não teria arquivo e cairia no TTS robótico do
   * navegador). É a pergunta que libera as alternativas.
   */
  const speakQuestion = useCallback(
    (s: RunnerStep) => {
      if (s.question.phrases && s.question.context) {
        qst.speakNowPreceded(s.question.context, s.question.question_text);
      } else {
        qst.speakNow(s.question.question_text);
      }
    },
    [qst]
  );

  // Fala automática das instruções ao abrir a tela de intro.
  useEffect(() => {
    if (screen !== "intro") return;
    const delay = ready ? 300 : 700;
    const t = window.setTimeout(() => play(INTRO_SPEECH), delay);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, ready]);

  // A tela em branco avança sozinha depois de BLANK_SCREEN_MS.
  const nextRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (screen !== "blank") return;
    const t = window.setTimeout(() => nextRef.current(), BLANK_SCREEN_MS);
    return () => window.clearTimeout(t);
  }, [screen]);

  // A tela de feedback também avança sozinha; o botão só antecipa. A saída mora
  // num ref (como nextRef) porque o timer não pode depender do render: as
  // dependências de `finishQuestion` mudam a cada render e o timer reiniciaria.
  const afterRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (screen !== "feedback") return;
    const t = window.setTimeout(() => afterRef.current(), FEEDBACK_SCREEN_MS);
    return () => window.clearTimeout(t);
  }, [screen]);

  useEffect(() => () => cancel(), [cancel]);

  const optionLetters = ["A", "B", "C", "D"];

  /** Abre o passo `idx`, falando dentro do gesto de toque (necessário em tablets). */
  const openStep = useCallback(
    (idx: number) => {
      const s = steps[idx];
      if (!s) return;
      setCur(idx);
      setSelected(null);
      setResult(null);
      if (hasStoryScreen(s)) {
        setScreen("context");
        ctx.speakNow(s.question.context!);
      } else {
        setScreen("question");
        speakQuestion(s);
      }
    },
    [steps, ctx, speakQuestion]
  );

  /** Fim da pergunta atual: encerra a fase, ou passa pela tela em branco. */
  const finishQuestion = useCallback(() => {
    cancel();
    const isLast = cur + 1 >= total;
    const phaseChanges = !isLast && steps[cur + 1].phase !== step!.phase;

    if (isLast) {
      setCompletedPhase(step!.phase);
      setScreen("done");
      return;
    }
    if (phaseChanges) {
      setCompletedPhase(step!.phase);
      setScreen("phaseComplete");
      return;
    }
    nextRef.current = () => openStep(cur + 1);
    setScreen("blank");
  }, [cancel, cur, total, steps, step, openStep]);

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
        const retryInContext = res.canRetry && hasStoryScreen(step);
        setResult({
          correct: res.isCorrect,
          canRetry: res.canRetry,
          retryInContext,
          correctKey: res.correctKey,
          // Sorteado aqui (handler de evento, não render): um emoji por resposta.
          emoji:
            FEEDBACK_EMOJIS[Math.floor(Math.random() * FEEDBACK_EMOJIS.length)],
        });
        cancel();
        // Saída da tela de feedback: volta para a pergunta ou segue adiante.
        afterRef.current = () => {
          if (res.canRetry) {
            setSelected(null);
            setResult(null);
            if (retryInContext) {
              setScreen("context");
              ctx.speakNow(step.question.context!);
            } else {
              setScreen("question");
              speakQuestion(step);
            }
          } else {
            finishQuestion();
          }
        };
        setScreen("feedback");
      } else {
        finishQuestion();
      }
    } finally {
      setPending(false);
    }
  }

  function goNextPhase() {
    openStep(cur + 1);
  }

  const progressPct = useMemo(() => {
    if (!step) return 100;
    // Credita a pergunta atual assim que ela se encerra — em qualquer fase.
    const doneHere = screen === "blank" || screen === "phaseComplete" ? 1 : 0;
    return Math.round(((step.indexInPhase + doneHere) / step.phaseTotal) * 100);
  }, [step, screen]);

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
            onClick={() => openStep(cur)}
            className="btn3d btn3d-green w-full mt-6"
          >
            Começar
          </button>
        </div>
        {exitModal}
      </div>
    );
  }

  // ---------- Telas de encerramento ----------
  if (screen === "done") {
    return (
      <CenterCard>
        <div className="text-6xl mb-3">🎉</div>
        <h1 className="text-2xl font-black mb-2">Parabéns, {studentName}!</h1>
        <p className="text-[var(--muted)] font-semibold mb-6">{doneMessage}</p>
        <Link href={finalHref} className="btn3d btn3d-green">
          {resultLabel}
        </Link>
        {exitModal}
      </CenterCard>
    );
  }

  if (screen === "phaseComplete" && completedPhase) {
    return (
      <CenterCard>
        <div className="text-6xl mb-3">{PHASE_EMOJI[completedPhase]}</div>
        <h1 className="text-2xl font-black mb-2">
          {steps[cur]?.stageLabel ?? `Fase ${completedPhase}`} concluída!
        </h1>
        <p className="text-[var(--muted)] font-semibold mb-6">
          Você foi muito bem! Vamos para a próxima parte.
        </p>
        <button onClick={goNextPhase} className="btn3d btn3d-green">
          Continuar
        </button>
        {exitModal}
      </CenterCard>
    );
  }

  // ---------- Respiro entre perguntas ----------
  if (screen === "blank") {
    return <div className="h-[100dvh] bg-white" aria-hidden />;
  }

  if (!step) return null;

  // ---------- Feedback (só Fase B) ----------
  if (screen === "feedback" && result) {
    return <FeedbackScreen result={result} />;
  }

  const header = (
    <div className="shrink-0 px-4 pt-4 pb-2 max-w-2xl w-full mx-auto">
      {/* Botão de sair (✕) à esquerda da barra: discreto (pequeno e apagado) e
          por TOQUE LONGO (~700ms), que apenas ABRE o popup de confirmação — a
          criança não sai com um toque solto. Esc também abre o popup. O rótulo
          da fase segue omitido: é ruído para a criança. */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label="Sair (segure para confirmar)"
          title="Segure para sair"
          onPointerDown={startExitHold}
          onPointerUp={cancelExitHold}
          onPointerLeave={cancelExitHold}
          onPointerCancel={cancelExitHold}
          className={`shrink-0 -m-3 p-3 text-sm leading-none select-none touch-none transition-opacity text-[var(--muted)] ${
            exitHolding ? "opacity-80" : "opacity-10"
          }`}
        >
          ✕
        </button>
        <div className="progressbar flex-1">
          <div style={{ width: `${progressPct}%` }} />
        </div>
      </div>
      {demoBadge && (
        <p className="text-center text-xs font-bold text-[var(--muted)] mt-1">
          {demoBadge}
        </p>
      )}
      {exitModal}
    </div>
  );

  // ---------- Tela da história / frases ----------
  if (screen === "context" && step.question.context) {
    const context = step.question.context;
    return (
      <div className="h-[100dvh] flex flex-col bg-white">
        {header}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 max-w-2xl w-full mx-auto flex flex-col gap-4">
          {step.question.image_key && (
            <div className="relative w-full aspect-[16/9] rounded-2xl overflow-hidden bg-[#f0f4f8]">
              <Image
                src={imageSrc(step.question.image_key)}
                alt=""
                fill
                sizes="(max-width: 640px) 100vw, 640px"
                className="object-contain"
                priority
              />
            </div>
          )}

          <div className="bg-[#f7f9fc] rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <SpeakButton
                text={context}
                speak={play}
                label="Ouvir de novo"
              />
            </div>
            {step.question.phrases ? (
              <ol className="flex flex-col gap-2">
                {step.question.phrases.map((p, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="shrink-0 text-xs font-black uppercase text-[var(--muted)] mt-1">
                      Frase {i + 1}
                    </span>
                    <span className="font-semibold leading-snug">{p}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="font-semibold text-[var(--foreground)] leading-snug">
                {context}
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t-2 border-[var(--border)] bg-white">
          <div className="max-w-2xl w-full mx-auto px-4 py-4 flex items-center justify-end">
            <button
              onClick={() => {
                setScreen("question");
                speakQuestion(step);
              }}
              disabled={!ctx.done}
              className="btn3d btn3d-green"
            >
              {ctx.done ? "Continuar" : "Ouvindo..."}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Tela da pergunta ----------
  const locked = pending || !qst.done;
  return (
    <div className="h-[100dvh] flex flex-col bg-white">
      {header}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 max-w-2xl w-full mx-auto flex flex-col gap-4">
        {/* Etapa 2 da Fase B (Semelhança): as frases ficam à vista JUNTO da
            pergunta — a criança compara as duas frases para responder, e teria
            que lembrá-las da tela anterior se não estivessem aqui. */}
        {step.question.phrases && (
          <div className="bg-[#f7f9fc] rounded-2xl p-4">
            {step.question.context && (
              <div className="mb-2">
                <SpeakButton
                  text={step.question.context}
                  speak={play}
                  label="Ouvir as frases"
                />
              </div>
            )}
            <ol className="flex flex-col gap-2">
              {step.question.phrases.map((p, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="shrink-0 text-xs font-black uppercase text-[var(--muted)] mt-1">
                    Frase {i + 1}
                  </span>
                  <span className="font-semibold leading-snug">{p}</span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <SpeakButton
              text={step.question.question_text}
              speak={play}
              label="Ouvir a pergunta"
            />
          </div>
          <h2 className="text-xl font-black leading-snug">
            {step.question.question_text}
          </h2>
        </div>

        <div className="flex flex-col gap-3 mt-1">
          {step.question.options.map((opt, i) => {
            const isSel = selected === opt.key;
            let cls = "choice";
            if (isSel) cls += " selected";
            return (
              // O botão de áudio fica FORA da alternativa: assim a alternativa
              // pode ser um <button> de verdade, sem aninhar botões.
              <div key={opt.key} className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={locked}
                  aria-pressed={isSel}
                  className={cls}
                  // Escolher a alternativa não fala: quem fala é o 🔊 ao lado.
                  onClick={() => setSelected(opt.key)}
                >
                  {opt.text}
                </button>
                <SpeakButton
                  text={opt.text}
                  speak={play}
                  label={`Ouvir opção ${optionLetters[i]}`}
                />
              </div>
            );
          })}
        </div>

        {!qst.done && (
          <p className="text-center text-sm font-bold text-[var(--muted)]">
            Ouça a pergunta para escolher a resposta.
          </p>
        )}
      </div>

      <div className="shrink-0 border-t-2 border-[var(--border)] bg-white">
        <div className="max-w-2xl w-full mx-auto px-4 py-4 flex items-center justify-end">
          <button
            onClick={onConfirm}
            disabled={selected == null || locked}
            className="btn3d btn3d-green"
          >
            {pending ? "..." : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Tela cheia de "Parabéns" / "Tente novamente" (Fase B). Não tem botão: avança
 * sozinha depois de FEEDBACK_SCREEN_MS (o timer mora no Runner, no efeito da
 * tela "feedback").
 */
function FeedbackScreen({
  result,
}: {
  result: {
    correct: boolean;
    canRetry: boolean;
    retryInContext: boolean;
    correctKey: string | null;
    emoji: string;
  };
}) {
  const emoji = result.emoji;

  if (result.correct) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-6 bg-[var(--green-soft)]">
        <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full">
          <div className="text-7xl mb-3">{emoji}</div>
          <h1 className="text-3xl font-black mb-2 text-[var(--green-dark)]">
            Parabéns!
          </h1>
          <p className="text-[var(--muted)] font-semibold">Você acertou!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center px-6 bg-[var(--red-soft)]">
      <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full">
        <div className="text-7xl mb-3">🤔</div>
        <h1 className="text-3xl font-black mb-2 text-[var(--red-dark)]">
          {result.canRetry ? "Tente novamente" : "Não foi dessa vez"}
        </h1>
        <p className="text-[var(--muted)] font-semibold">
          {result.canRetry
            ? result.retryInContext
              ? "Veja novamente a imagem e a frase antes de responder."
              : "Ouça a pergunta com atenção e escolha outra resposta."
            : "Tudo bem! Vamos para a próxima."}
        </p>
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
