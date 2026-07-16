"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { SpeakButton, useVoice } from "@/app/tests/[id]/run/speech";
import { FEEDBACK_SCREEN_MS, speechTimeoutMs } from "@/lib/config";
import { TUTORIAL_EXAMPLES } from "./examples";

/**
 * Tutorial guiado: a criança aprende a MECÂNICA do teste (ouvir o áudio,
 * escolher, confirmar) antes da Fase A, para que errar por não entender o app
 * não vire "não entendeu a metáfora".
 *
 * Não reusa o Runner de propósito. O Runner corre sozinho e fala sozinho ao
 * abrir a tela; aqui é o contrário — nada fala sem a criança tocar no 🔊, que é
 * justamente o que o tutorial ensina. Encaixar os dois comportamentos no mesmo
 * componente sairia mais caro que estas telas. O que importa não duplicar (a
 * camada de áudio e as classes visuais) vem de speech.tsx e globals.css.
 *
 * Cada passo do guia é um estado: a mão e o anel marcam o único alvo daquele
 * passo, e é a ação da criança que avança.
 */
type Guide =
  | "hearContext"
  | "continue"
  | "hearQuestion"
  | "choose"
  | "confirm"
  | "feedback"
  | "done";

export function TutorialRunner({ exitHref = "/" }: { exitHref?: string }) {
  const examples = TUTORIAL_EXAMPLES;
  const [cur, setCur] = useState(0);
  const ex = examples[cur];

  const firstGuide = (i: number): Guide =>
    examples[i].context ? "hearContext" : "hearQuestion";

  const [guide, setGuide] = useState<Guide>(firstGuide(0));
  const [selected, setSelected] = useState<string | null>(null);
  const [correct, setCorrect] = useState(false);

  const { play, cancel } = useVoice();

  const timerRef = useRef<number | null>(null);

  /**
   * Fala `text` e avança o guia quando a fala termina.
   *
   * O `from` não é enfeite: a trava de tempo existe para o caso de o áudio
   * falhar calado (senão a criança fica presa esperando uma fala que não vem),
   * mas sem conferir em qual passo estamos ela dispararia depois de a criança
   * já ter avançado no toque — e a puxaria de volta para a tela anterior.
   */
  const hear = useCallback(
    (text: string, from: Guide, next: Guide, onEnd?: () => void) => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      const advance = () => {
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        setGuide((g) => (g === from ? next : g));
        onEnd?.();
      };
      timerRef.current = window.setTimeout(advance, speechTimeoutMs(text));
      play(text, advance);
    },
    [play]
  );

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      cancel();
    },
    [cancel]
  );

  // A tela de feedback avança sozinha, como no teste real. A saída mora num ref
  // porque o timer não pode depender do render.
  const nextRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (guide !== "feedback") return;
    const t = window.setTimeout(() => nextRef.current(), FEEDBACK_SCREEN_MS);
    return () => window.clearTimeout(t);
  }, [guide]);

  function onConfirm() {
    if (!selected) return;
    cancel();
    const hit = ex.options.find((o) => o.key === selected)?.is_correct ?? false;
    setCorrect(hit);
    nextRef.current = hit
      ? () => {
          const nx = cur + 1;
          if (nx >= examples.length) {
            setGuide("done");
            return;
          }
          setCur(nx);
          setSelected(null);
          setGuide(firstGuide(nx));
        }
      : () => {
          // Errou: volta para escolher de novo, sem punição — é tutorial.
          setSelected(null);
          setGuide("choose");
        };
    setGuide("feedback");
  }

  // ---------- Tela final ----------
  if (guide === "done") {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-6 bg-[var(--green-soft)]">
        <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full">
          <div className="text-6xl mb-3">🎉</div>
          <h1 className="text-2xl font-black mb-2">Você já sabe jogar!</h1>
          <p className="text-[var(--muted)] font-semibold mb-6">
            Agora é só ouvir com atenção e escolher a resposta que você achar
            certa.
          </p>
          <Link href={exitHref} className="btn3d btn3d-green">
            Terminar
          </Link>
        </div>
      </div>
    );
  }

  // ---------- Feedback ----------
  if (guide === "feedback") {
    return (
      <div
        className={`min-h-[100dvh] flex items-center justify-center px-6 ${
          correct ? "bg-[var(--green-soft)]" : "bg-[var(--red-soft)]"
        }`}
      >
        <div className="bg-white rounded-3xl p-8 text-center max-w-sm w-full">
          <div className="text-7xl mb-3">{correct ? "🎉" : "🤔"}</div>
          <h1
            className={`text-3xl font-black mb-2 ${
              correct ? "text-[var(--green-dark)]" : "text-[var(--red-dark)]"
            }`}
          >
            {correct ? "Muito bem!" : "Quase!"}
          </h1>
          <p className="text-[var(--muted)] font-semibold">
            {correct
              ? "Era essa mesmo. Vamos para a próxima."
              : "Não faz mal. Vamos tentar de novo."}
          </p>
        </div>
      </div>
    );
  }

  const onContextScreen = guide === "hearContext" || guide === "continue";
  const stepPct = Math.round((cur / examples.length) * 100);

  const header = (
    <div className="shrink-0 px-4 pt-4 pb-2 max-w-2xl w-full mx-auto">
      <div className="flex items-center gap-3">
        <Link
          href={exitHref}
          className="text-2xl leading-none text-[var(--muted)]"
          aria-label="Sair do tutorial"
          title="Sair do tutorial"
        >
          ✕
        </Link>
        <div className="progressbar flex-1">
          <div style={{ width: `${stepPct}%` }} />
        </div>
        <span className="text-sm font-black text-[var(--muted)] whitespace-nowrap">
          Tutorial {cur + 1}/{examples.length}
        </span>
      </div>
      <p className="text-center text-xs font-bold text-[var(--muted)] mt-1">
        Vamos treinar antes de começar · {ex.teaches}
      </p>
    </div>
  );

  const coach = (text: string) => (
    <div className="shrink-0 px-4 pb-2 max-w-2xl w-full mx-auto">
      <p className="bg-[var(--blue-soft)] border-2 border-[var(--blue)] rounded-2xl px-4 py-2.5 font-black text-center text-[var(--blue-dark)]">
        {text}
      </p>
    </div>
  );

  // ---------- Tela da história / frases ----------
  if (onContextScreen && ex.context) {
    const hearing = guide === "hearContext";
    return (
      <div className="h-[100dvh] flex flex-col bg-white">
        {header}
        {coach(
          hearing
            ? ex.phrases
              ? "Toque no 🔊 para ouvir as frases."
              : "Toque no 🔊 para ouvir a história."
            : "Muito bem! Agora toque em Continuar."
        )}

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 max-w-2xl w-full mx-auto flex flex-col gap-4">
          {ex.image && (
            <div className="relative w-full aspect-[16/9] rounded-2xl overflow-hidden bg-[#f0f4f8]">
              <Image
                src={`/images/${ex.image}`}
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
              <Spot on={hearing} round hand="left-full top-0 ml-1.5">
                <SpeakButton
                  text={ex.context}
                  speak={(t, onEnd) => hear(t, "hearContext", "continue", onEnd)}
                  label={ex.phrases ? "Ouvir as frases" : "Ouvir a história"}
                />
              </Spot>
              <span className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">
                {ex.phrases ? "Leia as frases" : "História"}
              </span>
            </div>

            {ex.phrases ? (
              <ol className="flex flex-col gap-2">
                {ex.phrases.map((p, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="shrink-0 text-xs font-black uppercase text-[var(--muted)] mt-1">
                      Frase {i + 1}
                    </span>
                    <span className="font-semibold leading-snug">{p}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="font-semibold leading-snug">{ex.context}</p>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t-2 border-[var(--border)] bg-white">
          <div className="max-w-2xl w-full mx-auto px-4 py-4 flex items-center justify-end">
            <Spot on={!hearing} hand="right-2 -top-9">
              <button
                onClick={() => {
                  cancel();
                  setGuide("hearQuestion");
                }}
                disabled={hearing}
                className="btn3d btn3d-green"
              >
                Continuar
              </button>
            </Spot>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Tela da pergunta ----------
  return (
    <div className="h-[100dvh] flex flex-col bg-white">
      {header}
      {coach(
        guide === "hearQuestion"
          ? "Toque no 🔊 para ouvir a pergunta."
          : guide === "choose"
            ? "Toque na resposta que você acha certa. O 🔊 do lado lê cada uma."
            : "Agora toque em Confirmar."
      )}

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 max-w-2xl w-full mx-auto flex flex-col gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Spot
              on={guide === "hearQuestion"}
              round
              hand="left-full top-0 ml-1.5"
            >
              <SpeakButton
                text={ex.question_text}
                speak={(t, onEnd) => hear(t, "hearQuestion", "choose", onEnd)}
                label="Ouvir a pergunta"
              />
            </Spot>
            <span className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">
              Pergunta
            </span>
          </div>
          <h2 className="text-xl font-black leading-snug">
            {ex.question_text}
          </h2>
        </div>

        {/* A mão marca o grupo, nunca uma alternativa: apontar a resposta certa
            ensinaria a seguir a mão em vez de ouvir a pergunta. */}
        <Spot
          on={guide === "choose"}
          hand="left-1/2 -bottom-10 -ml-4"
          className="flex flex-col gap-3 mt-1"
        >
          {ex.options.map((opt, i) => (
            <div key={opt.key} className="flex items-center gap-2">
              <button
                type="button"
                disabled={guide === "hearQuestion"}
                aria-pressed={selected === opt.key}
                className={`choice ${selected === opt.key ? "selected" : ""}`}
                onClick={() => {
                  setSelected(opt.key);
                  setGuide("confirm");
                }}
              >
                {opt.text}
              </button>
              <SpeakButton
                text={opt.text}
                speak={play}
                label={`Ouvir opção ${["A", "B", "C", "D"][i]}`}
              />
            </div>
          ))}
        </Spot>
      </div>

      <div className="shrink-0 border-t-2 border-[var(--border)] bg-white">
        <div className="max-w-2xl w-full mx-auto px-4 py-4 flex items-center justify-end">
          <Spot on={guide === "confirm"} hand="right-2 -top-9">
            <button
              onClick={onConfirm}
              disabled={!selected}
              className="btn3d btn3d-green"
            >
              Confirmar
            </button>
          </Spot>
        </div>
      </div>
    </div>
  );
}

/** 👆 do passo atual. Não recebe toque — o alvo embaixo dela é que recebe. */
function Hand({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden className={`guide-hand ${className}`}>
      <span>👆</span>
    </span>
  );
}

/**
 * Marca o alvo do passo atual: anel em volta + mão. Fora do passo, é um
 * invólucro transparente — por isso `on` some com o anel em vez de escondê-lo.
 */
function Spot({
  on,
  round = false,
  hand,
  className = "",
  children,
}: {
  on: boolean;
  round?: boolean;
  hand: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative ${className || "inline-flex"} ${
        on ? `guide-target ${round ? "round" : ""}` : ""
      }`}
    >
      {children}
      {on && <Hand className={hand} />}
    </div>
  );
}
