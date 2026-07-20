"use client";

import { useMemo, useState } from "react";
import type { Bank, Question, QuestionOption } from "@/lib/types";
import { validateOptions } from "@/lib/questions";
import { imageSrc } from "@/lib/images";
import { createClient } from "@/lib/supabase/client";
import { updateQuestion } from "./actions";
import { resizeImage } from "./resizeImage";

/** Cliente de browser do Supabase, só para o upload de imagem (Storage). */
let _sb: ReturnType<typeof createClient> | null = null;
const supabase = () => (_sb ??= createClient());
const IMAGE_BUCKET = "question-images";

/** As 3 fases visíveis mapeiam para os 3 bancos (a mesma pergunta A1 serve A/AR1/AR2). */
const FASES: { bank: Bank; label: string }[] = [
  { bank: "A1", label: "Fase A — linha de base e reaplicações" },
  { bank: "B", label: "Fase B — treino" },
  { bank: "A2", label: "Fase C — generalização" },
];
const FASE_LABEL: Record<Bank, string> = {
  A1: "Fase A",
  B: "Fase B",
  A2: "Fase C",
};
const FASE_EMOJI: Record<Bank, string> = { A1: "🌱", B: "🚀", A2: "🏆" };

/** Identidade da metáfora: no banco B várias perguntas treinam a mesma. */
function metaphorKey(q: Question): string {
  return q.parent_metaphor_code ?? q.code;
}

