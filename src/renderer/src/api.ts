export interface LiveResolvedTarget {
  viewportX: number;
  viewportY: number;
  label: string;
  action: string;
  confidence: number;
}

export const api = (window as any).api;

export function resolveLiveTarget(
  targetLabel: string,
  action: string,
): Promise<LiveResolvedTarget | null> {
  return api.resolveLiveTarget(targetLabel, action);
}
