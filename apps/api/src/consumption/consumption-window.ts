const dayMs = 86_400_000;

export function dateOnly(value: Date | string) {
  const parsed = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Latest consumption date is invalid');
  }
  return new Date(
    Date.UTC(
      parsed.getUTCFullYear(),
      parsed.getUTCMonth(),
      parsed.getUTCDate(),
    ),
  );
}

export function addUtcDays(value: Date, days: number) {
  return new Date(dateOnly(value).getTime() + days * dayMs);
}

export function dateKey(value: Date) {
  return dateOnly(value).toISOString().slice(0, 10);
}

export function consumptionWindow(latest: Date, days = 28) {
  if (!Number.isInteger(days) || days < 1) {
    throw new Error('Consumption window days must be a positive integer');
  }
  const end = dateOnly(latest);
  return { start: addUtcDays(end, -(days - 1)), end };
}
