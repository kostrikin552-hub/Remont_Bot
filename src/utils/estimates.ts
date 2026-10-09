import {
  EstimateItem,
  EstimateCategoryGroup,
  CalculatedEstimateItem,
  PricingRules,
  PropertyType,
  PropertySubtype,
  BathroomsCount,
  CeilingHeight,
  KeyStatus,
  LeadScoring,
  LeadScoringGrade,
  RenovationClassId,
  AdditionalOption,
} from '../types';

/**
 * 1. Нелинейный расчет площади стен и периметра
 * Formula: WallArea = FloorArea * PerimeterRatio(FloorArea) * (CeilingHeight / 2.7)
 * - Studio <= 35 m² -> ratio 3.4
 * - 1-2 room 35..65 m² -> ratio 2.8
 * - 3+ room > 65 m² -> ratio 2.4
 */
export function calculateAccurateSurfaces(area: number, ceilingHeight: number = 2.7) {
  let perimeterRatio = 2.4;
  if (area <= 35) {
    perimeterRatio = 3.4; // Для компактных студий
  } else if (area <= 65) {
    perimeterRatio = 2.8; // Для 1-2 комнатных квартир
  }

  const heightFactor = ceilingHeight / 2.7;
  const wallArea = Math.round(area * perimeterRatio * heightFactor * 10) / 10;

  return { wallArea, perimeterRatio, heightFactor };
}

/**
 * 2. Расчет надбавки за дополнительные мокрые зоны (санузлы)
 * - 1 = совмещенный санузел (базовый)
 * - 1.5 = раздельный санузел (ванная комната + отдельный туалет)
 * - 2 = 2 полноценных санузла (мастер-спальня + гостевой)
 * - 3 = 3+ санузла (премиум-квартира)
 */
export function calculateWetAreasAddon(bathroomsCount: BathroomsCount = 1, regionalMultiplier: number = 1.0) {
  let extraBaths = 0;
  if (bathroomsCount === 1.5) {
    extraBaths = 0.45; // Раздельный санузел (доп. гребенка, отдельная гидроизоляция, облицовка туалета)
  } else if (bathroomsCount >= 2) {
    extraBaths = bathroomsCount - 1;
  }

  if (extraBaths <= 0) {
    return { worksAddon: 0, materialsAddon: 0, extraBaths: 0 };
  }

  // Дополнительный санузел: коллектор, штробление, гидроизоляция, укладка керамогранита, сантехприборы
  const BASE_EXTRA_BATH_WORK = 140000;
  const BASE_EXTRA_BATH_MAT = 85000;

  return {
    worksAddon: Math.round(extraBaths * BASE_EXTRA_BATH_WORK * regionalMultiplier),
    materialsAddon: Math.round(extraBaths * BASE_EXTRA_BATH_MAT * regionalMultiplier),
    extraBaths,
  };
}

/**
 * 3. Расчет ориентировочной вилки бюджета на ЧИСТОВЫЕ МАТЕРИАЛЫ
 * (плитка, сантехника, напольные покрытия, двери, обои/краска, чистовой свет)
 */
export function calculateFinishingMaterialsRange(area: number, renovationClassId: RenovationClassId) {
  let minPerMeter = 12000;
  let maxPerMeter = 18000;
  if (renovationClassId === 'capital') {
    minPerMeter = 18000;
    maxPerMeter = 30000;
  } else if (renovationClassId === 'designer') {
    minPerMeter = 32000;
    maxPerMeter = 60000;
  }

  return {
    min: Math.round(area * minPerMeter),
    max: Math.round(area * maxPerMeter),
    minPerMeter,
    maxPerMeter,
  };
}

/**
 * 4. Движок автоматического скоринга лида (Lead Scoring Engine)
 * Проверяет статус готовности ключей, класс ремонта, площадь и дату выезда.
 */
