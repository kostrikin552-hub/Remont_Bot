import React from 'react';
import {
  Building2,
  Sparkles,
  SlidersHorizontal,
  FileCheck,
  Compass,
  LayoutGrid,
  Check,
} from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

export type WizardStepId = 1 | 2 | 3 | 4;

interface StepWizardNavProps {
  currentStep: WizardStepId;
  onSelectStep: (step: WizardStepId) => void;
  isWizardMode: boolean;
  onToggleMode: (isWizard: boolean) => void;
  maxReachedStep: WizardStepId;
}

export const StepWizardNav: React.FC<StepWizardNavProps> = ({
  currentStep,
  onSelectStep,
  isWizardMode,
  onToggleMode,
  maxReachedStep,
}) => {
  const STEPS: {
    id: WizardStepId;
    title: string;
    shortTitle: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    {
      id: 1,
      title: 'Объект и площадь',
      shortTitle: '1. Объект',
      icon: Building2,
    },
    {
      id: 2,
      title: 'Класс ремонта',
      shortTitle: '2. Тариф',
      icon: Sparkles,
    },
    {
      id: 3,
      title: 'Опции и инженерия',
      shortTitle: '3. Опции',
      icon: SlidersHorizontal,
    },
    {
      id: 4,
      title: 'Смета и фиксация',
      shortTitle: '4. Смета',
      icon: FileCheck,
    },
  ];

  const handleStepClick = (stepId: WizardStepId) => {
    // Разрешаем переход к любому шагу до максимального достигнутого или следующего
    if (stepId <= maxReachedStep + 1) {
      triggerHaptic('selection');
      onSelectStep(stepId);
    }
  };

  const progressPercent = Math.round((currentStep / 4) * 100);

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl p-2.5 sm:p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-2.5">
      {/* Верхняя строка: Переключатель режима (Мастер vs Сводка) */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <Compass className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-zinc-900 dark:text-zinc-100 truncate">
            {isWizardMode ? `Шаг ${currentStep} из 4: ${STEPS[currentStep - 1].title}` : 'Сводный калькулятор'}
          </span>
        </div>

        {/* Переключатель Пошаговый мастер / Сводка */}
        <div className="flex items-center p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 shrink-0">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onToggleMode(true);
            }}
            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all flex items-center gap-1 ${
              isWizardMode
                ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <Compass className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>Мастер</span>
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onToggleMode(false);
            }}
            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all flex items-center gap-1 ${
              !isWizardMode
                ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <LayoutGrid className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            <span>Сводка</span>
          </button>
        </div>
      </div>

      {/* Полоса прогресса (в режиме мастера) */}
      {isWizardMode && (
        <div className="space-y-1.5">
          <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              style={{ width: `${progressPercent}%` }}
              className="h-full bg-emerald-500 rounded-full transition-all duration-300"
            />
          </div>

          {/* 4 кнопки шагов */}
          <div className="grid grid-cols-4 gap-1">
            {STEPS.map((step) => {
              const isCurrent = currentStep === step.id;
              const isPast = step.id < currentStep;
              const isAccessible = step.id <= maxReachedStep + 1;
              const Icon = step.icon;

              return (
                <button
                  key={step.id}
                  type="button"
                  disabled={!isAccessible}
                  onClick={() => handleStepClick(step.id)}
                  className={`p-1.5 rounded-lg text-left transition-all flex flex-col items-center sm:items-start text-center sm:text-left ${
                    isCurrent
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-500/40 font-bold'
                      : isPast
                      ? 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      : 'opacity-40 text-zinc-400 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    {isPast ? (
                      <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <Icon className="w-3 h-3 shrink-0" />
                    )}
                    <span className="text-[10px] font-bold hidden sm:inline truncate">
                      {step.shortTitle}
                    </span>
                  </div>
                  <span className="text-[9px] sm:hidden font-bold leading-tight mt-0.5">
                    {step.shortTitle}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
