"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { restartTest, deleteTest } from "./actions";

export function TestActions({ testId }: { testId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<null | "restart" | "delete">(null);

  function run(action: "restart" | "delete") {
    startTransition(async () => {
      if (action === "restart") await restartTest(testId);
      else await deleteTest(testId);
      setConfirm(null);
      router.refresh();
    });
  }

  if (confirm) {
    const isDelete = confirm === "delete";
    return (
      <div className="flex items-center gap-2 text-sm font-bold">
        <span className="text-[var(--muted)]">
          {isDelete ? "Excluir mesmo?" : "Recomeçar do zero?"}
        </span>
        <button
          onClick={() => run(confirm)}
          disabled={pending}
          className="px-3 py-1 rounded-lg bg-[var(--red)] text-white"
        >
          Sim
        </button>
        <button
          onClick={() => setConfirm(null)}
          disabled={pending}
          className="px-3 py-1 rounded-lg bg-[var(--border)] text-[var(--muted)]"
        >
          Não
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm font-bold">
      <button
        onClick={() => setConfirm("restart")}
        className="text-[var(--blue-dark)] hover:underline"
      >
        Recomeçar
      </button>
      <button
        onClick={() => setConfirm("delete")}
        className="text-[var(--red-dark)] hover:underline"
      >
        Excluir
      </button>
    </div>
  );
}
