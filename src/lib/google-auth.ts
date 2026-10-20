import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import type { InventoryItem } from './types';
import { buildSpreadsheetValues } from './google-logic';

// Initialize Firebase App singleton
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Configure Google Auth Provider with Google Sheets & Google Drive scopes
export const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/drive');
provider.setCustomParameters({
  prompt: 'select_account'
});

let cachedAccessToken: string | null = null;
let isSigningIn = false;

export const initGoogleAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user && cachedAccessToken) {
      if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
    } else if (!isSigningIn) {
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const signInWithGoogle = async (): Promise<{ user: User; accessToken: string }> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Gagal mendapatkan access token dari Google.');
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Google Sign In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getGoogleAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const setGoogleAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

export const signOutGoogle = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
};

// ==========================================
// Google Drive & Sheets API Operations
// ==========================================

/**
 * Test access to Google Spreadsheet
 */
export async function testSpreadsheetAccess(accessToken: string, spreadsheetId: string) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = err.error?.message || res.statusText;
    throw new Error(`Gagal mengakses Google Spreadsheet: ${message}. Pastikan izin sharing diatur ke "Siapa saja yang memiliki link: Editor".`);
  }

  const data = await res.json();
  return {
    title: data.properties?.title || 'Spreadsheet',
    sheets: (data.sheets || []).map((s: any) => s.properties?.title)
  };
}

/**
 * Test access to Google Drive Folder
 */
