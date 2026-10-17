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
