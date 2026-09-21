import { DomainError } from "../identity-tenancy/errors";

export interface AvailabilityRule {
  readonly weekday: number;
  readonly startMinute: number;
  readonly endMinute: number;
}

export interface BusyInterval {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

export interface AvailableSlot {
  readonly startsAt: Date;
  readonly endsAt: Date;
}

interface SlotRequest {
  readonly date: string;
  readonly timezone: string;
  readonly durationMinutes: number;
  readonly rules: readonly AvailabilityRule[];
  readonly busy: readonly BusyInterval[];
  readonly now: Date;
  readonly leadTimeMinutes?: number;
  readonly stepMinutes?: number;
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let value = formatterCache.get(timezone);
  if (!value) {
    try {
      value = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
      });
      value.format(new Date(0));
    } catch {
      throw new DomainError("VALIDATION_FAILED", "Časová zóna není platná.");
    }
    formatterCache.set(timezone, value);
  }
  return value;
}

function localParts(date: Date, timezone: string): Record<string, number> {
  return Object.fromEntries(
    formatter(timezone).formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)])
  );
}

export function zonedLocalTimeToUtc(date: string, minuteOfDay: number, timezone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || minuteOfDay < 0 || minuteOfDay > 1440) {
    throw new DomainError("VALIDATION_FAILED", "Datum nebo čas není platný.");
  }
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let candidate = desired;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = localParts(new Date(candidate), timezone);
    const observed = Date.UTC(parts.year ?? 0, (parts.month ?? 1) - 1, parts.day ?? 1, parts.hour ?? 0, parts.minute ?? 0);
    candidate += desired - observed;
  }
  return new Date(candidate);
}

function overlaps(left: BusyInterval, right: BusyInterval): boolean {
  return left.startsAt < right.endsAt && right.startsAt < left.endsAt;
}

export function generateAvailableSlots(request: SlotRequest): readonly AvailableSlot[] {
  const step = request.stepMinutes ?? 15;
  const lead = request.leadTimeMinutes ?? 60;
  if (request.durationMinutes < 5 || request.durationMinutes > 720 || step < 5 || step > 120 || lead < 0) {
    throw new DomainError("VALIDATION_FAILED", "Parametry dostupnosti nejsou platné.");
  }
  const weekday = new Date(`${request.date}T00:00:00.000Z`).getUTCDay();
  const earliest = request.now.getTime() + lead * 60_000;
  const slots: AvailableSlot[] = [];
  for (const rule of request.rules.filter((item) => item.weekday === weekday)) {
    if (rule.startMinute < 0 || rule.endMinute > 1440 || rule.startMinute >= rule.endMinute) {
      throw new DomainError("VALIDATION_FAILED", "Pracovní doba není platná.");
    }
    for (let minute = rule.startMinute; minute + request.durationMinutes <= rule.endMinute; minute += step) {
      const slot = {
        startsAt: zonedLocalTimeToUtc(request.date, minute, request.timezone),
        endsAt: zonedLocalTimeToUtc(request.date, minute + request.durationMinutes, request.timezone)
      };
      if (slot.startsAt.getTime() < earliest || slot.endsAt <= slot.startsAt) continue;
      if (!request.busy.some((interval) => overlaps(slot, interval))) slots.push(slot);
    }
  }
  return slots.sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
}
