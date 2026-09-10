"use client";

export default function PrintBar({ title }: { title: string }) {
  return (
    <div className="print:hidden sticky top-0 z-10 bg-teal text-white px-6 py-3 flex items-center justify-between mb-6">
      <p className="text-sm">{title}</p>
      <div className="flex gap-2">
        <button
          onClick={() => window.history.back()}
          className="text-sm rounded-md border border-white/20 px-3 py-1.5 hover:bg-card/10"
        >
          Back
        </button>
        <button
          onClick={() => window.print()}
          className="text-sm rounded-md bg-gold text-foreground font-medium px-3 py-1.5 hover:bg-gold-dark"
        >
          Print / Save as PDF
        </button>
      </div>
    </div>
  );
}
