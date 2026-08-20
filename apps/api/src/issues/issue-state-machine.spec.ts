import { IssueStatus } from '../generated/prisma/enums';
import { allowedTransitions, canTransition } from './issue-state-machine';

describe('issue state machine', () => {
  it('allows the supported resolution lifecycle', () => {
    expect(canTransition(IssueStatus.PENDING, IssueStatus.IN_PROGRESS)).toBe(true);
    expect(canTransition(IssueStatus.IN_PROGRESS, IssueStatus.WAITING_CUSTOMER)).toBe(true);
    expect(canTransition(IssueStatus.WAITING_CUSTOMER, IssueStatus.IN_PROGRESS)).toBe(true);
    expect(canTransition(IssueStatus.RESOLVED, IssueStatus.CLOSED)).toBe(true);
  });

  it('keeps closed issues immutable', () => {
    expect(allowedTransitions(IssueStatus.CLOSED)).toEqual([]);
    expect(canTransition(IssueStatus.CLOSED, IssueStatus.IN_PROGRESS)).toBe(false);
  });
});
