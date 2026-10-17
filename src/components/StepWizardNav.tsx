import React from 'react';
import {
  Building2,
  Sparkles,
  SlidersHorizontal,
  FileCheck,
} from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

export type StageId = 'property' | 'tariff' | 'options' | 'estimate';

interface StageNavProps {
  activeStage?: StageId;
  grandTotal?: number;
}

export const StepWizardNav: React.FC<StageNavProps> = ({
  activeStage: propActiveStage,
  grandTotal,
}) => {
  const [activeStage, setActiveStage] = React.useState<StageId>(propActiveStage || 'property');

  React.useEffect(() => {
    if (propActiveStage) {
      setActiveStage(propActiveStage);
    }
  }, [propActiveStage]);

  React.useEffect(() => {
    const sectionIds: { id: StageId; elementId: string }[] = [
      { id: 'property', elementId: 'sec-property' },
      { id: 'tariff', elementId: 'sec-tariff' },
      { id: 'options', elementId: 'sec-options' },
      { id: 'estimate', elementId: 'sec-estimate' },
    ];

    const handleScroll = () => {
      const scrollPos = window.scrollY + 140;
      for (let i = sectionIds.length - 1; i >= 0; i--) {
        const el = document.getElementById(sectionIds[i].elementId);
        if (el && el.offsetTop <= scrollPos) {
          setActiveStage(sectionIds[i].id);
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const STAGES: {
    id: StageId;
    anchorId: string;
    title: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    {
      id: 'property',
      anchorId: 'sec-property',
      title: '1. Объект',
      icon: Building2,
    },
    {
      id: 'tariff',
      anchorId: 'sec-tariff',
      title: '2. Тариф',
      icon: Sparkles,
    },
    {
      id: 'options',
      anchorId: 'sec-options',
      title: '3. Опции',
      icon: SlidersHorizontal,
    },
    {
      id: 'estimate',
      anchorId: 'sec-estimate',
      title: '4. Смета',
      icon: FileCheck,
    },
  ];

  const handleScrollTo = (anchorId: string) => {
    triggerHaptic('light');
    const el = document.getElementById(anchorId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl p-2 sm:p-2.5 border border-zinc-200 dark:border-zinc-800 shadow-xs space-y-1.5 sticky top-[57px] z-20 backdrop-blur-md bg-white/95 dark:bg-zinc-900/95">
      {/* 4 кнопки быстрой навигации по этапам сметы */}
      <div className="grid grid-cols-4 gap-1">
        {STAGES.map((st) => {
          const isActive = activeStage === st.id;
          const Icon = st.icon;

          return (
            <button
              key={st.id}
              type="button"
              onClick={() => handleScrollTo(st.anchorId)}
              className={`py-1.5 px-1 rounded-lg text-center transition-all flex items-center justify-center gap-1 cursor-pointer active:scale-95 ${
                isActive
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 font-bold shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700 font-semibold'
              }`}
            >
              <Icon className="w-3 h-3 shrink-0" />
              <span className="text-[11px] truncate">{st.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
