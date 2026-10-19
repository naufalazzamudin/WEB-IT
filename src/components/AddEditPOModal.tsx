import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Save, Loader2, Calendar, ShoppingCart } from 'lucide-react';
import type { PurchaseOrderItem, POStatus } from '../lib/types';
import { createPurchaseOrder, updatePurchaseOrder, uploadImageBase64 } from '../lib/api';
import { compressImage } from '../lib/image-utils';

interface AddEditPOModalProps {
  isOpen: boolean;
  itemToEdit?: PurchaseOrderItem | null;
  onClose: () => void;
  onSuccess: (item: PurchaseOrderItem, isEdit: boolean) => void;
  onToast: (text: string, type: 'success' | 'error' | 'info') => void;
}

export const AddEditPOModal: React.FC<AddEditPOModalProps> = ({
  isOpen,
  itemToEdit,
  onClose,
  onSuccess,
  onToast
}) => {
  const isEdit = !!itemToEdit;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getTodayDate = () => new Date().toISOString().split('T')[0];

  const [itemName, setItemName] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [dateOrder, setDateOrder] = useState(getTodayDate());
  const [dateArrival, setDateArrival] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [forUse, setForUse] = useState('');
  const [remarks, setRemarks] = useState('');
  const [status, setStatus] = useState<POStatus>('BELUM DATANG');

  const [isCompressing, setIsCompressing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (itemToEdit) {
      setItemName(itemToEdit.itemName);
      setPhotoUrl(itemToEdit.photoUrl);
      setDateOrder(itemToEdit.dateOrder ? itemToEdit.dateOrder.split('T')[0] : getTodayDate());
      setDateArrival(itemToEdit.dateArrival ? itemToEdit.dateArrival.split('T')[0] : '');
      setQuantity(itemToEdit.quantity || 1);
      setForUse(itemToEdit.forUse || '');
      setRemarks(itemToEdit.remarks || '');
      setStatus(itemToEdit.status || 'BELUM DATANG');
    } else {
      setItemName('');
      setPhotoUrl('');
      setDateOrder(getTodayDate());
      setDateArrival('');
      setQuantity(1);
      setForUse('');
      setRemarks('');
      setStatus('BELUM DATANG');
    }
    setError(null);
  }, [itemToEdit, isOpen]);

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
      setError('Item name is required.');
      return;
    }
    if (!dateOrder) {
      setError('Date order is required.');
      return;
    }
    if (quantity <= 0) {
      setError('Jumlah unit minimal 1.');
      return;
    }
    if (!forUse.trim()) {
      setError('Peruntukan (For Use) wajib diisi.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      let finalPhotoUrl = photoUrl;

      if (photoUrl && photoUrl.startsWith('data:image/')) {
        try {
          const uploadedUrl = await uploadImageBase64(photoUrl);
          finalPhotoUrl = uploadedUrl;
        } catch {
          finalPhotoUrl = photoUrl;
        }
      }

      if (isEdit && itemToEdit) {
        const res = await updatePurchaseOrder(itemToEdit.id, {
          itemName: itemName.trim(),
          photoUrl: finalPhotoUrl,
          dateOrder,
          dateArrival: dateArrival.trim() || null,
          quantity,
          forUse: forUse.trim(),
          remarks: remarks.trim() || null,
          status
        });
        onToast('Purchase Order updated successfully.', 'success');
        onSuccess(res.data, true);
      } else {
        const res = await createPurchaseOrder({
          itemName: itemName.trim(),
          photoUrl: finalPhotoUrl,
          dateOrder,
          dateArrival: dateArrival.trim() || null,
          quantity,
          forUse: forUse.trim(),
          remarks: remarks.trim() || null,
          status
        });
        onToast('Purchase Order added successfully.', 'success');
        onSuccess(res.data, false);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Unable to save Purchase Order. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="po-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto"
    >
      <div className="w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <ShoppingCart className="w-5 h-5" />
            </div>
            <div>
              <h2 id="po-modal-title" className="text-lg font-black text-slate-900 tracking-tight">
                {isEdit ? 'EDIT PURCHASE ORDER' : '+ ADD PURCHASE ORDER'}
              </h2>
              <p className="text-xs text-slate-500">
                {isEdit ? 'Update procurement details and shipment status' : 'Record new hardware or IT supplies order'}
              </p>
            </div>
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
              Item Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              placeholder="Contoh: Patch Cord Cat6 2M (50 pcs) / RAM DDR4 16GB"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium transition-all"
            />
          </div>

          {/* Status & Quantity in one row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Status Order <span className="text-rose-500">*</span>
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as POStatus)}
                className={`w-full px-4 py-2.5 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all ${
                  status === 'SUDAH DATANG'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-amber-50 text-amber-800 border-amber-300'
                }`}
              >
                <option value="BELUM DATANG">BELUM DATANG (Menunggu Datang)</option>
                <option value="SUDAH DATANG">SUDAH DATANG</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Jumlah Unit <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value, 10) || 1)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-semibold transition-all"
              />
            </div>
          </div>

          {/* Date Order & Date Arrival */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Date Order (Tanggal Pesan) <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={dateOrder}
                onChange={(e) => setDateOrder(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Date Arrival (Kedatangan)
              </label>
              <input
                type="date"
                value={dateArrival}
                onChange={(e) => setDateArrival(e.target.value)}
                placeholder="Tanggal diterima jika sudah tiba"
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium transition-all"
              />
            </div>
          </div>

          {/* For Use (Peruntukan) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              For Use (Peruntukan) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={forUse}
              onChange={(e) => setForUse(e.target.value)}
              placeholder="Contoh: Front Office PCs / Ballroom Wi-Fi / Housekeeping APs"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-medium transition-all"
            />
          </div>

          {/* Remarks (Catatan) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Remarks (Catatan / Keterangan)
            </label>
            <textarea
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Catatan nomor PO, vendor/distributor, resi pengiriman, atau info garansi..."
              className="w-full px-4 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs sm:text-sm font-medium transition-all"
            />
          </div>

          {/* Foto Barang Upload & Preview */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Foto Barang / Dokumen PO
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
                  className="w-20 h-20 object-cover rounded-xl border border-slate-200 bg-white"
                />
                <div className="flex-1">
                  <div className="text-xs font-bold text-slate-800">Foto barang terpilih</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Gambar otomatis dioptimalkan untuk excel & tampilan web.
                  </div>
                  <div className="mt-2 flex items-center gap-2">
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
                className="cursor-pointer border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-slate-50/50 hover:bg-indigo-50/30 rounded-2xl p-5 text-center transition-all group"
              >
                {isCompressing ? (
                  <div className="flex flex-col items-center gap-2 py-3 text-indigo-600">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    <span className="text-xs font-medium">Mengoptimalkan gambar...</span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-1.5 py-1">
                    <div className="p-2.5 bg-white rounded-xl shadow-2xs border border-slate-100 text-slate-500 group-hover:text-indigo-600 transition-colors">
                      <Upload className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-600">
                      Klik untuk upload foto barang PO
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Opsional - format JPG, PNG, atau WEBP
                    </span>
                  </div>
                )}
              </div>
            )}
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
                  <span>SAVE PURCHASE ORDER</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
