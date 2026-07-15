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
 * Reprodução preferindo o áudio pré-gerado (/audio/<id>.mp3, voz humana),
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

      const audio = new Audio();
      audio.preload = "auto";
      audioRef.current = audio;
      let fellBack = false;
      const fallback = () => {
        if (fellBack) return;
        fellBack = true;
        stopAudio();
        speak(text, onEnd);
      };
      audio.onended = () => {
        if (audioRef.current === audio) audioRef.current = null;
        onEnd?.();
      };
      audio.onerror = fallback;
      audio.oncanplaythrough = () => {
        audio.oncanplaythrough = null;
        audio.play().catch(fallback);
      };
      audio.src = audioSrc(text);
    },
    [speak, cancelTTS, stopAudio]
  );

  const cancel = useCallback(() => {
    cancelTTS();
    stopAudio();
  }, [cancelTTS, stopAudio]);

  return { play, cancel, supported, ready };
}

/**
 * Toca `text` ao abrir a tela e avisa quando a fala terminou — é o que libera
 * o botão "Continuar" (história) e as alternativas (pergunta).
 *
 * Dois cuidados que não são opcionais:
 * - Tablets bloqueiam áudio disparado por timer, então a fala precisa sair de
 *   dentro do gesto de toque. Quem chama `speakNow()` num handler de clique
 *   marca `suppressAuto`, e o efeito automático se cala para não tocar 2x.
 * - Se o fim nunca chega (mp3 quebrado, TTS falhando em silêncio), a trava
 *   abre sozinha por tempo — senão a criança fica presa na tela.
 */
export function useGatedSpeech(
  play: (text: string, onEnd?: () => void) => void,
  ready: boolean,
  text: string | null,
  active: boolean,
  timeoutMs: (t: string) => number
) {
  // Guarda QUAL texto já terminou, não um booleano: com um booleano, ao trocar
  // de pergunta o `done` do passo anterior valeria durante os ~250ms até a fala
  // começar, e a tela liberaria sozinha por um instante.
  const [spokenFor, setSpokenFor] = useState<string | null>(null);
  const done = !text || spokenFor === text;

  const suppressAuto = useRef(false);
  const timer = useRef<number | null>(null);

  const start = useCallback(
    (t: string) => {
      if (timer.current) window.clearTimeout(timer.current);
      const finish = () => setSpokenFor(t);
      // Trava de segurança: se o fim não chegar (mp3 quebrado, TTS mudo),
      // libera por tempo — senão a criança fica presa na tela.
      timer.current = window.setTimeout(finish, timeoutMs(t));
      play(t, finish);
    },
    [play, timeoutMs]
  );

  /** Fala dentro do gesto de toque; cala o autoplay que viria em seguida. */
  const speakNow = useCallback(
    (t: string) => {
      suppressAuto.current = true;
      start(t);
    },
    [start]
  );

  useEffect(() => {
    if (!active || !text) return;
    if (suppressAuto.current) {
      suppressAuto.current = false;
      return;
    }
    const delay = ready ? 250 : 700;
    const t = window.setTimeout(() => start(text), delay);
    return () => window.clearTimeout(t);
  }, [text, active, ready, start]);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    []
  );

  return { done, speakNow, replay: start };
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
