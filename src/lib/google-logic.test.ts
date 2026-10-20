import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractGoogleSpreadsheetId,
  extractGoogleDriveFolderId,
  validateGoogleConfig,
  formatInventoryRowForSheet,
  buildSpreadsheetValues,
  SPREADSHEET_HEADERS
} from './google-logic.ts';
import type { InventoryItem } from './types';

test('extractGoogleSpreadsheetId correctly extracts ID from various Google Sheet URLs', () => {
  const url1 = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit?usp=sharing';
  assert.equal(extractGoogleSpreadsheetId(url1), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');

  const url2 = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0';
  assert.equal(extractGoogleSpreadsheetId(url2), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');

  const url3 = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
  assert.equal(extractGoogleSpreadsheetId(url3), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');

  const rawId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
  assert.equal(extractGoogleSpreadsheetId(rawId), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');

  assert.equal(extractGoogleSpreadsheetId('invalid-url'), null);
  assert.equal(extractGoogleSpreadsheetId(''), null);
  assert.equal(extractGoogleSpreadsheetId(null), null);
});

test('extractGoogleDriveFolderId correctly extracts folder ID from various Google Drive URLs', () => {
  const url1 = 'https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9i0j_KLMNOPQRSTUV';
  assert.equal(extractGoogleDriveFolderId(url1), '1a2b3c4d5e6f7g8h9i0j_KLMNOPQRSTUV');

  const url2 = 'https://drive.google.com/drive/u/0/folders/1a2b3c4d5e6f7g8h9i0j_KLMNOPQRSTUV?usp=sharing';
  assert.equal(extractGoogleDriveFolderId(url2), '1a2b3c4d5e6f7g8h9i0j_KLMNOPQRSTUV');

  const rawId = '1a2b3c4d5e6f7g8h9i0j_KLMNOPQRSTUV';
  assert.equal(extractGoogleDriveFolderId(rawId), '1a2b3c4d5e6f7g8h9i0j_KLMNOPQRSTUV');

  assert.equal(extractGoogleDriveFolderId('invalid-folder'), null);
  assert.equal(extractGoogleDriveFolderId(''), null);
  assert.equal(extractGoogleDriveFolderId(undefined), null);
});

test('validateGoogleConfig validates correct and incorrect URLs', () => {
  const resValid = validateGoogleConfig(
    'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
    'https://drive.google.com/drive/folders/1a2b3c4d5e6f7g8h9i0j_KLMNOPQRSTUV'
  );
  assert.equal(resValid.valid, true);
  assert.equal(resValid.spreadsheetId, '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
  assert.equal(resValid.driveFolderId, '1a2b3c4d5e6f7g8h9i0j_KLMNOPQRSTUV');
  assert.equal(Object.keys(resValid.errors).length, 0);

  const resInvalid = validateGoogleConfig('', 'https://random-site.com');
  assert.equal(resInvalid.valid, false);
  assert.ok(resInvalid.errors.spreadsheetUrl);
  assert.ok(resInvalid.errors.driveFolderUrl);
});

test('formatInventoryRowForSheet formats row neatly with Drive photo URL', () => {
  const item: InventoryItem = {
    id: 'inv-101',
    itemName: 'Dell OptiPlex 7090 Micro PC',
    photoUrl: 'https://drive.google.com/file/d/1Fk_DrivePhotoId/view',
    category: 'PC ITEMS',
    dateRepaired: '2026-10-05',
    serialNumber: 'SN-DELL-7090-X1',
    remark: 'ex Front Office',
    createdAt: '2026-10-05T08:30:00Z',
    createdBy: 'ITMANAGER',
    updatedAt: '2026-10-08T14:35:00Z',
    updatedBy: 'ITASSIST'
  };

  const row = formatInventoryRowForSheet(item, 0);
  assert.equal(row[0], 1); // NO
  assert.equal(row[1], 'inv-101'); // ID
  assert.equal(row[2], 'https://drive.google.com/file/d/1Fk_DrivePhotoId/view'); // FOTO DRIVE
  assert.equal(row[3], 'Dell OptiPlex 7090 Micro PC'); // NAMA
  assert.equal(row[4], 'PC ITEMS'); // KATEGORI
  assert.equal(row[5], '2026-10-05'); // TANGGAL
  assert.equal(row[6], 'SN-DELL-7090-X1'); // SN
  assert.equal(row[7], 'ex Front Office'); // REMARK
  assert.equal(row[8], 'ITMANAGER'); // CREATED BY
  assert.equal(row[9], 'ITASSIST'); // UPDATED BY
});

test('buildSpreadsheetValues outputs header and items rows correctly', () => {
  const sampleItems: InventoryItem[] = [
    {
      id: 'inv-1',
      itemName: 'Switch Cisco',
      photoUrl: 'https://drive.google.com/file/d/123/view',
      category: 'NETWORK ITEMS',
      dateRepaired: '2026-10-01',
      serialNumber: null,
      remark: null,
      createdAt: '2026-10-01T00:00:00Z',
      createdBy: 'ITMANAGER',
      updatedAt: '2026-10-01T00:00:00Z',
      updatedBy: 'ITMANAGER'
    }
  ];

  const values = buildSpreadsheetValues(sampleItems);
  assert.equal(values.length, 2);
  assert.deepEqual(values[0], SPREADSHEET_HEADERS);
  assert.equal(values[1][0], 1);
  assert.equal(values[1][3], 'Switch Cisco');
});
