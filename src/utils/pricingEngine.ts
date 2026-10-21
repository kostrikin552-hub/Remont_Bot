/**
 * src/utils/pricingEngine.ts
 * 
 * Расчётное ядро MVP — Решение 8 ключевых болей прораба и заказчика:
 * 1. Авторасчёт электроточек по эргономике ГОСТ: Math.ceil(area * 1.15)
 * 2. Доставка и подъём материалов: фиксированная логистика зашита в черновой блок
 * 3. Расходные материалы (буры, пленка, скотч, мешки): area * 800 ₽/м²
 * 4. Вывоз строительного мусора (ТБО): авторасчёт контейнеров (от 1 до 3 шт.) включен в смету
 * 5. Смежные специалисты (натяжные потолки, кондиционеры): включены в ориентир полного бюджета
 * 6. Перерасход материалов на подрезку: технологический запас × 1.10 (+10%) на черновой объём
 * 7. Плавающая смета: фиксированная смета без доплат по договору
 * 8. Формула 25/40/25/10: полный бюджет заселения fullMoveInBudget = grandTotal * 2.2
 */

export interface MvpInput {
  area: number;
  housingType: 'white_box' | 'new_concrete' | 'secondary' | 'old_fund';
  repairClass: 'cosmetic' | 'capital' | 'designer';
  bathroomsCount: 1 | 2;
}

export interface MvpBudgetBreakdown {
  works: number;              // 25% — Строительно-монтажные и отделочные работы
  materials: number;          // 40% — Черновые и чистовые отделочные материалы
  furnitureAndTech: number;   // 25% — Мебель, кухня, сантехприборы и бытовая техника
  specialistsAndMisc: number; // 10% — Смежные подрядчики (потолки, кондиционеры, двери) и резерв
}

export interface MvpCalculationResult {
  // Боль 1: Электроточки по эргономике ГОСТ
  electricalPointsCount: number;
  costPerPoint: number;
  electricalWorkCost: number;

  // Боль 2: Логистика и подъем
  deliveryAndLiftingCost: number;

  // Боль 3: Расходные материалы (буры, мешки, укрывка, скотч)
  consumablesCost: number;

  // Боль 4: Вывоз мусора ТБО
  trashContainersCount: number;
  trashCostPerContainer: number;
  trashRemovalCost: number;

  // Боль 6: Технологический запас 10% на подрезку черновых материалов
  roughMaterialsBase: number;
  roughMaterialsReserve: number; // +10%
  roughMaterialsTotal: number;

  // Итоги сметы (Работы + Материалы)
  worksTotal: number;
  materialsTotal: number;
  grandTotal: number;
  pricePerMeter: number;

  // Боль 8: Полный ориентир бюджета переезда (2.2x от сметы)
  fullMoveInBudget: number;
  budgetBreakdown: MvpBudgetBreakdown;
}

/**
 * Основная функция расчёта MVP сметы ремонта
 */
