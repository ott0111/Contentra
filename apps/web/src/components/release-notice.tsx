'use client';
import { useEffect, useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Badge } from './ui';

export const APP_VERSION = '1.0.0';

type ReleaseNotice = {
  updateAvailable: boolean;
  required: boolean;
  version?: string;
  title?: string;
  changelog?: { features?: string[]; improvements?: string[]; fixes?: string[] } | null;
  publishedAt?: string | null;
};

const dismissedKey = 'contentra_release_notice_dismissed';

function formatDate(iso?: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function ReleaseNotice() {
  const [notice, setNotice] = useState<ReleaseNotice | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let mounted = true;
    api<ReleaseNotice>(
      `/api/v1/releases/latest?platform=web&version=${APP_VERSION}`,
    )
      .then((data) => {
        if (!mounted) return;
        setNotice(data);
        if (!data.updateAvailable) return;
        const dismissed = localStorage.getItem(dismissedKey);
        if (dismissed !== data.version) setVisible(true);
        if (data.required) setVisible(true);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  if (!notice?.updateAvailable || !visible || !notice.version) return null;

  const { features = [], improvements = [], fixes = [] } = notice.changelog ?? {};

  return (
    <section className="release-notice" role="status" aria-label="What's new">
      <div className="release-notice-inner">
        <Sparkles size={16} aria-hidden />
        <div className="release-notice-body">
          <strong>{notice.title ?? 'What\u2019s new'} <Badge>v{notice.version}</Badge></strong>
          {notice.publishedAt && (
            <span className="release-notice-date">{formatDate(notice.publishedAt)}</span>
          )}
          {features.length > 0 && (
            <ul>{features.map((item) => <li key={item}>{item}</li>)}</ul>
          )}
          {improvements.length > 0 && improvements.map((item) => <span key={item} className="release-note">{item}</span>)}
          {fixes.length > 0 && fixes.map((item) => <span key={item} className="release-note">{item}</span>)}
        </div>
        <button
          className="icon-btn"
          aria-label="Dismiss what's new"
          onClick={() => {
            localStorage.setItem(dismissedKey, notice.version ?? '');
            setVisible(false);
          }}
        >
          <X size={16} />
        </button>
      </div>
    </section>
  );
}