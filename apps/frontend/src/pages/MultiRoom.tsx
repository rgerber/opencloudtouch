import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Device } from "../components/DeviceSwiper";
import { useZones } from "../hooks/useZones";
import { useZoneNames } from "../hooks/useZoneNames";
import { useVolume } from "../hooks/useVolume";
import { useNowPlaying } from "../hooks/useNowPlaying";
import { useToast } from "../contexts/ToastContext";
import type { ZoneInfo } from "../api/zones";
import VolumeSlider from "../components/VolumeSlider";
import NowPlaying from "../components/NowPlaying";
import "./MultiRoom.css";

interface MultiRoomProps {
  readonly devices?: Device[];
}

// ---- Zone icon SVG (lighter color for dark card backgrounds) ----
const ZONE_MUSIC_PATH =
  "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z";

function ZoneIcon() {
  return (
    <span className="zone-icon">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path fill="#7ab8e8" d={ZONE_MUSIC_PATH} />
      </svg>
    </span>
  );
}

// ---- Zone Volume per Member ----

function ZoneMemberVolume({ deviceId }: Readonly<{ deviceId: string }>) {
  const { volume, muted, setDeviceVolume, toggleMute } = useVolume(deviceId);
  return (
    <div className="zone-member-volume">
      <VolumeSlider
        volume={volume}
        onVolumeChange={setDeviceVolume}
        muted={muted}
        onMuteToggle={toggleMute}
      />
    </div>
  );
}

// ---- Zone Now Playing (compact) ----

function ZoneNowPlaying({ masterId }: Readonly<{ masterId: string }>) {
  const { nowPlaying } = useNowPlaying(masterId);
  if (!nowPlaying || nowPlaying.source === "STANDBY") {
    return <div className="zone-now-playing standby">Standby</div>;
  }
  return (
    <div className="zone-now-playing">
      <NowPlaying
        nowPlaying={{
          art_url: nowPlaying.artwork_url ?? undefined,
          station: nowPlaying.station_name ?? undefined,
          track: nowPlaying.track ?? undefined,
          artist: nowPlaying.artist ?? undefined,
          play_status: nowPlaying.state,
          source: nowPlaying.source,
        }}
      />
    </div>
  );
}

// ---- Editable Zone Name ----

function EditableZoneName({
  name,
  onSave,
}: Readonly<{
  name: string;
  onSave: (newName: string) => void;
}>) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);

  const handleSave = () => {
    setEditing(false);
    if (draft.trim() !== name) {
      onSave(draft.trim());
    }
  };

  if (editing) {
    return (
      <input
        className="zone-name-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => e.key === "Enter" && handleSave()}
        maxLength={30}
        autoFocus
        aria-label="Zone-Name bearbeiten"
      />
    );
  }

  return (
    <button
      type="button"
      className="zone-name editable"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      title="Klick zum Bearbeiten"
    >
      {name}
    </button>
  );
}

function getCreateButtonLabel(loading: boolean, isEditing: boolean): string {
  if (loading) return "Wird erstellt...";
  return isEditing ? "Zone aktualisieren" : "Zone erstellen";
}

