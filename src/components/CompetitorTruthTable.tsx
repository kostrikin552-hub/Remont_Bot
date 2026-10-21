import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, XCircle, ShieldCheck, ChevronDown, Scale } from 'lucide-react';
import { triggerHaptic } from '../utils/telegram';

interface TrickItem {
  title: string;
  howTheyTrick: string;
  hiddenCost: string;
  howWeDo: string;
}

const TRICKS: TrickItem[] = [
  {
    title: 'Штробление бетона и подрозетники',
    howTheyTrick: 'Называют цену "от 350 ₽ за точку", умалчивая о штроблении армированного бетона, высверливании лунок и прокладке гофры.',
    hiddenCost: '+45 000 – 70 000 ₽',
    howWeDo: 'Все электромонтажные трассы, штробы, подрозетники и сборка щита уже включены в смету под ключ.',
  },
  {
    title: 'Грунтовка, обеспыливание и бетоноконтакт',
    howTheyTrick: 'Считают каждый слой грунтовки перед каждым этапом как отдельную платную операцию (до 4-5 слоев на стену).',
    hiddenCost: '+25 000 – 45 000 ₽',
    howWeDo: 'Грунтование по технологии Knauf/Ceresit входит в базовый регламент подготовки поверхностей без доплат.',
  },
  {
    title: 'Геометрия углов 90° под кухню и ванну',
    howTheyTrick: 'Делают дешевое "визуальное выравнивание". Когда привозят кухню и плитку, оказывается, что углы кривые, и требуют доплату за переделку.',
    hiddenCost: '+35 000 – 60 000 ₽',
    howWeDo: 'В тарифе "Капитальный" штукатурка по маякам с соблюдением углов 90° в мокрых зонах заложена изначально.',
  },
  {
    title: 'Подъём материалов и вывоз строительного мусора',
    howTheyTrick: 'В смету закладывают только работу. За разгрузку смесей и спуск 80 мешков мусора выставляют отдельный счет в конце каждого этапа.',
    hiddenCost: '+30 000 – 55 000 ₽',
    howWeDo: 'Логистика, занос смесей и регулярная утилизация мусора прописаны в договоре с фиксированной стоимостью.',
  },
  {
    title: 'Гидроизоляция санузлов с лентами примыканий',
    howTheyTrick: 'Экономят или "забывают" обмазочную гидроизоляцию и эластичные угловые ленты, из-за чего через полгода протекает пол к соседям.',
    hiddenCost: '+20 000 – 35 000 ₽',
    howWeDo: 'Двухслойная эластичная гидроизоляция с проклейкой углов лентой обязательна по СНиП и проверяется инженером.',
  },
];

