import React from 'react';
import { Plus } from 'lucide-react';
import type { InventoryStats, POStats, POStatus, Category } from '../lib/types';
import { DashboardStats } from './DashboardStats';
import { CategoryCards } from './CategoryCards';
import { POStatusCards } from './POStatusCards';

interface DashboardViewProps {
  stats: InventoryStats;
  poStats: POStats;
  recentlyEdited?: any[];
  activities?: any[];
  onSelectCategory: (category: Category) => void;
  onSelectPOStatus: (status: POStatus) => void;
  onOpenPOView: () => void;
  onSelectItem?: (item: any) => void;
  onViewImage?: (url: string, title: string) => void;
  onOpenAddInventoryModal: () => void;
  onOpenAddPOModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  stats,
  poStats,
  onSelectCategory,
  onSelectPOStatus,
  onOpenPOView,
  onOpenAddInventoryModal,
  onOpenAddPOModal
}) => {
  return (
    <div className="space-y-8">
      {/* Top Banner / Welcome Action */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(#6366f1_1px,transparent_1px)] [background-size:16px_16px] opacity-20 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="max-w-xl">
            <span className="inline-block px-3 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 mb-3">
              Department Operations & Procurement
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              HOTEL IT INVENTORY & PO
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1.5 leading-relaxed">
              Track refurbished workstations, switches, access points, dome cameras, and live procurement purchase orders with verified audit trails and Excel export.
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2.5 flex-wrap">
            <button
              type="button"
              onClick={onOpenAddInventoryModal}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-indigo-600/30 transition-all hover:scale-105 active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>+ ADD INVENTORY</span>
            </button>

            <button
              type="button"
              onClick={onOpenAddPOModal}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm tracking-wide shadow-lg shadow-emerald-600/30 transition-all hover:scale-105 active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>+ ADD PO</span>
            </button>
          </div>
        </div>
      </div>

      {/* Key Inventory Statistics Strip */}
      <DashboardStats stats={stats} />

      {/* INTERACTIVE PURCHASE ORDER STATUS CARDS */}
      <POStatusCards
        stats={poStats}
        onSelectStatus={onSelectPOStatus}
        onOpenPOView={onOpenPOView}
      />

      {/* CATEGORY DASHBOARD CARDS */}
      <CategoryCards
        stats={stats}
        onSelectCategory={onSelectCategory}
      />
    </div>
  );
};
