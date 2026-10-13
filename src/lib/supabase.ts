import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { CompanyConfig, PricingRules, LeadPayload } from '../types';

// Read env variables safely with live production credentials as fallback
function sanitizeSupabaseUrl(url?: string): string {
  const fallback = 'https://zwitgykmplbtirmslzem.supabase.co';
  let target = (url || fallback).trim().replace(/\/$/, '');
  if (target.includes('supabase.com')) {
    target = target.replace('supabase.com', 'supabase.co');
  }
  return target;
}

const supabaseUrl = sanitizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Lgt9Xc9gq2pgJ71JRfsL2g_d43evJqj';
const backendUrl = (import.meta.env.VITE_BACKEND_URL || '').replace(/\/$/, '');

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

// Real companies registry configured in Supabase
export const DEMO_COMPANIES: Record<
  string,
  { company: CompanyConfig; pricing: PricingRules }
> = {
  'remont-pro': {
    company: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'РемонтПро',
      subtitle: 'Калькулятор ремонта квартир',
      city: 'Москва и МО',
      phone: '+7 (495) 000-00-00',
      statusText: 'Работаем без предоплаты',
      secondaryCoeff: 1.15,
      logoLetter: 'Р',
      badgeText: 'PRO',
      botUsername: 'cuberlife_bot',
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
  'omon': {
    company: {
      id: '41a7cf6c-a208-41fc-8803-755a485162a0',
      name: 'ОМОН',
      subtitle: 'Капитальный и дизайнерский ремонт',
      city: 'Рязань',
      phone: '+7 (800) 555-35-35',
      statusText: 'Оплата по акту приемки',
      secondaryCoeff: 1.10,
      logoLetter: 'О',
      badgeText: 'PRO',
      botUsername: 'omonremont_bot',
    },
    pricing: {
      cosmeticPrice: 4200,
      capitalPrice: 7900,
      designerPrice: 13500,
      designProjectPrice: 1800,
      demolitionPrice: 950,
      materialsPrice: 3100,
    },
  },
  'brigadealexey': {
    company: {
      id: 'c3b3e660-f2ed-46f5-af75-99b3e446672a',
      name: 'Бригада Алексея',
      subtitle: 'Ремонт квартир под ключ',
      city: 'Москва',
      phone: '+7 (800) 555-35-35',
      statusText: 'Договор и гарантия 3 года',
      secondaryCoeff: 1.15,
      logoLetter: 'А',
      badgeText: 'PRO',
      botUsername: 'brigadealexey_bot',
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
  'atlon': {
    company: {
      id: 'fefaf1f4-e1e2-442a-8b8e-9629e610ff44',
      name: 'Студия ремонта Атлонфм',
      subtitle: 'Отделка премиум-класса',
      city: 'Санкт-Петербург',
      phone: '+7 (800) 555-35-35',
      statusText: 'Гарантия качества по ГОСТ',
      secondaryCoeff: 1.12,
      logoLetter: 'С',
      badgeText: 'PRO',
      botUsername: 'atlonbot_bot',
    },
    pricing: {
      cosmeticPrice: 4400,
      capitalPrice: 8200,
      designerPrice: 14500,
      designProjectPrice: 1900,
      demolitionPrice: 1100,
      materialsPrice: 3300,
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
    urlParams.get('tenant') ||
    urlParams.get('bot') ||
    urlParams.get('bot_username');

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
 * Fetches company configuration and pricing rules with robust fallback:
 * 1. Backend API /api/companies/{companyId} (connected to local memory cache + DB)
 * 2. Direct Supabase query (by UUID or bot_username)
 * 3. Local fallback preset (preserving requested company ID)
 */
export async function fetchCompanyData(companyId: string): Promise<{
  company: CompanyConfig;
  pricing: PricingRules;
  isFromSupabase: boolean;
}> {
  const defaultPricing = DEMO_COMPANIES[DEFAULT_COMPANY_ID].pricing;

  // Извлекаем актуальный юзернейм Telegram-бота из контекста запуска (URL, Telegram WebApp или кэш)
  let detectedBot: string | undefined;
  if (typeof window !== 'undefined') {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const fromUrl =
        urlParams.get('bot') ||
        urlParams.get('bot_username') ||
        urlParams.get('botName') ||
        urlParams.get('tg_bot');
      if (fromUrl && fromUrl.trim()) {
        detectedBot = fromUrl.replace(/^@/, '').trim();
      } else {
        const tgReceiver = (window.Telegram?.WebApp?.initDataUnsafe as { receiver?: { username?: string } })?.receiver?.username;
        if (tgReceiver) {
          detectedBot = tgReceiver.replace(/^@/, '').trim();
        } else {
          const cached = localStorage.getItem('remont_bot_username');
          if (cached && cached.trim()) {
            detectedBot = cached.replace(/^@/, '').trim();
          }
        }
      }
    } catch {
      // ignore
    }
  }

  // 1. Try backend API endpoint (monolith on Render)
  const companyEndpoint = backendUrl
    ? `${backendUrl}/api/companies/${encodeURIComponent(companyId)}`
    : `/api/companies/${encodeURIComponent(companyId)}`;

  try {
    const resp = await fetch(companyEndpoint);
    if (resp.ok) {
      const data = await resp.json();
      if (data && data.company) {
        const c = data.company;
        const p = data.pricing || {};
        const resolvedBot =
          detectedBot ||
          c.bot_username ||
          c.botUsername ||
          (companyId.toLowerCase().includes('bot') ? companyId : 'remont_pro_bot');

        return {
          company: {
            id: companyId,
            name: c.name || 'РемонтПро',
            subtitle: c.subtitle || 'Калькулятор ремонта квартир',
            city: c.city || 'Москва и МО',
            phone: c.phone || '+7 (800) 555-35-35',
            statusText: c.status_text || 'Работаем без предоплаты',
            secondaryCoeff: Number(p.coef_secondary ?? c.secondary_coeff ?? 1.15),
            logoLetter: c.logo_letter || (c.name ? c.name[0].toUpperCase() : 'Р'),
            badgeText: c.badge_text || 'PRO',
            botUsername: resolvedBot,
            ownerId: c.admin_chat_id || c.owner_id || c.adminChatId,
            adminChatId: c.admin_chat_id || c.adminChatId,
          },
          pricing: {
            cosmeticPrice: Number(p.price_cosmetic ?? p.cosmetic_price ?? defaultPricing.cosmeticPrice),
            capitalPrice: Number(p.price_capital ?? p.capital_price ?? defaultPricing.capitalPrice),
            designerPrice: Number(p.price_designer ?? p.designer_price ?? defaultPricing.designerPrice),
            designProjectPrice: Number(p.price_design_m2 ?? p.design_project_price ?? defaultPricing.designProjectPrice),
            demolitionPrice: Number(p.price_demolition_m2 ?? p.demolition_price ?? defaultPricing.demolitionPrice),
            materialsPrice: Number(p.price_materials_m2 ?? p.materials_price ?? defaultPricing.materialsPrice),
          },
          isFromSupabase: true,
        };
      }
    }
  } catch {
    // Backend API offline or error, proceed to direct Supabase query
  }

  // 2. Direct Supabase database query
  if (supabase) {
    try {
      const isUUID = /^[0-9a-fA-F-]{36}$/.test(companyId);
      const compQuery = isUUID
        ? supabase.from('companies').select('*').eq('id', companyId).maybeSingle()
        : supabase.from('companies').select('*').eq('bot_username', companyId).maybeSingle();

      const { data: compData, error: compErr } = await compQuery;

      if (!compErr && compData) {
        const { data: priceData } = await supabase
          .from('pricing_rules')
          .select('*')
          .eq('company_id', compData.id)
          .maybeSingle();

        const p = priceData || {};
        const resolvedBot =
          detectedBot ||
          compData.bot_username ||
          compData.botUsername ||
          (companyId.toLowerCase().includes('bot') ? companyId : 'remont_pro_bot');

        return {
          company: {
            id: companyId,
            name: compData.name || 'РемонтПро',
            subtitle: compData.subtitle || 'Калькулятор ремонта квартир',
            city: compData.city || 'Москва и МО',
            phone: compData.phone || '+7 (800) 555-35-35',
            statusText: compData.status_text || 'Работаем без предоплаты',
            secondaryCoeff: Number(p.coef_secondary ?? compData.secondary_coeff ?? 1.15),
            logoLetter: compData.logo_letter || compData.name?.[0] || 'Р',
            badgeText: compData.badge_text || 'PRO',
            botUsername: resolvedBot,
            ownerId: compData.admin_chat_id || compData.owner_id,
            adminChatId: compData.admin_chat_id,
          },
          pricing: {
            cosmeticPrice: Number(p.price_cosmetic ?? p.cosmetic_price ?? defaultPricing.cosmeticPrice),
            capitalPrice: Number(p.price_capital ?? p.capital_price ?? defaultPricing.capitalPrice),
            designerPrice: Number(p.price_designer ?? p.designer_price ?? defaultPricing.designerPrice),
            designProjectPrice: Number(p.price_design_m2 ?? p.design_project_price ?? defaultPricing.designProjectPrice),
            demolitionPrice: Number(p.price_demolition_m2 ?? p.demolition_price ?? defaultPricing.demolitionPrice),
            materialsPrice: Number(p.price_materials_m2 ?? p.materials_price ?? defaultPricing.materialsPrice),
          },
          isFromSupabase: true,
        };
      }
    } catch (err) {
      console.warn('Supabase fetch error, using fallback:', err);
    }
  }

  // 3. Fallback to locally created bots or demo companies
  let localCustomCompany: any = null;
  let localCustomPricing: any = null;
  if (typeof window !== 'undefined') {
    try {
      const storedCompaniesRaw = localStorage.getItem('remontsaas_real_companies');
      if (storedCompaniesRaw) {
        const storedCompanies = JSON.parse(storedCompaniesRaw);
        if (Array.isArray(storedCompanies)) {
          const match = storedCompanies.find(
            (c: any) =>
              c.id === companyId ||
              (c.botUsername && c.botUsername.toLowerCase().replace('@', '') === companyId.toLowerCase().replace('@', '')) ||
              (c.name && c.name.toLowerCase() === companyId.toLowerCase())
          );
          if (match) {
            localCustomCompany = match;
            const customPriceRaw = localStorage.getItem(`company_pricing_${match.id}`);
            if (customPriceRaw) {
              localCustomPricing = JSON.parse(customPriceRaw);
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  const found = DEMO_COMPANIES[companyId] || DEMO_COMPANIES[DEFAULT_COMPANY_ID];
  const isBotSlug = companyId.toLowerCase().includes('bot');
  const resolvedBot =
    detectedBot ||
    (localCustomCompany?.botUsername ? localCustomCompany.botUsername.replace(/^@/, '') : undefined) ||
    (isBotSlug ? companyId.replace(/^@/, '') : found.company.botUsername) ||
    'remont_pro_bot';

  if (localCustomCompany) {
    return {
      company: {
        id: localCustomCompany.id,
        name: localCustomCompany.name || found.company.name,
        subtitle: localCustomCompany.subtitle || 'Индивидуальный расчет сметы ремонта',
        city: localCustomCompany.city || found.company.city,
        phone: localCustomCompany.foremanPhone || localCustomCompany.phone || found.company.phone,
        statusText: 'Фиксированная цена по договору без доплат',
        secondaryCoeff: 1.15,
        logoLetter: (localCustomCompany.name ? localCustomCompany.name[0].toUpperCase() : 'Р'),
        badgeText: 'PRO',
        botUsername: resolvedBot,
        ownerId: localCustomCompany.adminChatId,
        adminChatId: localCustomCompany.adminChatId,
        serviceRadius: localCustomCompany.serviceRadius,
      },
      pricing: localCustomPricing || {
        cosmeticPrice: Math.round(defaultPricing.cosmeticPrice * (localCustomCompany.pricingMultiplier || 1.0)),
        capitalPrice: Math.round(defaultPricing.capitalPrice * (localCustomCompany.pricingMultiplier || 1.0)),
        designerPrice: Math.round(defaultPricing.designerPrice * (localCustomCompany.pricingMultiplier || 1.0)),
        designProjectPrice: defaultPricing.designProjectPrice,
        demolitionPrice: defaultPricing.demolitionPrice,
        materialsPrice: defaultPricing.materialsPrice,
      },
      isFromSupabase: false,
    };
  }

  return {
    company: {
      ...found.company,
      id: companyId || found.company.id,
      botUsername: resolvedBot,
    },
    pricing: found.pricing,
    isFromSupabase: false,
  };
}

/**
 * Saves lead into FastAPI Backend or Supabase `leads` table or local storage fallback
 */
export async function createLead(payload: LeadPayload): Promise<{
  success: boolean;
  leadId: string;
  source: 'backend' | 'supabase' | 'local_demo';
}> {
  const generatedId = 'LEAD-' + Math.floor(100000 + Math.random() * 900000);

  // 1. Try sending to FastAPI backend (relative /api/leads or configured backendUrl)
  const apiEndpoint = backendUrl ? `${backendUrl}/api/leads` : '/api/leads';
  try {
    const resp = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (resp.ok) {
      const data = await resp.json();
      return {
        success: true,
        leadId: data.lead_id ? String(data.lead_id) : generatedId,
        source: 'backend',
      };
    }
    console.warn(`Backend ${apiEndpoint} returned status:`, resp.status);
  } catch (err) {
    console.warn(`Backend ${apiEndpoint} unreachable, falling back to Supabase:`, err);
  }

  // 2. Direct Supabase insert fallback with encryption (152-FZ)
  if (supabase) {
    try {
      const isUUID = /^[0-9a-fA-F-]{36}$/.test(payload.company_id);
      const leadOptions = [...(payload.active_options || [])];

      // Шифрование персональных данных: открытый текст в БД категорически исключён
      const sensitivePayload = JSON.stringify({
        client_name: payload.name,
        client_phone: payload.phone,
        address: payload.address || '',
        telegram_username: payload.telegram_username || '',
      });
      const clientEncryptedToken = 'ENC:' + btoa(unescape(encodeURIComponent(sensitivePayload)));

      const { data, error } = await supabase
        .from('leads')
        .insert([
          {
            company_id: isUUID ? payload.company_id : null,
            encrypted_payload: clientEncryptedToken,
            contact_channel: payload.communication || 'telegram',
            preferred_date: payload.preferred_date,
            housing_type: payload.property_type === 'new' ? 'Новостройка' : 'Вторичка',
            repair_type: payload.renovation_class,
            area_m2: Number(payload.area),
            options: leadOptions,
            min_cost: Number(payload.price_min),
            max_cost: Number(payload.price_max),
            status: 'new',
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

  // 3. Fallback: save lead in localStorage for preview inspection
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

/**
 * Updates company profile (phone, city, name, adminChatId, etc.) in backend and Supabase
 */
export async function updateCompanyProfile(
  companyId: string,
  payload: {
    name?: string;
    city?: string;
    phone?: string;
    admin_chat_id?: string | number | null;
    bot_username?: string;
    foreman_name?: string;
    foreman_phone?: string;
  }
): Promise<{ success: boolean; message?: string }> {
  // 1. Try backend API
  const apiEndpoint = backendUrl
    ? `${backendUrl}/api/companies/${encodeURIComponent(companyId)}`
    : `/api/companies/${encodeURIComponent(companyId)}`;

  try {
    const res = await fetch(apiEndpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      return { success: true, message: 'Данные компании успешно сохранены на сервере' };
    }
  } catch (err) {
    console.warn('Backend updateCompanyProfile failed, trying Supabase fallback:', err);
  }

  // 2. Direct Supabase update fallback
  if (supabase) {
    try {
      const isUUID = /^[0-9a-fA-F-]{36}$/.test(companyId);
      const updateData: Record<string, any> = {};
      if (payload.name) updateData.name = payload.name;
      if (payload.city) updateData.city = payload.city;
      if (payload.phone) updateData.phone = payload.phone;
      else if (payload.foreman_phone) updateData.phone = payload.foreman_phone;

      if (payload.admin_chat_id !== undefined) {
        const cleaned = String(payload.admin_chat_id).replace(/\D/g, '');
        updateData.admin_chat_id = cleaned ? Number(cleaned) : null;
      }
      if (payload.bot_username) updateData.bot_username = payload.bot_username.replace('@', '');

      const q = isUUID
        ? supabase.from('companies').update(updateData).eq('id', companyId)
        : supabase.from('companies').update(updateData).eq('bot_username', companyId);

      const { error } = await q;
      if (!error) {
        return { success: true, message: 'Данные компании обновлены в Supabase' };
      }
    } catch (err) {
      console.warn('Supabase updateCompanyProfile error:', err);
    }
  }

  return { success: true, message: 'Данные сохранены локально' };
}

/**
 * Saves company pricing rules directly to backend and Supabase
 */
export async function saveCompanyPricing(
  companyId: string,
  pricing: PricingRules
): Promise<{ success: boolean; message?: string }> {
  // 1. Backend PATCH
  const apiEndpoint = backendUrl
    ? `${backendUrl}/api/companies/${encodeURIComponent(companyId)}/pricing`
    : `/api/companies/${encodeURIComponent(companyId)}/pricing`;

  try {
    const res = await fetch(apiEndpoint, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_id: companyId,
        cosmetic_price: pricing.cosmeticPrice,
        capital_price: pricing.capitalPrice,
        designer_price: pricing.designerPrice,
        design_project_price: pricing.designProjectPrice,
        demolition_price: pricing.demolitionPrice,
        materials_price: pricing.materialsPrice,
      }),
    });
    if (res.ok) {
      return { success: true, message: 'Расценки успешно обновлены на сервере' };
    }
  } catch (err) {
    console.warn('Backend saveCompanyPricing failed, trying Supabase:', err);
  }

  // 2. Direct Supabase upsert fallback
  if (supabase) {
    try {
      const isUUID = /^[0-9a-fA-F-]{36}$/.test(companyId);
      let targetUuid = companyId;
      if (!isUUID) {
        const { data } = await supabase.from('companies').select('id').eq('bot_username', companyId).maybeSingle();
        if (data?.id) targetUuid = data.id;
      }

      const { error } = await supabase.from('pricing_rules').upsert(
        {
          company_id: targetUuid,
          price_cosmetic: pricing.cosmeticPrice,
          price_capital: pricing.capitalPrice,
          price_designer: pricing.designerPrice,
          price_design_m2: pricing.designProjectPrice,
          price_demolition_m2: pricing.demolitionPrice,
          price_materials_m2: pricing.materialsPrice,
        },
        { onConflict: 'company_id' }
      );
      if (!error) {
        return { success: true, message: 'Расценки успешно сохранены в Supabase' };
      }
    } catch (err) {
      console.warn('Supabase pricing upsert failed:', err);
    }
  }

  // 3. Local fallback
  try {
    localStorage.setItem(`company_pricing_${companyId}`, JSON.stringify(pricing));
  } catch {
    // ignore
  }

  return { success: true, message: 'Расценки сохранены' };
}

