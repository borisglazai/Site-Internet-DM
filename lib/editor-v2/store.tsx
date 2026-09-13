"use client";
// EditorStore / EditorProvider — unique responsable de : pageKey, contenu
// courant, contenu initial, dirty, saving, historique undo/redo, dernière
// sauvegarde. Ne connaît rien du DOM, du texte, des médias ni de la barre —
// voir components/editor/{TextEditor,EditorShell}.tsx pour ces couches.
//
// Une instance appartient strictement à une page : chaque route
// /admin/editor-v2/** monte son <EditorProvider key={pageKey} .../> (voir
// app/admin/editor-v2/**/page.tsx et components/editor/pages/*), ce qui
// garantit par construction React un démontage/remontage complet — donc un
// state entièrement neuf — à chaque changement de page. C'est le correctif
// appliqué après-coup à V1 (voir CHANGELOG « isolation d'état entre pages »),
// posé ici dès la fondation plutôt que retrofit.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getPath, setPath } from "./path";
import { discardDraft, publishPage, saveDraft } from "./persistence";
import type { PageKey } from "./types";

const AUTOSAVE_DEBOUNCE_MS = 1200;

type StatusMessage = "Publié" | "Brouillon enregistré" | "Modifications non publiées" | "Enregistrement…" | "Brouillon annulé" | string;

export type EditorStoreValue<T extends object> = {
  pageKey: PageKey | string;
  content: T;
  initialContent: T;
  dirty: boolean;
  saving: boolean;
  message: StatusMessage;
  lastSavedAt: Date | null;
  canUndo: boolean;
  canRedo: boolean;
  getField: (path: string) => unknown;
  setField: (path: string, value: unknown) => void;
  undo: () => void;
  redo: () => void;
  save: () => Promise<boolean>;
  publish: () => Promise<boolean>;
  discard: () => Promise<boolean>;
  /** Sauvegarde d'abord si `dirty` (voir save()) puis navigue seulement en cas
   * de succès — un échec de sauvegarde ne doit jamais changer de page
   * silencieusement. */
  safeNavigate: (url: string) => Promise<boolean>;
};

const EditorContext = createContext<EditorStoreValue<object> | null>(null);

export function useEditorStore<T extends object = Record<string, unknown>>(): EditorStoreValue<T> {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error("useEditorStore() doit être utilisé sous <EditorProvider>.");
  return ctx as unknown as EditorStoreValue<T>;
}

