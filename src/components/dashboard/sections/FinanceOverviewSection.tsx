import { Wallet, TrendingUp, PiggyBank } from "lucide-react";
import StatCard from "@/components/dashboard/StatCard";

interface Props {
  rolePrefix:      string;
  totalBalance:    number;
  expectedThisTerm: number;
  paidThisTerm:    number;
  termName?:       string | null;
}

function money(n: number): string {
  return `KES ${Math.round(n).toLocaleString()}`;
}

export default function FinanceOverviewSection({
  totalBalance, expectedThisTerm, paidThisTerm, termName,
}: Props) {
  const collectedPct = expectedThisTerm > 0
    ? Math.round((paidThisTerm / expectedThisTerm) * 100)
    : 0;

  return (
    <section aria-labelledby="finance-overview-heading" className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="h-1 w-5 rounded-full bg-teal shrink-0" aria-hidden="true" />
        <h2
          id="finance-overview-heading"
          className="text-sm font-semibold text-slate uppercase tracking-wide"
        >
          Finance{termName ? ` · ${termName}` : ""}
        </h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          label="Total school balance"
          value={money(totalBalance)}
          icon={Wallet}
          color={totalBalance > 0 ? "warn" : "success"}
          sub={totalBalance > 0 ? "Outstanding" : "Fully collected"}
        />
        <StatCard
          label="Expected this term"
          value={money(expectedThisTerm)}
          icon={TrendingUp}
          color="info"
        />
        <StatCard
          label="Paid this term"
          value={money(paidThisTerm)}
          icon={PiggyBank}
          color="success"
          sub={`${collectedPct}% collected`}
        />
      </div>
    </section>
  );
}