export function calculateLeadScore(input: {
  keyStatus: KeyStatus;
  renovationClass: RenovationClassId;
  propertySubtype?: PropertySubtype;
  area: number;
  preferredDate?: string;
  hasAddress?: boolean;
}): LeadScoring {
  let score = 50;

  // 1. Статус ключей (критически важный фактор целевого лида)
  if (input.keyStatus === 'ready') {
    score += 35; // Ключи на руках, объект доступен
  } else if (input.keyStatus === 'in_30_days') {
    score += 15; // Ключи скоро (до 30 дней)
  } else {
    score -= 25; // Дом строится (2+ мес) -> выезд физически невозможен
  }

  // 2. Класс ремонта
  if (input.renovationClass === 'designer') score += 15;
  else if (input.renovationClass === 'capital') score += 10;
  else score += 0;

  // 3. Площадь объекта
  if (input.area >= 80) score += 10;
  else if (input.area >= 45) score += 5;

  // 4. Срочность даты
  if (input.preferredDate === 'Сегодня' || input.preferredDate === 'Завтра') {
    if (input.keyStatus === 'ready') score += 5;
  }

  score = Math.max(10, Math.min(100, score));

  let grade: LeadScoringGrade = 'warm';
  let badge = '🟡 ТЁПЛЫЙ (КОНСУЛЬТАЦИЯ)';
  let recommendedAction = 'Связаться для согласования проекта и консультации';
  const canScheduleVisit = input.keyStatus === 'ready';
  const warnings: string[] = [];

  if (input.keyStatus !== 'ready') {
    warnings.push(
      input.keyStatus === 'construction'
        ? '⚠️ Выезд на объект невозможен: дом строится. Провести онлайн-консультацию!'
        : '⚠️ Выезд согласуется: ключи ожидаются в течение 30 дней. Уточнить дату выдачи ключей.'
    );
  }

  if (score >= 80 && input.keyStatus === 'ready') {
    grade = 'vip';
    badge = '🔥 СРОЧНЫЙ (VIP)';
    recommendedAction = 'Срочный выезд инженера сегодня/завтра! Высокая конверсия в договор.';
  } else if (input.keyStatus === 'construction' || score < 50) {
    grade = 'cold';
    badge = '❄️ ХОЛОДНЫЙ (ПРИЦЕНКА)';
    recommendedAction = 'НЕ отправлять замерщика! Провести онлайн-консультацию по планировке и зафиксировать скидку.';
  } else {
    grade = 'warm';
    badge = '🟡 ТЁПЛЫЙ (КОНСУЛЬТАЦИЯ)';
    recommendedAction = input.keyStatus === 'ready'
      ? 'Согласовать выезд на замер и прислать предварительный проект.'
      : 'Подготовить эскиз расстановки мебели и созвониться онлайн.';
  }

  return {
    score,
    grade,
    badge,
    recommendedAction,
    canScheduleVisit,
    warnings,
  };
}

