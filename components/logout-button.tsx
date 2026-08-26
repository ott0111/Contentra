"use client";

export default function LogoutButton() {
  return <form action="/api/auth/logout" method="post"><button className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-bold text-[var(--muted)] hover:border-[var(--purple)] hover:text-white">Log out</button></form>;
}
