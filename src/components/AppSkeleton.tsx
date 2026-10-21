import React from 'react';

export const AppSkeleton: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 p-4 max-w-md mx-auto space-y-4 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-slate-300 dark:bg-slate-800" />
          <div className="space-y-1.5">
            <div className="w-28 h-5 bg-slate-300 dark:bg-slate-800 rounded-md" />
            <div className="w-36 h-3 bg-slate-200 dark:bg-slate-800/60 rounded-md" />
          </div>
        </div>
        <div className="w-9 h-9 rounded-xl bg-slate-200 dark:bg-slate-800" />
      </div>

      <div className="flex gap-2">
        <div className="w-36 h-6 rounded-full bg-slate-200 dark:bg-slate-800" />
        <div className="w-24 h-6 rounded-full bg-slate-200 dark:bg-slate-800" />
      </div>

      {/* Property Selector Skeleton */}
      <div className="h-28 rounded-2xl bg-slate-200 dark:bg-slate-800/80 p-3.5 space-y-2">
        <div className="w-24 h-3 bg-slate-300 dark:bg-slate-700 rounded" />
        <div className="h-12 bg-slate-300 dark:bg-slate-700/60 rounded-xl" />
      </div>

      {/* Area Slider Skeleton */}
      <div className="h-44 rounded-2xl bg-slate-200 dark:bg-slate-800/80 p-4 space-y-4">
        <div className="w-32 h-3 bg-slate-300 dark:bg-slate-700 rounded" />
        <div className="w-24 h-10 mx-auto bg-slate-300 dark:bg-slate-700 rounded-lg" />
        <div className="h-2 bg-slate-300 dark:bg-slate-700 rounded-full" />
      </div>

      {/* Tariff Cards Skeleton */}
      <div className="space-y-2.5">
        <div className="w-28 h-3 bg-slate-300 dark:bg-slate-800 rounded" />
        <div className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800/80" />
        <div className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800/80" />
        <div className="h-24 rounded-2xl bg-slate-200 dark:bg-slate-800/80" />
      </div>

      {/* Bottom Sticky Skeleton */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/80 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800">
        <div className="max-w-md mx-auto space-y-2">
          <div className="h-5 w-48 bg-slate-300 dark:bg-slate-700 rounded" />
          <div className="h-12 bg-blue-400/40 rounded-2xl" />
        </div>
      </div>
    </div>
  );
};
