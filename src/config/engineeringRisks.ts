export interface RiskProfile {
  percent: number;
  label: string;
  risks: string[];
}

export const HOUSING_RISK_PROFILES: Record<string, RiskProfile> = {
  white_box: {
    percent: 5,
    label: 'White Box (предчистовая)',
    risks: [
      'Пустоты под штукатуркой застройщика (бухтение)',
      'Геометрия углов 90° в зоне кухни и санузлов',
      'Работоспособность кабельных линий застройщика',
    ],
  },
  new_concrete: {
    percent: 8,
    label: 'Новостройка (монолит / бетон)',
    risks: [
      'Перепад монолитных плит (влияет на слой стяжки от 4 до 8 см)',
      'Отклонение монолитных пилонов от вертикали',
      'Высота канализационного тройника и давление воды',
    ],
  },
  open_plan: {
    percent: 10,
    label: 'Свободная планировка',
    risks: [
      'Точные границы мокрых зон по плану БТИ',
      'Фактический расход блоков для перегородок',
      'Необходимость звукоизоляции межквартирных стен',
    ],
  },
  secondary_panel: {
    percent: 12,
    label: 'Вторичка (типовая панель)',
    risks: [
      'Состояние проводки в скрытых каналах плит',
      'Сцепление старой штукатурки (демонтаж до основания)',
      'Износ общедомовых стояков и чугунного раструба',
    ],
  },
  old_fund: {
    percent: 18,
    label: 'Старый фонд / сталинка',
    risks: [
      'Состояние балок перекрытий (металл / дерево)',
      'Толщина старой штукатурки по дранке (до 10–15 см)',
      'Объём засыпки шлаком и строительного мусора под полом',
    ],
  },
};

/**
 * Normalizes internal property subtype or property type to the corresponding risk profile key
 */
export function normalizeRiskProfileKey(housingTypeOrSubtype: string): string {
  switch (housingTypeOrSubtype) {
    case 'new_whitebox':
    case 'white_box':
      return 'white_box';
    case 'new_open_plan':
    case 'open_plan':
      return 'open_plan';
    case 'secondary_standard':
    case 'secondary_panel':
    case 'secondary':
      return 'secondary_panel';
    case 'old_fund':
      return 'old_fund';
    case 'new_concrete':
    case 'new':
    default:
      return 'new_concrete';
  }
}

export function getReserveData(housingType: string, grandTotal: number) {
  const normalizedKey = normalizeRiskProfileKey(housingType);
  const profile = HOUSING_RISK_PROFILES[normalizedKey] || HOUSING_RISK_PROFILES.new_concrete;
  const reserveAmount = Math.round((grandTotal * (profile.percent / 100)) / 100) * 100;

  return {
    ...profile,
    profileKey: normalizedKey,
    reserveAmount,
  };
}
