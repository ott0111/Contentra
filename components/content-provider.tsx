"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/browser";
import { fetchContent, insertContent, patchContent, removeContent } from "@/lib/db/content-browser";
import type { ContentItem, ContentStatus } from "@/types/content";

const migrationKey = "contentra_data_migrated_v1";
type ContentContextValue = { items: ContentItem[]; createContent: (item: Omit<ContentItem, "id" | "createdAt" | "updatedAt">) => ContentItem; updateContent: (id: string, patch: Partial<ContentItem>) => void; deleteContent: (id: string) => void; duplicateContent: (id: string) => void; archiveContent: (id: string) => void };
const ContentContext = createContext<ContentContextValue>({ items: [], createContent: () => ({ id: "", title: "", body: "", contentType: "", platform: "", status: "DRAFT", tags: [], createdAt: "", updatedAt: "", scheduledAt: null }), updateContent: () => undefined, deleteContent: () => undefined, duplicateContent: () => undefined, archiveContent: () => undefined });

export function ContentProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ContentItem[]>([]);
  useEffect(() => { const load = async () => { try { const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) return; const userMigrationKey = `${migrationKey}_${user.id}`; if (!localStorage.getItem(userMigrationKey)) { const legacy = JSON.parse(localStorage.getItem("contentra-content") || "[]") as ContentItem[]; for (const item of legacy) await insertContent(user.id, item); localStorage.setItem(userMigrationKey, "true"); } setItems(await fetchContent()); } catch { setItems([]); } }; void load(); }, []);
  const createContent = (input: Omit<ContentItem, "id" | "createdAt" | "updatedAt">) => { const now = new Date().toISOString(); const item = { ...input, scheduledAt: input.scheduledAt ?? null, id: crypto.randomUUID(), createdAt: now, updatedAt: now }; setItems(current => [item, ...current]); void (async () => { try { const { data: { user } } = await createClient().auth.getUser(); if (!user) throw new Error("Authentication required"); const saved = await insertContent(user.id, input); setItems(current => current.map(row => row.id === item.id ? saved : row)); } catch { setItems(current => current.filter(row => row.id !== item.id)); } })(); return item; };
  const updateContent = (id: string, patch: Partial<ContentItem>) => { setItems(current => current.map(item => item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)); void patchContent(id, patch).catch(() => undefined); };
  const deleteContent = (id: string) => { setItems(current => current.filter(item => item.id !== id)); void removeContent(id).catch(() => undefined); };
  const duplicateContent = (id: string) => { const original = items.find(item => item.id === id); if (original) createContent({ ...original, title: `${original.title} Copy`, scheduledAt: null, status: "DRAFT" }); };
  const archiveContent = (id: string) => updateContent(id, { status: "ARCHIVED" as ContentStatus });
  return <ContentContext.Provider value={{ items, createContent, updateContent, deleteContent, duplicateContent, archiveContent }}>{children}</ContentContext.Provider>;
}
export const useContent = () => useContext(ContentContext);