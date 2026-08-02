import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Answer, TestWithStudent } from "@/lib/types";

function csvCell(value: string | number | null | undefined): string {
  const s = value == null ? "" : String(value);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function durationSeconds(ms: number): number {
  return Math.round(Math.max(0, ms)) / 1000;
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

  // Sem `questions`: cada resposta carrega a foto da pergunta como ela foi
  // aplicada (answers.presented). Ler a tabela viva faria o CSV mudar quando o
  // banco de perguntas fosse re-semeado — o dado histórico tem que ficar parado.
  const [{ data: tests }, { data: answers }] = await Promise.all([
    supabase.from("tests").select("*, student:students(name, birth_date)"),
    supabase.from("answers").select("*"),
  ]);

  const testById = new Map<string, TestWithStudent>();
  for (const t of (tests ?? []) as TestWithStudent[]) testById.set(t.id, t);

  const header = [
    "aluno",
    "data_nascimento",
    "status",
    "dispositivo",
    "fase",
    "historico",
    "aplicacao",
    "item",
    "metafora",
    "metafora_treinada",
    "etapa",
    "etapa_nome",
    "sem_contexto",
    "pergunta",
    "primeira_resposta",
    "resposta_correta",
    "acertou_de_primeira",
    "tentativas",
    "tempo_total_seg",
    "tempo_1a_resposta_seg",
    "erros_antes_de_acertar",
    "chegou_na_correta",
    "todas_as_escolhas",
    "respondido_em",
  ];

  const rows = ((answers ?? []) as Answer[])
    .map((a) => {
      const t = testById.get(a.test_id);
      if (!t) return null;
      // A foto do momento da aplicação, nunca a tabela viva.
      const p = a.presented;
      const selected = p.options.find((o) => o.key === a.selected_key);
      const correct = p.options.find((o) => o.is_correct);
      // O texto de cada escolha, em ordem — na Fase B mostra o caminho até acertar.
      const chosen = (a.selected_keys ?? [a.selected_key])
        .map((k) => p.options.find((o) => o.key === k)?.text ?? k)
        .join(" | ");
      // Quantas vezes errou antes de acertar: se resolveu, foram (tentativas−1)
      // erros até a correta; se não resolveu, todas as tentativas foram erro.
      const errosAntes = a.solved ? a.attempts - 1 : a.attempts;
      const totalDuration = (a.durations_ms ?? []).reduce(
        (sum, duration) => sum + duration,
        0
      );
      return [
        t.student?.name ?? "",
        t.student?.birth_date ?? "",
        t.status,
        a.device ?? "",
        a.phase,
        a.history ? "sim" : "nao",
        a.attempt_round,
        p.code,
        p.metaphor ?? "",
        p.parent_metaphor_code ?? "",
        p.etapa ?? "",
        p.etapa_label ?? "",
        // A condição experimental: a criança viu esta pergunta sem história/imagem?
        p.hide_context ? "sim" : "nao",
        p.question_text,
        selected?.text ?? a.selected_key,
        correct?.text ?? "",
        a.is_correct ? "sim" : "nao",
        a.attempts,
        durationSeconds(totalDuration),
        durationSeconds(a.durations_ms?.[0] ?? 0),
        errosAntes,
        a.solved ? "sim" : "nao",
        chosen,
        new Date(a.answered_at).toLocaleString("pt-BR"),
      ];
    })
    .filter((r): r is (string | number)[] => r !== null);

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
