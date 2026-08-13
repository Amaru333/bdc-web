import { fetchGoogleDoc, hasGoogleCredentials } from '@bdc/google-api';
import {
  type DocsDocument,
  type NestedDocTab,
  parseNestedMarkdownTabs,
} from './parseJson';

export type GoogleDocTabEntry = NestedDocTab & { id: string };

export async function loadGoogleDocTabs(
  docId: string,
): Promise<GoogleDocTabEntry[]> {
  if (!hasGoogleCredentials()) {
    console.warn('Missing Google API creds.');
    return [];
  }

  try {
    const doc = (await fetchGoogleDoc(docId)) as DocsDocument;
    const formattedMarkdown = parseNestedMarkdownTabs(doc);

    return formattedMarkdown.map((tab, index) => ({
      ...tab,
      id: tab.slug || `tab-${index}`,
      order: index,
    }));
  } catch (err) {
    console.error(`Error fetching Google Doc ${docId}:`, err);
    return [];
  }
}
