"use client";

import { useMemo, useState } from "react";

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

// Faixa de anos: crianças da avaliação têm até ~12 anos, mas deixamos folga.
// O <input type="date"> nativo obriga a "voltar muito os anos" no calendário;
// com um seletor de ano isso vira um toque. Anos em ordem decrescente.
const YEARS_BACK = 20;
// Não há alunos com menos de 6 anos, então pulamos os 5 anos mais recentes: o
// ano mais novo da lista é (ano atual − 5).
const SKIP_RECENT_YEARS = 5;

function daysInMonth(month: number, year: number): number {
  // month é 1..12; o dia 0 do mês seguinte é o último dia deste mês.
  if (!month) return 31;
  return new Date(year || 2000, month, 0).getDate();
}

/**
 * Seletor de data de nascimento em três campos (dia / mês / ano). Escreve a data
 * em ISO (`YYYY-MM-DD`) num input escondido `student_birth_date`, que é o que a
 * server action `createTest` espera. A data é opcional: enquanto os três campos
 * não estiverem preenchidos, o valor enviado fica vazio.
 */
export function BirthDatePicker() {
  const currentYear = new Date().getFullYear();
  const [day, setDay] = useState("");
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");

  const years = useMemo(
    () =>
      Array.from(
        { length: YEARS_BACK + 1 },
        (_, i) => currentYear - SKIP_RECENT_YEARS - i
      ),
    [currentYear]
  );

  const maxDay = daysInMonth(Number(month), Number(year));
  const days = useMemo(
    () => Array.from({ length: maxDay }, (_, i) => i + 1),
    [maxDay]
  );

  // Se o dia escolhido não cabe no mês/ano novo (ex.: 31 → fevereiro), limpa —
  // no handler do evento, nunca durante o render.
  function clampDay(nextMonth: number, nextYear: number) {
    if (Number(day) > daysInMonth(nextMonth, nextYear)) setDay("");
  }

  const iso =
    day && month && year
      ? `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      : "";

  const selectClass =
    "rounded-xl border-2 border-[var(--border)] px-3 py-3 font-semibold outline-none focus:border-[var(--blue)] bg-white";

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-bold text-[var(--muted)]">
        Data de nascimento
      </span>
      <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-2">
        <select
          aria-label="Dia"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className={selectClass}
        >
          <option value="">Dia</option>
          {days.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          aria-label="Mês"
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            clampDay(Number(e.target.value), Number(year));
          }}
          className={selectClass}
        >
          <option value="">Mês</option>
          {MONTHS.map((label, i) => (
            <option key={label} value={i + 1}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Ano"
          value={year}
          onChange={(e) => {
            setYear(e.target.value);
            clampDay(Number(month), Number(e.target.value));
          }}
          className={selectClass}
        >
          <option value="">Ano</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>
      <input type="hidden" name="student_birth_date" value={iso} />
    </div>
  );
}
