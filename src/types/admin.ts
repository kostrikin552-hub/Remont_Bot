import { KeyStatus, LeadScoringGrade, PropertySubtype } from '../types';

export interface TenantCompany {
  id: string;
  name: string;
  city: string;
  foremanName: string;
  foremanPhone: string;
  foremanTg: string;
  botUsername: string;
  subscriptionStatus: 'active' | 'trial' | 'expired';
  daysLeft: number;
  trialLeadsLeft: number;
  totalLeads: number;
  revenueEst: number;
  registeredAt: string;
  isBlocked: boolean;
  webhookStatus: 'healthy' | 'error' | 'warning';
  webhookError?: string;
  pricingMultiplier: number;
  serviceRadius?: string; // Зона обслуживания (например "Вся Москва + 15 км от МКАД")
}

export interface LiveLead {
  id: string;
  createdAt: string;
  companyId: string;
  companyName: string;
  customerName: string;
  phone: string;
  telegramUsername?: string;
  isUnlocked: boolean;
  city: string;
  address: string;
  area: number;
  propertySubtype?: PropertySubtype;
  bathroomsCount?: number;
  ceilingHeight?: number;
  keyStatus?: KeyStatus;
  leadScore?: number;
  leadGrade?: LeadScoringGrade;
  isVisitAllowed?: boolean;
  scoringWarning?: string;
  renovationClass: 'Косметический' | 'Капитальный' | 'Дизайнерский';
  estimateTotal: number;
  savingsTotal: number;
  rooms: string;
  status: 'new' | 'contacted' | 'measuring_scheduled' | 'contract_signed';
  breakdown: {
    category: string;
    name: string;
    qty: string;
    total: number;
  }[];
}

export interface BroadcastTemplate {
  id: string;
  name: string;
  segment: 'all' | 'active' | 'trial' | 'expiring_3d';
  text: string;
  buttonText?: string;
  buttonUrl?: string;
  sentAt?: string;
  deliveredCount?: number;
}

export interface GostPriceCatalogItem {
  id: string;
  category: string;
  name: string;
  unit: string;
  baseCost: number; // руб/ед
  description: string;
  gostCode: string;
}

export interface SaasStats {
  mrr: number;
  mrrGrowth: number;
  activeCompanies: number;
  trialCompanies: number;
  leadsToday: number;
  leadsMonth: number;
  totalEstimatesSum: number;
  webhooksTotal: number;
  webhooksHealthy: number;
  webhooksWarning: number;
}

// ---------------------------------------------------------------------------
// Мониторинг ошибок и состояния инфраструктуры (Health & Error Monitoring)
// ---------------------------------------------------------------------------
export type SystemServiceStatus = 'operational' | 'degraded' | 'outage';

export interface SystemServiceNode {
  id: string;
  name: string;
  category: 'telegram' | 'database' | 'api' | 'payment' | 'storage';
  status: SystemServiceStatus;
  latencyMs: number;
  uptime24h: number;
  lastChecked: string;
  details: string;
}

export type ErrorSeverity = 'critical' | 'warning' | 'info';

export interface SystemErrorLog {
  id: string;
  timestamp: string;
  service: string;
  severity: ErrorSeverity;
  message: string;
  companyId?: string;
  companyName?: string;
  statusCode?: number;
  stackTrace?: string;
  resolved: boolean;
}
