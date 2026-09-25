import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CompanyConfig, PricingRules, LeadPayload } from '../types';

// Read env variables safely
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Check if valid URL and Key are provided
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('http') &&
  !supabaseUrl.includes('your-project')
);

// Initialize Supabase client with graceful fallback
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

// Fallback demo companies for instant multi-tenancy testing
export const DEMO_COMPANIES: Record<
  string,
  { company: CompanyConfig; pricing: PricingRules }
> = {
  'remont-pro': {
    company: {
      id: 'remont-pro',
      name: 'РемонтПро',
      subtitle: 'Калькулятор ремонта квартир',
      city: 'Москва и МО',
      phone: '+7 (800) 555-35-35',
      statusText: 'Работаем без предоплаты',
      secondaryCoeff: 1.15,
      logoLetter: 'Р',
      badgeText: 'PRO',
    },
    pricing: {
      cosmeticPrice: 4500,
      capitalPrice: 8500,
      designerPrice: 15000,
      designProjectPrice: 2000,
      demolitionPrice: 1200,
      materialsPrice: 3500,
    },
  },
  'elite-stroi': {
    company: {
      id: 'elite-stroi',
      name: 'ЭлитСтрой Премиум',
      subtitle: 'Дизайнерский ремонт и отделка',
      city: 'Санкт-Петербург',
      phone: '+7 (812) 345-67-89',
      statusText: 'Гарантия 5 лет по ГОСТ',
      secondaryCoeff: 1.20,
      logoLetter: 'Э',
      badgeText: 'ELITE',
    },
    pricing: {
      cosmeticPrice: 5200,
      capitalPrice: 9800,
      designerPrice: 18000,
      designProjectPrice: 2500,
      demolitionPrice: 1500,
      materialsPrice: 4200,
    },
  },
  'master-remonta': {
    company: {
      id: 'master-remonta',
      name: 'МастерРемонт',
      subtitle: 'Надежный ремонт под ключ',
      city: 'Казань',
      phone: '+7 (843) 210-99-88',
      statusText: 'Без скрытых доплат',
      secondaryCoeff: 1.10,
      logoLetter: 'М',
      badgeText: 'МАСТЕР',
    },
    pricing: {
      cosmeticPrice: 3900,
      capitalPrice: 7400,
      designerPrice: 13500,
      designProjectPrice: 1700,
      demolitionPrice: 1000,
      materialsPrice: 3100,
    },
  },
};

export const DEFAULT_COMPANY_ID = 'remont-pro';

/**
 * Extracts company ID from URL search params or Telegram WebApp start_param
 */
export function getCompanyIdFromContext(): string {
  if (typeof window === 'undefined') return DEFAULT_COMPANY_ID;

  const urlParams = new URLSearchParams(window.location.search);
  const fromQuery =
    urlParams.get('company_id') ||
    urlParams.get('company') ||
    urlParams.get('tenant');

  if (fromQuery && fromQuery.trim()) {
    return fromQuery.trim().toLowerCase();
  }

  // Telegram start_param (e.g. t.me/bot?startapp=elite-stroi)
  const tgStartParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
  if (tgStartParam && tgStartParam.trim()) {
    return tgStartParam.trim().toLowerCase();
  }

  return DEFAULT_COMPANY_ID;
}

/**
 * Fetches company configuration and pricing rules from Supabase with robust fallback
 */
export async function fetchCompanyData(companyId: string): Promise<{
  company: CompanyConfig;
  pricing: PricingRules;
  isFromSupabase: boolean;
}> {
  // If Supabase is available, attempt real database fetch
  if (supabase) {
    try {
      // 1. Fetch Company
      const { data: compData, error: compErr } = await supabase
        .from('companies')
        .select('*')
        .eq('id', companyId)
        .maybeSingle();

      if (!compErr && compData) {
        // 2. Fetch Pricing Rules
        const { data: priceData } = await supabase
          .from('pricing_rules')
          .select('*')
          .eq('company_id', companyId)
          .maybeSingle();

        const defaultPricing = DEMO_COMPANIES[DEFAULT_COMPANY_ID].pricing;

        return {
          company: {
            id: compData.id,
            name: compData.name || 'РемонтПро',
            subtitle: compData.subtitle || 'Калькулятор ремонта квартир',
            city: compData.city || 'Москва и МО',
            phone: compData.phone || '+7 (800) 555-35-35',
            statusText: compData.status_text || 'Работаем без предоплаты',
            secondaryCoeff: Number(compData.secondary_coeff) || 1.15,
            logoLetter: compData.logo_letter || compData.name?.[0] || 'Р',
            badgeText: compData.badge_text || 'PRO',
          },
          pricing: {
            cosmeticPrice: Number(priceData?.cosmetic_price) || defaultPricing.cosmeticPrice,
            capitalPrice: Number(priceData?.capital_price) || defaultPricing.capitalPrice,
            designerPrice: Number(priceData?.designer_price) || defaultPricing.designerPrice,
            designProjectPrice: Number(priceData?.design_project_price) || defaultPricing.designProjectPrice,
            demolitionPrice: Number(priceData?.demolition_price) || defaultPricing.demolitionPrice,
            materialsPrice: Number(priceData?.materials_price) || defaultPricing.materialsPrice,
          },
          isFromSupabase: true,
        };
      }
    } catch (err) {
      console.warn('Supabase fetch error, using fallback:', err);
    }
  }

  // Fallback to demo companies
  const found = DEMO_COMPANIES[companyId] || DEMO_COMPANIES[DEFAULT_COMPANY_ID];
  return {
    ...found,
    isFromSupabase: false,
  };
}

/**
 * Saves lead into Supabase `leads` table or local storage fallback
 */
export async function createLead(payload: LeadPayload): Promise<{
  success: boolean;
  leadId: string;
  source: 'supabase' | 'local_demo';
}> {
  const generatedId = 'LEAD-' + Math.floor(100000 + Math.random() * 900000);

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('leads')
        .insert([
          {
            company_id: payload.company_id,
            name: payload.name,
            phone: payload.phone,
            city: payload.city,
            area: payload.area,
            property_type: payload.property_type,
            renovation_class: payload.renovation_class,
            price_min: payload.price_min,
            price_max: payload.price_max,
            total_base_cost: payload.total_base_cost,
            active_options: payload.active_options,
            preferred_date: payload.preferred_date,
            communication: payload.communication,
            comment: payload.comment || null,
            agreement_152fz: payload.agreement_152fz,
            created_at: new Date().toISOString(),
          },
        ])
        .select('id')
        .maybeSingle();

      if (!error) {
        return {
          success: true,
          leadId: data?.id ? String(data.id) : generatedId,
          source: 'supabase',
        };
      }
      console.warn('Supabase leads insert returned error, falling back to local:', error);
    } catch (err) {
      console.warn('Supabase insert failed:', err);
    }
  }

  // Fallback: save lead in localStorage for preview inspection
  try {
    const existingRaw = localStorage.getItem('applet_leads') || '[]';
    const existing = JSON.parse(existingRaw);
    existing.unshift({
      id: generatedId,
      ...payload,
      created_at: new Date().toISOString(),
    });
    localStorage.setItem('applet_leads', JSON.stringify(existing.slice(0, 50)));
  } catch {
    // Ignore storage quota
  }

  return {
    success: true,
    leadId: generatedId,
    source: 'local_demo',
  };
}
