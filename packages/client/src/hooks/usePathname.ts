import { useSyncExternalStore } from 'react';
import { subscribeToRoute } from '../lib/route.ts';

export function usePathname(): string {
  return useSyncExternalStore(subscribeToRoute, () => window.location.pathname);
}
