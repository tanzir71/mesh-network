import AsyncStorage from "@react-native-async-storage/async-storage";

export const RETENTION_KEY = "mesh_retention_days";
export const DEFAULT_RETENTION_DAYS = 365;

export type RetentionOption = { label: string; days: number };

export const RETENTION_OPTIONS: RetentionOption[] = [
  { label: "7d",  days: 7 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "6mo", days: 180 },
  { label: "1yr", days: 365 },
  { label: "∞",   days: 0 },
];

export async function loadRetentionDays(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(RETENTION_KEY);
    if (raw === null) return DEFAULT_RETENTION_DAYS;
    const val = parseInt(raw, 10);
    return isNaN(val) ? DEFAULT_RETENTION_DAYS : val;
  } catch {
    return DEFAULT_RETENTION_DAYS;
  }
}

export async function saveRetentionDays(days: number): Promise<void> {
  await AsyncStorage.setItem(RETENTION_KEY, String(days));
}

export function retentionCutoff(days: number): number {
  if (days === 0) return 0;
  return Date.now() - days * 86_400_000;
}

export function isFreshEnough(timestamp: number, days: number): boolean {
  if (days === 0) return true;
  return timestamp >= retentionCutoff(days);
}
