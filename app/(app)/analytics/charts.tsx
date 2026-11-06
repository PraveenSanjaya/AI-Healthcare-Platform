"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { label: string; count: number };

const TOP = 10;

/** One bar chart with an equivalent data table underneath, so the numbers are readable without the picture. */
function ChartCard({
  title,
  points,
  horizontal = false,
}: {
  title: string;
  points: Point[];
  horizontal?: boolean;
}) {
  const data = horizontal ? points.slice(0, TOP) : points;
  const empty = data.length === 0 || data.every((p) => p.count === 0);
  const height = horizontal ? Math.max(180, data.length * 34 + 40) : 260;
  return (
    <section className="space-y-2 rounded-lg border p-4" aria-label={title}>
      <h2 className="text-lg font-semibold">{title}</h2>
      {empty ? (
        <p className="text-muted-foreground py-8 text-center">No data in this period.</p>
      ) : (
        <div className="text-blue-700 dark:text-blue-400" style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={data}
              layout={horizontal ? "vertical" : "horizontal"}
              margin={{ top: 4, right: 12, bottom: 4, left: horizontal ? 8 : 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
              {horizontal ? (
                <>
                  <XAxis type="number" allowDecimals={false} />
                  <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 12 }} />
                </>
              ) : (
                <>
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                  <YAxis allowDecimals={false} />
                </>
              )}
              <Tooltip />
              <Bar
                dataKey="count"
                name="Generations"
                fill="currentColor"
                isAnimationActive={false}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {!empty && (
        <details className="text-sm">
          <summary className="cursor-pointer">View as table</summary>
          <table className="mt-2 w-full text-left">
            <caption className="sr-only">{title}</caption>
            <thead>
              <tr className="border-b">
                <th className="p-1">{horizontal ? "Name" : "Day"}</th>
                <th className="p-1">Generations</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.label} className="border-b">
                  <td className="p-1">{p.label}</td>
                  <td className="p-1">{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}

export function AnalyticsCharts({
  perDay,
  perTemplate,
  perUser,
}: {
  perDay: { day: string; count: number }[];
  perTemplate: { title: string; count: number }[];
  perUser: { name: string; count: number }[];
}) {
  return (
    <div className="space-y-6">
      <ChartCard
        title="Generations per day"
        points={perDay.map((d) => ({ label: d.day, count: d.count }))}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartCard
          title="Generations per template"
          horizontal
          points={perTemplate.map((t) => ({ label: t.title, count: t.count }))}
        />
        <ChartCard
          title="Generations per user"
          horizontal
          points={perUser.map((u) => ({ label: u.name, count: u.count }))}
        />
      </div>
    </div>
  );
}