export function QuestionsEditor({
  questions,
  answeredIds,
}: {
  questions: Question[];
  answeredIds: string[];
}) {
  const [items, setItems] = useState<Question[]>(questions);
  const [busca, setBusca] = useState("");

  const answered = useMemo(() => new Set(answeredIds), [answeredIds]);

  function onSaved(updated: Question) {
    setItems((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
  }

  const bankItems = (bank: Bank) => items.filter((q) => q.bank === bank);

  // Fase B organizada como no /preview: metáfora treinada → etapa → perguntas.
  const faseB = useMemo(() => {
    const metas = new Map<
      string,
      {
        code: string;
        metaphor: string;
        etapas: Map<number, { label: string; qs: Question[] }>;
      }
    >();
    for (const q of items) {
      if (q.bank !== "B") continue;
      const key = metaphorKey(q);
      let m = metas.get(key);
      if (!m) {
        m = { code: key, metaphor: q.metaphor ?? key, etapas: new Map() };
        metas.set(key, m);
      }
      const et = q.etapa ?? 0;
      let g = m.etapas.get(et);
      if (!g) {
        g = { label: q.etapa_label ?? "", qs: [] };
        m.etapas.set(et, g);
      }
      g.qs.push(q);
    }
    return [...metas.values()].map((m) => ({
      code: m.code,
      metaphor: m.metaphor,
      count: [...m.etapas.values()].reduce((n, g) => n + g.qs.length, 0),
      etapas: [...m.etapas.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([etapa, g]) => ({ etapa, label: g.label, qs: g.qs })),
    }));
  }, [items]);

  const b = busca.trim().toLowerCase();
  const results = b
    ? items.filter(
        (q) =>
          q.code.toLowerCase().includes(b) ||
          q.question_text.toLowerCase().includes(b)
      )
    : null;

  const rows = (qs: Question[]) => (
    <ul className="flex flex-col gap-2 mt-2">
      {qs.map((q) => (
        <QuestionRow
          key={q.id}
          question={q}
          answered={answered.has(q.id)}
          onSaved={onSaved}
        />
      ))}
    </ul>
  );

  const summaryCls =
    "cursor-pointer select-none font-black flex items-center gap-2 marker:content-none";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-[var(--muted)]">
        Edições valem para as próximas aplicações. Respostas já registradas não
        mudam. O áudio novo só entra depois de rodar a geração de áudio.
      </p>

      <input
        type="search"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar por código ou texto"
        aria-label="Buscar"
        className="rounded-xl border-2 border-[var(--border)] bg-white px-3 py-2 font-semibold text-sm"
      />

      {results ? (
        <>
          <p className="text-xs font-bold text-[var(--muted)]">
            {results.length} resultado{results.length === 1 ? "" : "s"}
          </p>
          {rows(results)}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          {FASES.map((f) => (
            <details
              key={f.bank}
              className="rounded-2xl border-2 border-[var(--border)] bg-white p-4"
            >
              <summary className={`${summaryCls} text-base`}>
                <span>{FASE_EMOJI[f.bank]}</span>
                <span>{f.label}</span>
                <span className="ml-auto text-xs text-[var(--muted)]">
                  {bankItems(f.bank).length} perguntas
                </span>
              </summary>

              {f.bank === "B" ? (
                <div className="flex flex-col gap-2 mt-3">
                  {faseB.map((m) => (
                    <details
                      key={m.code}
                      className="rounded-xl border-2 border-[var(--border)] bg-[#fbfcfe] p-3"
                    >
                      <summary className={`${summaryCls} text-sm`}>
                        <span className="font-black">{m.code}</span>
                        <span className="font-semibold text-[var(--muted)] truncate">
                          {m.metaphor}
                        </span>
                        <span className="ml-auto text-xs text-[var(--muted)] shrink-0">
                          {m.count}
                        </span>
                      </summary>

                      <div className="flex flex-col gap-2 mt-2">
                        {m.etapas.map((et) => (
                          <details key={et.etapa} className="pl-1">
                            <summary
                              className={`${summaryCls} text-xs uppercase tracking-wide text-[var(--muted)]`}
                            >
                              Etapa {et.etapa}: {et.label}
                              <span className="ml-auto">{et.qs.length}</span>
                            </summary>
                            {rows(et.qs)}
                          </details>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                rows(bankItems(f.bank))
              )}
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function QuestionRow({
  question,
  answered,
  onSaved,
}: {
  question: Question;
  answered: boolean;
  onSaved: (q: Question) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(question.question_text);
  const [imageKey, setImageKey] = useState(question.image_key ?? "");
  const [context, setContext] = useState(question.context ?? "");
  const [phrases, setPhrases] = useState<string[]>(question.phrases ?? []);
  const [options, setOptions] = useState<QuestionOption[]>(question.options);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Etapa 2 da Fase B tem `phrases`; outros itens podem ter só uma história
  // (`context`); há ainda os "apenas a pergunta" (nenhum dos dois).
  const hasPhrases = question.phrases != null;
  const hasStory = question.context != null && question.phrases == null;

  const invalid =
    text.trim() === ""
      ? "A pergunta não pode ficar em branco."
      : hasPhrases && phrases.some((p) => p.trim() === "")
        ? "As frases não podem ficar em branco."
        : validateOptions(options, question.options);

  const phrasesChanged =
    hasPhrases &&
    phrases.some((p, i) => p !== (question.phrases?.[i] ?? ""));

  const dirty =
    text !== question.question_text ||
    imageKey !== (question.image_key ?? "") ||
    (hasStory && context !== (question.context ?? "")) ||
    phrasesChanged ||
    options.some(
      (o, i) =>
        o.text !== question.options[i].text ||
        o.is_correct !== question.options[i].is_correct
    );

  const imgSrc = imageKey.trim().replace(/^\/+/, "");

  function setCorrect(key: string) {
    setOptions((prev) =>
      prev.map((o) => ({ ...o, is_correct: o.is_fixed ? false : o.key === key }))
    );
    setMsg(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reenviar o mesmo arquivo depois
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setMsg({ ok: false, text: "Selecione um arquivo de imagem." });
      return;
    }
    // Barra o arquivo original gigante ANTES de decodificar; depois a redução
    // deixa o que sobe bem menor.
    if (file.size > 15 * 1024 * 1024) {
      setMsg({ ok: false, text: "Imagem muito grande (máx. 15 MB)." });
      return;
    }
    setUploading(true);
    setMsg(null);
    try {
      const blob = await resizeImage(file);
      const path = `${question.code}-${Date.now()}.jpg`;
      const { error } = await supabase()
        .storage.from(IMAGE_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: true });
      if (error) throw error;
      const { data } = supabase().storage.from(IMAGE_BUCKET).getPublicUrl(path);
      setImageKey(data.publicUrl);
      setMsg({ ok: true, text: "Imagem enviada — clique em Salvar para aplicar." });
    } catch (err) {
      setMsg({
        ok: false,
        text: `Falha no upload: ${err instanceof Error ? err.message : "erro"}`,
      });
    } finally {
      setUploading(false);
    }
  }

  function setOptText(key: string, value: string) {
    setOptions((prev) =>
      prev.map((o) => (o.key === key ? { ...o, text: value } : o))
    );
    setMsg(null);
  }

  async function save() {
    if (invalid || !dirty) return;
    setSaving(true);
    setMsg(null);
    const res = await updateQuestion({
      id: question.id,
      question_text: text,
      image_key: imageKey,
      context,
      phrases: hasPhrases ? phrases : null,
      options,
    });
    setSaving(false);
    if (res.ok) {
      const cleanImage = imageKey.trim().replace(/^\/+/, "");
      // Reconstrói o `context` das frases igual ao servidor, para o objeto local
      // refletir o que foi gravado.
      const cleanPhrases = hasPhrases ? phrases.map((p) => p.trim()) : null;
      const savedContext = cleanPhrases
        ? cleanPhrases.map((p, i) => `Frase ${i + 1}: ${p}`).join(" ")
        : context.trim() || null;
      const saved: Question = {
        ...question,
        question_text: text.trim(),
        image_key: cleanImage || null,
        context: savedContext,
        phrases: cleanPhrases,
        options: options.map((o) => ({ ...o, text: o.text.trim() })),
      };
      setText(saved.question_text);
      setImageKey(saved.image_key ?? "");
      setContext(saved.context ?? "");
      setPhrases(saved.phrases ?? []);
      setOptions(saved.options);
      onSaved(saved);
      setMsg({ ok: true, text: "Salvo." });
    } else {
      setMsg({ ok: false, text: res.error ?? "Erro ao salvar." });
    }
  }

  return (
    <li className="bg-white rounded-2xl border-2 border-[var(--border)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-[#f7f9fc] transition-colors"
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="font-black text-sm">{question.code}</span>
            <span className="text-xs font-bold text-[var(--muted)]">
              {FASE_LABEL[question.bank]}
            </span>
            {answered && (
              <span className="text-xs font-bold text-[var(--blue-dark)] bg-[var(--blue-soft)] rounded-full px-2 py-0.5">
                já respondida
              </span>
            )}
          </span>
          <span className="block text-sm font-semibold text-[var(--foreground)] truncate mt-0.5">
            {question.question_text}
          </span>
        </span>
        <span className="text-[var(--muted)] font-black shrink-0">
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="border-t-2 border-[var(--border)] p-4 flex flex-col gap-4 bg-[#fbfcfe]">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">
              Pergunta
            </span>
            <textarea
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setMsg(null);
              }}
              rows={2}
              className="rounded-xl border-2 border-[var(--border)] bg-white px-3 py-2 font-semibold resize-y"
            />
          </label>

          {hasPhrases && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">
                Frases — lidas antes da pergunta
              </span>
              {phrases.map((p, i) => (
                <label key={i} className="flex items-center gap-2">
                  <span className="shrink-0 text-xs font-black uppercase text-[var(--muted)] w-16">
                    Frase {i + 1}
                  </span>
                  <input
                    type="text"
                    value={p}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPhrases((prev) =>
                        prev.map((x, j) => (j === i ? v : x))
                      );
                      setMsg(null);
                    }}
                    className="flex-1 min-w-0 rounded-xl border-2 border-[var(--border)] bg-white px-3 py-2 font-semibold text-sm"
                  />
                </label>
              ))}
            </div>
          )}

          {hasStory && (
            <label className="flex flex-col gap-1">
              <span className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">
                História — lida antes da pergunta
              </span>
              <textarea
                value={context}
                onChange={(e) => {
                  setContext(e.target.value);
                  setMsg(null);
                }}
                rows={3}
                className="rounded-xl border-2 border-[var(--border)] bg-white px-3 py-2 font-semibold resize-y"
              />
            </label>
          )}

          <div className="flex flex-col gap-1">
            <span className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">
              Imagem
            </span>
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn3d btn3d-gray cursor-pointer text-sm">
                {uploading ? "Enviando..." : "Enviar imagem"}
                <input
                  type="file"
                  accept="image/*"
                  onChange={onFile}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
              {imageKey && (
                <button
                  type="button"
                  onClick={() => {
                    setImageKey("");
                    setMsg(null);
                  }}
                  className="text-sm font-bold text-[var(--red-dark)] hover:underline"
                >
                  Remover
                </button>
              )}
            </div>
            {/* O caminho fica visível/editável: caminho estático (faseA/09.jpg)
                ou URL do Storage após o upload. */}
            <input
              type="text"
              value={imageKey}
              onChange={(e) => {
                setImageKey(e.target.value);
                setMsg(null);
              }}
              placeholder="ex.: faseA/01.jpg (ou envie um arquivo acima)"
              className="rounded-xl border-2 border-[var(--border)] bg-white px-3 py-2 font-semibold text-sm"
            />
            {imgSrc && (
              // <img> comum (não next/image): o caminho é editável e pode não
              // existir; o onError deixa claro quando não resolve.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={imageSrc(imgSrc)}
                alt=""
                className="mt-1 max-h-40 w-auto rounded-xl border-2 border-[var(--border)] bg-[#f0f4f8] object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
                onLoad={(e) => {
                  e.currentTarget.style.display = "";
                }}
              />
            )}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-black uppercase tracking-wide text-[var(--muted)]">
              Alternativas — marque a correta
            </span>
            {options.map((o) => (
              <div key={o.key} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${question.id}`}
                  checked={o.is_correct}
                  disabled={o.is_fixed}
                  onChange={() => setCorrect(o.key)}
                  aria-label={`Marcar alternativa ${o.key.toUpperCase()} como correta`}
                  className="w-5 h-5 shrink-0 accent-[var(--green)]"
                />
                {o.is_fixed ? (
                  <span className="flex-1 px-3 py-2 rounded-xl bg-[#eef1f5] font-semibold text-sm text-[var(--muted)]">
                    {o.text}
                  </span>
                ) : (
                  <input
                    type="text"
                    value={o.text}
                    onChange={(e) => setOptText(o.key, e.target.value)}
                    className="flex-1 min-w-0 rounded-xl border-2 border-[var(--border)] bg-white px-3 py-2 font-semibold text-sm"
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty || invalid !== null}
              className="btn3d btn3d-green"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            {invalid && dirty && (
              <span className="text-sm font-bold text-[var(--red-dark)]">
                {invalid}
              </span>
            )}
            {msg && (
              <span
                className={`text-sm font-bold ${
                  msg.ok ? "text-[var(--green-dark)]" : "text-[var(--red-dark)]"
                }`}
              >
                {msg.text}
              </span>
            )}
          </div>
        </div>
      )}
    </li>
  );
}