export const DEFAULT_ESTIMATE_CATALOG: EstimateItem[] = [
  // 1. ДЕМОНТАЖ И ПОДГОТОВКА (Demolition)
  {
    id: 'demo-wallpaper',
    category: 'demolition',
    title: 'Демонтаж старых обоев, краски и шпаклевки',
    unit: 'м²',
    quantityRatio: 2.6, // пересчитывается динамически от wallArea
    unitPrice: 140,
    tariffApplicability: ['cosmetic', 'capital', 'designer'],
    description: 'Очистка оснований до штукатурного слоя с увлажнением',
  },
  {
    id: 'demo-floors',
    category: 'demolition',
    title: 'Демонтаж старого линолеума / ламината и плинтусов',
    unit: 'м²',
    quantityRatio: 1.0,
    unitPrice: 180,
    tariffApplicability: ['cosmetic', 'capital', 'designer'],
    description: 'Снятие финишного покрытия и подложки без повреждения основания',
  },
  {
    id: 'demo-screed',
    category: 'demolition',
    title: 'Демонтаж старой цементной стяжки до плиты',
    unit: 'м²',
    quantityRatio: 0.8,
    unitPrice: 550,
    tariffApplicability: ['capital', 'designer'],
    description: 'Ударный демонтаж с сохранением целостности перекрытия',
  },
  {
    id: 'demo-old-fund',
    category: 'demolition',
    title: 'Тяжелый демонтаж старого фонда: штукатурка по дранке, лаги пола',
    unit: 'м²',
    quantityRatio: 1.0,
    unitPrice: 950,
    tariffApplicability: ['capital', 'designer'],
    description: 'Очистка кирпичных стен до кладки, расшивка деревянных перекрытий',
  },
  {
    id: 'demo-trash',
    category: 'demolition',
    title: 'Сбор в мешки, спуск и вывоз строительного мусора (контейнер)',
    unit: 'рейс',
    quantityRatio: 0.035,
    unitPrice: 8500,
    tariffApplicability: ['cosmetic', 'capital', 'designer'],
    description: 'Утилизация на лицензированном полигоне ТБО',
  },

  // 2. ЧЕРНОВЫЕ РАБОТЫ И ГЕОМЕТРИЯ (Rough)
  {
    id: 'rough-primer',
    category: 'rough',
    title: 'Обеспыливание и грунтовка глубокого проникновения (2 слоя)',
    unit: 'м²',
    quantityRatio: 2.6, // пересчитывается от wallArea
    unitPrice: 85,
    tariffApplicability: ['cosmetic', 'capital', 'designer'],
    description: 'Knauf Тифенгрунд с контролем адгезии',
  },
  {
    id: 'rough-plaster',
    category: 'rough',
    title: 'Штукатурка стен по маякам с выведением углов 90°',
    unit: 'м²',
    quantityRatio: 2.6, // пересчитывается от wallArea
    unitPrice: 680,
    tariffApplicability: ['capital', 'designer'],
    description: 'Лазерный контроль вертикалей, срезка маяков, замывка под шпаклёвку',
  },
  {
    id: 'rough-partitions',
    category: 'rough',
    title: 'Возведение межкомнатных перегородок из пазогребня / блоков с армированием',
    unit: 'м²',
    quantityRatio: 0.45,
    unitPrice: 850,
    tariffApplicability: ['capital', 'designer'],
    description: 'Для свободной планировки: монтаж демпферной ленты и перевязка рядов',
  },
  {
    id: 'rough-screed',
    category: 'rough',
    title: 'Устройство стяжки пола по маякам с армирующей фиброй',
    unit: 'м²',
    quantityRatio: 1.0,
    unitPrice: 580,
    tariffApplicability: ['capital', 'designer'],
    description: 'Демпферная лента по периметру, лазерный горизонт перепада до 2 мм',
  },
  {
    id: 'rough-waterproofing',
    category: 'rough',
    title: 'Обмазочная эластичная гидроизоляция санузла с лентой',
    unit: 'м²',
    quantityRatio: 0.35, // масштабируется от количества санузлов
    unitPrice: 480,
    tariffApplicability: ['cosmetic', 'capital', 'designer'],
    description: 'Обработка углов гидроизоляционной лентой с заходом на стены 20 см',
  },

  // 3. ИНЖЕНЕРНЫЕ СЕТИ (Engineering)
  {
    id: 'eng-cables',
    category: 'engineering',
    title: 'Штробление и прокладка ГОСТ-кабеля ВВГнг-LS в негорючей гофре',
    unit: 'пог. м',
    quantityRatio: 1.8,
    unitPrice: 210,
    tariffApplicability: ['capital', 'designer'],
    description: 'Фиксация к потолку клипсами, без скруток, сварка гильзами',
  },
  {
    id: 'eng-sockets',
    category: 'engineering',
    title: 'Высверливание подрозетников и монтаж стаканов (точки)',
    unit: 'точек',
    quantityRatio: 0.85,
    unitPrice: 490,
    tariffApplicability: ['capital', 'designer'],
    description: 'Алмазное безударное коронкование в бетоне и кирпиче',
  },
  {
    id: 'eng-panel',
    category: 'engineering',
    title: 'Сборка и коммутация силового электрощита с УЗО и реле напряжения',
    unit: 'щит',
    quantityRatio: 0.02,
    unitPrice: 9500,
    tariffApplicability: ['capital', 'designer'],
    description: 'Автоматика ABB/Schneider/DEKraft, маркировка линий, гребенки',
  },
  {
    id: 'eng-plumbing-pipes',
    category: 'engineering',
    title: 'Разводка труб водоснабжения и канализации из сшитого полиэтилена',
    unit: 'точек',
    quantityRatio: 0.16,
    unitPrice: 2400,
    tariffApplicability: ['capital', 'designer'],
    description: 'Трубы Rehau Rautitan / Stout с опрессовкой давлением 10 атм',
  },
  {
    id: 'eng-collector',
    category: 'engineering',
    title: 'Монтаж коллекторного узла с манометрами и самопромывными фильтрами',
    unit: 'узел',
    quantityRatio: 0.02,
    unitPrice: 11500,
    tariffApplicability: ['capital', 'designer'],
    description: 'Коллекторы Far/Stout, защита от гидроударов и компенсаторы',
  },

  // 4. ЧИСТОВАЯ ОТДЕЛКА (Finishing)
  {
    id: 'finish-putty',
    category: 'finishing',
    title: 'Шпаклевание стен финишной полимерной смесью (2 слоя)',
    unit: 'м²',
    quantityRatio: 2.6, // пересчитывается от wallArea
    unitPrice: 420,
    tariffApplicability: ['cosmetic', 'capital', 'designer'],
    description: 'Danogips DANO TOP под лампу Lossew без полос и рисок',
  },
  {
    id: 'finish-wallpaper',
    category: 'finishing',
    title: 'Оклейка стен бесшовными флизелиновыми обоями / покраска',
    unit: 'м²',
    quantityRatio: 2.3, // пересчитывается от wallArea
    unitPrice: 380,
    tariffApplicability: ['cosmetic', 'capital', 'designer'],
    description: 'Стыковка рисунка встык, невидимый шов, прокат резиновым валиком',
  },
  {
    id: 'finish-tiles',
    category: 'finishing',
    title: 'Укладка керамогранита в санузле и прихожей с запилом углов под 45°',
    unit: 'м²',
    quantityRatio: 0.45,
    unitPrice: 1650,
    tariffApplicability: ['capital', 'designer'],
    description: 'Система выравнивания плитки SVP, эпоксидная затирка швов',
  },
  {
    id: 'finish-laminate',
    category: 'finishing',
    title: 'Настил ламината 33 класса / кварцвинила с подложкой',
    unit: 'м²',
    quantityRatio: 0.75,
    unitPrice: 460,
    tariffApplicability: ['cosmetic', 'capital', 'designer'],
    description: 'Единый контур без порожков, компенсационные термозазоры',
  },
  {
    id: 'finish-plinth',
    category: 'finishing',
    title: 'Монтаж плинтусов с запилом углов торцовочной пилой',
    unit: 'пог. м',
    quantityRatio: 1.1,
    unitPrice: 260,
    tariffApplicability: ['cosmetic', 'capital', 'designer'],
    description: 'МДФ / дюрополимер со скрытым креплением',
  },
  {
    id: 'finish-doors',
    category: 'finishing',
    title: 'Установка межкомнатных дверей с доборами и магнитной фурнитурой',
    unit: 'комплект',
    quantityRatio: 0.065,
    unitPrice: 4200,
    tariffApplicability: ['capital', 'designer'],
    description: 'Врезка петель и ручек по шаблону, запенивание пистолетной пеной',
  },
  {
    id: 'finish-ceiling',
    category: 'finishing',
    title: 'Монтаж натяжного потолка MSD Premium с закладными под светильники',
    unit: 'м²',
    quantityRatio: 1.0,
    unitPrice: 780,
    tariffApplicability: ['cosmetic', 'capital', 'designer'],
    description: 'Алюминиевый профиль гарпунной системы, бесщелевой теневой зазор',
  },
  {
    id: 'design-project',
    category: 'finishing',
    title: 'Индивидуальный дизайн-проект (3D-визуализации, рабочие чертежи, спецификации)',
    unit: 'м²',
    quantityRatio: 1.0,
    unitPrice: 2000,
    tariffApplicability: ['cosmetic', 'capital', 'designer'],
    description: 'Обмерочный план, 3D-рендеры всех комнат, схема электрики, сантехники и развёртки стен',
  },

  // 5. ЧЕРНОВЫЕ СЕРТИФИЦИРОВАННЫЕ МАТЕРИАЛЫ (Materials)
  {
    id: 'mat-drymix',
    category: 'materials',
    title: 'Сухие смеси: Knauf Ротбанд, МП-75, Пескобетон М-300, наливной пол',
    unit: 'комплект',
    quantityRatio: 0.02,
    unitPrice: 65000,
    tariffApplicability: ['capital', 'designer'],
    description: 'Оригинальные заводские партии с доставкой и подъёмом на этаж',
  },
  {
    id: 'mat-electro',
    category: 'materials',
    title: 'Электроматериалы: кабель ГОСТ Конкорд, гофра, подрозетники Schneider',
    unit: 'комплект',
    quantityRatio: 0.02,
    unitPrice: 42000,
    tariffApplicability: ['capital', 'designer'],
    description: 'Медный негорючий кабель с тройной изоляцией',
  },
  {
    id: 'mat-plumbing',
    category: 'materials',
    title: 'Сантехматериалы: трубы Rehau, фитинги латунные, краны Bugatti',
    unit: 'комплект',
    quantityRatio: 0.02,
    unitPrice: 38000,
    tariffApplicability: ['capital', 'designer'],
    description: 'Сшитый полиэтилен с гарантией от протечек 50 лет',
  },
];

