import React, { useState, useEffect } from 'react';
import {
  Settings,
  Shield,
  User as UserIcon,
  HardDrive,
  LogOut,
  Sun,
  Moon,
  Database,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  PlusCircle,
  Link as LinkIcon,
  FileSpreadsheet,
  Layers,
  Sparkles
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  googleSignIn,
  googleSignOut,
  initGoogleAuth,
  getGoogleAccessToken,
  getCachedGoogleUser
} from '../lib/google-auth';
import {
  extractSpreadsheetId,
  getSpreadsheetDetails,
  createDatabaseWebItSpreadsheet,
  pushAllToSheets,
  fetchInventoryFromSheets,
  fetchPOFromSheets,
  resolveSheetNames,
  REQUIRED_SPREADSHEET_NAME,
  SpreadsheetDetails
} from '../lib/sheets-service';
import {
  fetchSheetConfig,
  saveSheetConfig,
  fetchAllData,
  syncDataFromSheets,
  SheetConfig
} from '../lib/api';

interface SettingsViewProps {
  onLogout: () => void;
  onOpenUserManagement: () => void;
  onDataSynced?: () => void;
  addToast: (text: string, type?: 'success' | 'error' | 'info') => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  onLogout,
  onOpenUserManagement,
  onDataSynced,
  addToast
}) => {
  const { user } = useAuth();
  const [theme, setTheme] = useState<'light' | 'system'>('light');

  // Google Account state
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isSigningInGoogle, setIsSigningInGoogle] = useState(false);

  // Sheet configuration state
  const [sheetConfig, setSheetConfig] = useState<SheetConfig>({
    isEnabled: false,
    spreadsheetUrl: '',
    spreadsheetId: '',
    spreadsheetTitle: '',
    lastSyncTime: null
  });
  const [inputUrl, setInputUrl] = useState('');
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isCheckingSheet, setIsCheckingSheet] = useState(false);
  const [isCreatingSheet, setIsCreatingSheet] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [sheetDetails, setSheetDetails] = useState<SpreadsheetDetails | null>(null);

  // Destructive Action Confirmation Modal state
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    actionLabel: string;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    message: '',
    actionLabel: 'Konfirmasi',
    onConfirm: async () => {}
  });

  // Load existing Google Auth & Sheet Config
  useEffect(() => {
    // 1. Google Auth listener
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
      },
      () => {
        const u = getCachedGoogleUser();
        setGoogleUser(u);
      }
    );

    // Initial check
    const existingUser = getCachedGoogleUser();
    if (existingUser) {
      setGoogleUser(existingUser);
    }
    getGoogleAccessToken().then(tok => {
      if (tok) setGoogleToken(tok);
    });

    // 2. Fetch server sheet config
    fetchSheetConfig()
      .then(cfg => {
        setSheetConfig(cfg);
        if (cfg.spreadsheetUrl) {
          setInputUrl(cfg.spreadsheetUrl);
        }
      })
      .catch(err => {
        console.error('Error loading sheet config:', err);
      })
      .finally(() => {
        setIsLoadingConfig(false);
      });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, []);

  // When google token is available and spreadsheetId exists, inspect spreadsheet details
  useEffect(() => {
    if (googleToken && sheetConfig.spreadsheetId) {
      getSpreadsheetDetails(sheetConfig.spreadsheetId, googleToken)
        .then(details => {
          setSheetDetails(details);
        })
        .catch(err => {
          console.warn('Could not inspect current spreadsheet:', err);
        });
    }
  }, [googleToken, sheetConfig.spreadsheetId]);

  // Google Sign In handler
  const handleGoogleLogin = async () => {
    setIsSigningInGoogle(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setGoogleToken(res.accessToken);
        addToast(`Berhasil menghubungkan akun Google: ${res.user.email}`, 'success');

        // If there is already an input URL or config ID, verify it immediately
        const idToCheck = sheetConfig.spreadsheetId || extractSpreadsheetId(inputUrl);
        if (idToCheck) {
          try {
            const details = await getSpreadsheetDetails(idToCheck, res.accessToken);
            setSheetDetails(details);
          } catch {
            // Ignore initial inspection error
          }
        }
      }
    } catch (err: any) {
      console.error('Google Sign In error:', err);
      addToast(err.message || 'Gagal menghubungkan Akun Google', 'error');
    } finally {
      setIsSigningInGoogle(false);
    }
  };

  const handleGoogleSignOut = async () => {
    try {
      await googleSignOut();
      setGoogleUser(null);
      setGoogleToken(null);
      setSheetDetails(null);
      addToast('Akun Google diputuskan', 'info');
    } catch (err: any) {
      addToast(err.message || 'Gagal memutus akun Google', 'error');
    }
  };

  // Verify and Save Google Spreadsheet
  const handleVerifyAndSaveSheet = async () => {
    if (!inputUrl.trim()) {
      addToast('Silakan masukkan link Google Spreadsheet terlebih dahulu', 'error');
      return;
    }

    const spreadsheetId = extractSpreadsheetId(inputUrl.trim());
    if (!spreadsheetId) {
      addToast('Format link Spreadsheet tidak valid. Contoh: https://docs.google.com/spreadsheets/d/.../edit', 'error');
      return;
    }

    if (!googleToken) {
      addToast('Silakan hubungkan akun Google terlebih dahulu untuk memverifikasi spreadsheet', 'error');
      return;
    }

    setIsCheckingSheet(true);
    try {
      const details = await getSpreadsheetDetails(spreadsheetId, googleToken);
      setSheetDetails(details);

      if (!details.isNamedCorrectly) {
        addToast(
          `Peringatan: Nama spreadsheet saat ini "${details.title}". Disarankan mengubah nama file menjadi "${REQUIRED_SPREADSHEET_NAME}".`,
          'info'
        );
      }

      // Save to server
      const updated = await saveSheetConfig({
        spreadsheetUrl: inputUrl.trim(),
        spreadsheetId,
        spreadsheetTitle: details.title,
        isEnabled: true
      });
      setSheetConfig(updated);
      addToast(`Spreadsheet "${details.title}" berhasil dihubungkan sebagai database online!`, 'success');
    } catch (err: any) {
      console.error('Verify spreadsheet error:', err);
      addToast(
        `Gagal memeriksa spreadsheet: ${err.message}. Pastikan spreadsheet dibagikan dengan akses "Izinkan edit semua yang memiliki link".`,
        'error'
      );
    } finally {
      setIsCheckingSheet(false);
    }
  };

  // Create "DATABASE WEB IT" automatically
  const handleAutoCreateSpreadsheet = async () => {
    if (!googleToken) {
      addToast('Silakan hubungkan akun Google terlebih dahulu', 'error');
      return;
    }

    setIsCreatingSheet(true);
    try {
      addToast('Sedang membuat Google Spreadsheet "DATABASE WEB IT" di Google Drive Anda...', 'info');
      const details = await createDatabaseWebItSpreadsheet(googleToken);
      setSheetDetails(details);
      setInputUrl(details.url);

      const updated = await saveSheetConfig({
        spreadsheetUrl: details.url,
        spreadsheetId: details.spreadsheetId,
        spreadsheetTitle: details.title,
        isEnabled: true
      });
      setSheetConfig(updated);

      addToast(
        'Spreadsheet "DATABASE WEB IT" berhasil dibuat otomatis dengan Sheet1 (Inventory) dan Sheet2 (Purchase Order)!',
        'success'
      );
    } catch (err: any) {
      console.error('Error creating spreadsheet:', err);
      addToast(`Gagal membuat spreadsheet otomatis: ${err.message}`, 'error');
    } finally {
      setIsCreatingSheet(false);
    }
  };

  // Pull data from Google Sheets into Web App
  const handlePullFromSheets = async () => {
    const spreadsheetId = sheetConfig.spreadsheetId || extractSpreadsheetId(inputUrl);
    if (!spreadsheetId) {
      addToast('Spreadsheet belum dihubungkan', 'error');
      return;
    }
    if (!googleToken) {
      addToast('Silakan login ke Akun Google Anda terlebih dahulu', 'error');
      return;
    }

    setIsSyncing(true);
    try {
      addToast('Mengambil data terbaru dari Google Spreadsheet...', 'info');
      const details = await getSpreadsheetDetails(spreadsheetId, googleToken);
      setSheetDetails(details);
      const { invSheet, poSheet } = resolveSheetNames(details);

      const [invItems, poItems] = await Promise.all([
        fetchInventoryFromSheets(spreadsheetId, googleToken, invSheet),
        fetchPOFromSheets(spreadsheetId, googleToken, poSheet)
      ]);

      const syncResult = await syncDataFromSheets(invItems, poItems);
      setSheetConfig(prev => ({ ...prev, lastSyncTime: syncResult.lastSyncTime }));

      addToast(
        `Sinkronisasi berhasil! Memuat ${syncResult.inventoryCount} Inventory & ${syncResult.poCount} Purchase Order dari Google Spreadsheet.`,
        'success'
      );

      if (onDataSynced) {
        onDataSynced();
      }
    } catch (err: any) {
      console.error('Pull from sheets error:', err);
      addToast(`Gagal menarik data dari Google Sheets: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  // Push local web app data to Google Sheets with mandatory confirmation dialog
  const handlePushToSheets = () => {
    const spreadsheetId = sheetConfig.spreadsheetId || extractSpreadsheetId(inputUrl);
    if (!spreadsheetId) {
      addToast('Spreadsheet belum dihubungkan', 'error');
      return;
    }
    if (!googleToken) {
      addToast('Silakan login ke Akun Google Anda terlebih dahulu', 'error');
      return;
    }

    setConfirmDialog({
      isOpen: true,
      title: 'Perbarui Data di Google Spreadsheet?',
      message:
        'Tindakan ini akan menyinkronkan dan memperbarui seluruh baris data Inventory dan Purchase Order pada file Google Spreadsheet "DATABASE WEB IT". Apakah Anda yakin ingin melanjutkan?',
      actionLabel: 'Ya, Perbarui Spreadsheet',
      onConfirm: async () => {
        setIsSyncing(true);
        try {
          addToast('Menyiapkan dan mengirim data ke Google Sheets...', 'info');
          const all = await fetchAllData();
          const details = await getSpreadsheetDetails(spreadsheetId, googleToken);
          setSheetDetails(details);
          const { invSheet, poSheet, invSheetId, poSheetId } = resolveSheetNames(details);

          await pushAllToSheets(
            spreadsheetId,
            googleToken,
            all.inventory,
            all.purchaseOrders,
            invSheet,
            poSheet,
            invSheetId,
            poSheetId
          );

          const now = new Date().toISOString();
          await saveSheetConfig({ lastSyncTime: now });
          setSheetConfig(prev => ({ ...prev, lastSyncTime: now }));

          addToast(
            `Data berhasil diperbarui ke Google Sheets (${all.inventory.length} Inventory & ${all.purchaseOrders.length} PO)!`,
            'success'
          );
        } catch (err: any) {
          console.error('Push to sheets error:', err);
          addToast(`Gagal mengirim data ke Google Sheets: ${err.message}`, 'error');
        } finally {
          setIsSyncing(false);
        }
      }
    });
  };

  // Toggle Sheets Mode
  const handleToggleSheetsMode = async () => {
    const newStatus = !sheetConfig.isEnabled;
    try {
      const updated = await saveSheetConfig({
        ...sheetConfig,
        isEnabled: newStatus
      });
      setSheetConfig(updated);
      addToast(
        newStatus
          ? 'Mode Database Google Sheets telah DIAKTIFKAN'
          : 'Mode Database Google Sheets DINONAKTIFKAN (menggunakan database lokal)',
        'info'
      );
    } catch (err: any) {
      addToast(err.message || 'Gagal mengubah mode database', 'error');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-indigo-600 font-bold text-xs uppercase tracking-wider mb-1">
          <Settings className="w-4 h-4" />
          <span>Pengaturan Sistem & Database</span>
        </div>
        <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
          SYSTEM & DATABASE SETTINGS
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Kelola koneksi online Google Spreadsheet, data staff, dan konfigurasi aplikasi
        </p>
      </div>

      {/* Online Database Google Spreadsheet Section */}
      <div className="bg-gradient-to-br from-emerald-50/60 via-white to-teal-50/40 rounded-3xl border-2 border-emerald-200/80 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-emerald-100">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md shadow-emerald-600/20">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  DATABASE ONLINE GOOGLE SPREADSHEET
                </h2>
                <span
                  className={`px-2.5 py-0.5 text-[11px] font-bold rounded-full ${
                    sheetConfig.isEnabled && sheetConfig.spreadsheetId
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  {sheetConfig.isEnabled && sheetConfig.spreadsheetId ? '● REALTIME AKTIF' : 'NON-AKTIF'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-0.5">
                Hubungkan ke spreadsheet <strong>DATABASE WEB IT</strong> untuk sinkronisasi Inventory & Purchase Order secara realtime
              </p>
            </div>
          </div>

          {sheetConfig.spreadsheetId && (
            <button
              type="button"
              onClick={handleToggleSheetsMode}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition-all shadow-2xs ${
                sheetConfig.isEnabled
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              }`}
            >
              {sheetConfig.isEnabled ? 'Nonaktifkan Mode Sheets' : 'Aktifkan Mode Sheets'}
            </button>
          )}
        </div>

        {/* 1. Hubungkan Akun Google */}
        <div className="bg-white/80 rounded-2xl p-5 border border-slate-200/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Langkah 1</div>
              <div className="text-sm font-bold text-slate-900">Hubungkan Akun Google</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Masuk dengan akun Google yang memiliki akses edit pada spreadsheet target.
              </div>
            </div>

            {googleUser ? (
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                  {googleUser.photoURL ? (
                    <img
                      src={googleUser.photoURL}
                      alt={googleUser.displayName || 'Google User'}
                      className="w-7 h-7 rounded-full border border-emerald-300"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-emerald-600 text-white flex items-center justify-center text-xs font-bold">
                      {googleUser.email ? googleUser.email.charAt(0).toUpperCase() : 'G'}
                    </div>
                  )}
                  <div className="text-left">
                    <div className="text-xs font-bold text-emerald-900 leading-tight">
                      {googleUser.displayName || 'Google Account'}
                    </div>
                    <div className="text-[11px] text-emerald-700 font-mono truncate max-w-[180px]">
                      {googleUser.email}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGoogleSignOut}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors"
                >
                  Ganti / Putuskan
                </button>
              </div>
            ) : (
              /* Official Google Sign-In button per guidelines */
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={isSigningInGoogle}
                className="inline-flex items-center gap-3 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-300 hover:border-slate-400 text-slate-700 font-semibold text-xs rounded-xl shadow-2xs transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <svg className="w-4 h-4" viewBox="0 0 48 48">
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                <span>{isSigningInGoogle ? 'Menghubungkan...' : 'Sign in with Google'}</span>
              </button>
            )}
          </div>
        </div>

        {/* 2. Link Spreadsheet & Verifikasi */}
        <div className="bg-white/80 rounded-2xl p-5 border border-slate-200/80 space-y-4">
          <div>
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Langkah 2</div>
            <div className="text-sm font-bold text-slate-900">Kolom Link Google Spreadsheet</div>
            <div className="text-xs text-slate-500 mt-0.5">
              Masukkan link Google Sheets yang akan digunakan sebagai database aplikasi.
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <LinkIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={inputUrl}
                  onChange={e => setInputUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5.../edit"
                  className="w-full pl-10 pr-4 py-2.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-mono"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleVerifyAndSaveSheet}
                  disabled={isCheckingSheet || !inputUrl.trim()}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 shrink-0"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isCheckingSheet ? 'Memeriksa...' : 'Simpan & Hubungkan'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleAutoCreateSpreadsheet}
                  disabled={isCreatingSheet || !googleToken}
                  className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 shrink-0"
                  title="Buat spreadsheet baru dengan nama DATABASE WEB IT di Google Drive Anda secara otomatis"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span>{isCreatingSheet ? 'Membuat...' : 'Buat Otomatis'}</span>
                </button>
              </div>
            </div>

            {/* Syarat & Aturan Spreadsheet */}
            <div className="p-3.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs space-y-1.5 text-amber-900">
              <div className="font-bold flex items-center gap-1.5 text-amber-950">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Ketentuan Google Spreadsheet:</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-slate-700 pl-1 leading-relaxed">
                <li>
                  Nama spreadsheet <strong>harus persis:</strong>{' '}
                  <span className="font-mono font-bold text-slate-900 bg-amber-100 px-1 py-0.5 rounded">
                    DATABASE WEB IT
                  </span>
                </li>
                <li>
                  Akses link spreadsheet: pilih{' '}
                  <span className="font-bold text-emerald-800">
                    *Izinkan edit semua yang memiliki link (Anyone with the link can edit)
                  </span>
                </li>
                <li>
                  Struktur data terbagi menjadi 2 sheet:{' '}
                  <strong>Sheet1 (Inventory)</strong> dan{' '}
                  <strong>Sheet2 (Purchase Order)</strong>
                </li>
                <li>
                  Data mencakup semua field: Nama barang, Foto (gambar PNG/JPG langsung di sel spreadsheet), kategori, serial number, remark/catatan, hingga{' '}
                  <span className="font-bold text-indigo-700">ditambahkan / diedit oleh siapa</span> dan waktu update.
                </li>
              </ul>
            </div>

            {/* Spreadsheet Connected Card */}
            {sheetDetails && (
              <div className="p-4 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <FileSpreadsheet className="w-5 h-5 text-emerald-700 shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                        <span>{sheetDetails.title}</span>
                        {sheetDetails.isNamedCorrectly ? (
                          <span className="px-2 py-0.2 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-md border border-emerald-300">
                            Nama Sesuai
                          </span>
                        ) : (
                          <span className="px-2 py-0.2 bg-amber-100 text-amber-800 text-[10px] font-bold rounded-md border border-amber-300">
                            Nama Berbeda
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono truncate max-w-sm">
                        ID: {sheetDetails.spreadsheetId}
                      </div>
                    </div>
                  </div>

                  <a
                    href={sheetDetails.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:text-emerald-800 bg-white hover:bg-emerald-100/50 border border-emerald-300 rounded-lg transition-colors w-fit"
                  >
                    <span>Buka di Google Sheets</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t border-emerald-200/60">
                  <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-emerald-100">
                    <Layers className="w-4 h-4 text-indigo-600 shrink-0" />
                    <div>
                      <div className="font-bold text-slate-800">Sheet 1: Inventory</div>
                      <div className="text-[11px] text-slate-500">
                        Item PC, Network, CCTV, SN, Remark, User
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-emerald-100">
                    <Layers className="w-4 h-4 text-sky-600 shrink-0" />
                    <div>
                      <div className="font-bold text-slate-800">Sheet 2: Purchase Order</div>
                      <div className="text-[11px] text-slate-500">
                        PO unit, status datang, remarks, User
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. Aksi Sinkronisasi Realtime */}
        <div className="bg-white/80 rounded-2xl p-5 border border-slate-200/80 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Langkah 3</div>
              <div className="text-sm font-bold text-slate-900">Sinkronisasi & Pembaruan Database</div>
              <div className="text-xs text-slate-500 mt-0.5">
                {sheetConfig.lastSyncTime
                  ? `Terakhir disinkronkan: ${new Date(sheetConfig.lastSyncTime).toLocaleString('id-ID')}`
                  : 'Belum pernah disinkronkan'}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handlePullFromSheets}
                disabled={isSyncing || !sheetConfig.spreadsheetId}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>Tarik Data dari Spreadsheet</span>
              </button>

              <button
                type="button"
                onClick={handlePushToSheets}
                disabled={isSyncing || !sheetConfig.spreadsheetId}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-2xs transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Kirim Semua Data ke Spreadsheet</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Other App Preferences */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-2xs space-y-6">
        <h2 className="text-base font-bold text-slate-900 tracking-tight pb-3 border-b border-slate-100">
          Staff & Preferences
        </h2>

        {/* Current User */}
        <div className="pb-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-700 font-bold">
              <UserIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">{user?.username}</div>
              <div className="text-xs text-slate-500">{user?.role}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenUserManagement}
            className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl transition-colors"
          >
            Manage Credentials
          </button>
        </div>

        {/* Theme preference */}
        <div className="pb-6 border-b border-slate-100 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-slate-900">Theme Preference</div>
            <div className="text-xs text-slate-500 mt-0.5">Hotel IT Professional Clean Light theme</div>
          </div>
          <div className="inline-flex rounded-xl p-1 bg-slate-100 border border-slate-200">
            <button
              type="button"
              onClick={() => setTheme('light')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                theme === 'light' ? 'bg-white shadow-2xs text-slate-900' : 'text-slate-600'
              }`}
            >
              <Sun className="w-3.5 h-3.5 text-amber-500" />
              <span>Light</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme('system')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                theme === 'system' ? 'bg-white shadow-2xs text-slate-900' : 'text-slate-600'
              }`}
            >
              <Moon className="w-3.5 h-3.5 text-indigo-500" />
              <span>System</span>
            </button>
          </div>
        </div>

        {/* Storage & Persistence Status */}
        <div className="pb-6 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900">Local Cache & Persistent Server DB</div>
              <div className="text-xs text-emerald-600 font-semibold">Active & Synced to Server Database</div>
            </div>
          </div>
          <span className="text-xs text-slate-400 font-mono">data/db.json</span>
        </div>

        {/* Logout */}
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out Current User</span>
          </button>
        </div>
      </div>

      {/* Mandatory User Confirmation Modal for Destructive/Mutating Google Sheets Operations */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">{confirmDialog.title}</h3>
                <p className="text-xs text-slate-500">Konfirmasi Operasi Google Sheets</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {confirmDialog.message}
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmDialog(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={async () => {
                  setConfirmDialog(prev => ({ ...prev, isOpen: false }));
                  await confirmDialog.onConfirm();
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-2xs transition-colors"
              >
                {confirmDialog.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
