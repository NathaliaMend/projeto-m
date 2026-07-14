import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getBanks } from "@/lib/questions.server";
import type { Answer, Question, Test } from "@/lib/types";

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(
      new URL("/login", process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000")
    );
  }

  const [{ data: tests }, { data: answers }, byBank] = await Promise.all([
    supabase.from("tests").select("*"),
    supabase.from("answers").select("*"),
    getBanks(supabase),
  ]);

  const testById = new Map<string, Test>();
  for (const t of (tests ?? []) as Test[]) testById.set(t.id, t);

  const questionById = new Map<string, Question>();
  for (const list of Object.values(byBank)) {
    for (const q of list) questionById.set(q.id, q);
  }

  const header = [
    "aluno",
    "data_nascimento",
    "status",
    "fase",
    "metafora",
    "etapa",
    "pergunta",
    "resposta_escolhida",
    "resposta_correta",
    "acertou",
    "respondido_em",
  ];

  const rows = ((answers ?? []) as Answer[])
    .map((a) => {
      const t = testById.get(a.test_id);
      const q = questionById.get(a.question_id);
      if (!t) return null;
      const selected = q?.options.find((o) => o.key === a.selected_key);
      const correct = q?.options.find((o) => o.is_correct);
      return [
        t.student_name,
        t.student_birth_date ?? "",
        t.status,
        a.phase,
        q?.metaphor ?? "",
        q?.step ?? "",
        q?.question_text ?? "",
        selected?.text ?? a.selected_key,
        correct?.text ?? "",
        a.is_correct ? "sim" : "nao",
        new Date(a.answered_at).toLocaleString("pt-BR"),
      ];
    })
    .filter((r): r is string[] => r !== null);

  const csv =
    "﻿" + // BOM para acentos abrirem certo no Excel
    [header, ...rows]
      .map((r) => r.map(csvCell).join(","))
      .join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="avaliacoes-${new Date()
        .toISOString()
        .slice(0, 10)}.csv"`,
    },
  });
}
