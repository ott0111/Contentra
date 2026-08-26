"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";

const platformList = ["YouTube", "TikTok", "Instagram", "X", "Twitch"] as const;
type PlatformName = typeof platformList[number];
type Connection = {
  id: string;
  platform: string;
  username: string | null;
  connected: boolean;
  last_synced_at?: string | null;
};

function ConnectionsContent() {
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [noticeType, setNoticeType] = useState<"success" | "error" | "">("");

  const successParam = searchParams.get("success");
  const errorParam = searchParams.get("error");
  const callbackNotice =
    successParam === "connected"
      ? "Account connected successfully! Refreshing..."
      : errorParam
        ? `Connection failed: ${decodeURIComponent(errorParam)}`
        : "";
  const callbackNoticeType = successParam === "connected" ? "success" : errorParam ? "error" : "";

  // Handle OAuth callback messages from query params
  useEffect(() => {
    if (successParam === "connected") {
      const timer = window.setTimeout(() => {
        window.location.reload();
      }, 1500);
      return () => window.clearTimeout(timer);
    }
  }, [successParam]);

  const currentNotice = notice || callbackNotice;
  const currentNoticeType = notice ? noticeType : callbackNoticeType;

  // Load connections from database
  useEffect(() => {
    void (async () => {
      try {
        const client = createClient();
        const { data: { user } } = await client.auth.getUser();
        if (!user) return;
        const { data } = await client
          .from("platforms")
          .select("id,platform,username,connected,last_synced_at")
          .eq("user_id", user.id);
        setConnections((data || []) as Connection[]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const disconnect = async (id: string) => {
    try {
      const platform = connections.find(connection => connection.id === id)?.platform.toLowerCase() || "youtube";
      const response = await fetch(platform === "youtube" ? "/api/connections/youtube/disconnect" : `/api/platforms/${platform}/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformId: id }),
      });

      if (!response.ok) {
        throw new Error("Disconnect failed");
      }

      setConnections(current => current.filter(connection => connection.id !== id));
      setNotice("Account disconnected.");
      setNoticeType("success");
    } catch (error) {
      setNotice("This account could not be disconnected.");
      setNoticeType("error");
    }
  };

  const sync = async (platform: PlatformName) => {
    if (!["YouTube", "Instagram", "TikTok", "X"].includes(platform)) return;

    try {
      setSyncing(true);
      const slug = platform.toLowerCase() === "youtube" ? "youtube" : platform.toLowerCase();
      const response = await fetch(`/api/platforms/${slug}/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Sync failed");
      }

      const result = await response.json();
      setConnections(current => current.map(connection => connection.platform.toLowerCase() === slug ? { ...connection, last_synced_at: new Date().toISOString() } : connection));
      setNotice(`Synced just now. ${result.synced} days updated.`);
      setNoticeType("success");
    } catch (error) {
      setNotice(
        `Sync failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
      setNoticeType("error");
    } finally {
      setSyncing(false);
    }
  };

  const connectionFor = (platform: PlatformName) =>
    connections.find(
      connection =>
        connection.platform.toLowerCase() === platform.toLowerCase() &&
        connection.connected
    );

  const connect = (platform: PlatformName) => {
    if (["YouTube", "Instagram", "TikTok", "X"].includes(platform)) {
      const slug = platform.toLowerCase();
      window.location.href = slug === "youtube" ? "/api/connections/youtube/connect" : `/api/platforms/${slug}/connect`;
    } else {
      setNotice(`${platform} integration coming soon.`);
      setNoticeType("error");
    }
  };

  return (
    <main className="min-h-screen pb-16">
      <header className="border-b border-[var(--border)] bg-white px-5 py-8 sm:px-10">
        <div className="mx-auto max-w-5xl">
          <Link
            href="/dashboard/settings"
            className="text-sm font-bold text-[var(--purple-light)]"
          >
            ← Settings
          </Link>
          <h1 className="mt-6 text-3xl font-extrabold">Connected Accounts</h1>
          <p className="mt-2 text-[var(--muted)]">
            Connect your platforms to safely import performance data. OAuth
            authentication keeps your credentials secure.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl p-5 sm:p-10">
        {currentNotice && (
          <div
            role="status"
            className={`mb-5 rounded-xl p-4 text-sm ${
              currentNoticeType === "success"
                ? "bg-[#edf8f1] text-[var(--success)]"
                : currentNoticeType === "error"
                  ? "bg-[#fef2f2] text-[var(--error)]"
                  : "bg-[var(--accent-soft)] text-[var(--purple-light)]"
            }`}
          >
            {currentNotice}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-[var(--border)] bg-white p-10 text-center text-sm text-[var(--muted)]">
            Loading connected accounts...
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {platformList.map(platform => {
              const connection = connectionFor(platform);
              return (
                <article
                  key={platform}
                  className="rounded-2xl border border-[var(--border)] bg-white p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-lg font-extrabold text-[var(--purple-light)]">
                      {platform.slice(0, 1)}
                    </div>
                    {connection ? (
                      <span className="rounded-full bg-[#edf8f1] px-2.5 py-1 text-xs font-bold text-[var(--success)]">
                        ✓ Connected
                      </span>
                    ) : (
                      <span className="rounded-full bg-[var(--background)] px-2.5 py-1 text-xs font-bold text-[var(--muted)]">
                        Not connected
                      </span>
                    )}
                  </div>

                  <h2 className="mt-5 text-lg font-bold">{platform}</h2>

                  {connection ? (
                    <>
                      <p className="mt-2 text-sm text-[var(--muted)]">
                        @{connection.username || "account"}
                      </p>
                      {connection.last_synced_at && (
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          Last synced:{" "}
                          {new Date(connection.last_synced_at).toLocaleDateString()}
                        </p>
                      )}
                      <div className="mt-6 flex gap-2">
                        <button
                          onClick={() => sync(platform)}
                          disabled={syncing}
                          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] px-4 py-2.5 text-sm font-bold text-[var(--purple-light)] hover:opacity-80 disabled:opacity-50"
                        >
                          {syncing ? "Syncing..." : "Sync Now"}
                        </button>
                        <button
                          onClick={() => disconnect(connection.id)}
                          className="flex-1 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-bold hover:border-[var(--error)] hover:text-[var(--error)]"
                        >
                          Disconnect
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                        {["YouTube", "Instagram", "TikTok", "X"].includes(platform)
                          ? `Connect your ${platform} account to sync official analytics.`
                          : "This integration is not configured yet."}
                      </p>
                      <button
                        onClick={() => connect(platform)}
                        disabled={syncing}
                        className="mt-6 w-full rounded-xl border border-[var(--border)] bg-[var(--purple-light)] px-4 py-2.5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {["YouTube", "Instagram", "TikTok", "X"].includes(platform) ? `Connect ${platform}` : "Coming Soon"}
                      </button>
                    </>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}

export default function ConnectionsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen pb-16">
          <div className="mx-auto max-w-5xl p-5 sm:p-10">
            <div className="rounded-2xl border border-[var(--border)] bg-white p-10 text-center text-sm text-[var(--muted)]">
              Loading connected accounts...
            </div>
          </div>
        </main>
      }
    >
      <ConnectionsContent />
    </Suspense>
  );
}
