import { IssueStatus } from '../generated/prisma/enums';

const transitions: Record<IssueStatus, IssueStatus[]> = {
  PENDING: [IssueStatus.IN_PROGRESS],
  IN_PROGRESS: [IssueStatus.WAITING_CUSTOMER, IssueStatus.WAITING_INTERNAL, IssueStatus.RESOLVED],
  WAITING_CUSTOMER: [IssueStatus.IN_PROGRESS],
  WAITING_INTERNAL: [IssueStatus.IN_PROGRESS],
  RESOLVED: [IssueStatus.CLOSED, IssueStatus.IN_PROGRESS],
  CLOSED: [],
};

export function allowedTransitions(status: IssueStatus) {
  return transitions[status];
}

export function canTransition(from: IssueStatus, to: IssueStatus) {
  return transitions[from].includes(to);
}
