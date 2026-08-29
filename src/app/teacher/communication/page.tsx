"use client";

import { useEffect, useState } from "react";
import CommunicationShell from "@/components/messaging/CommunicationShell";
import MessageList from "@/components/messaging/MessageList";
import MessageDetail from "@/components/messaging/MessageDetail";
import Composer from "@/components/messaging/Composer";

const BASE = "/teacher/communication";

interface Group { id: string; name: string }
interface SchoolClass { id: string; name: string; form: number; stream: string | null }

export default function TeacherCommunicationPage() {
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [showComposer, setShowComposer] = useState(false);
  const [refreshKey, setRefreshKey]     = useState(0);
  const [canManage, setCanManage]       = useState(false);
  const [groups, setGroups]             = useState<Group[]>([]);
  const [classes, setClasses]           = useState<SchoolClass[]>([]);

  useEffect(() => {
    fetch("/api/messaging/settings").then((r) => setCanManage(r.ok)).catch(() => {});

    fetch("/api/messaging/groups")
      .then((r) => r.ok ? r.json() : [])
      .then((data: Group[]) => setGroups(data))
      .catch(() => {});

    fetch("/api/classes")
      .then((r) => r.ok ? r.json() : [])
      .then((data: SchoolClass[]) => setClasses(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  return (
    <CommunicationShell
      base={BASE}
      canManage={canManage}
      onNewMessage={canManage ? () => setShowComposer(true) : undefined}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-0 lg:gap-6 min-h-[70vh]">
        <div className="lg:border-r lg:border-line lg:pr-6">
          <MessageList
            onSelect={setSelectedId}
            selectedId={selectedId ?? undefined}
            refreshKey={refreshKey}
          />
        </div>
        <div className="hidden lg:block">
          {!selectedId && (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="w-16 h-16 rounded-2xl bg-royal-50 flex items-center justify-center mb-4">
                <span className="text-3xl">💬</span>
              </div>
              <p className="text-base font-medium text-ink mb-1">No message selected</p>
              <p className="text-sm text-slate">Pick a message from the list to view details</p>
            </div>
          )}
        </div>
      </div>

      {selectedId && (
        <MessageDetail
          messageId={selectedId}
          canManage={canManage}
          onClose={() => setSelectedId(null)}
          onRetry={() => setRefreshKey((k) => k + 1)}
        />
      )}

      {showComposer && (
        <Composer
          schoolId=""
          groups={groups}
          classes={classes}
          onClose={() => setShowComposer(false)}
          onSent={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </CommunicationShell>
  );
}
