"use client";

import { useEffect, useState } from "react";
import { formatDuration } from "@/lib/duration";
import type { Answer } from "@/lib/types";

function durationOf(answer: Answer) {
  return (answer.durations_ms ?? []).reduce((sum, duration) => sum + duration, 0);
}

export function HistorySidebar({
  history,
  questionText,
}: {
  history: Answer[];
  questionText: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 self-start rounded-xl border-2 border-[var(--border)] px-2.5 py-1 text-xs font-black text-[var(--muted)] hover:border-[var(--blue)] hover:text-[var(--blue-dark)]"
        aria-label={`Abrir histórico desta pergunta (${history.length} aplicação${history.length === 1 ? "" : "ões"})`}
      >
        Histórico ({history.length})
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/40"
          role="presentation"
          onClick={() => setOpen(false)}
        >
          <aside
            className="ml-auto flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Histórico da pergunta"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-4 border-b-2 border-[var(--border)] p-5">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase text-[var(--muted)]">
                  Histórico da pergunta
                </p>
                <h2 className="mt-1 font-black leading-snug">{questionText}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="shrink-0 rounded-xl px-2 py-1 text-xl font-black text-[var(--muted)] hover:bg-[#f7f9fc]"
                aria-label="Fechar histórico"
              >
                ×
              </button>
            </header>

            <div className="flex-1 overflow-y-auto p-5">
              <ul className="flex flex-col gap-3">
                {history.map((answer) => {
                  const selected = answer.presented.options.find(
                    (option) => option.key === answer.selected_key
                  );
                  const total = durationOf(answer);
                  return (
                    <li
                      key={answer.id}
                      className="rounded-2xl bg-[#f7f9fc] p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-black">
                          Aplicação {answer.attempt_round}
                        </span>
                        <span className="text-xs font-bold text-[var(--muted)]">
                          {new Date(answer.answered_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
                        1ª resposta: {selected?.text ?? answer.selected_key}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
                        Tempo: {formatDuration(total)} · 1ª resposta: {formatDuration(
                          answer.durations_ms?.[0] ?? 0
                        )}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
                        {answer.attempts} tentativa
                        {answer.attempts === 1 ? "" : "s"} · {answer.is_correct ? "acertou de primeira" : "errou de primeira"}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
