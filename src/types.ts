export type PropertyType = 'new' | 'secondary';

export type PropertySubtype =
  | 'new_concrete'       // Новостройка (Бетон со стенами) — базовый расчёт
  | 'new_whitebox'       // Новостройка (White Box) — без штукатурки и базовой стяжки
  | 'new_open_plan'      // Новостройка (Свободная планировка) — +возведение перегородок
  | 'secondary_standard' // Вторичка типовая (панель/кирпич) — стандартный демонтаж (x1.15)
  | 'old_fund';          // Старый фонд / Сталинка — тяжелый демонтаж, очистка дранки (x1.45)

export type BathroomsCount = 1 | 1.5 | 2 | 3;

export type CeilingHeight = 2.7 | 3.0 | 3.2 | 3.5;

export type KeyStatus =
  | 'ready'         // 🟢 Ключи на руках, готовы показать объект
  | 'in_30_days'    // 🟡 Ключи получаем в течение 30 дней
  | 'construction'; // ⚪ Дом строится / ключи через 2+ мес

export type LeadScoringGrade = 'vip' | 'warm' | 'cold';

export interface LeadScoring {
  score: number; // 0..100
  grade: LeadScoringGrade;
  badge: string; // '🔥 СРОЧНЫЙ (VIP)', '🟡 ТЁПЛЫЙ (КОНСУЛЬТАЦИЯ)', '❄️ ХОЛОДНЫЙ (ПРИЦЕНКА)'
  recommendedAction: string;
  canScheduleVisit: boolean;
  warnings?: string[];
}

export type RenovationClassId = 'cosmetic' | 'capital' | 'designer';

export interface RenovationClass {
  id: RenovationClassId;
  title: string;
  badge?: string;
  pricePerMeter: number;
  popular?: boolean;
  description: string;
  features: string[];
}

export interface AdditionalOption {
  id: 'designProject' | 'demolition' | 'materials';
  title: string;
  subtitle: string;
  pricePerMeter: number;
  iconName: 'Palette' | 'Hammer' | 'PackageCheck';
  enabled: boolean;
}

export interface CalculationResult {
  area: number;
  propertyType: PropertyType;
  propertySubtype: PropertySubtype;
  bathroomsCount: BathroomsCount;
  ceilingHeight: CeilingHeight;
  wallArea: number;
  perimeterRatio: number;
  propertyTypeCoeff: number;
  renovationClass: RenovationClass;
  activeOptions: AdditionalOption[];
  baseWorkCost: number;
  addonsCost: number;
  wetAreasCost: { works: number; materials: number };
  finishingMaterialsEstimate: {
    min: number;
    max: number;
    minPerMeter: number;
    maxPerMeter: number;
  };
  totalCost: number;
  priceMin: number;
  priceMax: number;
  estimatedDays: { min: number; max: number };
}

export interface BookingFormState {
  name: string;
  phone: string;
  address: string;
  date: string;
  communication: 'telegram' | 'call' | 'whatsapp';
  comment: string;
  keyStatus: KeyStatus;
  agreement152fz: boolean;
}

export interface CompanyConfig {
  id: string;
  name: string;
  subtitle?: string;
  city: string;
  phone: string;
  statusText: string;
  secondaryCoeff: number;
  serviceRadius?: string; // Зона присутствия: e.g. "Вся Москва + 15 км от МКАД"
  logoLetter: string;
  badgeText?: string;
  botUsername?: string;
  ownerId?: string | number;
  adminChatId?: string | number;
}

export interface PricingRules {
  cosmeticPrice: number;
  capitalPrice: number;
  designerPrice: number;
  designProjectPrice: number;
  demolitionPrice: number;
  materialsPrice: number;
}

export interface LeadPayload {
  company_id: string;
  name: string;
  phone: string;
  city: string;
  area: number;
  property_type: PropertyType;
  property_subtype?: PropertySubtype;
  bathrooms_count?: number;
  ceiling_height?: number;
  key_status?: KeyStatus;
  lead_score?: number;
  lead_grade?: LeadScoringGrade;
  renovation_class: string;
  price_min: number;
  price_max: number;
  total_base_cost: number;
  active_options: string[];
  preferred_date: string;
  communication: string;
  address?: string;
  comment?: string;
  telegram_username?: string;
  agreement_152fz: boolean;
}

export type EstimateCategoryType =
  | 'demolition'
  | 'rough'
  | 'engineering'
  | 'finishing'
  | 'materials';

export interface EstimateItem {
  id: string;
  category: EstimateCategoryType;
  title: string;
  unit: string; // 'м²', 'пог. м', 'точка', 'шт.', 'комплект'
  quantityRatio: number; // множитель от площади (например 2.6 для стен)
  unitPrice: number; // расценка компании за единицу
  tariffApplicability?: RenovationClassId[];
  description?: string;
}

export interface CalculatedEstimateItem {
  item: EstimateItem;
  quantity: number;
  subtotal: number;
  excluded?: boolean;
}

export interface EstimateCategoryGroup {
  category: EstimateCategoryType;
  title: string;
  badge: string;
  description: string;
  totalCost: number;
  items: CalculatedEstimateItem[];
}

