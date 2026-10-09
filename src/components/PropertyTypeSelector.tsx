import React from 'react';
import { Building2, Home, Sparkles, Layers, Landmark } from 'lucide-react';
import { PropertyType, PropertySubtype } from '../types';
import { triggerHaptic } from '../utils/telegram';

interface PropertyTypeSelectorProps {
  value: PropertyType;
  subtype: PropertySubtype;
  onChange: (type: PropertyType) => void;
  onChangeSubtype: (subtype: PropertySubtype) => void;
  secondaryCoeff?: number;
}

export const PropertyTypeSelector: React.FC<PropertyTypeSelectorProps> = ({
  subtype,
  onChange,
  onChangeSubtype,
  secondaryCoeff = 1.15,
}) => {
  const SUBTYPES: {
    id: PropertySubtype;
    parentType: PropertyType;
    title: string;
    badge: string;
    hint: string;
    icon: React.FC<{ className?: string }>;
  }[] = [
    {
      id: 'new_concrete',
      parentType: 'new',
      title: 'Новостройка: Бетон',
      badge: 'База',
      hint: 'Стены от застройщика, полная черновая отделка',
      icon: Building2,
    },
    {
      id: 'new_whitebox',
      parentType: 'new',
      title: 'Новостройка: White Box',
      badge: '-25% черновой',
      hint: 'Штукатурка и стяжка уже есть от застройщика',
      icon: Sparkles,
    },
    {
      id: 'new_open_plan',
      parentType: 'new',
      title: 'Свободная планировка',
      badge: '+перегородки',
      hint: 'Возведение стен из блоков и шумоизоляция',
      icon: Layers,
    },
    {
      id: 'secondary_standard',
      parentType: 'secondary',
      title: 'Вторичка (Панель/Кирпич)',
      badge: `×${secondaryCoeff}`,
      hint: 'Стандартный демонтаж старой отделки и обоев',
      icon: Home,
    },
    {
      id: 'old_fund',
      parentType: 'secondary',
      title: 'Старый фонд / Сталинка',
      badge: '×1.45 сложный',
      hint: 'Демонтаж дранки, очистка лаг пола, тяжелый мусор',
      icon: Landmark,
    },
  ];

  const handleSelectSubtype = (item: (typeof SUBTYPES)[0]) => {
    if (subtype !== item.id) {
      triggerHaptic('selection');
      onChangeSubtype(item.id);
      onChange(item.parentType);
    }
  };

  const currentItem = SUBTYPES.find((s) => s.id === subtype) || SUBTYPES[0];

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl p-3 border border-zinc-200 dark:border-zinc-800 shadow-xs">
      <div className="flex items-center justify-between mb-2 px-0.5">
        <span className="text-[11px] font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
          1. Тип объекта и состояние
        </span>
        <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-900/60">
          {currentItem.badge}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-1 bg-zinc-100 dark:bg-zinc-800/80 rounded-lg">
        {SUBTYPES.map((item) => {
          const isSelected = subtype === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleSelectSubtype(item)}
              className={`flex flex-col items-start p-2 rounded-md text-left transition-all ${
                isSelected
                  ? 'bg-white dark:bg-zinc-900 text-zinc-950 dark:text-white shadow-xs ring-1 ring-zinc-900/10 dark:ring-white/20'
                  : 'text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:bg-white/50 dark:hover:bg-zinc-700/50'
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <div className={`p-1 rounded ${isSelected ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'}`}>
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                </div>
                <span className={`text-[9px] font-extrabold uppercase px-1 py-0.2 rounded ${
                  isSelected
                    ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white'
                    : 'text-zinc-400 dark:text-zinc-500'
                }`}>
                  {item.badge}
                </span>
              </div>
              <span className="text-xs font-bold leading-tight line-clamp-1">
                {item.title}
              </span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-1 mt-0.5 leading-snug">
                {item.hint}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

