export type RoundupPeriod = 'morning' | 'evening';

export function scheduledPeriod(scheduledTime: number, timeZone: string): RoundupPeriod | null {
  const hour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: 'numeric',
    hourCycle: 'h23'
  }).format(new Date(scheduledTime)));
  if (hour === 8) return 'morning';
  if (hour === 19) return 'evening';
  return null;
}
