/**
 * Custom hook for device volume control.
 *
 * Syncs volume slider with backend device state.
 * Debounces volume changes to avoid flooding the device API.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  getVolume,
  setVolume as setVolumeApi,
  setMute as setMuteApi,
  isDeviceOfflineError,
  type VolumeState,
} from "../api/devices";
import { isDeviceOffline, markDeviceOffline } from "../api/offlineDeviceStore";

const POLL_INTERVAL_MS = 5000;
const DEBOUNCE_MS = 300;

export interface UseVolumeResult {
  volume: number;
  muted: boolean;
  loading: boolean;
  deviceOffline: boolean;
  setDeviceVolume: (level: number) => void;
  toggleMute: () => void;
}

export function useVolume(deviceId: string | undefined): UseVolumeResult {
  const [volume, setVolume] = useState(0);
  const [muted, setMuted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deviceOffline, setDeviceOffline] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingVolumeRef = useRef(false);
  const offlineRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(undefined);

  // Fetch volume from device
  const fetchVolume = useCallback(
    async (force = false) => {
      if (!deviceId || pendingVolumeRef.current || (!force && offlineRef.current)) return;
      // Session-level offline check
      if (isDeviceOffline(deviceId)) {
        if (!offlineRef.current) {
          offlineRef.current = true;
          setDeviceOffline(true);
        }
        return;
      }
      try {
        const vol: VolumeState = await getVolume(deviceId);
        setVolume(vol.actual);
        setMuted(vol.muted);
        setDeviceOffline(false);
        offlineRef.current = false;
      } catch (err) {
        if (isDeviceOfflineError(err)) {
          markDeviceOffline(deviceId);
          setDeviceOffline(true);
          offlineRef.current = true;
          // Stop polling — device is offline
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = undefined;
          }
        }
        console.warn("[useVolume] Failed to fetch volume:", err);
      }
    },
    [deviceId]
  );

  // Initial fetch + polling
  useEffect(() => {
    if (!deviceId) {
      setDeviceOffline(false);
      offlineRef.current = false;
      return;
    }

    // If device is already known offline in session store, skip ALL requests
    if (isDeviceOffline(deviceId)) {
      setDeviceOffline(true);
      offlineRef.current = true;
      return;
    }

    // Reset offline state on device change
    setDeviceOffline(false);
    offlineRef.current = false;

    setLoading(true);
    fetchVolume()
      .then(() => {
        // Only start polling if device is still online after initial fetch
        if (!offlineRef.current) {
          intervalRef.current = setInterval(fetchVolume, POLL_INTERVAL_MS);
        }
      })
      .finally(() => setLoading(false));

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };
  }, [deviceId, fetchVolume]);

  // Debounced volume setter — auto-unmutes when muted
  const setDeviceVolume = useCallback(
    (level: number) => {
      if (!deviceId) return;
      setVolume(level); // Optimistic update
      pendingVolumeRef.current = true;

      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(async () => {
        try {
          const vol = await setVolumeApi(deviceId, level);
          setVolume(vol.actual);
          if (vol.muted) {
            // Auto-unmute when slider is moved while muted
            const unmuteVol = await setMuteApi(deviceId, false);
            setMuted(unmuteVol.muted);
            setVolume(unmuteVol.actual);
          } else {
            setMuted(vol.muted);
          }
        } catch (err) {
          console.error("[useVolume] Failed to set volume:", err);
        } finally {
          pendingVolumeRef.current = false;
        }
      }, DEBOUNCE_MS);
    },
    [deviceId]
  );

  // Mute toggler
  const toggleMute = useCallback(() => {
    if (!deviceId) return;
    const newMuted = !muted;
    setMuted(newMuted); // Optimistic update
    setMuteApi(deviceId, newMuted)
      .then((vol) => {
        setMuted(vol.muted);
        setVolume(vol.actual);
      })
      .catch((err) => {
        console.error("[useVolume] Failed to toggle mute:", err);
        setMuted(!newMuted); // Rollback
      });
  }, [deviceId, muted]);

  return { volume, muted, loading, deviceOffline, setDeviceVolume, toggleMute };
}