export const CATEGORY_LABELS: Record<
  EstimateItem['category'],
  { title: string; badge: string; description: string; icon: string }
> = {
  demolition: {
    title: '1. Демонтаж и подготовка',
    badge: 'Подготовка',
    description: 'Очистка помещений, демонтаж покрытий, вывоз мусора',
    icon: 'Hammer',
  },
  rough: {
    title: '2. Черновые работы и геометрия',
    badge: 'Основа',
    description: 'Штукатурка по маякам 90°, стяжка пола, гидроизоляция',
    icon: 'Layers',
  },
  engineering: {
    title: '3. Инженерные коммуникации',
    badge: 'Сети ГОСТ',
    description: 'Электромонтаж под ключ, сборка щита, трубы Rehau',
    icon: 'Zap',
  },
  finishing: {
    title: '4. Чистовая отделка',
    badge: 'Финиш',
    description: 'Керамогранит, обои/покраска, ламинат, потолки, двери',
    icon: 'Sparkles',
  },
  materials: {
    title: '5. Черновые сертифицированные материалы',
    badge: 'Материалы',
    description: 'Оптовые закупки Knauf, Rehau, ABB с подъёмом',
    icon: 'Package',
  },
};

/**
 * Gets the company estimate items, merged with company's base pricing
 */
