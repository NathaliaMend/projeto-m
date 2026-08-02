"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restartStage } from "@/app/tests/actions";

/**
 * "Recomeçar do 0" de UMA sub-etapa da Fase B: apaga as respostas daquela
 * sub-etapa para que ela possa ser aplicada de novo. Pede confirmação porque
 * é destrutivo — o dado gravado (inclusive o acerto de primeira) é removido.
 */
export function StageRestartButton({
  testId,
  stageId,
}: {
  testId: string;
  stageId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function restart() {
    startTransition(async () => {
      await restartStage(testId, stageId);
      setConfirming(false);
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5 text-xs font-bold shrink-0">
        <span className="text-[var(--muted)]">Apagar respostas?</span>
        <button
          type="button"
          onClick={restart}
          disabled={pending}
          className="px-2 py-0.5 rounded-md bg-[var(--red)] text-white"
        >
          Sim
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={pending}
          className="px-2 py-0.5 rounded-md bg-[var(--border)] text-[var(--muted)]"
        >
          Não
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-xs font-bold text-[var(--red-dark)] hover:underline shrink-0"
    >
      Recomeçar
    </button>
  );
}
