'use client';
import Link from 'next/link';

const items: Array<[string, string]> = [['account', 'Account'], ['workspaces', 'Workspaces'], ['preferences', 'Preferences'], ['privacy', 'Privacy'], ['languages', 'Languages'], ['integrations', 'Integrations'], ['billing', 'Billing'], ['notifications', 'Notifications'], ['api', 'API'], ['ai-credits', 'AI Credits'], ['storage', 'Storage']];

export function SettingsShell({ active, children }: { active: string; children: React.ReactNode }) {
	return <div className="settings-shell"><nav className="settings-nav" aria-label="Settings">{items.map(([slug, label]) => <Link key={slug} className={active === slug ? 'active' : ''} href={`/app/settings/${slug}`}>{label}</Link>)}</nav><div className="settings-content">{children}</div></div>;
}