export default function MultiRoom({ devices = [] }: Readonly<MultiRoomProps>) {
  const { zones, isLoading, error, createZone, dissolveZone, addMembers, removeMembers } =
    useZones();
  const { getZoneName, setZoneName, removeZoneName } = useZoneNames();
  const { show: showToast } = useToast();

  const [selectedDevices, setSelectedDevices] = useState<string[]>([]);
  const [editingZone, setEditingZone] = useState<ZoneInfo | null>(null);
  const [operationLoading, setOperationLoading] = useState(false);
  const [confirmDissolve, setConfirmDissolve] = useState<string | null>(null);

  const handleDeviceToggle = (deviceId: string) => {
    setSelectedDevices((prev) => {
      if (prev.includes(deviceId)) {
        return prev.filter((id) => id !== deviceId);
      }
      return [...prev, deviceId];
    });
  };

  const handleSetMaster = (deviceId: string) => {
    setSelectedDevices((prev) => {
      const without = prev.filter((id) => id !== deviceId);
      return [deviceId, ...without];
    });
  };

  const handleCreateZone = useCallback(async () => {
    if (selectedDevices.length < 2) return;

    const masterId = selectedDevices[0]!;
    const slaveIds = selectedDevices.slice(1);

    setOperationLoading(true);
    try {
      if (editingZone) {
        // Edit mode: figure out adds/removes
        const currentMemberIds = editingZone.members.map((m) => m.device_id);
        const toAdd = slaveIds.filter((id) => !currentMemberIds.includes(id));
        const toRemove = currentMemberIds.filter(
          (id) => id !== editingZone.master_id && !selectedDevices.includes(id)
        );

        if (toRemove.length > 0) {
          await removeMembers(editingZone.master_id, toRemove);
        }
        if (toAdd.length > 0) {
          await addMembers(editingZone.master_id, toAdd);
        }
      } else {
        await createZone(masterId, slaveIds);
      }
      setSelectedDevices([]);
      setEditingZone(null);
      showToast(editingZone ? "Zone aktualisiert" : "Zone erstellt", "success");
    } catch {
      showToast("Zone konnte nicht erstellt werden", "error");
    } finally {
      setOperationLoading(false);
    }
  }, [selectedDevices, editingZone, showToast, createZone, addMembers, removeMembers]);

  const handleDissolveZone = useCallback(
    async (masterId: string) => {
      setOperationLoading(true);
      try {
        await dissolveZone(masterId);
        removeZoneName(masterId);
        setConfirmDissolve(null);
        showToast("Zone aufgelöst", "success");
      } catch {
        showToast("Zone konnte nicht aufgelöst werden", "error");
      } finally {
        setOperationLoading(false);
      }
    },
    [dissolveZone, removeZoneName, showToast]
  );

  const handleEditZone = (zone: ZoneInfo) => {
    setEditingZone(zone);
    setSelectedDevices(zone.members.map((m) => m.device_id));
  };

  const getDeviceById = (deviceId: string): Device | undefined => {
    return devices.find((d) => d.device_id === deviceId);
  };

  const isDeviceInZone = (deviceId: string): boolean => {
    return zones.some((zone) => zone.members.some((m) => m.device_id === deviceId));
  };

  const getMasterName = (zone: ZoneInfo): string => {
    const master = zone.members.find((m) => m.role === "master");
    return master?.name || getDeviceById(zone.master_id)?.name || "Unknown";
  };

  // ---- Loading State ----
  if (isLoading && zones.length === 0) {
    return (
      <div className="page multiroom-page">
        <h1 className="page-title">Multi-Room Zonen</h1>
        <div className="zone-card" style={{ opacity: 0.5 }}>
          <div className="zone-header">
            <ZoneIcon />
            <h3 className="zone-name">Lade Zonen...</h3>
          </div>
        </div>
      </div>
    );
  }

  // ---- Error State ----
  if (error && zones.length === 0) {
    return (
      <div className="page multiroom-page">
        <h1 className="page-title">Multi-Room Zonen</h1>
        <div className="info-box" style={{ borderColor: "#ff6b6b" }}>
          <div className="info-icon">⚠️</div>
          <div className="info-content">
            <h4 className="info-title">Fehler beim Laden</h4>
            <p>{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page multiroom-page">
      <h1 className="page-title">Multi-Room Zonen</h1>

      {/* Active Zones */}
      {zones.length > 0 && (
        <motion.section
          className="zones-section"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="section-title">Aktive Zonen</h2>
          <div className="zones-list">
            {zones.map((zone) => {
              const defaultName = `${getMasterName(zone)} Zone`;
              const zoneName = getZoneName(zone.master_id, defaultName);

              return (
                <motion.div
                  key={zone.master_id}
                  className="zone-card"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <div className="zone-header">
                    <ZoneIcon />
                    <EditableZoneName
                      name={zoneName}
                      onSave={(name) => setZoneName(zone.master_id, name)}
                    />
                  </div>

                  {/* Now Playing (STORY-1012) */}
                  <ZoneNowPlaying masterId={zone.master_id} />

                  {/* Zone Members with Volume (STORY-1007) */}
                  <div className="zone-devices">
                    {zone.members.map((member) => (
                      <div key={member.device_id} className={`zone-device ${member.role}`}>
                        <div className="zone-device-header">
                          <span className={`device-badge ${member.role}-badge`}>
                            {member.role === "master" ? "Master" : "Slave"}
                          </span>
                          <span className="device-name">
                            {member.name ||
                              getDeviceById(member.device_id)?.name ||
                              "Unknown Device"}
                          </span>
                        </div>
                        <ZoneMemberVolume deviceId={member.device_id} />
                      </div>
                    ))}
                  </div>

                  {/* Zone Actions */}
                  <div className="zone-actions">
                    <button
                      className="zone-action-button edit"
                      onClick={() => handleEditZone(zone)}
                      disabled={operationLoading}
                    >
                      <span className="button-icon">✏️</span>
                      <span>Bearbeiten</span>
                    </button>
                    {confirmDissolve === zone.master_id ? (
                      <button
                        className="zone-action-button dissolve"
                        onClick={() => handleDissolveZone(zone.master_id)}
                        disabled={operationLoading}
                      >
                        <span className="button-icon">⚠️</span>
                        <span>Wirklich auflösen?</span>
                      </button>
                    ) : (
                      <button
                        className="zone-action-button dissolve"
                        onClick={() => setConfirmDissolve(zone.master_id)}
                        disabled={operationLoading}
                      >
                        <span className="button-icon">❌</span>
                        <span>Auflösen</span>
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* Empty State */}
      {zones.length === 0 && (
        <motion.div className="info-box" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="info-icon">ℹ️</div>
          <div className="info-content">
            <h4 className="info-title">Keine aktiven Zonen</h4>
            <p>Wähle mindestens 2 Geräte aus, um eine Zone zu erstellen.</p>
          </div>
        </motion.div>
      )}

      {/* Device Selection */}
      <motion.section
        className="device-selection-section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <h2 className="section-title">
          {editingZone
            ? `Zone bearbeiten: ${getZoneName(editingZone.master_id, getMasterName(editingZone) + " Zone")}`
            : "Neue Zone erstellen"}
        </h2>

        <div className="devices-grid">
          {devices.map((device, index) => {
            const inZone = isDeviceInZone(device.device_id);
            const isSelected = selectedDevices.includes(device.device_id);
            const isMaster = selectedDevices[0] === device.device_id;
            const inEditZone =
              editingZone?.members.some((m) => m.device_id === device.device_id) ?? false;

            return (
              <motion.label
                key={device.device_id}
                className={`device-checkbox-card ${isSelected ? "selected" : ""} ${inZone && !isSelected && !inEditZone ? "in-zone" : ""}`}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 * index }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleDeviceToggle(device.device_id)}
                  disabled={inZone && !isSelected && !inEditZone}
                />
                <div className="device-checkbox-content">
                  <div className="device-checkbox-header">
                    <span className="device-checkbox-name">{device.name}</span>
                    {isMaster && <span className="device-badge master-badge">Master</span>}
                    {isSelected && !isMaster && (
                      <>
                        <span className="device-badge slave-badge">Slave</span>
                        <button
                          className="set-master-btn"
                          onClick={(e) => {
                            e.preventDefault();
                            handleSetMaster(device.device_id);
                          }}
                          title="Als Master setzen"
                        >
                          ★
                        </button>
                      </>
                    )}
                    {inZone && !isSelected && !inEditZone && (
                      <span className="device-badge in-zone-badge">In Zone</span>
                    )}
                  </div>
                  <span className="device-checkbox-model">{device.model}</span>
                </div>
              </motion.label>
            );
          })}
        </div>

        {selectedDevices.length > 0 && (
          <motion.div
            className="selection-info"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <p className="selection-count">
              {selectedDevices.length} Gerät(e) ausgewählt
              {selectedDevices.length < 2 && " (mindestens 2 erforderlich)"}
            </p>
            <button
              className="create-zone-button"
              onClick={handleCreateZone}
              disabled={selectedDevices.length < 2 || operationLoading}
            >
              <span className="button-icon">{operationLoading ? "⏳" : "➕"}</span>
              <span>{getCreateButtonLabel(operationLoading, !!editingZone)}</span>
            </button>
            {editingZone && (
              <button
                className="zone-action-button"
                onClick={() => {
                  setEditingZone(null);
                  setSelectedDevices([]);
                }}
              >
                Abbrechen
              </button>
            )}
          </motion.div>
        )}
      </motion.section>

      {/* Info Box */}
      <motion.div
        className="info-box"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
      >
        <div className="info-icon">ℹ️</div>
        <div className="info-content">
          <h4 className="info-title">Multi-Room Hinweise</h4>
          <ul className="info-list">
            <li>Das erste ausgewählte Gerät wird automatisch zum Master</li>
            <li>Klicke ★ um ein anderes Gerät zum Master zu machen</li>
            <li>Master und Slaves spielen synchron die gleiche Musik</li>
            <li>Lautstärke kann pro Gerät individuell angepasst werden</li>
            <li>Klicke auf den Zonen-Namen um ihn zu ändern</li>
          </ul>
        </div>
      </motion.div>
    </div>
  );
}