export function getCompanyEstimateItems(
  companyId: string,
  pricing: PricingRules
): EstimateItem[] {
  // Check if company has custom saved estimate items in localStorage
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(`company_estimate_${companyId}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // Fallback
    }
  }

  // Adjust rates dynamically according to company's pricing rule multipliers
  const baseCosmeticRatio = pricing.cosmeticPrice / 4500;
  const baseCapitalRatio = pricing.capitalPrice / 8500;
  const materialsRatio = pricing.materialsPrice / 3500;
  const demoRatio = pricing.demolitionPrice / 1200;

  return DEFAULT_ESTIMATE_CATALOG.map((item) => {
    if (item.id === 'design-project') {
      return {
        ...item,
        unitPrice: pricing.designProjectPrice || 2000,
      };
    }

    let multiplier = baseCapitalRatio;
    if (item.category === 'demolition') multiplier = demoRatio;
    if (item.category === 'materials') multiplier = materialsRatio;
    if (item.category === 'finishing' && item.tariffApplicability?.includes('cosmetic')) {
      multiplier = baseCosmeticRatio;
    }

    // Round nicely to 10 rubles
    const adjustedPrice = Math.round((item.unitPrice * multiplier) / 10) * 10;

    return {
      ...item,
      unitPrice: adjustedPrice,
    };
  });
}

/**
 * Saves customized company estimate items
 */
export function saveCompanyEstimateItems(companyId: string, items: EstimateItem[]) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`company_estimate_${companyId}`, JSON.stringify(items));
    } catch (e) {
      console.error('Error saving company estimate items:', e);
    }
  }
}

/**
 * Calculates complete itemized breakdown for exact area and options
 */
export function calculateDetailedEstimate(
  items: EstimateItem[],
  area: number,
  propertyType: PropertyType,
  secondaryCoeff: number,
  renovationClassId: RenovationClassId,
  activeOptions: AdditionalOption[],
  excludedItemIds: string[] = [],
  propertySubtype: PropertySubtype = 'new_concrete',
  bathroomsCount: BathroomsCount = 1,
  ceilingHeight: CeilingHeight = 2.7
): {
  groups: EstimateCategoryGroup[];
  grandTotal: number;
  worksTotal: number;
  materialsTotal: number;
  wetAreasCost: { works: number; materials: number };
  finishingMaterialsEstimate: {
    min: number;
    max: number;
    minPerMeter: number;
    maxPerMeter: number;
  };
  wallArea: number;
  perimeterRatio: number;
  totalPositions: number;
  activePositions: number;
  excludedCount: number;
  savingsTotal: number;
} {
  // Accurate dynamic wall surfaces based on area and ceiling height
  const { wallArea, perimeterRatio } = calculateAccurateSurfaces(area, ceilingHeight);

  // Subtype-dependent secondary coefficient:
  // Old fund / Stalinka requires heavy coeff 1.45 due to lath plaster, joists, tons of debris.
  let effectiveSecondaryCoeff = 1.0;
  if (propertySubtype === 'old_fund') {
    effectiveSecondaryCoeff = 1.45;
  } else if (propertyType === 'secondary' || propertySubtype === 'secondary_standard') {
    effectiveSecondaryCoeff = secondaryCoeff || 1.15;
  }

  const isSecondary =
    propertyType === 'secondary' ||
    propertySubtype === 'secondary_standard' ||
    propertySubtype === 'old_fund';

  const isDemolitionActive =
    activeOptions.some((o) => o.id === 'demolition' && o.enabled) || isSecondary;
  const isMaterialsActive = activeOptions.some((o) => o.id === 'materials' && o.enabled);
  const isDesignActive = activeOptions.some((o) => o.id === 'designProject' && o.enabled);

  // Wet areas calculation addon
  const wetAddon = calculateWetAreasAddon(bathroomsCount, 1.0);

  // Finishing materials range estimate
  const finishingMaterialsEstimate = calculateFinishingMaterialsRange(area, renovationClassId);

  // Group items by category
  const categories: EstimateItem['category'][] = [
    'demolition',
    'rough',
    'engineering',
    'finishing',
    'materials',
  ];

  let grandTotal = 0;
  let worksTotal = 0;
  let materialsTotal = 0;
  let totalPositions = 0;
  let activePositions = 0;
  let excludedCount = 0;
  let savingsTotal = 0;

  const groups: EstimateCategoryGroup[] = [];

  for (const cat of categories) {
    // If demolition option is not enabled and property is new, skip demolition category
    if (cat === 'demolition' && !isDemolitionActive) {
      continue;
    }
    // If materials option is disabled, skip materials category
    if (cat === 'materials' && !isMaterialsActive) {
      continue;
    }

    const catItems = items.filter((item) => {
      if (item.category !== cat) return false;

      // Filter design project if option is disabled
      if (item.id === 'design-project' && !isDesignActive) {
        return false;
      }
      // Filter by tariff applicability
      if (item.tariffApplicability && !item.tariffApplicability.includes(renovationClassId)) {
        return false;
      }

      // Old fund demolition item only applies to old fund
      if (item.id === 'demo-old-fund' && propertySubtype !== 'old_fund') {
        return false;
      }

      // Partitions only relevant for open plan or capital/designer
      if (item.id === 'rough-partitions' && propertySubtype !== 'new_open_plan') {
        return false;
      }

      // White box already has plaster and basic screed
      if (propertySubtype === 'new_whitebox' && item.id === 'rough-plaster') {
        return false;
      }

      return true;
    });

    if (catItems.length === 0) continue;

    const calculatedItems: CalculatedEstimateItem[] = catItems.map((item) => {
      let qty = Math.round(area * item.quantityRatio * 10) / 10;

      // 1. Dynamic wall area substitution:
      if (
        item.id === 'demo-wallpaper' ||
        item.id === 'rough-primer' ||
        item.id === 'rough-plaster' ||
        item.id === 'finish-putty'
      ) {
        qty = wallArea;
      } else if (item.id === 'finish-wallpaper') {
        qty = Math.round(wallArea * 0.9 * 10) / 10; // Minus door and window openings
      }

      // 2. White Box adjustments:
      if (propertySubtype === 'new_whitebox') {
        if (item.id === 'rough-screed') {
          qty = Math.round(area * 0.15 * 10) / 10; // Only corrective floor leveling
        } else if (item.id === 'eng-cables') {
          qty = Math.round(area * 0.6 * 10) / 10; // Complementing existing developer wiring
        }
      }

      // 3. Wet areas scaling (additional bathrooms):
      if (wetAddon.extraBaths > 0) {
        if (item.id === 'rough-waterproofing') {
          qty = Math.round(0.35 * area * (1 + wetAddon.extraBaths * 0.8) * 10) / 10;
        } else if (item.id === 'finish-tiles') {
          qty = Math.round(0.45 * area * (1 + wetAddon.extraBaths * 0.7) * 10) / 10;
        } else if (item.id === 'eng-plumbing-pipes') {
          qty = Math.round(area * item.quantityRatio + wetAddon.extraBaths * 4);
        } else if (item.id === 'eng-collector') {
          qty = Math.max(1, Math.round(1 + wetAddon.extraBaths));
        }
      }

      // 4. Old fund debris multiplier:
      if (propertySubtype === 'old_fund' && item.id === 'demo-trash') {
        qty = Math.max(2, Math.round(area * 0.06));
      }

      if (
        item.unit === 'щит' ||
        item.unit === 'узел' ||
        item.unit === 'рейс' ||
        item.unit === 'комплект'
      ) {
        qty = Math.max(1, Math.round(qty));
      }

      // Secondary property coefficient applies to rough and demolition
      const itemCoeff =
        (item.category === 'demolition' || item.category === 'rough') && isSecondary
          ? effectiveSecondaryCoeff
          : 1.0;

      const subtotal = Math.round(qty * item.unitPrice * itemCoeff);
      const isExcluded = excludedItemIds.includes(item.id);

      return {
        item,
        quantity: qty,
        subtotal,
        excluded: isExcluded,
      };
    });

    let catTotal = 0;
    for (const ci of calculatedItems) {
      totalPositions += 1;
      if (ci.excluded) {
        excludedCount += 1;
        savingsTotal += ci.subtotal;
      } else {
        catTotal += ci.subtotal;
        activePositions += 1;
      }
    }

    grandTotal += catTotal;

    if (cat === 'materials') {
      materialsTotal += catTotal;
    } else {
      worksTotal += catTotal;
    }

    groups.push({
      category: cat,
      title: CATEGORY_LABELS[cat].title,
      badge: CATEGORY_LABELS[cat].badge,
      description: CATEGORY_LABELS[cat].description,
      totalCost: catTotal,
      items: calculatedItems,
    });
  }

  return {
    groups,
    grandTotal,
    worksTotal,
    materialsTotal,
    wetAreasCost: {
      works: wetAddon.worksAddon,
      materials: wetAddon.materialsAddon,
    },
    finishingMaterialsEstimate,
    wallArea,
    perimeterRatio,
    totalPositions,
    activePositions,
    excludedCount,
    savingsTotal,
  };
}

/**
 * Formats full textual estimate suitable for copying or sending via Telegram
 */
export function formatTextEstimate(
  companyName: string,
  area: number,
  propertyType: PropertyType,
  tariffTitle: string,
  groups: EstimateCategoryGroup[],
  grandTotal: number,
  botUsername?: string
): string {
  const dateStr = new Date().toLocaleDateString('ru-RU');
  let text = `📄 ДЕТАЛИЗИРОВАННАЯ ИНЖЕНЕРНАЯ СМЕТА НА РЕМОНТ\n`;
  text += `Компания: ${companyName}\n`;
  if (botUsername) {
    const cleanBot = botUsername.replace(/^@/, '').trim();
    text += `Telegram-бот компании: @${cleanBot} (https://t.me/${cleanBot}?start=calc_${area})\n`;
  }
  text += `Дата формирования: ${dateStr}\n`;
  text += `Объект: ${area} м² (${propertyType === 'new' ? 'Новостройка' : 'Вторичное жилье'})\n`;
  text += `Тарифный план: ${tariffTitle}\n`;
  text += `=====================================\n\n`;

  for (const g of groups) {
    text += `🔹 ${g.title.toUpperCase()} (Итого: ${g.totalCost.toLocaleString('ru-RU')} ₽)\n`;
    for (const ci of g.items) {
      if (ci.excluded) {
        text += ` • [Исключено клиентом] ${ci.item.title} (экономия ${ci.subtotal.toLocaleString('ru-RU')} ₽)\n`;
      } else {
        text += ` • ${ci.item.title}\n`;
        text += `   Объем: ${ci.quantity} ${ci.item.unit} × ${ci.item.unitPrice.toLocaleString('ru-RU')} ₽ = ${ci.subtotal.toLocaleString('ru-RU')} ₽\n`;
      }
    }
    text += `\n`;
  }

  text += `=====================================\n`;
  text += `💰 ИТОГО ПО СМЕТЕ: ${grandTotal.toLocaleString('ru-RU')} ₽\n`;
  text += `🔒 Все цены фиксируются в приложении к договору.\n`;
  text += `🎁 В подарок: лазерный замер 0 ₽ и 3D-план расстановки мебели!\n`;
  if (botUsername) {
    const cleanBot = botUsername.replace(/^@/, '').trim();
    text += `👉 Открыть и изменить расчёт в боте: https://t.me/${cleanBot}?start=calc_${area}`;
  }

  return text;
}
