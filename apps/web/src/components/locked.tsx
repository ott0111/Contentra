'use client';
import { useMemo } from 'react';
import { Button, EmptyState } from '@/components/ui';

const LOCKED_CODES = new Set(['FEATURE_LOCKED', 'PLAN_LIMIT_REACHED']);

export function isLockedCode(code: string) {
  return LOCKED_CODES.has(code);
}

export function LockedGate({ code, detail }: { code: string; detail?: string }) {
  const copy = useMemo(() => {
    if (code === 'PLAN_LIMIT_REACHED') {
      return {
        title: 'Plan limit reached',
        description:
          detail ??
          'This workspace has hit its plan limit. Upgrade to raise the limit and keep working.',
      };
    }
    return {
      title: 'This area is a paid feature',
      description:
        detail ??
          'Your current plan does not include this feature. Upgrade to Pro or Business to unlock it.',
    };
  }, [code, detail]);

  if (!isLockedCode(code)) return null;
  return (
    <div className="section">
      <EmptyState
        title={copy.title}
        description={copy.description}
        action={
          <Button href="/app/settings/billing">
            View upgrade options
          </Button>
        }
      />
    </div>
  );
}