'use client';
import Link from 'next/link';
const items=[['Overview','/app/business/overview'],['Website','/app/business/website'],['Conversions','/app/business/conversions'],['Customers','/app/business/customers'],['Products','/app/business/products'],['Campaigns','/app/business/campaigns'],['Attribution','/app/business/attribution'],['API / Data','/app/business/api-data']];
export function BusinessShell({children}:{children:React.ReactNode}){return <div className="business-shell"><aside className="settings-nav" aria-label="Business navigation"><span className="eyebrow">Business</span>{items.map(([label,href])=><Link key={href} href={href}>{label}</Link>)}</aside><section className="settings-content">{children}</section></div>}
