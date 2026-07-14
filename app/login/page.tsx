"use client";

import { useActionState } from "react";
import { signIn, signUp, type LoginState } from "./actions";

const initial: LoginState = {};

export default function LoginPage() {
  const [signInState, signInAction, signingIn] = useActionState(signIn, initial);
  const [signUpState, signUpAction, signingUp] = useActionState(signUp, initial);

  const error = signInState.error || signUpState.error;
  const message = signUpState.message;

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-10 bg-[var(--blue-soft)]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">🧠</div>
          <h1 className="text-2xl font-black text-[var(--foreground)]">
            Avaliação de Compreensão
          </h1>
          <p className="text-[var(--muted)] mt-1 font-semibold">
            Área do aplicador
          </p>
        </div>

        <form className="bg-white rounded-3xl p-6 shadow-sm flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-[var(--muted)]">E-mail</span>
            <input
              name="email"
              type="email"
              autoComplete="email"
              required
              className="rounded-xl border-2 border-[var(--border)] px-4 py-3 font-semibold outline-none focus:border-[var(--blue)]"
              placeholder="voce@exemplo.com"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-bold text-[var(--muted)]">Senha</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="rounded-xl border-2 border-[var(--border)] px-4 py-3 font-semibold outline-none focus:border-[var(--blue)]"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <p className="text-[var(--red-dark)] text-sm font-bold text-center">
              {error}
            </p>
          )}
          {message && (
            <p className="text-[var(--green-dark)] text-sm font-bold text-center">
              {message}
            </p>
          )}

          <button
            className="btn3d btn3d-green w-full"
            formAction={signInAction}
            disabled={signingIn || signingUp}
          >
            {signingIn ? "Entrando..." : "Entrar"}
          </button>
          <button
            className="btn3d btn3d-gray w-full"
            formAction={signUpAction}
            disabled={signingIn || signingUp}
          >
            {signingUp ? "Criando..." : "Criar conta"}
          </button>
        </form>
      </div>
    </main>
  );
}
