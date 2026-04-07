"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

const PIE_FILL = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#ef4444", "#64748b", "#06b6d4", "#84cc16"];

function moneyTooltip(v: number) {
  return new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v) + " сум";
}

type DayActivityProps = {
  ordersToday: number;
  ordersActive: number;
  paymentsToday: number;
  returnsToday: number;
};

export function DashboardDayActivityChart({ ordersToday, ordersActive, paymentsToday, returnsToday }: DayActivityProps) {
  const data = [
    { name: "Заказы", soni: ordersToday },
    { name: "В работе", soni: ordersActive },
    { name: "Платежи", soni: paymentsToday },
    { name: "Возвраты", soni: returnsToday }
  ];
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} className="text-muted-foreground" />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} className="text-muted-foreground" />
        <Tooltip
          contentStyle={{ borderRadius: 8, fontSize: 12 }}
          formatter={(v: number) => [v, "Кол-во"]}
        />
        <Bar dataKey="soni" fill="var(--primary)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

type TrendRow = { dateShort: string; orders: number; revenue: number };

export function ReportsTrendCharts({ rows }: { rows: TrendRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
          <XAxis dataKey="dateShort" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={36} />
          <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [v, "Заказы"]} />
          <Line type="monotone" dataKey="orders" stroke="var(--primary)" strokeWidth={2} dot={false} name="Заказы" />
        </LineChart>
      </ResponsiveContainer>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={rows} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
          <XAxis dataKey="dateShort" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} width={44} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`)} />
          <Tooltip
            contentStyle={{ borderRadius: 8, fontSize: 12 }}
            formatter={(v: number) => [moneyTooltip(v), "Выручка"]}
          />
          <Area type="monotone" dataKey="revenue" stroke="#10b981" fill="#10b981" fillOpacity={0.2} name="Выручка" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

type StatusSlice = { status: string; name: string; value: number };

export function ReportsStatusPie({ slices }: { slices: StatusSlice[] }) {
  if (slices.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <Pie
          data={slices}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={92}
          label={false}
        >
          {slices.map((_, i) => (
            <Cell key={slices[i].status} fill={PIE_FILL[i % PIE_FILL.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [v, "Заказы"]} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

type ProductBar = { label: string; revenue: number };

export function ReportsTopProductsBar({ items }: { items: ProductBar[] }) {
  if (items.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={Math.min(360, 40 + items.length * 28)}>
      <BarChart data={items} layout="vertical" margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${Math.round(v / 1000)}k`)} />
        <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [moneyTooltip(v), "Сумма"]} />
        <Bar dataKey="revenue" fill="var(--primary)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

type ChannelBar = { label: string; orders: number };

export function ReportsChannelOrdersBar({ items }: { items: ChannelBar[] }) {
  if (items.length === 0) return null;
  return (
    <ResponsiveContainer width="100%" height={Math.min(320, 40 + items.length * 26)}>
      <BarChart data={items} layout="vertical" margin={{ top: 8, right: 12, left: 4, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" horizontal={false} />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
        <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} formatter={(v: number) => [v, "Заказы"]} />
        <Bar dataKey="orders" fill="#0d9488" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
