"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import CommunicationShell from "@/components/messaging/CommunicationShell";
import MessageList        from "@/components/messaging/MessageList";
import MessageDetail      from "@/components/messaging/MessageDetail";
import Composer           from "@/components/messaging/Composer";
import { useSearchParams } from "next/navigation";

interface Group       { id: string; name: string }
interface SchoolClass { id: string; name: string; form: number; stream: string | null }

// ---------------------------------------------------------------------------
// Inner component — uses useSearchParams (needs Suspense wrapper)
// ---------------------------------------------------------------------------

function CommunicationPage() {
  const searchParams = useSearchParams();

  // ── State ─────────────────────────────────────────────────────────────────
  const [composerOpen, setComposerOpen] = useState(false);
  const [refreshKey,   setRefreshKey]   = useState(0);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [detailOpen,   setDetailOpen]   = useState(false);

  // ── Data for Composer ─────────────────────────────────────────────────────
  const [schoolId, setSchoolId] = useState("");
  const [groups,   setGroups]   = useState<Group[]>([]);
  const [classes,  setClasses]  = useState<SchoolClass[]>([]);

  useEffect(() => {
    // schoolId is returned by the messaging settings endpoint
    fetch("/api/messaging/settings")
      .then((r) => r.ok ? r.json() : null)
      .then((d: { schoolId?: string } | null) => { if (d?.schoolId) setSchoolId(d.schoolId); })
      .catch(() => {});

    fetch("/api/messaging/groups")
      .then((r) => r.ok ? r.json() : [])
      .then((d: Group[]) => setGroups(d))
      .catch(() => {});

    fetch("/api/classes")
      .then((r) => r.ok ? r.json() : [])
      .then((d: SchoolClass[]) => setClasses(d))
      .catch(() => {});
  }, []);

  // Open composer pre-filled when navigated from templates page
  useEffect(() => {
    if (searchParams.get("template")) setComposerOpen(true);
  }, [searchParams]);

  const handleSent = useCallback(() => setRefreshKey((k) => k + 1), []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
    setDetailOpen(true);
  }, []);

  const handleDetailClose = useCallback(() => {
    setDetailOpen(false);
    setSelectedId(null);
  }, []);

  return (
    <>
      <CommunicationShell
        base="/principal/communication"
        canManage={true}
        onNewMessage={() => setComposerOpen(true)}
      >
        <MessageList
          onSelect={handleSelect}
          selectedId={selectedId ?? undefined}
          refreshKey={refreshKey}
        />
      </CommunicationShell>

      {detailOpen && (
        <MessageDetail
          messageId={selectedId}
          canManage={true}
          onClose={handleDetailClose}
          onRetry={handleSent}
        />
      )}

      {composerOpen && (
        <Composer
          schoolId={schoolId}
          onClose={() => setComposerOpen(false)}
          onSent={handleSent}
          groups={groups}
          classes={classes}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Page export — wraps with Suspense (required by Next.js 14 for useSearchParams)
// ---------------------------------------------------------------------------

export default function PrincipalCommunicationPage() {
  return (
    <Suspense>
      <CommunicationPage />
    </Suspense>
  );
}
