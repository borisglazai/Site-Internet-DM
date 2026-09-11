import { db } from "./cms-db";

// Médias disponibles pour le sélecteur de l'éditeur visuel (galeries,
// remplacement d'image). Utilisé uniquement par les routes protégées sous
// app/admin/editor/** — jamais par une route publique.
export async function editorMedia() {
  const result = await db()
    .prepare("SELECT * FROM media WHERE deleted_at IS NULL AND visible=1 ORDER BY updated_at DESC LIMIT 500")
    .all();
  return result.results || [];
}
