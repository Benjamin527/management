import { Injectable } from '@nestjs/common';
import { IssuePriority } from '../generated/prisma/enums';

const hours: Record<IssuePriority, number> = {
  CRITICAL: 2,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 72,
};

@Injectable()
export class SlaService {
  dueAt(priority: IssuePriority, from = new Date()) {
    return new Date(from.getTime() + hours[priority] * 60 * 60 * 1000);
  }
}
