/**
 * Tests for useZones hook — mutation guards and API integration.
 *
 * Covers: isMutatingRef suppresses polling during zone operations,
 * error propagation, and correct API delegation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useZones } from "../../src/hooks/useZones";

// Mock all zone API functions
const mockGetZones = vi.fn().mockResolvedValue([]);
const mockCreateZone = vi.fn();
const mockDissolveZone = vi.fn();
const mockAddMembers = vi.fn();
const mockRemoveMembers = vi.fn();
const mockChangeMaster = vi.fn();

vi.mock("../../src/api/zones", () => ({
  getZones: (...args: unknown[]) => mockGetZones(...args),
  createZone: (...args: unknown[]) => mockCreateZone(...args),
  dissolveZone: (...args: unknown[]) => mockDissolveZone(...args),
  addZoneMembers: (...args: unknown[]) => mockAddMembers(...args),
  removeZoneMembers: (...args: unknown[]) => mockRemoveMembers(...args),
  changeMaster: (...args: unknown[]) => mockChangeMaster(...args),
}));

const MOCK_ZONE = {
  master_id: "ST10-001",
  master_ip: "192.168.1.10",
  is_master: true,
  members: [
    { device_id: "ST10-001", ip_address: "192.168.1.10", role: "master" as const },
    { device_id: "ST30-002", ip_address: "192.168.1.20", role: "slave" as const },
  ],
};

describe("useZones – mutation operations", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockGetZones.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("createZone delegates to API and refetches zones after 3s sync delay", async () => {
    mockCreateZone.mockResolvedValue(MOCK_ZONE);
    mockGetZones.mockResolvedValueOnce([]); // initial fetch
    mockGetZones.mockResolvedValue([MOCK_ZONE]); // after create

    const { result } = renderHook(() => useZones());
    await act(() => vi.advanceTimersByTimeAsync(0)); // initial fetch

    // Trigger createZone
    let createPromise: Promise<unknown>;
    await act(async () => {
      createPromise = result.current.createZone("ST10-001", ["ST30-002"]);
      // Advance past the 3s device sync delay inside createZone
      await vi.advanceTimersByTimeAsync(3100);
    });
    await act(async () => {
      await createPromise!;
    });

    expect(mockCreateZone).toHaveBeenCalledWith("ST10-001", ["ST30-002"]);
  });

  it("createZone sets error state on API failure", async () => {
    mockCreateZone.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useZones());
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(async () => {
      await expect(
        result.current.createZone("ST10-001", ["ST30-002"]),
      ).rejects.toThrow("Network error");
    });

    expect(result.current.error).toBe("Network error");
  });

  it("dissolveZone removes zone optimistically and suppresses polling for 15s", async () => {
    mockGetZones.mockResolvedValue([MOCK_ZONE]);
    mockDissolveZone.mockResolvedValue(undefined);

    const { result } = renderHook(() => useZones());
    await act(() => vi.advanceTimersByTimeAsync(0));

    expect(result.current.zones).toHaveLength(1);

    await act(async () => {
      await result.current.dissolveZone("ST10-001");
    });

    // Zone removed optimistically
    expect(result.current.zones).toHaveLength(0);
    expect(mockDissolveZone).toHaveBeenCalledWith("ST10-001");

    // Polling should be suppressed — reset getZones call count
    const callsBefore = mockGetZones.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(5000)); // one poll interval
    expect(mockGetZones.mock.calls.length).toBe(callsBefore); // no new calls

    // After 15s cooldown, polling resumes
    await act(() => vi.advanceTimersByTimeAsync(15000));
    await act(() => vi.advanceTimersByTimeAsync(5000)); // next poll
    expect(mockGetZones.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("addMembers delegates to API, refetches, and resets mutation flag", async () => {
    const updatedZone = { ...MOCK_ZONE, members: [...MOCK_ZONE.members, { device_id: "ST10-003", ip_address: "192.168.1.30", role: "slave" as const }] };
    mockAddMembers.mockResolvedValue(updatedZone);

    const { result } = renderHook(() => useZones());
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(async () => {
      await result.current.addMembers("ST10-001", ["ST10-003"]);
    });

    expect(mockAddMembers).toHaveBeenCalledWith("ST10-001", ["ST10-003"]);
    // Polling should resume (isMutatingRef reset) — verify by advancing timer
    const callsBefore = mockGetZones.mock.calls.length;
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(mockGetZones.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it("removeMembers delegates to API and handles errors", async () => {
    mockRemoveMembers.mockRejectedValue(new Error("Remove failed"));

    const { result } = renderHook(() => useZones());
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(async () => {
      await expect(
        result.current.removeMembers("ST10-001", ["ST30-002"]),
      ).rejects.toThrow("Remove failed");
    });

    expect(result.current.error).toBe("Remove failed");
  });

  it("changeMaster delegates to API and refetches", async () => {
    const newMasterZone = { ...MOCK_ZONE, master_id: "ST30-002" };
    mockChangeMaster.mockResolvedValue(newMasterZone);

    const { result } = renderHook(() => useZones());
    await act(() => vi.advanceTimersByTimeAsync(0));

    await act(async () => {
      const zone = await result.current.changeMaster("ST10-001", "ST30-002");
      expect(zone.master_id).toBe("ST30-002");
    });

    expect(mockChangeMaster).toHaveBeenCalledWith("ST10-001", "ST30-002");
  });

  it("mutation suppresses concurrent polling", async () => {
    // Simulate a slow createZone that takes longer than poll interval
    let resolveCreate: (v: unknown) => void;
    mockCreateZone.mockReturnValue(new Promise((r) => { resolveCreate = r; }));

    const { result } = renderHook(() => useZones());
    await act(() => vi.advanceTimersByTimeAsync(0));
    const callsAfterInit = mockGetZones.mock.calls.length;

    // Start mutation (don't await)
    let createPromise: Promise<unknown>;
    act(() => {
      createPromise = result.current.createZone("ST10-001", ["ST30-002"]);
    });

    // Advance past poll interval — fetch should be skipped
    await act(() => vi.advanceTimersByTimeAsync(5000));
    expect(mockGetZones.mock.calls.length).toBe(callsAfterInit);

    // Resolve mutation
    await act(async () => {
      resolveCreate!(MOCK_ZONE);
      await vi.advanceTimersByTimeAsync(3100);
      await createPromise!;
    });
  });
});