export const CompetitorTruthTable: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'comparison' | 'tricks'>('comparison');

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 shadow-xs overflow-hidden">
      {/* Header bar */}
      <button
        type="button"
        onClick={() => {
          triggerHaptic('light');
          setIsOpen(!isOpen);
        }}
        className="w-full p-3.5 flex items-center justify-between text-left hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition cursor-pointer"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 dark:bg-red-500/20 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
            <Scale className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-zinc-950 dark:text-white uppercase tracking-wider">
                Анти-обман
              </span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-400 border border-amber-300 dark:border-amber-800">
                Сравнение смет
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400 font-medium truncate mt-0.5">
              Почему дешёвые сметы частников на старте вырастают на +40–60%
            </p>
          </div>
        </div>

        <ChevronDown
          className={`w-4 h-4 text-zinc-400 transition-transform duration-200 shrink-0 ml-2 ${
            isOpen ? 'rotate-180 text-zinc-900 dark:text-white' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="p-3.5 pt-0 border-t border-zinc-100 dark:border-zinc-800 space-y-3 animate-in fade-in duration-150">
          {/* Subheader tabs */}
          <div className="grid grid-cols-2 gap-1.5 pt-3">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setActiveTab('comparison');
              }}
              className={`py-1.5 px-2 rounded-lg text-xs font-bold text-center transition cursor-pointer ${
                activeTab === 'comparison'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              Сравнение условий
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('selection');
                setActiveTab('tricks');
              }}
              className={`py-1.5 px-2 rounded-lg text-xs font-bold text-center transition cursor-pointer ${
                activeTab === 'tricks'
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 shadow-xs'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              5 скрытых доплат ({TRICKS.length})
            </button>
          </div>

          {activeTab === 'comparison' && (
            <div className="space-y-2 pt-1 text-xs">
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                {/* Column 1: Cheap private crews */}
                <div className="p-3 rounded-xl bg-red-50/60 dark:bg-red-950/20 border border-red-200/80 dark:border-red-900/40 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-red-700 dark:text-red-400">
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Частные бригады</span>
                  </div>
                  <ul className="space-y-1.5 text-zinc-700 dark:text-zinc-300">
                    <li className="flex items-start gap-1">
                      <span className="text-red-500 font-bold shrink-0">•</span>
                      <span>Занижают смету на старте на 30–50%</span>
                    </li>
                    <li className="flex items-start gap-1">
                      <span className="text-red-500 font-bold shrink-0">•</span>
                      <span>Предоплата до начала работ</span>
                    </li>
                    <li className="flex items-start gap-1">
                      <span className="text-red-500 font-bold shrink-0">•</span>
                      <span>Доплаты за штробы, мусор, подъем</span>
                    </li>
                    <li className="flex items-start gap-1">
                      <span className="text-red-500 font-bold shrink-0">•</span>
                      <span>Сроки сдвигаются на 1–3 месяца</span>
                    </li>
                    <li className="flex items-start gap-1">
                      <span className="text-red-500 font-bold shrink-0">•</span>
                      <span>Гарантия «на словах» (симка меняется)</span>
                    </li>
                  </ul>
                </div>

                {/* Column 2: Our Engineering Standard */}
                <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200/90 dark:border-emerald-900/50 space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <span>Наш стандарт ГОСТ</span>
                  </div>
                  <ul className="space-y-1.5 text-zinc-700 dark:text-zinc-300">
                    <li className="flex items-start gap-1">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">✓</span>
                      <span>Твёрдая смета с фиксацией в договоре</span>
                    </li>
                    <li className="flex items-start gap-1">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">✓</span>
                      <span>0% предоплаты — оплата по факту КС-2</span>
                    </li>
                    <li className="flex items-start gap-1">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">✓</span>
                      <span>Все 35 видов работ уже включены</span>
                    </li>
                    <li className="flex items-start gap-1">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">✓</span>
                      <span>Штраф 0.1% за каждый день просрочки</span>
                    </li>
                    <li className="flex items-start gap-1">
                      <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">✓</span>
                      <span>Официальная гарантия 36 месяцев</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'tricks' && (
            <div className="space-y-2 pt-1">
              {TRICKS.map((trick, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-full bg-zinc-200 dark:bg-zinc-700 flex items-center justify-center text-[10px] font-mono font-bold">
                        {idx + 1}
                      </span>
                      <span>{trick.title}</span>
                    </span>
                    <span className="font-mono font-extrabold text-red-600 dark:text-red-400 text-[11px] shrink-0 bg-red-100/80 dark:bg-red-950/80 px-1.5 py-0.5 rounded">
                      {trick.hiddenCost}
                    </span>
                  </div>

                  <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-snug">
                    <strong className="text-zinc-700 dark:text-zinc-300">Уловка:</strong> {trick.howTheyTrick}
                  </p>

                  <div className="p-2 rounded bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-900/40 text-[11px] text-emerald-900 dark:text-emerald-300 leading-snug flex items-start gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span><strong>У нас:</strong> {trick.howWeDo}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bottom badge */}
          <div className="p-2.5 rounded-lg bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 text-[11px] font-medium flex items-center justify-between gap-2 shadow-xs">
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400 dark:text-emerald-600 shrink-0" />
              <span>Вы получаете финальную смету без скрытых строчек</span>
            </div>
            <span className="font-mono font-bold text-emerald-400 dark:text-emerald-600 text-[10px] uppercase">
              ГОСТ 3.04.01-87
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
