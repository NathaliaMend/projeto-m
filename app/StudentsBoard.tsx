"use client";

import { useState } from "react";
import Link from "next/link";

export interface StudentSummary {
  id: string;
  name: string;
  birthDate: string | null;
  ownerId: string;
  ownerLabel: string; // nome/e-mail de quem cadastrou o aluno
  testsCount: number;
  inProgress: number;
  updatedAt: string | null;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR");
}

type Filter = "all" | "mine";

export function StudentsBoard({
  students,
  currentUserId,
}: {
  students: StudentSummary[];
  currentUserId: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const mineCount = students.filter((s) => s.ownerId === currentUserId).length;
  const visible =
    filter === "mine"
      ? students.filter((s) => s.ownerId === currentUserId)
      : students;

  const tabClass = (active: boolean) =>
    `px-4 py-2 rounded-full text-sm font-bold transition-colors ${
      active
        ? "bg-[var(--blue)] text-white"
        : "bg-white text-[var(--muted)] border-2 border-[var(--border)] hover:border-[var(--blue)]"
    }`;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={tabClass(filter === "all")}
        >
          Todos os alunos ({students.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("mine")}
          className={tabClass(filter === "mine")}
        >
          Meus alunos ({mineCount})
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center text-[var(--muted)] font-semibold">
          {filter === "mine"
            ? "Você ainda não cadastrou nenhum aluno."
            : "Nenhum aluno ainda."}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((student) => {
            const mine = student.ownerId === currentUserId;
            return (
              <li
                key={student.id}
                className="bg-white rounded-2xl border-2 border-transparent hover:border-[var(--blue)] transition-colors"
              >
                <Link
                  href={`/students/${student.id}`}
                  className="block p-4 sm:p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-black text-lg truncate">
                          {student.name}
                        </h2>
                        {!mine && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[var(--border)] text-[var(--muted)]">
                            {student.ownerLabel}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-[var(--muted)] font-semibold mt-0.5">
                        Nasc.: {formatDate(student.birthDate)}
                      </p>
                    </div>
                    <span className="text-[var(--blue)] font-black text-2xl shrink-0">
                      →
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-4 text-sm font-bold text-[var(--muted)]">
                    <span>
                      {student.testsCount} avaliação
                      {student.testsCount === 1 ? "" : "ões"}
                    </span>
                    {student.inProgress > 0 && (
                      <span className="text-[var(--blue-dark)]">
                        {student.inProgress} em andamento
                      </span>
                    )}
                    <span className="ml-auto">
                      Atualizado em {formatDate(student.updatedAt)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
