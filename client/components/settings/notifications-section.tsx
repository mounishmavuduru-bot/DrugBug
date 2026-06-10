"use client";

import { useMemo, useState } from "react";
import { Bell, BellOff, Loader2, AlertTriangle, Info } from "lucide-react";
import { useReducer, useTable } from "spacetimedb/react";
import { Identity } from "spacetimedb";

import { tables, reducers, identityHex } from "@/lib/db";
import { pushSupported, subscribeWebPush, unsubscribeWebPush } from "@/lib/push";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

/**
 * Web Push opt-in (PRD §14). Detects support, subscribes via VAPID and persists
 * the subscription to push_subscriptions; toggling off unsubscribes locally and
 * removes the stored row. The current state is driven by the realtime
 * subscription rows (a web sub owned by me), so it stays consistent across
 * devices/reloads.
 */
export function NotificationsSection({ me }: { me: Identity }) {
  const registerPush = useReducer(reducers.registerPushSubscription);
  const removePush = useReducer(reducers.removePushSubscription);

  const [rows, ready] = useTable(tables.push_subscriptions);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vapidMissing, setVapidMissing] = useState(false);

  const supported = pushSupported();
  const hex = identityHex(me);

  // My web push subscription, if any.
  const mySub = useMemo(
    () =>
      rows.find(
        (r) => identityHex(r.ownerIdentity) === hex && r.platform === "web"
      ),
    [rows, hex]
  );
  const enabled = !!mySub;

  async function enable() {
    setBusy(true);
    setError(null);
    setVapidMissing(false);
    try {
      const sub = await subscribeWebPush();
      if (!sub) {
        // null => permission declined or VAPID not configured.
        if (typeof Notification !== "undefined" && Notification.permission === "denied") {
          setError(
            "Notifications are blocked in your browser settings. Enable them for DrugBug and try again."
          );
        } else {
          setVapidMissing(true);
        }
        return;
      }
      await registerPush({
        endpoint: sub.endpoint,
        keys: JSON.stringify(sub.keys),
        platform: "web",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t enable notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!mySub) return;
    setBusy(true);
    setError(null);
    try {
      await unsubscribeWebPush();
      await removePush({ subId: mySub.subId });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t turn off notifications. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
        <Bell className="size-3.5" /> Notifications
      </h2>

      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">Push reminders</p>
            <p className="mt-0.5 text-xs text-muted">
              Dose reminders, predicted-miss nudges, refills, recalls, and caregiver alerts.
            </p>
          </div>
          {ready && supported ? (
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Push notifications"
              disabled={busy}
              onClick={enabled ? disable : enable}
              className={[
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-fast outline-none focus-visible:ring-2 focus-visible:ring-primary/60 disabled:opacity-50",
                enabled ? "bg-primary" : "bg-elevated border border-border",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-block size-4 transform rounded-full bg-white transition-fast",
                  enabled ? "translate-x-6" : "translate-x-1",
                ].join(" ")}
              />
              {busy ? (
                <Loader2 className="absolute -right-6 size-3.5 animate-spin text-muted" />
              ) : null}
            </button>
          ) : null}
        </div>

        {!supported ? (
          <p className="flex items-start gap-2 rounded-[var(--radius)] bg-elevated px-3 py-2 text-xs text-muted">
            <Info className="mt-px size-3.5 shrink-0" />
            Web Push isn’t supported in this browser. Install DrugBug as an app (iOS 16.4+,
            Android, or desktop) to enable reminders, or use the native build.
          </p>
        ) : null}

        {vapidMissing ? (
          <p className="flex items-start gap-2 rounded-[var(--radius)] border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
            <Info className="mt-px size-3.5 shrink-0" />
            Push delivery isn’t configured on this deployment yet (no VAPID key). Once the
            server is set up, you’ll be able to turn on reminders here.
          </p>
        ) : null}

        {error ? (
          <p className="flex items-center gap-2 text-sm text-danger">
            <AlertTriangle className="size-4 shrink-0" /> {error}
          </p>
        ) : null}

        {ready && supported && !vapidMissing ? (
          <div className="flex items-center gap-2 text-xs">
            {enabled ? (
              <Badge variant="success">
                <Bell className="size-3" /> On
              </Badge>
            ) : (
              <Badge variant="neutral">
                <BellOff className="size-3" /> Off
              </Badge>
            )}
            <span className="text-muted">
              {enabled
                ? "This device will receive reminders."
                : "Turn on to receive reminders on this device."}
            </span>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