export function calculateMvpRenovation(input: MvpInput): MvpCalculationResult {
  const area = Math.max(15, Math.min(400, Math.round(input.area || 50)));
  const { housingType, repairClass, bathroomsCount } = input;

  // 1. БОЛЬ 1: Авторасчёт электроточек по эргономике ГОСТ
  // Формула: Math.ceil(area * 1.15)
  const electricalPointsCount = Math.ceil(area * 1.15);
  const costPerPoint = repairClass === 'designer' ? 1800 : (repairClass === 'capital' ? 1500 : 1200);
  const electricalWorkCost = electricalPointsCount * costPerPoint;

  // 2. БОЛЬ 2: Доставка и подъём материалов
  // Фиксированная логистика: аренда транспорта (10 000 ₽) + ручной/грузовой подъём
  const deliveryAndLiftingCost = Math.round(15000 + area * 250);

  // 3. БОЛЬ 3: Расходные материалы (буры, диски, плёнка, скотч, мешки)
  // Норматив: area * 800 ₽/м²
  const consumablesCost = Math.round(area * 800);

  // 4. БОЛЬ 4: Вывоз строительного мусора (ТБО)
  // Авторасчёт контейнеров 8 м³ (от 1 до 3 шт.)
  let trashContainersCount = 1;
  if (area > 85) {
    trashContainersCount = 3;
  } else if (area > 45) {
    trashContainersCount = 2;
  }
  const trashCostPerContainer = 9500;
  const trashRemovalCost = trashContainersCount * trashCostPerContainer;

  // 5. БОЛЬ 6: Черновые материалы и коэффициент технологического запаса × 1.10 (+10% на подрезку)
  let baseRoughRate = 7000;
  if (housingType === 'white_box') {
    baseRoughRate = 3500;
  } else if (housingType === 'secondary') {
    baseRoughRate = 8500;
  } else if (housingType === 'old_fund') {
    baseRoughRate = 11000;
  }

  const classMultiplier = repairClass === 'designer' ? 1.25 : (repairClass === 'cosmetic' ? 0.75 : 1.0);
  const extraBathRough = bathroomsCount > 1 ? 60000 : 0;
  const roughMaterialsBase = Math.round(area * baseRoughRate * classMultiplier + extraBathRough);

  // Коэффициент технологического запаса × 1.10 (+10% на подрезку и бой)
  const roughMaterialsReserve = Math.round(roughMaterialsBase * 0.10);
  const roughMaterialsTotal = roughMaterialsBase + roughMaterialsReserve;

  // 6. Стоимость отделочных работ (СМР)
  let baseWorkRate = 14500;
  if (repairClass === 'cosmetic') {
    baseWorkRate = 8000;
  } else if (repairClass === 'designer') {
    baseWorkRate = 22000;
  }

  let housingWorkCoeff = 1.0;
  if (housingType === 'white_box') {
    housingWorkCoeff = 0.85;
  } else if (housingType === 'secondary') {
    housingWorkCoeff = 1.15;
  } else if (housingType === 'old_fund') {
    housingWorkCoeff = 1.35;
  }

  const extraBathWork = bathroomsCount > 1 ? 120000 : 0;
  const generalWorkCost = Math.round(area * baseWorkRate * housingWorkCoeff + extraBathWork);
  const worksTotal = generalWorkCost + electricalWorkCost;

  // Суммарные материалы (черновые с запасом + расходники + логистика + мусор)
  const materialsTotal = roughMaterialsTotal + consumablesCost + deliveryAndLiftingCost + trashRemovalCost;

  // Итоговая базовая смета
  const grandTotal = worksTotal + materialsTotal;
  const pricePerMeter = Math.round(grandTotal / area);

  // 7. БОЛЬ 8: Полный бюджет заселения (Формула 25/40/25/10)
  // fullMoveInBudget = grandTotal * 2.2
  const fullMoveInBudget = Math.round(grandTotal * 2.2);

  // БОЛЬ 5: Смежные специалисты (потолки, кондиционеры, двери) включены в 10%
  const budgetBreakdown: MvpBudgetBreakdown = {
    works: Math.round(fullMoveInBudget * 0.25),              // 25% СМР
    materials: Math.round(fullMoveInBudget * 0.40),          // 40% Черновые и чистовые материалы
    furnitureAndTech: Math.round(fullMoveInBudget * 0.25),   // 25% Мебель, сантехника, кухня, техника
    specialistsAndMisc: Math.round(fullMoveInBudget * 0.10), // 10% Смежные специалисты (потолки, кондиционеры, двери)
  };

  return {
    electricalPointsCount,
    costPerPoint,
    electricalWorkCost,
    deliveryAndLiftingCost,
    consumablesCost,
    trashContainersCount,
    trashCostPerContainer,
    trashRemovalCost,
    roughMaterialsBase,
    roughMaterialsReserve,
    roughMaterialsTotal,
    worksTotal,
    materialsTotal,
    grandTotal,
    pricePerMeter,
    fullMoveInBudget,
    budgetBreakdown,
  };
}

/**
 * Хелпер для форматирования сумм в рублях
 */
export function formatRubles(val: number): string {
  return `${Math.round(val).toLocaleString('ru-RU')} ₽`;
}
