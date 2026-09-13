"use client";
// Unique point de contentEditable de V2. Rend éditables les éléments
// `data-edit-key` déjà émis par les composants publics (HomeBody, WorkBody,
// ...) quand on leur passe `editable`, SANS les modifier — ce sont eux qui
// restent la source du rendu (voir SITE PUBLIC dans l'audit V2).
//
// Différence volontaire avec V1 (app/visual-editor.tsx) : le(s) écouteur(s)
// sont posés sur le conteneur de CE composant, jamais sur `document`. C'est
// la seule pièce de V2 qui touche le DOM de façon impérative, et elle reste
// strictement confinée à ce sous-arbre — voir l'audit V2, section
// « TEXT EDITING ».
import { useEffect, useRef } from "react";
import { useEditorStore } from "../../lib/editor-v2/store";
import { getPath } from "../../lib/editor-v2/path";

type ActiveEdit = { node: HTMLElement; path: string; before: string };

export function TextEditor({ children }: { children: React.ReactNode }) {
  const { content, setField } = useEditorStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<ActiveEdit | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    function stopEditing(node: HTMLElement) {
      node.removeAttribute("contenteditable");
      node.classList.remove("ve2-editing");
    }

    function validate() {
      const active = activeRef.current;
      if (!active) return;
      // Efface la référence AVANT de retirer `contenteditable` : le retirer
      // déclenche un `focusout` synchrone, qui rappelle `validate()` de façon
      // réentrante pendant que cette même fonction est encore sur la pile —
      // sans ce nettoyage anticipé, `setField` était invoqué deux fois par
      // édition (un doublon dans l'historique, undo/redo silencieusement
      // cassés après une seule modification).
      activeRef.current = null;
      stopEditing(active.node);
      const next = active.node.innerText;
      if (next !== active.before) setField(active.path, next);
    }

    function cancel() {
      const active = activeRef.current;
      if (!active) return;
      activeRef.current = null;
      active.node.innerText = active.before;
      stopEditing(active.node);
    }

    function startEditing(node: HTMLElement) {
      const path = node.dataset.editKey;
      if (!path) return;
      activeRef.current = { node, path, before: node.innerText };
      node.contentEditable = "true";
      node.classList.add("ve2-editing");
      node.focus();
    }

    function onClick(event: MouseEvent) {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-edit-key]");
      if (!target || !container!.contains(target)) return;
      if (activeRef.current?.node === target) return;
      event.preventDefault();
      if (activeRef.current) validate();
      startEditing(target);
    }

    // `focusout` (et non `blur`, qui ne remonte pas) capturé sur le
    // conteneur : équivalent local du "clic extérieur = validation" de
    // l'énoncé, sans écouter les clics sur tout le document.
    function onFocusOut(event: FocusEvent) {
      if (activeRef.current && activeRef.current.node === event.target) validate();
    }

    function onKeyDown(event: KeyboardEvent) {
      const active = activeRef.current;
      if (!active) return;
      if (event.key === "Escape") {
        event.preventDefault();
        cancel();
        return;
      }
      // Entrée valide pour un champ "titre" (une seule ligne, pas de <p>) ;
      // dans un paragraphe, Entrée doit rester un retour à la ligne normal.
      if (event.key === "Enter" && !event.shiftKey && active.node.tagName !== "P") {
        event.preventDefault();
        validate();
      }
    }

    container.addEventListener("click", onClick);
    container.addEventListener("focusout", onFocusOut);
    container.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("click", onClick);
      container.removeEventListener("focusout", onFocusOut);
      container.removeEventListener("keydown", onKeyDown);
      if (activeRef.current) stopEditing(activeRef.current.node);
      activeRef.current = null;
    };
  }, [setField]);

  // Reflète dans le DOM une mise à jour externe du contenu (undo/redo) sans
  // attendre un nouveau rendu des composants publics — ceux-ci ne
  // reconstruisent pas leur arbre au gré du state d'un composant frère.
  // N'écrase jamais le champ en cours d'édition (l'utilisateur y tape).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    container.querySelectorAll<HTMLElement>("[data-edit-key]").forEach((node) => {
      if (activeRef.current?.node === node) return;
      const value = getPath(content, node.dataset.editKey!);
      if (typeof value === "string" && node.innerText !== value) node.innerText = value;
    });
  }, [content]);

  return (
    <div ref={containerRef} className="ve2-text-editor">
      {children}
    </div>
  );
}
