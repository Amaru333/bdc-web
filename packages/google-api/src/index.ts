import { GoogleAuth, type JWTInput } from "google-auth-library";

const DOCS_SCOPE = "https://www.googleapis.com/auth/documents.readonly";
const SHEETS_READ_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const SHEETS_WRITE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export const GOOGLE_CREDENTIALS_ENV_VAR = "GOOGLE_CREDENTIALS_BASE64";

function parseCredentialsBase64(base64: string): JWTInput {
  try {
    const json = Buffer.from(base64, "base64").toString("utf-8");
    return JSON.parse(json) as JWTInput;
  } catch {
    throw new Error(
      `Invalid ${GOOGLE_CREDENTIALS_ENV_VAR}: must be valid base64-encoded service account JSON.`,
    );
  }
}

/**
 * Resolve Google service account credentials from a base64 string or
 * the GOOGLE_CREDENTIALS_BASE64 environment variable.
 */
export function resolveGoogleCredentials(credentialsBase64?: string): JWTInput {
  const base64 = credentialsBase64 ?? process.env[GOOGLE_CREDENTIALS_ENV_VAR];
  if (!base64) {
    throw new Error(`Missing ${GOOGLE_CREDENTIALS_ENV_VAR} environment variable.`);
  }
  return parseCredentialsBase64(base64);
}

export function hasGoogleCredentials(credentialsBase64?: string): boolean {
  return Boolean(credentialsBase64 ?? process.env[GOOGLE_CREDENTIALS_ENV_VAR]);
}

/**
 * Resolve credentials from a raw service account JSON object (e.g. read from a local file).
 */
export function resolveGoogleCredentialsFromJson(credentials: JWTInput): JWTInput {
  return credentials;
}

type CredentialSource =
  | { credentialsBase64?: string }
  | { credentials: JWTInput };

function resolveCredentialInput(source?: CredentialSource): JWTInput {
  if (source && "credentials" in source && source.credentials) {
    return source.credentials;
  }
  return resolveGoogleCredentials(
    source && "credentialsBase64" in source ? source.credentialsBase64 : undefined,
  );
}

async function getAccessToken(scopes: string[], source?: CredentialSource): Promise<string> {
  const credentials = resolveCredentialInput(source);
  const auth = new GoogleAuth({
    credentials,
    scopes,
  });

  const client = await auth.getClient();
  const token = await client.getAccessToken();

  if (!token.token) {
    throw new Error("Could not generate an access token for Google APIs.");
  }

  return token.token;
}

export type GoogleCredentialOptions = {
  credentialsBase64?: string;
  credentials?: JWTInput;
};

export type FetchGoogleDocOptions = GoogleCredentialOptions & {
  includeTabsContent?: boolean;
};

/**
 * Fetch a Google Doc via the Docs API and return the raw JSON response.
 */
export async function fetchGoogleDoc(
  docId: string,
  options: FetchGoogleDocOptions = {},
): Promise<unknown> {
  const { includeTabsContent = true, ...credentialOptions } = options;
  const token = await getAccessToken([DOCS_SCOPE], credentialOptions);

  const params = new URLSearchParams();
  if (includeTabsContent) {
    params.set("includeTabsContent", "true");
  }

  const query = params.toString();
  const url = `https://docs.googleapis.com/v1/documents/${docId}${query ? `?${query}` : ""}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Google Doc ${docId}: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

export type FetchGoogleSheetOptions = GoogleCredentialOptions & {
  ranges?: string[];
  includeGridData?: boolean;
};

/**
 * Fetch a Google Sheet via the Sheets API and return the raw JSON response.
 */
export async function fetchGoogleSheet(
  spreadsheetId: string,
  options: FetchGoogleSheetOptions = {},
): Promise<unknown> {
  const { ranges, includeGridData = true, ...credentialOptions } = options;
  const token = await getAccessToken([SHEETS_READ_SCOPE], credentialOptions);

  const params = new URLSearchParams();
  if (ranges?.length) {
    for (const range of ranges) {
      params.append("ranges", range);
    }
  }
  if (includeGridData) {
    params.set("includeGridData", "true");
  }

  const query = params.toString();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${query ? `?${query}` : ""}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Google Sheet ${spreadsheetId}: ${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

export type FetchGoogleSheetValuesOptions = GoogleCredentialOptions;

/**
 * Fetch cell values from a Google Sheet range via the Sheets API values.get endpoint.
 */
export async function fetchGoogleSheetValues(
  spreadsheetId: string,
  range: string,
  options: FetchGoogleSheetValuesOptions = {},
): Promise<string[][]> {
  const token = await getAccessToken([SHEETS_READ_SCOPE], options);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to fetch Google Sheet values ${spreadsheetId}: ${response.status} ${response.statusText}. ${body}`,
    );
  }

  const data = (await response.json()) as { values?: string[][] };
  return data.values ?? [];
}

type GoogleSheetProperties = {
  sheetId?: number;
  title?: string;
};

