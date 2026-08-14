import { defineCollection, z } from 'astro:content';
import { readFile } from 'node:fs/promises';
import { glob } from 'astro/loaders';
import { load as loadYaml } from 'js-yaml';
import { loadGoogleDocTabs } from './utils/loadGoogleDocTabs';
import { loadMembersFromSheet } from './utils/loadMembersFromSheet';

const GOOGLE_DOC_TABS_SCHEMA = z.lazy(() =>
  z.object({
    id: z.string().optional(),
    name: z.string(),
    slug: z.string(),
    content: z.string(),
    order: z.number().optional(),
    children: z.array(z.any()).optional(),
  }),
);

const MEETING_MATERIALS_DOC_ID = '1og0MLu2YJ6W66LXcP53Y4K6B0289xYSfVt6LYV3hnKc';
const RFCS_DOC_ID = '1jXCKx5szHtAtH1eQsBtzeVA8VdSdBIB_Wa2BWgetj8E';

const members = defineCollection({
  loader: async () => loadMembersFromSheet(),
  schema: z.object({
    idValue: z.string(),
    hideFromDirectory: z.boolean().optional(),
    consortiumWideEmailOptOut: z.boolean().optional(),
    firstName: z.string(),
    surname: z.string(),
    specialTitle: z.string().optional(),
    email: z.string(),
    alternateEmail: z.string().optional(),
    projectRole: z.string(),
    team: z.string(),
    affiliation: z.string(),
    gitHubHandle: z.string().optional(),
    nihEraCommonsId: z.string().optional(),
    orcId: z.string().optional(),
    professionalTitle: z.string().optional(),
    externalProfileLink: z.string().optional(),
    collaborationGroups: z.string().optional(),
    chairForCollaborationGroup: z.string().optional(),
    parents: z.string().optional(),
    children: z.string().optional(),
    onboardingFormSubmitted: z.string().optional(),
    codeOfConduct: z.string().optional(),
    consortiumCharter: z.string().optional(),
    privacyPolicy: z.string().optional(),
    controlledAccessData: z.string().optional(),
    cloudServices: z.string().optional(),
    dashboard: z.string().optional(),
    teamCollaborationMtg: z.string().optional(),
    steeringCommMtg: z.string().optional(),
    projectManagerMtg: z.string().optional(),
    projectManagerName: z.string().optional(),
    projectManagerEmail: z.string().optional(),
    executiveAssistantName: z.string().optional(),
    executiveAssistantEmail: z.string().optional(),
  }),
});

const workingGroups = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/working-groups' }),
  schema: z.object({
    title: z.string(),
    status: z.string().default('active'),
    charter: z.string().url().optional(),
    drive: z.string().url().optional(),
    agenda: z.string().url().optional(),
  }),
});

const recurringMeetings = defineCollection({
  loader: async () => {
    const text = await readFile(
      './src/content/recurring-meetings.yaml',
      'utf-8',
    );
    const items = loadYaml(text) as Array<Record<string, unknown>>;
    return items.map((item, i) => ({ id: String(i), ...item }));
  },
  schema: z.object({
    name: z.string(),
    schedule: z.string(),
    time: z.string(),
    agenda: z.string().url().optional(),
    notes: z.string().url().optional(),
  }),
});

const bams = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/bams' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    location: z.string().optional(),
    notes: z.string().url().optional(),
    slides: z.string().url().optional(),
    reportout: z.string().url().optional(),
    recording: z.string().url().optional(),
  }),
});

const meetingMaterialsAPI = defineCollection({
  loader: async () => loadGoogleDocTabs(MEETING_MATERIALS_DOC_ID),
  schema: GOOGLE_DOC_TABS_SCHEMA,
});

const rfcsAPI = defineCollection({
  loader: async () => loadGoogleDocTabs(RFCS_DOC_ID),
  schema: GOOGLE_DOC_TABS_SCHEMA,
});

export const collections = {
  members,
  'working-groups': workingGroups,
  'recurring-meetings': recurringMeetings,
  bams,
  'meeting-materials-api': meetingMaterialsAPI,
  'rfcs-api': rfcsAPI,
};
