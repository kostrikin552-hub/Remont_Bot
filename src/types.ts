export type PropertyType = 'new' | 'secondary';

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
  propertyTypeCoeff: number;
  renovationClass: RenovationClass;
  activeOptions: AdditionalOption[];
  baseWorkCost: number;
  addonsCost: number;
  totalCost: number;
  priceMin: number;
  priceMax: number;
  estimatedDays: { min: number; max: number };
}

export interface BookingFormState {
  name: string;
  phone: string;
  date: string;
  communication: 'telegram' | 'call' | 'whatsapp';
  comment: string;
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
  logoLetter: string;
  badgeText?: string;
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
  renovation_class: string;
  price_min: number;
  price_max: number;
  total_base_cost: number;
  active_options: string[];
  preferred_date: string;
  communication: string;
  comment?: string;
  agreement_152fz: boolean;
}
