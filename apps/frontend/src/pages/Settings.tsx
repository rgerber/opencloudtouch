import { useState, useEffect, useRef, FormEvent } from "react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { useManualIPs, useAddManualIP, useDeleteManualIP } from "../hooks/useSettings";
import { useDiscoveryStream } from "../hooks/useDiscoveryStream";
import { useToast } from "../contexts/ToastContext";
import { toUserMessage } from "../utils/errorMessages";
import type { Device } from "../api/devices";
import "./Settings.css";

export default function Settings() {
  const [newIP, setNewIP] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // React Query hooks
  const { data: manualIPs = [], isLoading: loading, error: queryError, refetch } = useManualIPs();
  const addIP = useAddManualIP();
  const deleteIP = useDeleteManualIP();

  // Discovery
  const { isDiscovering, devicesFound, completed, startDiscovery } = useDiscoveryStream();
  const queryClient = useQueryClient();
  const { show } = useToast();

  // Capture device IDs that existed before this component was mounted.
  // Used to determine how many NEW devices were found by the discovery.
  const [preDiscoveryDeviceIds] = useState<Set<string>>(() => {
    const existing = queryClient.getQueryData<Device[]>(["devices"]) ?? [];
    return new Set(existing.map((d) => d.device_id));
  });

  const completedRef = useRef(false);

  // Show toast when discovery completes
  useEffect(() => {
    if (completed && !completedRef.current) {
      completedRef.current = true;
      const newDeviceCount = devicesFound.filter(
        (d) => !preDiscoveryDeviceIds.has(d.device_id)
      ).length;
      const message =
        newDeviceCount === 1 ? "1 neues Gerät gefunden" : `${newDeviceCount} neue Geräte gefunden`;
      show(message, "success");
    }
  }, [completed, devicesFound, preDiscoveryDeviceIds, show]);

  const validateIP = (ip: string): boolean => {
    const parts = ip.split(".");
    if (parts.length !== 4) return false;
    return parts.every((part) => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255 && part === num.toString();
    });
  };

  const handleAddIP = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmedIP = newIP.trim();

    if (!trimmedIP) {
      setError("Bitte geben Sie eine IP-Adresse ein");
      return;
    }

    if (!validateIP(trimmedIP)) {
      setError("Ungültige IP-Adresse (Format: 192.168.1.10)");
      return;
    }

    if (manualIPs.includes(trimmedIP)) {
      setError("Diese IP-Adresse existiert bereits");
      return;
    }

    try {
      await addIP.mutateAsync(trimmedIP);
      setNewIP("");
      setSuccess(`IP ${trimmedIP} hinzugefügt`);
      setError("");
      // Auto-clear success message after 3s
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("[Settings] Failed to add IP:", err);
      setError(toUserMessage(err));
    }
  };

  const handleDeleteIP = async (ipToDelete: string) => {
    try {
      await deleteIP.mutateAsync(ipToDelete);
      setSuccess(`IP ${ipToDelete} entfernt`);
      setError("");
      // Auto-clear success message after 3s
      setTimeout(() => setSuccess(""), 3000);
    } catch (err) {
      console.error("[Settings] Failed to delete IP:", err);
      setError(toUserMessage(err));
    }
  };

  if (loading) {
    return (
      <div className="loading-container" role="status" aria-live="polite" aria-label="Ladevorgang">
        <div className="spinner" aria-hidden="true" />
        <p className="loading-message">Einstellungen werden geladen...</p>
      </div>
    );
  }

  if (queryError) {
    return (
      <div className="error-container">
        <div className="error-icon">⚠️</div>
        <h2 className="error-title">Fehler beim Laden</h2>
        <p className="error-message">{toUserMessage(queryError.message)}</p>
        <button className="btn btn-primary" onClick={() => void refetch()}>
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="page settings-page">
      <h1 className="page-title">Einstellungen</h1>

      {/* Manual IPs Section */}
      <motion.section
        className="settings-section"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="section-title">
          <span className="section-icon">🌐</span>
          Manuelle Geräte-IPs
        </h2>

        <div className="settings-card">
          <p className="section-description">
            Fügen Sie IP-Adressen von Geräten manuell hinzu, falls die automatische Erkennung nicht
            funktioniert.
          </p>

          {/* Add IP Form */}
          <form onSubmit={handleAddIP} className="ip-add-form">
            <input
              type="text"
              value={newIP}
              onChange={(e) => setNewIP(e.target.value)}
              placeholder="192.168.1.10"
              className="ip-input"
              pattern="^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$"
            />
            <button type="submit" className="btn btn-primary">
              + Hinzufügen
            </button>
          </form>

          {/* Error/Success Messages */}
          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          {/* IP List */}
          <div className="ip-list">
            {manualIPs.length === 0 ? (
              <p className="empty-message">Keine manuellen IPs konfiguriert</p>
            ) : (
              <ul className="ip-items">
                {manualIPs.map((ip) => (
                  <motion.li
                    key={ip}
                    className="ip-item"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                  >
                    <span className="ip-address">{ip}</span>
                    <button
                      onClick={() => handleDeleteIP(ip)}
                      className="btn btn-delete"
                      title="IP entfernen"
                    >
                      ×
                    </button>
                  </motion.li>
                ))}
              </ul>
            )}
          </div>

          {/* Discover Button */}
          {manualIPs.length > 0 && (
            <div className="discover-action">
              <button
                className="btn btn-primary"
                onClick={() => void startDiscovery()}
                disabled={isDiscovering}
                aria-label="Geräte suchen"
              >
                {isDiscovering ? "Suche läuft…" : "Geräte suchen"}
              </button>
            </div>
          )}

          {/* Info Box */}
          <div className="info-box">
            <strong>ℹ️ Hinweis:</strong>
            <p>
              Klicken Sie auf &quot;Geräte suchen&quot;, um die Erkennung manuell zu starten.
              Gefundene Geräte erscheinen auf der Startseite.
            </p>
          </div>
        </div>
      </motion.section>
    </div>
  );
}
