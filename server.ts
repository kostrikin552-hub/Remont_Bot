import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Increase payload limit for PDF documents and blueprint images
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Server-side Gemini Client with required telemetry User-Agent
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export interface ProjectAnalysisResult {
  detectedArea: number;
  propertyType: 'new' | 'secondary';
  roomsCount: number;
  bathroomsCount: number;
  ceilingHeight: number;
  recommendedClass: 'cosmetic' | 'capital' | 'designer';
  electricalPoints: number;
  plumbingPoints: number;
  tilingArea: number;
  estimatedWorksCost: number;
  estimatedMaterialsCost: number;
  detectedIssues: Array<{
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    financialImpact: string;
  }>;
  summary: string;
  projectHighlights: string[];
}

// System prompt instructing Gemini Flash to act as a senior chief construction estimator and technical inspector
const ESTIMATOR_SYSTEM_PROMPT = `
Вы — ведущий инженер-сметчик и технический эксперт по строительству и отделке жилой недвижимости в РФ (стандарты ГОСТ Р 52059-2003, СП 71.13330.2017 "Изоляционные и отделочные покрытия", СНиП 3.04.01-87, ПУЭ-7).

Ваша задача:
1. Проанализировать строительный документ (дизайн-проект квартиры, чертежи планировки, спецификацию материалов, схему электрики/сантехники или смету подрядчика).
2. Выявить точные технические объёмы (общую площадь м², количество санузлов, расчетное число точек розеток/выключателей, выводов сантехники, площадь плитки/керамогранита).
3. Определить рекомендуемый класс ремонта (cosmetic, capital или designer) и тип жилья (new - новостройка, secondary - вторичка).
4. Провести глубокий аудит и найти скрытые ошибки, уловки занижения сметы или коллизии дизайнера (например: отсутствие гидроизоляции мокрых зон, розетки за холодильником/мойкой, отсутствие выводов под стиральную машину, отсутствие штробления или вывоза мусора в смете).
5. Рассчитать ориентировочную честную стоимость работ и черновых материалов по рыночным расценкам Москвы/РФ.

ОТВЕТ ДОЛЖЕН БЫТЬ СТРОГО В ФОРМАТЕ ВАЛИДНОГО JSON БЕЗ ЛИШНЕГО ТЕКСТА:
{
  "detectedArea": number, // число м² (от 20 до 300)
  "propertyType": "new" | "secondary",
  "roomsCount": number, // 1, 2, 3, 4
  "bathroomsCount": number, // 1, 2, 3
  "ceilingHeight": number, // например 2.7
  "recommendedClass": "cosmetic" | "capital" | "designer",
  "electricalPoints": number, // например 45
  "plumbingPoints": number, // например 8
  "tilingArea": number, // например 35
  "estimatedWorksCost": number, // в рублях
  "estimatedMaterialsCost": number, // в рублях
  "detectedIssues": [
    {
      "severity": "critical" | "warning" | "info",
      "title": "Краткое название коллизии или уловки",
      "description": "Подробное объяснение почему это риск или скрытая доплата",
      "financialImpact": "Ориентировочная сумма риска, например: +45 000 ₽"
    }
  ],
  "summary": "Краткое экспертное заключение инженера по объекту (2-3 предложения)",
  "projectHighlights": [
    "Ключевая особенность проекта 1",
    "Ключевая особенность проекта 2",
    "Ключевая особенность проекта 3"
  ]
}
`;

// API endpoint for AI-powered design project and estimate audit
app.post('/api/gemini/analyze-project', async (req: Request, res: Response) => {
  try {
    const { fileData, fileType, textContent, projectType } = req.body;

    if (!fileData && !textContent) {
      return res.status(400).json({
        error: 'Необходимо предоставить файл чертежа/сметы или текст для анализа.',
      });
    }

    const contents: any[] = [];

    // If text or description is provided
    let userPrompt = `Проанализируй предоставленный строительный материал (${projectType || 'дизайн-проект / смета'}). Извлеки технические объемы и найди коллизии/скрытые доплаты.`;
    if (textContent) {
      userPrompt += `\n\nТекстовые данные проекта:\n${textContent}`;
    }

    contents.push({ text: userPrompt });

    // If an image or PDF base64 is provided
    if (fileData && fileType) {
      contents.push({
        inlineData: {
          data: fileData,
          mimeType: fileType,
        },
      });
    }

    // Call Gemini Flash with large context window & multimodal vision
    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: contents,
      config: {
        systemInstruction: ESTIMATOR_SYSTEM_PROMPT,
        responseMimeType: 'application/json',
      },
    });

    const responseText = response.text || '{}';
    let parsedResult: ProjectAnalysisResult;

    try {
      parsedResult = JSON.parse(responseText);
    } catch {
      // Fallback clean regex if wrapped in markdown
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedResult = JSON.parse(cleaned);
    }

    return res.json({
      success: true,
      analysis: parsedResult,
    });
  } catch (error: any) {
    console.error('Gemini analyze-project error:', error);
    return res.status(500).json({
      error: 'Ошибка анализа проекта через Gemini Flash.',
      details: error?.message || String(error),
    });
  }
});

