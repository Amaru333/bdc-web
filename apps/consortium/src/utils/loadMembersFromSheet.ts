import {
  fetchGoogleSheetValuesBySheetId,
  hasGoogleCredentials,
} from '@bdc/google-api';

export const MEMBERS_SPREADSHEET_ID =
  '1KyhYG8deCZp1dYjYkkQCV96I6wt5xjpMGLW6dKSsmKc';
export const MEMBERS_SHEET_ID = 1718183097;

export type MemberRecord = {
  id: string;
  idValue: string;
  hideFromDirectory?: boolean;
  firstName: string;
  surname: string;
  email: string;
  consortiumWideEmailOptOut?: boolean;
  team: string;
  affiliation: string;
  projectRole: string;
  collaborationGroups?: string;
  steeringCommMtg?: string;
  onboardingFormSubmitted?: string;
  alternateEmail?: string;
  gitHubHandle?: string;
  professionalTitle?: string;
  specialTitle?: string;
  externalProfileLink?: string;
  chairForCollaborationGroup?: string;
  parents?: string;
  children?: string;
  codeOfConduct?: string;
  consortiumCharter?: string;
  privacyPolicy?: string;
  controlledAccessData?: string;
  cloudServices?: string;
  dashboard?: string;
  teamCollaborationMtg?: string;
  projectManagerMtg?: string;
  projectManagerName?: string;
  projectManagerEmail?: string;
  executiveAssistantName?: string;
  executiveAssistantEmail?: string;
};

function normalizeText(value: unknown): string {
  if (value == null || value === '') return '';
  return String(value).replace(/\s+/g, ' ').trim();
}

function parseConsortiumWideEmailOptOut(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'no' || normalized.includes('remove')) return true;
  return false;
}

function parseHideFromDirectory(showInDirectory: string): boolean {
  return showInDirectory.trim().toLowerCase() === 'no';
}

function sheetRowToMember(row: string[], index: number): MemberRecord | null {
  const [
    _timestamp,
    firstName = '',
    lastName = '',
    email = '',
    consortiumWideEmails = '',
    team = '',
    affiliation = '',
    projectRole = '',
    collaborationGroups = '',
    steeringCommMtg = '',
    status = '',
    showInDirectory = '',
  ] = row.map((cell) => normalizeText(cell));

  if (!firstName && !lastName && !email) return null;

  const id = String(index + 1);

  return {
    id,
    idValue: id,
    hideFromDirectory: parseHideFromDirectory(showInDirectory),
    firstName,
    surname: lastName,
    email,
    consortiumWideEmailOptOut:
      parseConsortiumWideEmailOptOut(consortiumWideEmails),
    team,
    affiliation,
    projectRole,
    collaborationGroups,
    steeringCommMtg,
    onboardingFormSubmitted: status,
    alternateEmail: '',
    gitHubHandle: '',
    professionalTitle: '',
    specialTitle: '',
    externalProfileLink: '',
    chairForCollaborationGroup: '',
    parents: '',
    children: '',
    codeOfConduct: '',
    consortiumCharter: '',
    privacyPolicy: '',
    controlledAccessData: '',
    cloudServices: '',
    dashboard: '',
    teamCollaborationMtg: '',
    projectManagerMtg: '',
    projectManagerName: '',
    projectManagerEmail: '',
    executiveAssistantName: '',
    executiveAssistantEmail: '',
  };
}

export async function loadMembersFromSheet(): Promise<MemberRecord[]> {
  if (!hasGoogleCredentials()) {
    console.warn('Missing Google API creds.');
    return [];
  }

  try {
    const rows = await fetchGoogleSheetValuesBySheetId(
      MEMBERS_SPREADSHEET_ID,
      MEMBERS_SHEET_ID,
      {
        startRowIndex: 1, // A2 — skip header row
        startColumnIndex: 0, // column A
        endColumnIndex: 12, // through column L
      },
    );

    return rows
      .map((row, index) => sheetRowToMember(row, index))
      .filter((member): member is MemberRecord => member !== null);
  } catch (err) {
    console.error(
      `Error fetching members from Google Sheet ${MEMBERS_SPREADSHEET_ID}:`,
      err,
    );
    return [];
  }
}