export async function testDriveFolderAccess(accessToken: string, folderId: string) {
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,name,mimeType,capabilities`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const message = err.error?.message || res.statusText;
    throw new Error(`Gagal mengakses Folder Google Drive: ${message}. Pastikan folder diatur ke "Siapa saja yang memiliki link: Editor".`);
  }

  const data = await res.json();
  if (data.mimeType !== 'application/vnd.google-apps.folder') {
    throw new Error('ID yang dimasukkan bukan merupakan Folder Google Drive.');
  }

  return {
    folderName: data.name,
    canAddChildren: data.capabilities?.canAddChildren ?? true
  };
}

/**
 * Convert data URL or local /uploads/ URL to Blob
 */
async function getBlobFromUrl(photoUrl: string): Promise<{ blob: Blob; mimeType: string }> {
  if (photoUrl.startsWith('data:')) {
    const match = photoUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const byteCharacters = atob(match[2]);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      return { blob: new Blob([byteArray], { type: mimeType }), mimeType };
    }
  }

  // If local /uploads/ URL or relative URL, fetch it from server
  const fetchUrl = photoUrl.startsWith('/') ? photoUrl : `/${photoUrl}`;
  const res = await fetch(fetchUrl);
  if (!res.ok) {
    throw new Error(`Gagal mengambil gambar lokal dari ${photoUrl}`);
  }
  const blob = await res.blob();
  return { blob, mimeType: blob.type || 'image/jpeg' };
}

/**
 * Upload an image blob directly to the user's Google Drive folder
 * and make it viewable by anyone with the link
 */
export async function uploadImageToDriveFolder(
  accessToken: string,
  folderId: string,
  fileName: string,
  photoUrl: string
): Promise<{ fileId: string; driveViewUrl: string; driveDirectUrl: string }> {
  // If already a Google Drive link, return it directly
  if (photoUrl.includes('drive.google.com') || photoUrl.includes('googleusercontent.com')) {
    return {
      fileId: '',
      driveViewUrl: photoUrl,
      driveDirectUrl: photoUrl
    };
  }

  const { blob, mimeType } = await getBlobFromUrl(photoUrl);

  const cleanName = `${fileName.replace(/[^a-zA-Z0-9_-]/g, '_')}_${Date.now()}.jpg`;

  const metadata = {
    name: cleanName,
    parents: [folderId],
    mimeType
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const metadataPart = `${delimiter}Content-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}`;
  const mediaHeader = `${delimiter}Content-Type: ${mimeType}\r\n\r\n`;

  const arrayBuffer = await blob.arrayBuffer();
  const uint8View = new Uint8Array(arrayBuffer);

  const encoder = new TextEncoder();
  const part1 = encoder.encode(metadataPart);
  const part2 = encoder.encode(mediaHeader);
  const part3 = encoder.encode(closeDelimiter);

  const fullBody = new Uint8Array(part1.byteLength + part2.byteLength + uint8View.byteLength + part3.byteLength);
  fullBody.set(part1, 0);
  fullBody.set(part2, part1.byteLength);
  fullBody.set(uint8View, part1.byteLength + part2.byteLength);
  fullBody.set(part3, part1.byteLength + part2.byteLength + uint8View.byteLength);

  const uploadRes = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`
      },
      body: fullBody
    }
  );

  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(`Gagal upload foto ke Google Drive: ${err.error?.message || uploadRes.statusText}`);
  }

  const fileData = await uploadRes.json();
  const fileId = fileData.id;

  // Make file readable by anyone with the link so it renders properly in spreadsheet
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role: 'reader',
        type: 'anyone'
      })
    });
  } catch (permErr) {
    console.warn('Set permission warning:', permErr);
  }

  const driveViewUrl = fileData.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
  const driveDirectUrl = `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;

  return {
    fileId,
    driveViewUrl,
    driveDirectUrl
  };
}

/**
 * Format and style the Google Spreadsheet so it looks clean, structured, and professional.
 */
async function formatGoogleSheet(
  accessToken: string,
  spreadsheetId: string,
  sheetId: number,
  rowCount: number
) {
  const requests = [
    // 1. Freeze header row (Row 1)
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: {
            frozenRowCount: 1
          }
        },
        fields: 'gridProperties.frozenRowCount'
      }
    },
    // 2. Format Header Row Style (Navy background #1e293b, Bold white text, Center aligned)
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 11
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.12, green: 0.16, blue: 0.23 }, // #1e293b
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            textFormat: {
              bold: true,
              foregroundColor: { red: 1.0, green: 1.0, blue: 1.0 },
              fontSize: 10
            },
            padding: { top: 6, bottom: 6, left: 8, right: 8 },
            wrapStrategy: 'WRAP'
          }
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding,wrapStrategy)'
      }
    },
    // 3. Set row height for header
    {
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: 0,
          endIndex: 1
        },
        properties: {
          pixelSize: 42
        },
        fields: 'pixelSize'
      }
    },
    // 4. Set row heights for data rows (spacious and clear)
    {
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: 'ROWS',
          startIndex: 1,
          endIndex: Math.max(rowCount, 2)
        },
        properties: {
          pixelSize: 48
        },
        fields: 'pixelSize'
      }
    },
    // 5. Set custom column widths
    // 0: NO (50px)
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 60 },
        fields: 'pixelSize'
      }
    },
    // 1: ID BARANG (120px)
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 130 },
        fields: 'pixelSize'
      }
    },
    // 2: FOTO BARANG (DRIVE URL) (280px)
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 },
        properties: { pixelSize: 300 },
        fields: 'pixelSize'
      }
    },
    // 3: NAMA BARANG (240px)
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 },
        properties: { pixelSize: 250 },
        fields: 'pixelSize'
      }
    },
    // 4: KATEGORI (150px)
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 },
        properties: { pixelSize: 150 },
        fields: 'pixelSize'
      }
    },
    // 5: TANGGAL (130px)
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 },
        properties: { pixelSize: 130 },
        fields: 'pixelSize'
      }
    },
    // 6: SERIAL NUMBER (160px)
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 },
        properties: { pixelSize: 160 },
        fields: 'pixelSize'
      }
    },
    // 7: REMARK (200px)
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 },
        properties: { pixelSize: 200 },
        fields: 'pixelSize'
      }
    },
    // 8: DITAMBAHKAN OLEH (130px)
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 8, endIndex: 9 },
        properties: { pixelSize: 130 },
        fields: 'pixelSize'
      }
    },
    // 9: DIUBAH OLEH (130px)
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 9, endIndex: 10 },
        properties: { pixelSize: 130 },
        fields: 'pixelSize'
      }
    },
    // 10: TERAKHIR DIUPDATE (170px)
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: 'COLUMNS', startIndex: 10, endIndex: 11 },
        properties: { pixelSize: 170 },
        fields: 'pixelSize'
      }
    },
    // 6. Enable Auto-filter on all data columns
    {
      setBasicFilter: {
        filter: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: Math.max(rowCount, 2),
            startColumnIndex: 0,
            endColumnIndex: 11
          }
        }
      }
    }
  ];

  try {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ requests })
    });
  } catch (err) {
    console.warn('Formatting spreadsheet warning:', err);
  }
}

/**
 * Sync all inventory items to Google Spreadsheet:
 * 1. Uploads any non-Drive photos to the Google Drive folder.
 * 2. Writes rows into "INVENTORY DATABASE" tab.
 * 3. Applies clean corporate formatting and freeze headers.
 */
export async function syncAllInventoryToSheets(
  accessToken: string,
  spreadsheetId: string,
  driveFolderId: string,
  items: InventoryItem[],
  onProgress?: (msg: string, current: number, total: number) => void
): Promise<{ updatedItems: InventoryItem[]; count: number }> {
  const updatedItems: InventoryItem[] = [];
  const total = items.length;

  // Step 1: Ensure photos are uploaded to Google Drive folder
  for (let i = 0; i < total; i++) {
    const item = { ...items[i] };
    const isDrivePhoto = item.photoUrl.includes('drive.google.com') || item.photoUrl.includes('googleusercontent.com');

    if (!isDrivePhoto && item.photoUrl) {
      if (onProgress) {
        onProgress(`Mengupload foto ${item.itemName} (${i + 1}/${total}) ke Google Drive...`, i + 1, total);
      }
      try {
        const driveResult = await uploadImageToDriveFolder(
          accessToken,
          driveFolderId,
          `${item.category}_${item.itemName}`,
          item.photoUrl
        );
        item.photoUrl = driveResult.driveViewUrl;
      } catch (uploadErr) {
        console.warn(`Failed to upload photo for ${item.itemName}:`, uploadErr);
      }
    }

    updatedItems.push(item);
  }

  if (onProgress) {
    onProgress('Mempersiapkan data dan format Google Spreadsheet...', total, total);
  }

  // Step 2: Fetch spreadsheet info to get or create sheet
  const metaRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?includeGridData=false`,
    {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  if (!metaRes.ok) {
    throw new Error('Gagal mengakses metadata spreadsheet.');
  }

  const metaData = await metaRes.json();
  const sheets: any[] = metaData.sheets || [];
  const targetSheetName = 'INVENTORY DATABASE';
  let targetSheet = sheets.find((s: any) => s.properties?.title === targetSheetName);

  if (!targetSheet) {
    // Create new sheet tab
    const addSheetRes = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [
            {
              addSheet: {
                properties: {
                  title: targetSheetName,
                  gridProperties: {
                    rowCount: Math.max(total + 50, 100),
                    columnCount: 15
                  }
                }
              }
            }
          ]
        })
      }
    );

    if (addSheetRes.ok) {
      const addData = await addSheetRes.json();
      targetSheet = addData.replies?.[0]?.addSheet;
    } else {
      // Fallback to first sheet
      targetSheet = sheets[0];
    }
  }

  const sheetTitle = targetSheet?.properties?.title || 'Sheet1';
  const sheetId = targetSheet?.properties?.sheetId || 0;

  // Step 3: Clear old data in the sheet
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(sheetTitle)}'!A1:Z${total + 100}:clear`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  );

  // Step 4: Write all rows with header
  const values = buildSpreadsheetValues(updatedItems);
  const writeRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/'${encodeURIComponent(sheetTitle)}'!A1?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        values
      })
    }
  );

  if (!writeRes.ok) {
    const err = await writeRes.json().catch(() => ({}));
    throw new Error(`Gagal menulis ke Google Spreadsheet: ${err.error?.message || writeRes.statusText}`);
  }

  // Step 5: Format the spreadsheet
  if (sheetId !== undefined) {
    await formatGoogleSheet(accessToken, spreadsheetId, sheetId, values.length);
  }

  if (onProgress) {
    onProgress('Sinkronisasi Google Spreadsheet & Drive selesai!', total, total);
  }

  return {
    updatedItems,
    count: updatedItems.length
  };
}