type GoogleSheetMetadata = {
  sheets?: Array<{ properties?: GoogleSheetProperties }>;
};

/**
 * Look up a tab's current title from its stable sheet ID (the `gid` in sheet URLs).
 */
export async function resolveGoogleSheetTitleById(
  spreadsheetId: string,
  sheetId: number,
  options: GoogleCredentialOptions = {},
): Promise<string> {
  const meta = (await fetchGoogleSheet(spreadsheetId, {
    ...options,
    includeGridData: false,
  })) as GoogleSheetMetadata;

  const title = meta.sheets?.find((sheet) => sheet.properties?.sheetId === sheetId)?.properties
    ?.title;

  if (!title) {
    throw new Error(`Sheet with id ${sheetId} not found in spreadsheet ${spreadsheetId}.`);
  }

  return title;
}

function columnIndexToLetter(index: number): string {
  let result = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    result = String.fromCharCode(65 + rem) + result;
    n = Math.floor((n - 1) / 26);
  }
  return result;
}

function buildSheetRangeA1(title: string, gridRange: GoogleSheetGridRange): string {
  const escapedTitle = `'${title.replace(/'/g, "''")}'`;
  const { startRowIndex, endRowIndex, startColumnIndex, endColumnIndex } = gridRange;

  const hasBounds =
    startRowIndex !== undefined ||
    endRowIndex !== undefined ||
    startColumnIndex !== undefined ||
    endColumnIndex !== undefined;

  if (!hasBounds) {
    return escapedTitle;
  }

  const startCol = columnIndexToLetter(startColumnIndex ?? 0);
  const startRow = (startRowIndex ?? 0) + 1;

  if (endRowIndex === undefined && endColumnIndex === undefined) {
    return `${escapedTitle}!${startCol}${startRow}`;
  }

  const endCol =
    endColumnIndex !== undefined ? columnIndexToLetter(endColumnIndex - 1) : startCol;
  const endRow = endRowIndex !== undefined ? endRowIndex : undefined;

  if (endRow !== undefined) {
    return `${escapedTitle}!${startCol}${startRow}:${endCol}${endRow}`;
  }

  return `${escapedTitle}!${startCol}${startRow}:${endCol}`;
}

export type GoogleSheetGridRange = {
  /** 0-based, inclusive. Omit with endRowIndex to read through the last row. */
  startRowIndex?: number;
  /** 0-based, exclusive. */
  endRowIndex?: number;
  /** 0-based, inclusive. Omit with endColumnIndex to read through the last column. */
  startColumnIndex?: number;
  /** 0-based, exclusive. */
  endColumnIndex?: number;
};

export type FetchGoogleSheetValuesBySheetIdOptions = GoogleCredentialOptions &
  GoogleSheetGridRange;

/**
 * Fetch cell values from a sheet tab by its stable ID (`gid` / `sheetId`) instead of tab name.
 * Resolves the current tab title at runtime, then reads via values.get (readonly scope).
 */
export async function fetchGoogleSheetValuesBySheetId(
  spreadsheetId: string,
  sheetId: number,
  options: FetchGoogleSheetValuesBySheetIdOptions = {},
): Promise<string[][]> {
  const {
    startRowIndex,
    endRowIndex,
    startColumnIndex,
    endColumnIndex,
    ...credentialOptions
  } = options;

  const title = await resolveGoogleSheetTitleById(spreadsheetId, sheetId, credentialOptions);
  const range = buildSheetRangeA1(title, {
    startRowIndex,
    endRowIndex,
    startColumnIndex,
    endColumnIndex,
  });

  return fetchGoogleSheetValues(spreadsheetId, range, credentialOptions);
}

export type UpdateGoogleSheetValuesOptions = GoogleCredentialOptions & {
  valueInputOption?: "RAW" | "USER_ENTERED";
};

/**
 * Write values to a Google Sheet range via the Sheets API values.update endpoint.
 */
export async function updateGoogleSheetValues(
  spreadsheetId: string,
  range: string,
  values: string[][],
  options: UpdateGoogleSheetValuesOptions = {},
): Promise<unknown> {
  const { valueInputOption = "USER_ENTERED", ...credentialOptions } = options;
  const token = await getAccessToken([SHEETS_WRITE_SCOPE], credentialOptions);

  const params = new URLSearchParams({
    valueInputOption,
  });
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}?${params}`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to update Google Sheet ${spreadsheetId}: ${response.status} ${response.statusText}. ${body}`,
    );
  }

  return response.json();
}

/**
 * Clear values in a Google Sheet range.
 */
export async function clearGoogleSheetRange(
  spreadsheetId: string,
  range: string,
  options: GoogleCredentialOptions = {},
): Promise<unknown> {
  const token = await getAccessToken([SHEETS_WRITE_SCOPE], options);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:clear`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Failed to clear Google Sheet range ${range}: ${response.status} ${response.statusText}. ${body}`,
    );
  }

  return response.json();
}