export function EditorProvider<T extends object>({
  pageKey,
  initial,
  hasDraft = false,
  children,
}: {
  pageKey: PageKey | string;
  initial: T;
  hasDraft?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [content, setContent] = useState<T>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<StatusMessage>(hasDraft ? "Brouillon enregistré" : "Publié");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [historyLength, setHistoryLength] = useState(1);

  const history = useRef<T[]>([initial]);
  // `contentRef`/`dirtyRef` sont écrits SYNCHRONEMENT, à la source, dans
  // chaque callback qui change `content`/`dirty` — jamais via un effet qui
  // se contenterait de les recopier après coup. Un effet post-rendu laisse
  // une fenêtre où deux évènements synchrones qui se suivent dans le même
  // tick (ex. le `focusout` de validation d'un champ texte, immédiatement
  // suivi du `change` du sélecteur de page) verraient encore l'ancienne
  // valeur : `safeNavigate()` déciderait alors de ne PAS sauvegarder avant
  // de naviguer, believing à tort qu'il n'y a rien à sauvegarder. Écrire ces
  // refs directement dans setField/undo/redo/save (tous des gestionnaires
  // d'évènement, jamais du code de rendu) reste conforme à la règle
  // react-hooks/refs, qui interdit seulement de les lire/écrire PENDANT le
  // rendu.
  const contentRef = useRef(content);
  const dirtyRef = useRef(dirty);

  // `historyIndex`/`historyLength` (state, pour re-render les boutons
  // undo/redo) et l'index réellement utilisé par les mutateurs doivent rester
  // synchrones même entre deux rendus rapprochés ; un ref évite de dépendre
  // d'une valeur potentiellement périmée dans les callbacks ci-dessous.
  const historyIndexRef = useRef(0);

  const getField = useCallback((path: string) => getPath(contentRef.current, path), []);

  const setField = useCallback((path: string, value: unknown) => {
    // L'updater passé à setContent() doit rester PUR : React (mode strict, en
    // développement) peut l'invoquer deux fois par mise à jour pour détecter
    // les effets de bord. Muter `history.current`/appeler d'autres setters
    // à l'intérieur le ferait deux fois par édition, désynchronisant
    // durablement l'index d'historique (undo/redo cassés après une seule
    // édition) — la tenue de l'historique se fait donc juste après, sur la
    // valeur ainsi calculée, dans le corps de setField lui-même (qui, lui,
    // ne s'exécute qu'une fois par appel réel).
    let next: T | undefined;
    setContent((current) => {
      next = setPath(current, path, value);
      return next;
    });
    contentRef.current = next as T;
    dirtyRef.current = true;
    history.current = history.current.slice(0, historyIndexRef.current + 1);
    history.current.push(next as T);
    historyIndexRef.current = history.current.length - 1;
    setHistoryIndex(historyIndexRef.current);
    setHistoryLength(history.current.length);
    setDirty(true);
    setMessage("Modifications non publiées");
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current < 1) return;
    historyIndexRef.current -= 1;
    setHistoryIndex(historyIndexRef.current);
    const previous = history.current[historyIndexRef.current];
    contentRef.current = previous;
    dirtyRef.current = true;
    setContent(previous);
    setDirty(true);
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current >= history.current.length - 1) return;
    historyIndexRef.current += 1;
    setHistoryIndex(historyIndexRef.current);
    const next = history.current[historyIndexRef.current];
    contentRef.current = next;
    dirtyRef.current = true;
    setContent(next);
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    const result = await saveDraft(pageKey, contentRef.current);
    setSaving(false);
    if (!result.ok) {
      setMessage(result.error);
      return false;
    }
    dirtyRef.current = false;
    setDirty(false);
    setLastSavedAt(new Date());
    setMessage("Brouillon enregistré");
    return true;
  }, [pageKey]);

  const publish = useCallback(async () => {
    setSaving(true);
    const result = await publishPage(pageKey, contentRef.current);
    setSaving(false);
    if (!result.ok) {
      setMessage(result.error);
      return false;
    }
    dirtyRef.current = false;
    setDirty(false);
    setLastSavedAt(new Date());
    setMessage("Publié");
    return true;
  }, [pageKey]);

  const discard = useCallback(async () => {
    setSaving(true);
    const result = await discardDraft(pageKey);
    setSaving(false);
    if (!result.ok) {
      setMessage(result.error);
      return false;
    }
    dirtyRef.current = false;
    setMessage("Brouillon annulé");
    return true;
  }, [pageKey]);

  const safeNavigate = useCallback(
    async (url: string) => {
      if (dirtyRef.current) {
        const saved = await save();
        if (!saved) return false;
      }
      router.push(url);
      return true;
    },
    [router, save],
  );

  // Autosave debouncé — se comporte comme V1 pour la temporisation. `save()`
  // capture `pageKey` directement (stable pour la durée de vie de cette
  // instance, garanti par `key={pageKey}` côté appelant) et lit
  // `contentRef.current` (toujours à jour, voir plus haut) : la requête ne
  // peut donc jamais être attribuée à une autre page.
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      void save();
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [content, dirty, save]);

  // Filet de sécurité au démontage (navigation, fermeture) : si un brouillon
  // reste dirty, tente une sauvegarde "best effort" avec `keepalive` pour
  // survivre à la destruction du composant — plutôt que de la perdre
  // silencieusement comme le ferait une simple annulation du minuteur.
  // pageKey est stable pour la durée de vie de cette instance (voir
  // key={pageKey} côté appelant) ; ce nettoyage ne doit s'exécuter qu'au
  // démontage réel, d'où le tableau de dépendances vide.
  useEffect(() => {
    return () => {
      if (dirtyRef.current) {
        void saveDraft(pageKey, contentRef.current, { keepalive: true });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<EditorStoreValue<T>>(
    () => ({
      pageKey,
      content,
      initialContent: initial,
      dirty,
      saving,
      message,
      lastSavedAt,
      canUndo: historyIndex > 0,
      canRedo: historyIndex < historyLength - 1,
      getField,
      setField,
      undo,
      redo,
      save,
      publish,
      discard,
      safeNavigate,
    }),
    [pageKey, content, initial, dirty, saving, message, lastSavedAt, historyIndex, historyLength, getField, setField, undo, redo, save, publish, discard, safeNavigate],
  );

  return <EditorContext.Provider value={value as EditorStoreValue<object>}>{children}</EditorContext.Provider>;
}
