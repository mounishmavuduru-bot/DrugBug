"use client";

import { useCallback, useState } from "react";
import {
  Check,
  Copy,
  Mail,
  ShieldOff,
  Trash2,
  UserPlus,
} from "lucide-react";
import { useReducer } from "spacetimedb/react";
import { reducers } from "@/lib/db";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState } from "@/components/shared/states";
import { AccessBadge, StatusBadge } from "@/components/caregiver/access-badge";
import {
  ACCESS_LEVELS,
  type AccessLevel,
  type CaregiverLink,
} from "@/components/caregiver/caregiver-utils";

// ---- invite modal ----

function InviteCaregiverModal({
  open,
  onClose,
  onInvited,
}: {
  open: boolean;
  onClose: () => void;
  onInvited: (linkId: string) => void;
}) {
  const invite = useReducer(reducers.inviteCaregiver);
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<AccessLevel>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setEmail("");
    setLevel("view");
    setError(null);
    setBusy(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = email.trim();
      if (!trimmed) {
        setError("Enter the caregiver's email address.");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await invite({ caregiverEmail: trimmed, accessLevel: level });
        // The new pending link arrives via the realtime subscription; the list
        // surfaces its linkId for sharing. We just close + flag success here.
        onInvited(trimmed);
        handleClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send the invite.");
      } finally {
        setBusy(false);
      }
    },
    [email, level, invite, onInvited, handleClose]
  );

  return (
    <Modal open={open} onClose={handleClose} title="Add a caregiver">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="caregiver-email">Caregiver email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input
              id="caregiver-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="caregiver@example.com"
              className="pl-9"
              autoFocus
            />
          </div>
          <p className="mt-1 text-[11px] text-muted">
            In the live product an invite is emailed. Here, the pending link&apos;s ID is shown so you
            can share it directly.
          </p>
        </div>

        <fieldset className="space-y-1.5">
          <legend className="mb-1.5 block text-xs font-medium text-muted">Access level</legend>
          <div className="space-y-1.5">
            {ACCESS_LEVELS.map((a) => (
              <label
                key={a.value}
                className={`flex cursor-pointer items-start gap-2.5 rounded-[var(--radius)] border p-2.5 transition-fast ${
                  level === a.value
                    ? "border-primary/50 bg-primary/10"
                    : "border-border bg-elevated hover:border-primary/30"
                }`}
              >
                <input
                  type="radio"
                  name="access-level"
                  value={a.value}
                  checked={level === a.value}
                  onChange={() => setLevel(a.value)}
                  className="mt-0.5 accent-[var(--color-primary)]"
                />
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-text">{a.label}</span>
                  <span className="block text-[11px] text-muted">{a.blurb}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {error ? (
          <p className="rounded-[var(--radius)] border border-danger/30 bg-danger/10 p-2 text-xs text-danger">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="md" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" size="md" disabled={busy}>
            <UserPlus className="size-4" />
            {busy ? "Sending…" : "Send invite"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ---- accept-by-link input ----

function AcceptLinkForm() {
  const accept = useReducer(reducers.acceptCaregiverLink);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const trimmed = value.trim();
      if (!trimmed) {
        setError("Paste the link ID you were sent.");
        return;
      }
      let linkId: bigint;
      try {
        linkId = BigInt(trimmed);
      } catch {
        setError("That doesn't look like a valid link ID (it should be a number).");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        await accept({ linkId });
        setDone(true);
        setValue("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not accept that link.");
      } finally {
        setBusy(false);
      }
    },
    [value, accept]
  );

  return (
    <Card className="space-y-2">
      <div>
        <h3 className="text-sm font-semibold text-text">Accept a caregiver invite</h3>
        <p className="text-xs text-muted">
          Someone shared a link ID with you? Paste it here to start caring for them.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <Input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setDone(false);
          }}
          placeholder="Link ID, e.g. 42"
          inputMode="numeric"
          aria-label="Caregiver link ID"
        />
        <Button type="submit" variant="secondary" size="md" disabled={busy} className="shrink-0">
          <Check className="size-4" />
          {busy ? "Accepting…" : "Accept"}
        </Button>
      </form>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
      {done ? (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <Check className="size-3.5" /> Accepted — the patient now appears under &quot;I&apos;m a
          caregiver&quot;.
        </p>
      ) : null}
    </Card>
  );
}

// ---- a single patient-side link row ----

function LinkRow({ link }: { link: CaregiverLink }) {
  const revoke = useReducer(reducers.revokeCaregiverLink);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const linkId = link.linkId.toString();
  const isActive = link.status !== "revoked";

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(linkId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be blocked; the ID is still visible to copy manually.
    }
  }, [linkId]);

  const handleRevoke = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await revoke({ linkId: link.linkId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke this caregiver.");
    } finally {
      setBusy(false);
    }
  }, [revoke, link.linkId]);

  return (
    <Card className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text">
            {link.caregiverEmail || "Caregiver"}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <StatusBadge status={link.status} />
            <AccessBadge level={link.accessLevel} />
          </div>
        </div>
        {isActive ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRevoke}
            disabled={busy}
            className="shrink-0 text-danger hover:bg-danger/10 hover:text-danger"
            aria-label={`Revoke ${link.caregiverEmail || "caregiver"}`}
          >
            <Trash2 className="size-4" />
            {busy ? "Revoking…" : "Revoke"}
          </Button>
        ) : (
          <Badge variant="neutral" className="shrink-0">
            <ShieldOff className="size-3" /> Revoked
          </Badge>
        )}
      </div>

      {link.status === "pending" ? (
        <div className="rounded-[var(--radius)] border border-border bg-elevated p-2.5">
          <p className="text-[11px] text-muted">
            Share this link ID with the caregiver so they can accept:
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <code className="mono flex-1 truncate rounded bg-background px-2 py-1 text-xs text-text">
              {linkId}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              aria-label="Copy link ID"
              className="shrink-0"
            >
              {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </Card>
  );
}

// ---- the patient-side ("My caregivers") section ----

export function MyCaregiversList({ links }: { links: readonly CaregiverLink[] }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const sorted = [...links].sort((a, b) => Number(b.linkId - a.linkId));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-text">Caregivers you&apos;ve invited</h2>
          <p className="text-xs text-muted">People who can see (and optionally help manage) your meds.</p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => setInviteOpen(true)}
          className="shrink-0"
        >
          <UserPlus className="size-4" />
          Add a caregiver
        </Button>
      </div>

      {inviteError ? (
        <ErrorState
          title="Invite failed"
          description={inviteError}
          retry={() => setInviteError(null)}
        />
      ) : null}

      {sorted.length === 0 ? (
        <EmptyState
          icon={UserPlus}
          title="No caregivers yet"
          description="Invite a family member or carer to help keep an eye on your medications."
          action={
            <Button variant="primary" size="md" onClick={() => setInviteOpen(true)}>
              <UserPlus className="size-4" />
              Add a caregiver
            </Button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {sorted.map((link) => (
            <LinkRow key={link.linkId.toString()} link={link} />
          ))}
        </div>
      )}

      <AcceptLinkForm />

      <InviteCaregiverModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={() => setInviteError(null)}
      />
    </div>
  );
}
