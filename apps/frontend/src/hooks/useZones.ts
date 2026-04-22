/**
 * useZones Hook (STORY-1005)
 * React hook for multi-room zone management with polling and mutations.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getZones,
  createZone as createZoneApi,
  dissolveZone as dissolveZoneApi,
  addZoneMembers as addMembersApi,
  removeZoneMembers as removeMembersApi,
  changeMaster as changeMasterApi,
  type ZoneInfo,
} from "../api/zones";

const POLL_INTERVAL_MS = 5000;

export interface UseZonesResult {
  zones: ZoneInfo[];
  isLoading: boolean;
  error: string | null;
  createZone: (masterId: string, slaveIds: string[]) => Promise<ZoneInfo>;
  dissolveZone: (masterId: string) => Promise<void>;
  addMembers: (masterId: string, deviceIds: string[]) => Promise<ZoneInfo>;
  removeMembers: (masterId: string, deviceIds: string[]) => Promise<void>;
  changeMaster: (oldMasterId: string, newMasterId: string) => Promise<ZoneInfo>;
  refetch: () => Promise<void>;
}

export function useZones(): UseZonesResult {
  const [zones, setZones] = useState<ZoneInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isMutatingRef = useRef(false);

  const fetchZones = useCallback(async () => {
    if (isMutatingRef.current) {
      console.debug("[useZones] Skipping poll (mutation in progress)");
      return;
    }
    try {
      const data = await getZones();
      console.debug(
        "[useZones] Fetched %d zone(s): %s",
        data.length,
        data.map((z) => `${z.master_id}(${z.members.length}m)`).join(", ")
      );
      setZones(data);
      setError(null);
    } catch (err) {
      console.warn("[useZones] Failed to fetch zones:", err);
      setError(err instanceof Error ? err.message : "Failed to load zones");
    }
  }, []);

  // Initial fetch + polling
  useEffect(() => {
    setIsLoading(true);
    fetchZones().finally(() => setIsLoading(false));

    const interval = setInterval(fetchZones, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchZones]);

  const createZone = useCallback(
    async (masterId: string, slaveIds: string[]): Promise<ZoneInfo> => {
      isMutatingRef.current = true;
      console.info("[useZones] Creating zone: master=%s, slaves=%s", masterId, slaveIds);
      try {
        const result = await createZoneApi(masterId, slaveIds);
        console.info("[useZones] Zone created, waiting 3s for device sync...");
        // Give SoundTouch devices time to fully form the zone before polling
        await new Promise((r) => setTimeout(r, 3000));
        await fetchZones();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create zone");
        throw err;
      } finally {
        isMutatingRef.current = false;
      }
    },
    [fetchZones]
  );

  const dissolveZone = useCallback(async (masterId: string): Promise<void> => {
    isMutatingRef.current = true;
    try {
      await dissolveZoneApi(masterId);
      console.info("[useZones] Zone dissolved: %s (suppressing polls for 15s)", masterId);
      setZones((prev) => prev.filter((z) => z.master_id !== masterId));
      // Keep isMutating true for 15s so polling doesn't re-fetch the zone
      // before the SoundTouch device has fully dissolved it.
      setTimeout(() => {
        isMutatingRef.current = false;
        console.debug("[useZones] Polling re-enabled after dissolve cooldown");
      }, 15_000);
    } catch (err) {
      isMutatingRef.current = false;
      setError(err instanceof Error ? err.message : "Failed to dissolve zone");
      throw err;
    }
  }, []);

  const addMembers = useCallback(
    async (masterId: string, deviceIds: string[]): Promise<ZoneInfo> => {
      isMutatingRef.current = true;
      try {
        const result = await addMembersApi(masterId, deviceIds);
        await fetchZones();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add members");
        throw err;
      } finally {
        isMutatingRef.current = false;
      }
    },
    [fetchZones]
  );

  const removeMembers = useCallback(
    async (masterId: string, deviceIds: string[]): Promise<void> => {
      isMutatingRef.current = true;
      try {
        await removeMembersApi(masterId, deviceIds);
        await fetchZones();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove members");
        throw err;
      } finally {
        isMutatingRef.current = false;
      }
    },
    [fetchZones]
  );

  const changeMasterFn = useCallback(
    async (oldMasterId: string, newMasterId: string): Promise<ZoneInfo> => {
      isMutatingRef.current = true;
      try {
        const result = await changeMasterApi(oldMasterId, newMasterId);
        await fetchZones();
        return result;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to change master");
        throw err;
      } finally {
        isMutatingRef.current = false;
      }
    },
    [fetchZones]
  );

  return {
    zones,
    isLoading,
    error,
    createZone,
    dissolveZone,
    addMembers,
    removeMembers,
    changeMaster: changeMasterFn,
    refetch: fetchZones,
  };
}
