'use client';
import Link from 'next/link';
import { Bell, ChevronDown, Settings, LogOut, Search, X, Command, FileText } from 'lucide-react';
import { SearchButton, Skeleton, AIWidget, Badge, Toaster, toast } from './ui';
import { ReleaseNotice } from './release-notice';
import { api, ApiClientError } from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';

const nav=[['Home','/app'],['Creatos','/creatos'],['Create','/app/create'],['Content','/app/content'],['Library','/app/library']];
const navGroups=[
 {label:'Intelligence',tier:'PRO',items:[['Inspiration','/app/inspiration'],['Trend Intelligence','/app/analytics']]},
 {label:'Plan & Grow',tier:'PRO',items:[['Calendar','/app/calendar'],['Analytics','/app/analytics']]},
 {label:'Business',tier:'BUSINESS',items:[['Business OS','/app/business/overview'],['Campaigns','/app/business/campaigns'],['Team & Workspaces','/app/settings/workspaces']]},
];
}