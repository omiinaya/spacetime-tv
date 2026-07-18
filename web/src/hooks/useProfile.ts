import { useState, useEffect, useCallback } from "react";

const PROFILE_STORAGE_KEY = "stv_current_profile";

export interface Profile {
  profile_id: string;
  name: string;
  avatar: string;
  created: number;
}

export interface ProfileWithPin extends Profile {
  pin?: string;
}

const API_BASE = "/api";

// ── Local storage helpers ──────────────────────────────────────────

function getStoredProfile(): Profile | null {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function storeProfile(profile: Profile | null) {
  if (profile) {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
  } else {
    localStorage.removeItem(PROFILE_STORAGE_KEY);
  }
}

// ── API calls ──────────────────────────────────────────────────────

export async function fetchProfiles(): Promise<Profile[]> {
  const res = await fetch(`${API_BASE}/profiles`);
  if (!res.ok) throw new Error("Failed to fetch profiles");
  const data = await res.json();
  return data.profiles || [];
}

export async function createProfile(
  name: string,
  pin: string,
  avatar?: string,
): Promise<Profile> {
  const res = await fetch(`${API_BASE}/profiles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, pin, avatar: avatar || "default" }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create profile");
  }
  const data = await res.json();
  return data.profile;
}

export async function verifyProfilePin(
  profileId: string,
  pin: string,
): Promise<boolean> {
  const res = await fetch(`${API_BASE}/profiles/${profileId}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pin }),
  });
  if (!res.ok) return false;
  const data = await res.json();
  return data.valid === true;
}

export async function deleteProfileApi(profileId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/profiles/${profileId}`, {
    method: "DELETE",
  });
  return res.ok;
}

// ── Progress sync ──────────────────────────────────────────────────

export async function fetchProfileProgress(
  profileId: string,
): Promise<Record<string, any>> {
  const res = await fetch(`${API_BASE}/profiles/${profileId}/progress`);
  if (!res.ok) return {};
  const data = await res.json();
  return data.progress || {};
}

export async function syncProfileProgress(
  profileId: string,
  watchKey: string,
  position: number,
  seriesData?: Record<string, any>,
  movieData?: Record<string, any>,
): Promise<boolean> {
  const res = await fetch(`${API_BASE}/profiles/${profileId}/progress`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ watchKey, position, seriesData, movieData }),
  });
  return res.ok;
}

// ── Watch history ─────────────────────────────────────────────────

export async function addProfileHistory(
  profileId: string,
  watchKey: string,
  title: string,
  contentType: string,
  position: number = 0,
  duration: number = 0,
  metadata: Record<string, any> = {},
): Promise<boolean> {
  const res = await fetch(`${API_BASE}/profiles/${profileId}/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      watchKey,
      title,
      contentType,
      position,
      duration,
      metadata,
    }),
  });
  return res.ok;
}

export async function fetchProfileHistory(
  profileId: string,
  limit: number = 50,
  offset: number = 0,
): Promise<any[]> {
  const res = await fetch(
    `${API_BASE}/profiles/${profileId}/history?limit=${limit}&offset=${offset}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.history || [];
}

export async function clearProfileHistory(profileId: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/profiles/${profileId}/history`, {
    method: "DELETE",
  });
  return res.ok;
}

// ── Hook ───────────────────────────────────────────────────────────

export function useProfile() {
  const [profile, setProfileState] = useState<Profile | null>(getStoredProfile);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const setProfile = useCallback((p: Profile | null) => {
    storeProfile(p);
    setProfileState(p);
  }, []);

  const refreshProfiles = useCallback(async () => {
    try {
      const list = await fetchProfiles();
      setProfiles(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  useEffect(() => {
    refreshProfiles().finally(() => setLoading(false));
  }, [refreshProfiles]);

  return {
    profile,
    profiles,
    loading,
    setProfile,
    refreshProfiles,
  };
}
