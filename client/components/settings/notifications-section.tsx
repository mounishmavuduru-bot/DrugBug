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
            "Notifications are blocked in your browser settings. Allow them for DrugBug, then try again."
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
      setError(e instanceof Error ? e.message : "Couldn't turn on reminders. Try again.");
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
      setError(e instanceof Error ? e.message : "Couldn't turn off reminders. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3" aria-labelledby="notifications-heading">
      <h2
        id="notifications-heading"
        className="label-mono px-1 text-[11px] uppercase tracking-[0.14em] text-faint"
      >
        Notifications
      </h2>

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink">Push reminders</p>
            <p className="mt-0.5 text-xs text-muted">
              Dose times, predicted-miss nudges, refills, recalls, and caregiver
              alerts on this device.
            </p>
          </div>
          {ready && supported ? (
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label="Push reminders"
              disabled={busy}
              onClick={enabled ? disable : enable}
              className={[
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-[var(--radius-pill)] transition-colors duration-150 ease-[var(--ease)] outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50",
                enabled ? "bg-brand" : "border border-rule-strong bg-surface",
              ].join(" ")}
            >
              <span
                className={[
                  "inline-block size-4 transform rounded-[var(--radius-pill)] transition-transform duration-150 ease-[var(--ease)]",
                  enabled ? "translate-x-6 bg-brand-ink" : "translate-x-1 bg-muted",
                ].join(" ")}
              />
              {busy ? (
                <Loader2 className="absolute -right-6 size-3.5 animate-spin text-faint" />
              ) : null}
            </button>
          ) : null}
        </div>

        {!supported ? (
          <p className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-rule bg-surface px-3 py-2 text-xs text-muted">
            <Info className="mt-px size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            This browser can't show web push. Install DrugBug as an app (iOS 16.4+,
            Android, or desktop) to turn on reminders.
          </p>
        ) : null}

        {vapidMissing ? (
          <p className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-rule-strong bg-monitor-tint px-3 py-2 text-xs text-monitor">
            <Info className="mt-px size-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
            Push delivery isn't set up on this deployment yet (no VAPID key). Once
            the server has one, you can turn reminders on here.
          </p>
        ) : null}

        {error ? (
          <p className="flex items-center gap-2 text-sm text-danger" role="alert">
            <AlertTriangle className="size-4 shrink-0" strokeWidth={1.75} /> {error}
          </p>
        ) : null}

        {ready && supported && !vapidMissing ? (
          <div className="flex items-center gap-2 text-xs">
            {enabled ? (
              <Badge variant="positive">
                <Bell className="size-3" strokeWidth={1.75} /> On
              </Badge>
            ) : (
              <Badge variant="neutral">
                <BellOff className="size-3" strokeWidth={1.75} /> Off
              </Badge>
            )}
            <span className="text-muted">
              {enabled
                ? "Reminders go to this device."
                : "Turn on to get reminders on this device."}
            </span>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
