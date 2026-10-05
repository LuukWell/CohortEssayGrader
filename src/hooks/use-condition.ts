'use client';

import { useSession } from '@/hooks/use-session';

export function useCondition() {
  const { session } = useSession();
  const condition = session?.condition ?? null;
  return {
    condition,
    isDashboard: condition === 'dashboard',
    isBaseline: condition === 'baseline',
  };
}
