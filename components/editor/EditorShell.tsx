"use client";
// EditorShell — unique responsable de la barre supérieure : navigation entre
// pages, statut, Prévisualiser, Publier, Quitter (+ undo/redo). Ne connaît
// rien du contenu lui-même : tout passe par useEditorStore().
import { useEffect, useState } from "react";
import { useEditorStore } from "../../lib/editor-v2/store";

const pageNav: Array<[href: string, label: string]> = [
  ["/admin/editor-v2", "Accueil"],
  ["/admin/editor-v2/notre-travail", "Notre travail"],
  ["/admin/editor-v2/services", "Services"],
  ["/admin/editor-v2/a-propos", "À propos"],
  ["/admin/editor-v2/contact", "Contact"],
];

export function EditorShell({ pageLabel, editUrl, previewUrl }: { pageLabel: string; editUrl: string; previewUrl: string }) {
  const store = useEditorStore();
  const [moreOpen, setMoreOpen] = useState(false);

  // Réserve l'espace occupé par la barre, fixe en haut de la fenêtre — même
  // technique que V1, appliquée seulement pendant que la barre est montée.
  useEffect(() => {
    document.body.classList.add("ve2-active");
    return () => document.body.classList.remove("ve2-active");
  }, []);

  async function onSelectPage(event: React.ChangeEvent<HTMLSelectElement>) {
    const target = event.target.value;
    if (target === editUrl) return;
    await store.safeNavigate(target);
  }

  async function onPreview() {
    await store.safeNavigate(previewUrl);
  }

  async function onPublish() {
    if (!confirm("Publier cette version ?")) return;
    await store.publish();
  }

  async function onDiscard() {
    setMoreOpen(false);
    if (!confirm("Abandonner le brouillon et revenir à la dernière version publiée ? Cette action est irréversible.")) return;
    if (await store.discard()) location.reload();
  }

  async function onQuit() {
    await store.safeNavigate("/admin");
  }

  const currentInNav = pageNav.some(([href]) => href === editUrl);

  return (
    <div className="ve2-bar ve2-ui">
      <div className="ve2-bar-status">
        <b>
          Divine Motion V2 — {pageLabel}
        </b>
        <small className={store.dirty ? "ve2-dirty" : ""}>
          {store.saving ? "Enregistrement…" : store.message}
          {store.lastSavedAt && !store.saving && (
            <i className="ve2-saved-at">{store.lastSavedAt.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" })}</i>
          )}
        </small>
      </div>
      <select className="ve2-page-select" value={editUrl} onChange={onSelectPage} aria-label="Changer de page">
        {!currentInNav && <option value={editUrl}>{pageLabel}</option>}
        {pageNav.map(([href, label]) => (
          <option key={href} value={href}>
            {label}
          </option>
        ))}
      </select>
      <div className="ve2-history">
        <button onClick={store.undo} disabled={!store.canUndo} title="Annuler la dernière modification (local)">
          ↶
        </button>
        <button onClick={store.redo} disabled={!store.canRedo} title="Rétablir la modification annulée">
          ↷
        </button>
      </div>
      <nav>
        <button onClick={onPreview}>Prévisualiser</button>
        <button className="ve2-publish" onClick={onPublish} disabled={store.saving}>
          Publier
        </button>
        <div className="ve2-more">
          <button className="ve2-more-trigger" onClick={() => setMoreOpen((open) => !open)} aria-label="Plus d’actions" aria-expanded={moreOpen}>
            ⋯
          </button>
          {moreOpen && (
            <div className="ve2-more-menu">
              <button className="ve2-danger" onClick={onDiscard}>
                Abandonner le brouillon
              </button>
            </div>
          )}
        </div>
        <button onClick={onQuit}>Quitter</button>
      </nav>
    </div>
  );
}
