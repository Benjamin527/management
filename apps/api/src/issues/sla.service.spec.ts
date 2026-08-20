import { IssuePriority } from '../generated/prisma/enums';
import { SlaService } from './sla.service';

describe('SlaService', () => {
  const now = new Date('2026-08-20T00:00:00.000Z');

  it.each([
    [IssuePriority.CRITICAL, 2],
    [IssuePriority.HIGH, 8],
    [IssuePriority.MEDIUM, 24],
    [IssuePriority.LOW, 72],
  ])('sets %s SLA to %i hours', (priority, hours) => {
    expect(new SlaService().dueAt(priority, now)).toEqual(
      new Date(now.getTime() + hours * 60 * 60 * 1000),
    );
  });
});
