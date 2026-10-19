import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Camera, Loader2, Save, Image as ImageIcon } from 'lucide-react';
import type { InventoryItem, Category } from '../lib/types';
import { CATEGORIES } from '../lib/types';
import { createInventory, updateInventory, uploadImageBase64 } from '../lib/api';
import { compressImage } from '../lib/image-utils';

interface AddEditInventoryModalProps {
  isOpen: boolean;
  itemToEdit?: InventoryItem | null;
  initialCategory?: Category;
  onClose: () => void;
  onSuccess: (item: InventoryItem, isEdit: boolean) => void;
  onToast: (text: string, type: 'success' | 'error' | 'info') => void;
}

export const AddEditInventoryModal: React.FC<AddEditInventoryModalProps> = ({
  isOpen,
  itemToEdit,
  initialCategory,
  onClose,
  onSuccess,
  onToast
}) => {
  const isEdit = !!itemToEdit;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getTodayDate = () => new Date().toISOString().split('T')[0];

  const [itemName, setItemName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [category, setCategory] = useState<Category>('PC ITEMS');
  const [dateRepaired, setDateRepaired] = useState(getTodayDate());
  const [serialNumber, setSerialNumber] = useState('');
  const [remark, setRemark] = useState('');

  const [isCompressing, setIsCompressing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (itemToEdit) {
      setItemName(itemToEdit.itemName);
      setPhotoUrl(itemToEdit.photoUrl);
      setCategory(itemToEdit.category);
      setDateRepaired(itemToEdit.dateRepaired.split('T')[0]);
      setSerialNumber(itemToEdit.serialNumber || '');
      setRemark(itemToEdit.remark || '');
    } else {
      setItemName('');
      setPhotoUrl('');
      setCategory(initialCategory || 'PC ITEMS');
      setDateRepaired(getTodayDate());
      setSerialNumber('');
      setRemark('');
    }
    setError(null);
  }, [itemToEdit, initialCategory, isOpen]);

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.match(/^image\/(jpeg|jpg|png|webp)$/i)) {
      setError('Please select a valid image file (JPG, PNG, or WEBP).');
      return;
    }

    setIsCompressing(true);
    setError(null);

    try {
      const compressedDataUrl = await compressImage(file, 1200, 0.85);
      setPhotoUrl(compressedDataUrl);
    } catch (err: any) {
      setError('Failed to process image. Please try another image.');
    } finally {
      setIsCompressing(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemName.trim()) {
      setError('Nama barang wajib diisi (Item name is required).');
      return;
    }
    if (!photoUrl && !isEdit) {
      setError('Foto barang wajib diunggah (Photo is required for new items).');
      return;
    }
    if (!dateRepaired) {
      setError('Tanggal dibereskan wajib diisi (Date repaired is required).');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      let finalPhotoUrl = photoUrl;

      // If photo is a new compressed data URL, save it through the upload endpoint
      if (photoUrl && photoUrl.startsWith('data:image/')) {
        try {
          const uploadedUrl = await uploadImageBase64(photoUrl);
          finalPhotoUrl = uploadedUrl;
        } catch {
          // Fall back to storing data URL directly if upload route has issue
          finalPhotoUrl = photoUrl;
        }
      }

      if (isEdit && itemToEdit) {
        const res = await updateInventory(itemToEdit.id, {
          itemName: itemName.trim(),
          photoUrl: finalPhotoUrl,
          category,
          dateRepaired,
          serialNumber: serialNumber.trim() || null,
          remark: remark.trim() || null
        });
        onToast('Inventory updated successfully.', 'success');
        onSuccess(res.data, true);
      } else {
        const res = await createInventory({
          itemName: itemName.trim(),
          photoUrl: finalPhotoUrl,
          category,
          dateRepaired,
          serialNumber: serialNumber.trim() || null,
          remark: remark.trim() || null
        });
        onToast('Inventory added successfully.', 'success');
        onSuccess(res.data, false);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Unable to save inventory data. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inventory-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div>
            <h2 id="inventory-modal-title" className="text-lg font-black text-slate-900 tracking-tight">
              {isEdit ? 'EDIT INVENTORY DATA' : '+ ADD NEW INVENTORY'}
            </h2>
            <p className="text-xs text-slate-500">
              {isEdit ? 'Update existing hotel IT equipment record' : 'Register refurbished, retired, or spare IT equipment'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 text-xs sm:text-sm font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl">
              {error}
            </div>
          )}

          {/* Item Name */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Nama Barang <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Contoh: Dell OptiPlex 7090"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium transition-all"
            />
          </div>

          {/* Category Dropdown */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Kategori <span className="text-rose-500">*</span>
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium bg-white transition-all"
            >
              {CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Tanggal Dibereskan */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Tanggal Dibereskan <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={dateRepaired}
              onChange={(e) => setDateRepaired(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium transition-all"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Data bulan laporan akan otomatis disinkronkan berdasarkan tanggal ini.
            </p>
          </div>

          {/* Serial Number (Optional) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Serial Number (Optional)
            </label>
            <input
              type="text"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              placeholder="e.g. SN-DELL-883920 (Kosongkan bila tidak ada)"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-mono transition-all"
            />
          </div>

          {/* Foto Barang Upload & Preview */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Foto Barang {!isEdit && <span className="text-rose-500">*</span>}
            </label>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />

            {photoUrl ? (
              <div className="relative rounded-2xl border border-slate-200 overflow-hidden bg-slate-50 p-2 flex items-center gap-4">
                <img
                  src={photoUrl}
                  alt="Preview"
                  className="w-24 h-24 object-cover rounded-xl border border-slate-200 bg-white"
                />
                <div className="flex-1">
                  <div className="text-xs font-bold text-slate-800">Foto terpilih</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Gambar otomatis dioptimalkan & dikompresi untuk performa cepat.
                  </div>
                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors"
                    >
                      Ganti Foto
                    </button>
                    <button
                      type="button"
                      onClick={() => setPhotoUrl('')}
                      className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/30 rounded-2xl p-6 text-center transition-all group"
              >
                {isCompressing ? (
                  <div className="flex flex-col items-center gap-2 py-4 text-indigo-600">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="text-xs font-medium">Mengoptimalkan gambar...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <div className="p-3 bg-white rounded-2xl shadow-xs border border-slate-100 text-slate-500 group-hover:text-indigo-600 transition-colors">
                      <Upload className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-xs sm:text-sm font-bold text-slate-700 group-hover:text-indigo-600">
                        Klik untuk upload foto barang
                      </span>
                      <span className="text-xs text-slate-400 block mt-0.5">
                        JPG, PNG, atau WEBP (Mendukung kamera smartphone)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Kolom Remark (ex Front Office, ex Room) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Remark
            </label>
            <input
              type="text"
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="ex Front Office, ex Room"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium transition-all"
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Catatan peruntukan atau asal unit (misal: ex Front Office, ex Room, ex Resto, dsb).
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || isCompressing}
              className="flex items-center justify-center gap-2 px-6 py-2.5 text-xs sm:text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-md transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>SAVE DATA</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
