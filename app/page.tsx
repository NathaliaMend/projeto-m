import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { TestWithStudent } from "@/lib/types";
import { StudentsBoard, type StudentSummary } from "./StudentsBoard";

/** Teste do dashboard: inclui o dono do aluno, para o filtro "Meus alunos". */
type DashboardTest = TestWithStudent & {
  student: { name: string; birth_date: string | null; applicator_id: string } | null;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Visibilidade compartilhada (ver 0002_shared_visibility.sql): a query traz os
  // testes de TODA a equipe; o filtro "Meus alunos" mora no cliente.
  const [{ data: tests }, { data: applicators }] = await Promise.all([
    supabase
      .from("tests")
      .select("*, student:students(name, birth_date, applicator_id)")
      .order("created_at", { ascending: false }),
    supabase.from("applicators").select("id, name, email"),
  ]);

  const ownerLabelById = new Map<string, string>();
  for (const a of applicators ?? []) {
    ownerLabelById.set(a.id, a.name || a.email || "Avaliador");
  }

  const list = (tests ?? []) as DashboardTest[];
  const studentsById = new Map<
    string,
    {
      id: string;
      name: string;
      birthDate: string | null;
      ownerId: string;
      tests: DashboardTest[];
    }
  >();

  for (const test of list) {
    if (!test.student) continue;
    const student = studentsById.get(test.student_id) ?? {
      id: test.student_id,
      name: test.student.name,
      birthDate: test.student.birth_date,
      ownerId: test.student.applicator_id,
      tests: [],
    };
    student.tests.push(test);
    studentsById.set(test.student_id, student);
  }

  // Tests já vêm ordenados por created_at desc, então tests[0] é o mais recente.
  const students: StudentSummary[] = [...studentsById.values()].map((s) => ({
    id: s.id,
    name: s.name,
    birthDate: s.birthDate,
    ownerId: s.ownerId,
    ownerLabel: ownerLabelById.get(s.ownerId) ?? "Avaliador",
    testsCount: s.tests.length,
    inProgress: s.tests.filter((t) => t.status === "in_progress").length,
    updatedAt: s.tests[0]?.created_at ?? null,
  }));

  return (
    <main className="min-h-screen bg-[#f7f9fc]">
      <header className="bg-white border-b-2 border-[var(--border)]">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🧠</span>
            <h1 className="text-lg sm:text-xl font-black">Alunos</h1>
          </div>
          <form action="/auth/signout" method="post">
            <button className="text-sm font-bold text-[var(--muted)] hover:underline">
              Sair
            </button>
          </form>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <Link href="/students/new" className="btn3d btn3d-green">
            + Novo aluno
          </Link>
          <a
            href="/api/tests/export"
            className="btn3d btn3d-blue"
            aria-label="Exportar todos os testes em CSV"
          >
            Exportar CSV
          </a>
          <Link href="/questions" className="btn3d btn3d-gray">
            Perguntas
          </Link>
        </div>

        <StudentsBoard students={students} currentUserId={user.id} />
      </div>
    </main>
  );
}
