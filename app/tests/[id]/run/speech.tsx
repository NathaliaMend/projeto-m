"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { audioSrc } from "@/lib/audio";

/**
 * Reprodução de áudio via Web Speech API (SpeechSynthesis), voz pt-BR.
 * Não requer arquivos de áudio nem serviço externo.
 *
 * Observações importantes de compatibilidade:
 * - A lista de vozes carrega de forma assíncrona (evento `voiceschanged`).
 * - Navegadores só permitem falar após uma interação do usuário; por isso a
 *   fala deve ser disparada dentro de um handler de toque/clique.
 * - Chrome às vezes "trava" em estado pausado — chamamos `resume()` antes.
 */
export function useSpeak() {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supported) return;
    const load = () => {
      const voices = window.speechSynthesis.getVoices();
      // Prioriza voz LOCAL pt-BR (vozes remotas/Google podem falhar em silêncio).
      const pt =
        voices.find((v) => /pt[-_]?BR/i.test(v.lang) && v.localService) ||
        voices.find((v) => /pt[-_]?BR/i.test(v.lang)) ||
        voices.find((v) => /^pt/i.test(v.lang) && v.localService) ||
        voices.find((v) => /^pt/i.test(v.lang)) ||
        null;
      if (pt) voiceRef.current = pt;
      if (voices.length > 0) setReady(true);
    };
    load();
    window.speechSynthesis.addEventListener?.("voiceschanged", load);
    return () =>
      window.speechSynthesis.removeEventListener?.("voiceschanged", load);
  }, [supported]);

  const speak = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!supported || !text) return;
      const synth = window.speechSynthesis;
      try {
        synth.cancel();
      } catch {}
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pt-BR";
      u.rate = 0.95;
      u.pitch = 1.05;
      u.volume = 1;
      // Recarrega a voz na hora (getVoices pode ter populado depois do mount).
      if (!voiceRef.current) {
        const voices = synth.getVoices();
        voiceRef.current =
          voices.find((v) => /pt[-_]?BR/i.test(v.lang) && v.localService) ||
          voices.find((v) => /pt[-_]?BR/i.test(v.lang)) ||
          voices.find((v) => /^pt/i.test(v.lang)) ||
          null;
      }
      if (voiceRef.current) u.voice = voiceRef.current;
      if (onEnd) u.onend = onEnd;
      try {
        synth.resume();
      } catch {}
      synth.speak(u);
    },
    [supported]
  );

  const cancel = useCallback(() => {
    if (supported) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
  }, [supported]);

  return { speak, cancel, supported, ready };
}

/**
 * Reprodução preferindo o áudio pré-gerado (/audio/<id>.m4a, voz humana),
 * com fallback automático para o TTS do navegador quando o arquivo não existe.
 */
export function useVoice() {
  const { speak, cancel: cancelTTS, supported, ready } = useSpeak();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
  }, []);

  const play = useCallback(
    (text: string, onEnd?: () => void) => {
      if (!text) return;
      cancelTTS();
      stopAudio();

      const audio = new Audio(audioSrc(text));
      audioRef.current = audio;
      let fellBack = false;
      const fallback = () => {
        if (fellBack) return;
        fellBack = true;
        stopAudio();
        speak(text, onEnd); // arquivo ausente/bloqueado → voz do navegador
      };
      audio.onended = () => {
        if (audioRef.current === audio) audioRef.current = null;
        onEnd?.();
      };
      audio.onerror = fallback;
      audio.play().catch(fallback);
    },
    [speak, cancelTTS, stopAudio]
  );

  const cancel = useCallback(() => {
    cancelTTS();
    stopAudio();
  }, [cancelTTS, stopAudio]);

  return { play, cancel, supported, ready };
}

/** Botão circular de "ouvir" que reproduz um texto. */
export function SpeakButton({
  text,
  speak,
  label = "Ouvir",
  className = "",
}: {
  text: string;
  speak: (text: string, onEnd?: () => void) => void;
  label?: string;
  className?: string;
}) {
  const [playing, setPlaying] = useState(false);
  const timer = useRef<number | null>(null);

  function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setPlaying(true);
    speak(text, () => setPlaying(false));
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(
      () => setPlaying(false),
      Math.max(2000, text.length * 90)
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`speak-btn ${playing ? "playing" : ""} ${className}`}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M3 10v4a1 1 0 0 0 1 1h3l4 4V5L7 9H4a1 1 0 0 0-1 1Z" />
        <path
          d="M16 8a5 5 0 0 1 0 8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
