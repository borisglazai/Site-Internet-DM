"use client";
// Centralise tous les appels réseau de persistance de l'éditeur V2. Réutilise
// l'API existante (/api/admin/visual-editor) sans modification — aucune
// nécessité démontrée d'en changer le contrat pour cette phase.
//
// Chaque fonction prend `pageKey`/`content` en arguments explicites plutôt
// que de les lire d'un state ambiant : ça rend impossible, par construction,
// d'écrire le contenu d'une page sous la clé d'une autre (voir l'audit
// « isolation d'état entre pages » qui a motivé cette réécriture).

export type PersistAction = "save" | "publish" | "discard";

export type PersistResult = { ok: true; content?: Record<string, unknown> } | { ok: false; error: string };

async function callVisualEditorApi(
  pageKey: string,
  action: PersistAction,
  content: object,
  options?: { keepalive?: boolean },
): Promise<PersistResult> {
  try {
    const response = await fetch("/api/admin/visual-editor", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pageKey, action, content }),
      keepalive: options?.keepalive,
    });
    const json = (await response.json().catch(() => ({}))) as { error?: string; content?: Record<string, unknown> };
    if (!response.ok) return { ok: false, error: json.error || "Opération impossible." };
    return { ok: true, content: json.content };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erreur réseau." };
  }
}

export function saveDraft(pageKey: string, content: object, options?: { keepalive?: boolean }) {
  return callVisualEditorApi(pageKey, "save", content, options);
}

export function publishPage(pageKey: string, content: object) {
  return callVisualEditorApi(pageKey, "publish", content);
}

export function discardDraft(pageKey: string) {
  return callVisualEditorApi(pageKey, "discard", {});
}
