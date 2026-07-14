"use client";

import { useEffect, useRef, useState } from "react";

interface VoiceInfo {
  name: string;
  lang: string;
  localService: boolean;
  default: boolean;
}

export default function AudioDiagnosticPage() {
  const [voices, setVoices] = useState<VoiceInfo[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [supported, setSupported] = useState<boolean | null>(null);
  const logRef = useRef<string[]>([]);

  function push(line: string) {
    logRef.current = [
      `${new Date().toLocaleTimeString()} — ${line}`,
      ...logRef.current,
    ].slice(0, 40);
    setLog([...logRef.current]);
  }

  useEffect(() => {
    const ok = typeof window !== "undefined" && "speechSynthesis" in window;
    setSupported(ok);
    if (!ok) return;
    const load = () => {
      const vs = window.speechSynthesis.getVoices();
      setVoices(
        vs.map((v) => ({
          name: v.name,
          lang: v.lang,
          localService: v.localService,
          default: v.default,
        }))
      );
      push(`getVoices(): ${vs.length} vozes`);
    };
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () =>
      window.speechSynthesis.removeEventListener?.("voiceschanged", load);
  }, []);

  function testSpeak(useVoice: "pt-local" | "pt-any" | "default") {
    const synth = window.speechSynthesis;
    if (!synth) {
      push("speechSynthesis indisponível");
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(
      "Olá! Este é um teste de áudio. Um, dois, três."
    );
    u.lang = "pt-BR";
    u.volume = 1;
    u.rate = 0.95;

    const vs = synth.getVoices();
    let chosen: SpeechSynthesisVoice | undefined;
    if (useVoice === "pt-local") {
      chosen =
        vs.find((v) => /pt[-_]?BR/i.test(v.lang) && v.localService) ||
        vs.find((v) => /^pt/i.test(v.lang) && v.localService);
    } else if (useVoice === "pt-any") {
      chosen = vs.find((v) => /pt[-_]?BR/i.test(v.lang)) || vs.find((v) => /^pt/i.test(v.lang));
    }
    if (chosen) {
      u.voice = chosen;
      push(`Usando voz: ${chosen.name} (${chosen.lang}, local=${chosen.localService})`);
    } else {
      push(`Sem voz específica — usando padrão do sistema (lang=pt-BR)`);
    }

    u.onstart = () => push("▶ onstart — começou a falar");
    u.onend = () => push("■ onend — terminou");
    u.onerror = (e) => push(`✖ onerror — ${e.error ?? "erro desconhecido"}`);
    u.onpause = () => push("⏸ onpause");
    u.onresume = () => push("⏵ onresume");

    try {
      synth.resume();
    } catch {}
    synth.speak(u);
    push(
      `speak() chamado — speaking=${synth.speaking} pending=${synth.pending} paused=${synth.paused}`
    );
    // Checagem após 500ms: se não começou, provavelmente foi bloqueado/silencioso.
    window.setTimeout(() => {
      push(
        `+500ms — speaking=${synth.speaking} pending=${synth.pending} paused=${synth.paused}`
      );
    }, 500);
  }

  return (
    <main className="min-h-screen bg-[#f7f9fc] px-4 py-8">
      <div className="max-w-lg mx-auto">
        <h1 className="text-2xl font-black mb-1">Diagnóstico de áudio (TTS)</h1>
        <p className="text-[var(--muted)] font-semibold mb-4 text-sm">
          Clique nos botões abaixo e veja o que aparece no registro. Isso mostra
          se o navegador consegue reproduzir o som.
        </p>

        <p className="font-bold mb-4">
          speechSynthesis suportado:{" "}
          <span
            className={supported ? "text-[var(--green-dark)]" : "text-[var(--red-dark)]"}
          >
            {supported === null ? "…" : supported ? "SIM" : "NÃO"}
          </span>
        </p>

        <div className="flex flex-col gap-3 mb-6">
          <button
            onClick={() => testSpeak("pt-local")}
            className="btn3d btn3d-green w-full"
          >
            🔊 Testar (voz pt-BR local)
          </button>
          <button
            onClick={() => testSpeak("pt-any")}
            className="btn3d btn3d-blue w-full"
          >
            🔊 Testar (qualquer voz pt)
          </button>
          <button
            onClick={() => testSpeak("default")}
            className="btn3d btn3d-gray w-full"
          >
            🔊 Testar (voz padrão do sistema)
          </button>
        </div>

        <h2 className="font-black mb-2">Registro</h2>
        <pre className="bg-black text-green-300 text-xs rounded-xl p-3 overflow-x-auto whitespace-pre-wrap min-h-[120px]">
          {log.length ? log.join("\n") : "Nenhum evento ainda."}
        </pre>

        <h2 className="font-black mt-6 mb-2">
          Vozes disponíveis ({voices.length})
        </h2>
        <ul className="text-sm bg-white rounded-xl p-3 max-h-64 overflow-y-auto">
          {voices.map((v, i) => (
            <li key={i} className="font-semibold py-0.5">
              {/pt/i.test(v.lang) ? "🇧🇷 " : ""}
              {v.name} — <span className="text-[var(--muted)]">{v.lang}</span>{" "}
              {v.localService ? "· local" : "· remota"}
              {v.default ? " · padrão" : ""}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
