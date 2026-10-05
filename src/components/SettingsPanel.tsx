import { Copy, Eye, EyeOff, KeyRound, RefreshCw, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, type BridgeStatus } from "../db";
import { isTauriRuntime } from "../runtime";
import { useStore } from "../state/store";
import { Modal } from "./ui";

interface LogEntry {
  ts: string;
  cmd: string;
  ok: boolean;
  ms: number;
}

function parseLogLine(line: string): LogEntry | null {
  try {
    const v = JSON.parse(line) as Partial<LogEntry>;
    if (typeof v.ts === "string" && typeof v.cmd === "string") {
      return {
        ts: v.ts,
        cmd: v.cmd,
        ok: v.ok !== false,
        ms: typeof v.ms === "number" ? v.ms : 0,
      };
    }
  } catch {
    // Not a JSON line: rendered raw.
  }
  return null;
}

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className="icon-button"
        onClick={() => setOpen(true)}
        aria-label="Settings"
        title="Settings"
      >
        <Settings size={16} />
      </button>
      {open ? <SettingsPanel onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const tauri = isTauriRuntime();
  const { reportError } = useStore();
  const fire = useCallback(
    (promise: Promise<unknown>) => {
      void promise.catch(reportError);
    },
    [reportError],
  );
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [portDraft, setPortDraft] = useState("");

  const refresh = useCallback(() => {
    if (!tauri) return;
    fire(api.bridge.status().then(setStatus));
    fire(api.bridge.log().then(setLogLines));
  }, [tauri, fire]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (status) setPortDraft(String(status.port));
  }, [status]);

  const statusText = () => {
    if (!status) return "Loading…";
    if (status.running && status.actualPort != null) {
      return `Running on http://127.0.0.1:${status.actualPort}`;
    }
    if (status.enabled) return "Enabled but not running (port busy?)";
    return "Disabled";
  };

  const applyPort = () => {
    const port = Number(portDraft);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) return;
    fire(api.bridge.setPort(port).then(setStatus));
  };

  const copyToken = () => {
    if (!token) return;
    fire(navigator.clipboard.writeText(token));
  };

  const regenToken = () => {
    if (
      !window.confirm(
        "Regenerate the bridge token? Agents using the old token will lose access.",
      )
    ) {
      return;
    }
    fire(
      api.bridge.regenToken().then((t) => {
        setToken(t);
        setShowToken(true);
      }),
    );
  };

  return (
    <Modal title="Settings" onClose={onClose} width={560}>
      <h4 className="settings-section-title">AI bridge (local API)</h4>
      <p className="muted small">
        Lets AI agents and scripts on this computer read and modify Bizi data
        through the same validated commands as the UI. Bound to 127.0.0.1 only;
        guarded by the token below.
      </p>
      {!tauri ? (
        <p className="muted small">
          The AI bridge requires the desktop app (not the browser preview).
        </p>
      ) : (
        <>
          <div className="settings-row">
            <span>{statusText()}</span>
            {status ? (
              <button
                className="button small"
                onClick={() =>
                  fire(api.bridge.setEnabled(!status.enabled).then(setStatus))
                }
              >
                {status.enabled ? "Disable" : "Enable"}
              </button>
            ) : null}
          </div>
          <div className="settings-row">
            <label className="settings-inline-field">
              Port
              <input
                className="field-input settings-port"
                value={portDraft}
                onChange={(e) => setPortDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyPort();
                }}
              />
            </label>
            <button className="button small" onClick={applyPort}>
              Apply
            </button>
          </div>
          <div className="settings-row">
            <span className="settings-token" title={token ?? undefined}>
              <KeyRound size={14} />
              {token
                ? showToken
                  ? token
                  : `${token.slice(0, 8)}…`
                : "••••••••"}
            </span>
            <span className="settings-actions">
              <button
                className="button small ghost"
                onClick={() => {
                  if (showToken) {
                    setShowToken(false);
                  } else if (token) {
                    setShowToken(true);
                  } else {
                    fire(
                      api.bridge.getToken().then((t) => {
                        setToken(t);
                        setShowToken(true);
                      }),
                    );
                  }
                }}
              >
                {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                {showToken ? " Hide" : " Show"}
              </button>
              <button
                className="button small ghost"
                onClick={copyToken}
                disabled={!token}
              >
                <Copy size={13} /> Copy
              </button>
              <button className="button small danger" onClick={regenToken}>
                Regenerate
              </button>
            </span>
          </div>
          <div className="settings-row">
            <h4 className="settings-section-title">
              AI activity (last {logLines.length})
            </h4>
            <button className="button small ghost" onClick={refresh}>
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
          {logLines.length === 0 ? (
            <p className="muted small">No bridge activity yet.</p>
          ) : (
            <ul className="settings-log">
              {logLines.map((line, i) => {
                const entry = parseLogLine(line);
                if (!entry) {
                  return (
                    <li key={i} className="settings-log-line">
                      <span className="muted small">{line}</span>
                    </li>
                  );
                }
                return (
                  <li key={i} className="settings-log-line">
                    <span className="muted small">
                      {entry.ts.slice(11, 19)}
                    </span>
                    <code>{entry.cmd}</code>
                    <span className={entry.ok ? "badge" : "badge priority-p1"}>
                      {entry.ok ? "ok" : "error"}
                    </span>
                    <span className="muted small">{entry.ms} ms</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
