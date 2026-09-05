"use client";

/**
 * DashboardGreeting
 *
 * Client-rendered greeting + three dismissible alert cards.
 * Time-of-day greeting is computed on the client to avoid hydration mismatches.
 */

import { useState, useEffect } from "react";
import AlertDismissibleCard from "./AlertDismissibleCard";

interface AlertCardData {
  id:        string;
  variant:   "fees" | "assignment" | "attendance";
  title:     string;
  body:      string;
  linkLabel: string;
  linkHref:  string;
}

interface Props {
  parentName:   string;  // e.g. "Baba Miguel"
  studentName:  string;  // e.g. "Miguel"
  alerts:       AlertCardData[];
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function getEmoji(): string {
  const h = new Date().getHours();
  if (h < 12) return "👋";
  if (h < 17) return "☀️";
  return "🌙";
}

export default function DashboardGreeting({ parentName, studentName, alerts }: Props) {
  const [greeting, setGreeting] = useState("Good morning");
  const [emoji,    setEmoji]    = useState("👋");

  useEffect(() => {
    setGreeting(getGreeting());
    setEmoji(getEmoji());
  }, []);

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl md:text-[28px] font-bold text-ink dark:text-dark-text leading-tight">
          {greeting}, {parentName}! {emoji}
        </h1>
        <p className="text-sm text-slate dark:text-dark-muted mt-1">
          Here&apos;s what&apos;s happening with {studentName} today.
        </p>
      </div>

      {/* Alert cards row */}
      {alerts.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {alerts.map((a) => (
            <AlertDismissibleCard key={a.id} {...a} />
          ))}
        </div>
      )}
    </div>
  );
}
