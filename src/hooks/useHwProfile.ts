import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HwProfile } from "../types";

export type HwState = ReturnType<typeof useHwProfile>;

export function useHwProfile() {
  const [profile, setProfile] = useState<HwProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<HwProfile>("detect_hw_accel")
      .then(setProfile)
      .catch((e) => setError(String(e)));
  }, []);

  return { profile, error };
}