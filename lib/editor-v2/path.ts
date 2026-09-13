// Utilitaires de chemin en pointillés (dot-path) pour le contenu de l'éditeur
// V2 — écrits neufs plutôt qu'importés de app/visual-editor.tsx (V2 ne doit
// pas dépendre du composant monolithique existant, voir l'audit V2).
// Mêmes règles que l'équivalent V1 (segment numérique → index de tableau)
// pour rester compatible avec des chemins comme "principles.0.title".

function pathParts(path: string): Array<string | number> {
  return path.split(".").map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

export function getPath(object: unknown, path: string): unknown {
  return pathParts(path).reduce<unknown>((value, key) => {
    if (value == null) return undefined;
    return (value as Record<string | number, unknown>)[key];
  }, object);
}

export function setPath<T>(object: T, path: string, value: unknown): T {
  const parts = pathParts(path);
  const next = structuredClone((object ?? {}) as object) as Record<string | number, unknown>;
  let cursor: Record<string | number, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    const nextKey = parts[i + 1];
    if (cursor[key] == null) cursor[key] = typeof nextKey === "number" ? [] : {};
    cursor = cursor[key] as Record<string | number, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
  return next as T;
}
