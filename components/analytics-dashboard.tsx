"use client";
/* eslint-disable react-hooks/purity */
import Link from "next/link";
import { useMemo, useState } from "react";
import { useContent } from "@/components/content-provider";
import { useAnalytics } from "@/components/analytics-provider";
import {
  engagement,
  getSummary,
  getTopContent,
  getTrend,
} from "@/lib/analytics/calculations";
import type { ContentPerformance } from "@/types/analytics";

type Metric = "views" | "likes" | "comments" | "shares" | "followersGained";
const metricNames: Record<Metric, string> = {
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  shares: "Shares",
  followersGained: "Followers",
};
const numberValue = (value: string) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

export default function AnalyticsDashboard() {
  const { items } = useContent();
  const { records, youtube, addPerformance } = useAnalytics();
  const [range, setRange] = useState("30");
  const [metric, setMetric] = useState<Metric>("views");
  const [platform, setPlatform] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const filtered = useMemo(() => {
    const cutoff = range === "all" ? 0 : Date.now() - Number(range) * 86400000;
    return records.filter(
      (record) =>
        new Date(record.recordedAt).getTime() >= cutoff &&
        (platform === "All" ||
          record.platform === platform ||
          items.find((item) => item.id === record.contentId)?.platform ===
            platform),
    );
  }, [records, range, platform, items]);
  const summary = getSummary(filtered);
  const top = getTopContent(items, filtered, metric);
  const trend = getTrend(filtered);
  const values = trend.map(
    (point) => point[metric === "followersGained" ? "followers" : metric],
  );
  const peak = Math.max(...values, 1);
  const youtubeFiltered = filtered.filter(
    (record) => record.platform === "YouTube",
  );
  const youtubeWatchTime = youtubeFiltered.reduce(
    (total, record) => total + (record.watchTimeMinutes || 0),
    0,
  );
  const youtubeAverageDuration = youtubeFiltered.length
    ? youtubeFiltered.reduce(
        (total, record) => total + (record.averageViewDurationSeconds || 0),
        0,
      ) / youtubeFiltered.length
    : 0;
  return (
    <main className="min-h-screen bg-[var(--background)] pb-12">
      <header className="border-b border-[var(--border)] px-5 py-6 sm:px-8">
        <Link href="/dashboard" className="text-sm text-[var(--purple-light)]">
          ← Dashboard
        </Link>
        <div className="mt-8 flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="text-3xl font-bold">Analytics</h1>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Understand what&apos;s working and turn your performance into
              better content.
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="rounded-xl bg-[var(--purple)] px-4 py-3 text-sm font-bold"
          >
            + Add performance
          </button>
        </div>
      </header>
      <div className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
        <div className="flex flex-wrap gap-2">
          <select
            value={range}
            onChange={(event) => setRange(event.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
          >
            <option value="7">7 days</option>
            <option value="28">28 days</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="all">All time</option>
          </select>
          <select
            value={platform}
            onChange={(event) => setPlatform(event.target.value)}
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm"
          >
            <option>All</option>
            {["X", "TikTok", "Instagram", "YouTube"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </div>
        {filtered.length === 0 ? (
          <Empty onAdd={() => setShowForm(true)} youtube={platform === "YouTube"} />
        ) : (
          <>
            <Stats summary={summary} />
            {platform === "YouTube" && (
              <YouTubeOverview
                records={youtubeFiltered}
                lastSyncedAt={youtube.lastSyncedAt}
                watchTimeMinutes={youtubeWatchTime}
                averageDuration={youtubeAverageDuration}
              />
            )}
            {platform !== "YouTube" && platform !== "All" && (
              <PlatformOverview platform={platform} records={filtered} />
            )}
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-bold">Performance over time</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {metricNames[metric]} in the selected period.
                  </p>
                </div>
                <select
                  value={metric}
                  onChange={(event) => setMetric(event.target.value as Metric)}
                  className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                >
                  {Object.entries(metricNames).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {trend.length ? (
                <div className="mt-8 flex h-48 items-end gap-2 border-b border-l border-[var(--border)] px-3">
                  {trend.map((point) => {
                    const value =
                      point[
                        metric === "followersGained" ? "followers" : metric
                      ];
                    return (
                      <div
                        key={point.date}
                        title={`${point.date}: ${value}`}
                        className="flex-1 rounded-t bg-[var(--purple)]"
                        style={{
                          height: `${Math.max(5, (value / peak) * 100)}%`,
                        }}
                      />
                    );
                  })}
                </div>
              ) : (
                <p className="mt-8 text-sm text-[var(--muted)]">
                  Your performance data will appear here.
                </p>
              )}
            </section>
            <div className="grid gap-6 xl:grid-cols-2">
              <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
                <h2 className="font-bold">Top performing content</h2>
                <div className="mt-4 space-y-3">
                  {top.map((entry, index) => (
                    <Link
                      key={entry.item.id}
                      href={`/dashboard/content/${entry.item.id}`}
                      className="flex items-center gap-3 rounded-xl border border-[var(--border)] p-3"
                    >
                      <span className="font-bold text-[var(--purple-light)]">
                        #{index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">
                          {entry.item.title}
                        </span>
                        <span className="text-xs text-[var(--muted)]">
                          {entry.item.platform} ·{" "}
                          {entry.summary.totalViews.toLocaleString()} views
                        </span>
                      </span>
                      <span className="text-xs text-[var(--purple-light)]">
                        {entry.summary.engagementRate.toFixed(1)}%
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
              <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
                <h2 className="font-bold">Performance by platform</h2>
                <div className="mt-4 space-y-4">
                  {["X", "TikTok", "Instagram", "YouTube"].map((value) => {
                    const rows = filtered.filter(
                      (record) =>
                        record.platform === value ||
                        items.find((item) => item.id === record.contentId)
                          ?.platform === value,
                    );
                    const total = getSummary(rows);
                    return (
                      <div key={value}>
                        <div className="flex justify-between text-sm">
                          <span>{value}</span>
                          <span className="text-[var(--muted)]">
                            {total.totalViews.toLocaleString()} views ·{" "}
                            {rows.length} records
                          </span>
                        </div>
                        <div className="mt-2 h-2 rounded bg-[var(--background)]">
                          <div
                            className="h-2 rounded bg-[var(--purple)]"
                            style={{
                              width: `${summary.totalViews ? (total.totalViews / summary.totalViews) * 100 : 0}%`,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
            <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
              <h2 className="font-bold">Performance records</h2>
              <div className="mt-4 space-y-3">
                {filtered.map((record) => {
                  const item = items.find(
                    (content) => content.id === record.contentId,
                  );
                  return item ? (
                    <Link
                      key={record.id}
                      href={`/dashboard/content/${item.id}`}
                      className="flex flex-wrap gap-3 rounded-xl border border-[var(--border)] p-3 text-sm"
                    >
                      <span className="min-w-40 flex-1 font-bold">
                        {item.title}
                      </span>
                      <span className="text-[var(--muted)]">
                        {record.views.toLocaleString()} views
                      </span>
                      <span className="text-[var(--muted)]">
                        {engagement(record).toFixed(1)}% engagement
                      </span>
                      <span className="text-xs text-[var(--faint)]">
                        {new Date(record.recordedAt).toLocaleDateString()}
                      </span>
                    </Link>
                  ) : null;
                })}
              </div>
            </section>
          </>
        )}
      </div>
      {showForm && (
        <PerformanceModal
          items={items}
          onClose={() => setShowForm(false)}
          onSave={(record) => {
            addPerformance(record);
            setShowForm(false);
          }}
        />
      )}
    </main>
  );
}
function Stats({ summary }: { summary: ReturnType<typeof getSummary> }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ["Total views", summary.totalViews.toLocaleString()],
        [
          "Total engagement",
          (
            summary.totalLikes +
            summary.totalComments +
            summary.totalShares +
            summary.totalSaves
          ).toLocaleString(),
        ],
        ["Followers gained", summary.followersGained.toLocaleString()],
        ["Engagement rate", `${summary.engagementRate.toFixed(1)}%`],
      ].map(([label, value]) => (
        <div
          key={label}
          className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5"
        >
          <p className="text-sm text-[var(--muted)]">{label}</p>
          <p className="mt-3 text-2xl font-bold">{value}</p>
          <p className="mt-2 text-xs text-[var(--faint)]">
            No comparison available
          </p>
        </div>
      ))}
    </div>
  );
}
function YouTubeOverview({ records, lastSyncedAt, watchTimeMinutes, averageDuration }: { records: ContentPerformance[]; lastSyncedAt: string | null; watchTimeMinutes: number; averageDuration: number }) {
  const cards = [
    ["Subscribers gained", records.reduce((total, record) => total + record.followersGained, 0).toLocaleString()],
    ["Subscribers lost", records.reduce((total, record) => total + (record.followersLost || 0), 0).toLocaleString()],
    ["Watch time", `${Math.round(watchTimeMinutes).toLocaleString()} min`],
    ["Average view duration", `${Math.round(averageDuration).toLocaleString()} sec`],
  ];
  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">YouTube account analytics</h2><p className="mt-1 text-sm text-[var(--muted)]">Real data from your connected YouTube account.</p></div><p className="text-xs text-[var(--muted)]">{lastSyncedAt ? `Last synced ${new Date(lastSyncedAt).toLocaleString()}` : "Not synced yet"}</p></div><div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-xl border border-[var(--border)] p-4"><p className="text-xs text-[var(--muted)]">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></div>)}</div></section>;
}
function PlatformOverview({ platform, records }: { platform: string; records: ContentPerformance[] }) {
  const impressions = records.reduce((total, record) => total + (record.impressions || 0), 0);
  const reach = records.reduce((total, record) => total + (record.reach || 0), 0);
  const followers = records.at(-1)?.followers;
  const metric = platform === "X" ? ["Impressions", impressions.toLocaleString()] : ["Reach", reach.toLocaleString()];
  return <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6"><h2 className="font-bold">{platform} account analytics</h2><p className="mt-1 text-sm text-[var(--muted)]">Metrics returned by the connected {platform} account&apos;s official API.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="rounded-xl border border-[var(--border)] p-4"><p className="text-xs text-[var(--muted)]">{metric[0]}</p><p className="mt-2 text-xl font-bold">{metric[1]}</p></div><div className="rounded-xl border border-[var(--border)] p-4"><p className="text-xs text-[var(--muted)]">Followers</p><p className="mt-2 text-xl font-bold">{followers == null ? "Not provided" : followers.toLocaleString()}</p></div></div></section>;
}
function Empty({ onAdd, youtube = false }: { onAdd: () => void; youtube?: boolean }) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] px-6 py-16 text-center">
      <h2 className="font-bold">{youtube ? "No synced YouTube data for this period." : "No performance data yet."}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-[var(--muted)]">
        {youtube ? "Sync your connected YouTube account or choose a wider date range to view available metrics." : "Add performance data to your published content to start understanding what works."}
      </p>
      <button
        onClick={onAdd}
        className="mt-5 rounded-xl bg-[var(--purple)] px-4 py-3 text-sm font-bold"
      >
        Add performance
      </button>
      <Link
        href="/dashboard/content"
        className="ml-2 inline-block rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-bold"
      >
        View content
      </Link>
    </div>
  );
}
function PerformanceModal({
  items,
  onClose,
  onSave,
}: {
  items: { id: string; title: string }[];
  onClose: () => void;
  onSave: (record: Omit<ContentPerformance, "id">) => void;
}) {
  const [contentId, setContentId] = useState(items[0]?.id || "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [values, setValues] = useState<Record<string, string>>({
    views: "",
    likes: "",
    comments: "",
    shares: "",
    saves: "",
    followersGained: "",
  });
  const [error, setError] = useState("");
  const save = () => {
    const parsed = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, numberValue(value)]),
    );
    if (
      !contentId ||
      !date ||
      Object.values(parsed).some((value) => value === null)
    ) {
      setError("Enter zero or greater values for every metric.");
      return;
    }
    onSave({
      contentId,
      ...parsed,
      recordedAt: new Date(`${date}T12:00:00`).toISOString(),
    } as Omit<ContentPerformance, "id">);
  };
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/70 p-5">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface-raised)] p-6"
      >
        <div className="flex justify-between">
          <h2 className="text-xl font-bold">Add performance</h2>
          <button onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <label className="mt-5 block text-sm font-bold">
          Content
          <select
            value={contentId}
            onChange={(event) => setContentId(event.target.value)}
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] p-3"
          >
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-5 grid grid-cols-2 gap-3">
          {[
            "views",
            "likes",
            "comments",
            "shares",
            "saves",
            "followersGained",
          ].map((field) => (
            <label key={field} className="text-xs font-bold capitalize">
              {field.replace("followersGained", "followers gained")}
              <input
                type="number"
                min="0"
                value={values[field]}
                onChange={(event) =>
                  setValues({ ...values, [field]: event.target.value })
                }
                className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5 text-sm"
              />
            </label>
          ))}
        </div>
        <label className="mt-4 block text-xs font-bold">
          Date recorded
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] p-2.5 text-sm"
          />
        </label>
        {error && (
          <p role="alert" className="mt-4 text-sm text-[var(--purple-light)]">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-bold"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="rounded-xl bg-[var(--purple)] px-4 py-2.5 text-sm font-bold"
          >
            Save performance
          </button>
        </div>
      </div>
    </div>
  );
}
