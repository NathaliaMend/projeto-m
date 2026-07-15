import type { SupabaseClient } from "@supabase/supabase-js";
import type { Bank, Question } from "./types";
import { PHASES } from "./phases";

/** Carrega os bancos necessários para as 3 fases, ordenados por order_index. */
export async function getBanks(
  supabase: SupabaseClient
): Promise<Record<string, Question[]>> {
  const banks = Array.from(new Set(PHASES.map((p) => p.bank))) as Bank[];
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .in("bank", banks)
    .order("order_index", { ascending: true });

  if (error) throw new Error(error.message);

  const byBank: Record<string, Question[]> = {};
  for (const b of banks) byBank[b] = [];
  for (const q of (data ?? []) as Question[]) {
    (byBank[q.bank] ??= []).push(q);
  }
  return byBank;
}
