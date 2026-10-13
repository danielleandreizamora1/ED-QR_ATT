import type { Role } from '@/lib/profiles';

// Required User Roles — QR-ATT Final Project spec.
//
// A. Student: account, personal info, available events, scan QR,
//    record attendance, personal history.
// B. Teacher: secure login, create/manage events, generate event QR,
//    view attendance records, monitor attendance, view summaries.
// C. Administrator: manage users, manage events, overall attendance,
//    manage/correct records, system records/reports.

export type { Role } from '@/lib/profiles';

export const ROLES: readonly Role[] = ['student', 'teacher', 'admin'] as const;

type Capability =
  | 'viewEvents' // view available events
  | 'scanAndRecord' // scan QR + record own attendance
  | 'viewOwnHistory' // personal attendance history
  | 'createEvents' // create/manage own events + generate QR
  | 'viewEventAttendance' // attendance records for own events
  | 'viewSummaries' // per-event attendance summaries
  | 'manageUsers' // list/change user roles
  | 'manageAllEvents' // edit/delete any event
  | 'viewOverallAttendance' // every check-in system-wide
  | 'correctRecords' // delete/correct attendance rows
  | 'viewReports'; // system records/reports;

const CAPABILITIES: Record<Role, Set<Capability>> = {
  student: new Set(['viewEvents', 'scanAndRecord', 'viewOwnHistory']),
  teacher: new Set([
    'viewEvents',
    'scanAndRecord',
    'viewOwnHistory',
    'createEvents',
    'viewEventAttendance',
    'viewSummaries',
  ]),
  admin: new Set([
    'viewEvents',
    'scanAndRecord',
    'viewOwnHistory',
    'createEvents',
    'viewEventAttendance',
    'viewSummaries',
    'manageUsers',
    'manageAllEvents',
    'viewOverallAttendance',
    'correctRecords',
    'viewReports',
  ]),
};

export function can(role: Role | null | undefined, capability: Capability): boolean {
  if (!role) return false;
  return CAPABILITIES[role]?.has(capability) ?? false;
}

export function canCreateEvents(role: Role | null | undefined): boolean {
  return can(role, 'createEvents');
}

export function canManageAll(role: Role | null | undefined): boolean {
  return can(role, 'manageUsers');
}

export function roleLabel(role: Role | null | undefined): string {
  switch (role) {
    case 'teacher':
      return 'Teacher';
    case 'admin':
      return 'Administrator';
    default:
      return 'Student';
  }
}