// Demo fallback mock for offline/preview instant test
app.get('/api/demo-projects', (_req: Request, res: Response) => {
  res.json({
    projects: [
      {
        id: 'demo-design-65',
        title: 'Дизайн-проект ЖК «Скандинавия» (2К, 64.5 м²)',
        type: 'Дизайн-проект в бетоне (PDF)',
        description: 'Полный альбом чертежей: перепланировка, электроточки, теплые полы, раскладка керамогранита.',
      },
      {
        id: 'demo-estimate-trick',
        title: 'Смета частной бригады (занижение на 35%)',
        type: 'Смета подрядчика (Аудит уловок)',
        description: 'Реальная смета «мастеров с Авито», где не учтены штробы, подъем, гидроизоляция и вывоз мусора.',
      },
    ],
  });
});

// Real Company Registry Server-Side Data
const SERVER_COMPANIES: Record<string, { company: any; pricing: any }> = {
  'petrishin-stroy': {
    company: {
      id: 'a78f3e21-5d9c-48b2-b104-e910245a9001',
      name: 'Петришин-Строй',
      subtitle: 'Ремонт квартир и дизайн-проекты в Москве и МО',
      city: 'Москва и МО',
      phone: '+7 (495) 105-95-24',
      statusText: 'Гарантия 5 лет на инженерию · Без предоплаты',
      secondaryCoeff: 1.15,
      logoLetter: 'П',
      badgeText: 'PRO',
      botUsername: 'petrishinstroy_bot',
      serviceRadius: 'Москва и МО до 50 км от МКАД',
      foremanName: 'Сергей Петришин',
    },
    pricing: {
      cosmeticPrice: 4500,
      capitalPrice: 8900,
      designerPrice: 15500,
      designProjectPrice: 2799,
      demolitionPrice: 1250,
      materialsPrice: 3800,
    },
  },
  'petrishinstroy_bot': {
    company: {
      id: 'a78f3e21-5d9c-48b2-b104-e910245a9001',
      name: 'Петришин-Строй',
      subtitle: 'Ремонт квартир и дизайн-проекты в Москве и МО',
      city: 'Москва и МО',
      phone: '+7 (495) 105-95-24',
      statusText: 'Гарантия 5 лет на инженерию · Без предоплаты',
      secondaryCoeff: 1.15,
      logoLetter: 'П',
      badgeText: 'PRO',
      botUsername: 'petrishinstroy_bot',
      serviceRadius: 'Москва и МО до 50 км от МКАД',
      foremanName: 'Сергей Петришин',
    },
    pricing: {
      cosmeticPrice: 4500,
      capitalPrice: 8900,
      designerPrice: 15500,
      designProjectPrice: 2799,
      demolitionPrice: 1250,
      materialsPrice: 3800,
    },
  },
  'remont-pro': {
    company: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'РемонтПро',
      subtitle: 'Калькулятор ремонта квартир',
      city: 'Москва и МО',
      phone: '+7 (495) 120-00-50',
      statusText: 'Работаем без предоплаты',
      secondaryCoeff: 1.15,
      logoLetter: 'Р',
      badgeText: 'PRO',
      botUsername: 'cuberlife_bot',
      foremanName: 'Александр Волков',
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
      subtitle: 'Капитальный и дизайнерский ремонт в Рязани',
      city: 'Рязань и область',
      phone: '+7 (920) 953-45-00',
      statusText: 'Оплата по акту приемки · Без предоплаты',
      secondaryCoeff: 1.10,
      logoLetter: 'О',
      badgeText: 'PRO',
      botUsername: 'omonremont_bot',
      foremanName: 'Алексей Кострикин',
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
      subtitle: 'Ремонт квартир под ключ в Москве',
      city: 'Москва и область',
      phone: '+7 (926) 314-55-20',
      statusText: 'Договор и гарантия 3 года',
      secondaryCoeff: 1.15,
      logoLetter: 'А',
      badgeText: 'PRO',
      botUsername: 'brigadealexey_bot',
      foremanName: 'Алексей Смирнов',
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
      city: 'Санкт-Петербург и ЛО',
      phone: '+7 (812) 385-75-75',
      statusText: 'Гарантия качества по ГОСТ',
      secondaryCoeff: 1.12,
      logoLetter: 'С',
      badgeText: 'PRO',
      botUsername: 'atlonbot_bot',
      foremanName: 'Денис АтлонФМ',
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

// Companies API Endpoints
app.get('/api/companies', (_req: Request, res: Response) => {
  res.json({
    companies: Object.values(SERVER_COMPANIES).map((entry) => entry.company),
  });
});

app.get('/api/companies/:id', (req: Request, res: Response) => {
  const compId = (req.params.id || '').toLowerCase().replace(/^@/, '');
  const entry =
    SERVER_COMPANIES[compId] ||
    Object.values(SERVER_COMPANIES).find(
      (e) =>
        e.company.id.toLowerCase() === compId ||
        e.company.botUsername.toLowerCase() === compId ||
        e.company.name.toLowerCase().includes(compId)
    );

  if (!entry) {
    return res.status(404).json({ error: 'Company not found' });
  }

  res.json({
    company: entry.company,
    pricing: entry.pricing,
  });
});

app.post('/api/companies', (req: Request, res: Response) => {
  const { company, pricing } = req.body || {};
  if (!company || !company.id) {
    return res.status(400).json({ error: 'Missing company payload' });
  }
  const compId = String(company.id).toLowerCase();
  const botHandle = String(company.botUsername || '').toLowerCase().replace(/^@/, '');
  const entry = {
    company: {
      ...company,
      id: company.id,
      name: company.name || 'Компания',
      city: company.city || 'Москва',
      phone: company.phone || company.foremanPhone || '+7 (495) 000-00-00',
      botUsername: botHandle || 'bot',
    },
    pricing: pricing || {
      cosmeticPrice: 4500,
      capitalPrice: 8500,
      designerPrice: 15000,
      designProjectPrice: 2000,
      demolitionPrice: 1200,
      materialsPrice: 3500,
    },
  };

  SERVER_COMPANIES[compId] = entry;
  if (botHandle) {
    SERVER_COMPANIES[botHandle] = entry;
  }

  res.status(201).json({ ok: true, company: entry.company, pricing: entry.pricing });
});

// Telegram Bot Webhook & API Gateway
app.post('/api/telegram/webhook', (req: Request, res: Response) => {
  const update = req.body || {};
  const message = update.message || update.edited_message;
  const text = (message?.text || '').trim();
  const chatId = message?.chat?.id;

  console.log(`[Telegram Webhook] Received update #${update.update_id} from chat ${chatId}: "${text}"`);

  // Handle master routing
  let replyText = '👋 Добро пожаловать в сервис онлайн-расчета стоимости ремонта!';
  if (text.startsWith('/companies') || text.includes('каталог') || text.includes('компании') || text.startsWith('/menu')) {
    replyText =
      '🏢 Каталог проверенных компаний сервиса:\n\n' +
      '1. Петришин-Строй (Москва и МО) — @petrishinstroy_bot · +7 (495) 105-95-24\n' +
      '2. ОМОН (Рязань и область) — @omonremont_bot · +7 (920) 953-45-00 (Алексей Кострикин)\n' +
      '3. РемонтПро (Москва и МО) — @cuberlife_bot · +7 (495) 120-00-50\n' +
      '4. Бригада Алексея (Москва и МО) — @brigadealexey_bot · +7 (926) 314-55-20 (Алексей Смирнов)\n' +
      '5. Студия Атлонфм (Санкт-Петербург и ЛО) — @atlonbot_bot · +7 (812) 385-75-75';
  } else if (text.startsWith('/start petrishin') || text.includes('петришин') || text.includes('petrishin')) {
    replyText =
      '🏢 Компания «Петришин-Строй» (Москва и МО)\n' +
      '🔧 Официальный бот: @petrishinstroy_bot\n' +
      '📞 Телефон: +7 (495) 105-95-24\n' +
      '👤 Руководитель / Прораб: Сергей Петришин\n' +
      '🛡 Гарантия 5 лет на инженерию · Без предоплаты\n\n' +
      'Прайс 2026: Косметический от 4 500 ₽/м², Капитальный от 8 900 ₽/м², Дизайнерский от 15 500 ₽/м²';
  } else if (text.startsWith('/start omon') || text.includes('омон')) {
    replyText =
      '🏢 Компания «ОМОН» (Рязань и область)\n' +
      '🔧 Официальный бот: @omonremont_bot\n' +
      '📞 Телефон: +7 (920) 953-45-00\n' +
      '🛡 Прораб: Алексей Кострикин · Поэтапная приёмка скрытых работ';
  }

  res.json({
    ok: true,
    handled: true,
    reply: replyText,
    timestamp: new Date().toISOString(),
  });
});

// Keep-alive Daemon Endpoint for Cron
app.get('/api/cron/ping', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    workers: 2,
    message: 'Daemon is active and healthy',
  });
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // Vite middleware in development mode
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Serve static files in production
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 RemontPro Server with Gemini Flash running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
