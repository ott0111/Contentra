"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { CreatorProfile, OnboardingData } from "@/types/creator";
import { createClient } from "@/lib/supabase/browser";

const emptyProfile: CreatorProfile = { id: "local-profile", displayName: "", username: "", bio: "", avatar: "", niches: [], targetAudience: "", experienceLevel: "", platforms: [], primaryGoal: "", contentStyles: [], notificationPreferences: {} };
const storageKey = "contentra-creator-profile";
const CreatorContext = createContext<{ profile: CreatorProfile; saveProfile: (data: Partial<CreatorProfile>) => void; completeOnboarding: (data: OnboardingData) => Promise<void> }>({ profile: emptyProfile, saveProfile: () => undefined, completeOnboarding: async () => undefined });

export function CreatorProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState(emptyProfile);
  useEffect(() => { const load = async () => { try { const supabase = createClient(); const { data: { user } } = await supabase.auth.getUser(); if (user) { const { data } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(); if (data) { setProfile({ ...emptyProfile, id: String(data.user_id), displayName: data.display_name || "", username: data.username || "", bio: data.bio || "", avatar: data.avatar_url || "", niches: data.niche ? String(data.niche).split(", ").filter(Boolean) : [], targetAudience: data.target_audience || "", experienceLevel: data.experience_level || "", platforms: data.platforms || [], primaryGoal: data.primary_goal || "", contentStyles: data.content_styles || [], notificationPreferences: data.notification_preferences || {} }); return; } } } catch { /* Local fallback keeps the pre-auth shell usable. */ } const saved = window.localStorage.getItem(storageKey); if (saved) setProfile(JSON.parse(saved)); }; void load(); }, []);
  const persist = async (next: CreatorProfile) => { const supabase = createClient(); const { data: { user }, error: authError } = await supabase.auth.getUser(); if (authError) throw new Error(authError.message); if (!user) throw new Error("Authentication required"); const profileData = { user_id: user.id, username: next.username, display_name: next.displayName, bio: next.bio, avatar_url: next.avatar, niche: next.niches.join(", "), target_audience: next.targetAudience, experience_level: next.experienceLevel, platforms: next.platforms, primary_goal: next.primaryGoal, content_styles: next.contentStyles, notification_preferences: next.notificationPreferences || {} }; const { error } = await supabase.from("profiles").upsert(profileData, { onConflict: "user_id" }); if (error) { console.error("Contentra profile save failed", { message: error.message, code: error.code, details: error.details, hint: error.hint }); throw new Error(error.message); } setProfile(next); };
  const saveProfile = (data: Partial<CreatorProfile>) => { void persist({ ...profile, ...data }); };
  const completeOnboarding = async (data: OnboardingData) => { await persist({ ...profile, ...data, id: "local-profile", avatar: data.displayName.slice(0, 2).toUpperCase(), bio: "Turning content into growth." }); };
  return <CreatorContext.Provider value={{ profile, saveProfile, completeOnboarding }}>{children}</CreatorContext.Provider>;
}

export const useCreator = () => useContext(CreatorContext);