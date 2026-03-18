/**
 * Setup Badge Component
 *
 * Visual indicator showing device setup status on device cards.
 * Reads setup_status directly from the Device object (persisted in DB).
 * Click navigates to setup wizard for that device.
 */
import { useNavigate } from "react-router-dom";
import "./SetupBadge.css";

interface SetupBadgeProps {
  deviceId: string;
  setupStatus?: string;
}

type DisplayStatus =
  | "unknown"
  | "unconfigured"
  | "configured"
  | "pending"
  | "failed"
  | "outdated"
  | "offline";

const STATUS_CONFIG: Record<DisplayStatus, { cls: string; icon: string; title: string }> = {
  unknown: {
    cls: "setup-badge badge-unknown",
    icon: "⚙️",
    title: "Gerät einrichten",
  },
  unconfigured: {
    cls: "setup-badge badge-unconfigured",
    icon: "⚙️",
    title: "Setup erforderlich - Klicken zum Konfigurieren",
  },
  configured: {
    cls: "setup-badge badge-configured",
    icon: "✓",
    title: "Gerät konfiguriert",
  },
  pending: {
    cls: "setup-badge badge-pending",
    icon: "⏳",
    title: "Setup läuft...",
  },
  failed: {
    cls: "setup-badge badge-unconfigured",
    icon: "⚠️",
    title: "Setup fehlgeschlagen - Klicken zum Wiederholen",
  },
  outdated: {
    cls: "setup-badge badge-outdated",
    icon: "⚠️",
    title: "Gerät zeigt auf alte OCT-Instanz - Klicken zum Aktualisieren",
  },
  offline: {
    cls: "setup-badge badge-offline",
    icon: "⚙️",
    title: "Gerät nicht erreichbar",
  },
};

const VALID_STATUSES = new Set<string>(Object.keys(STATUS_CONFIG));

export default function SetupBadge({ deviceId, setupStatus }: Readonly<SetupBadgeProps>) {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate(`/setup-wizard?deviceId=${deviceId}`);
  };

  const displayStatus: DisplayStatus =
    setupStatus && VALID_STATUSES.has(setupStatus) ? (setupStatus as DisplayStatus) : "unknown";

  const { cls, icon, title } = STATUS_CONFIG[displayStatus];

  return (
    <button
      className={cls}
      onClick={handleClick}
      title={title}
      aria-label={title}
      data-test="setup-button"
    >
      <span className="badge-icon">{icon}</span>
    </button>
  );
}
