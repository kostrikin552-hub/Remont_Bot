"""
Политика конфиденциальности и обработки персональных данных (Федеральный закон № 152-ФЗ РФ).
Включает:
- Указание Оператора: Самозанятый Кострикин Алексей Алексеевич, ИНН: 711380053758, email: kostrikin552@gmail.com
- Текст согласия: «Нажимая кнопку, вы даете согласие на обработку персональных данных...»
- Цели, состав данных, сроки хранения, права субъекта, порядок отзыва согласия.
"""

PRIVACY_SUMMARY_TEXT = (
    "🔒 <b>ПОЛИТИКА ОБРАБОТКИ ПЕРСОНАЛЬНЫХ ДАННЫХ (152-ФЗ РФ)</b>\n\n"
    "👤 <b>Оператор персональных данных:</b>\n"
    "Самозанятый Кострикин Алексей Алексеевич (Плательщик НПД)\n"
    "ИНН: <code>711380053758</code>\n"
    "Email: <code>kostrikin552@gmail.com</code>\n\n"
    "📝 <b>Текст согласия субъекта персональных данных:</b>\n"
    "<i>«Нажимая кнопку, вы даете согласие на обработку персональных данных "
    "в соответствии с Федеральным законом № 152-ФЗ и Политикой конфиденциальности платформы».</i>\n\n"
    "🎯 <b>Цели обработки:</b>\n"
    "• Автоматический расчёт сметы и подбор оптимального класса ремонта;\n"
    "• Связь дежурного инженера для согласования удобного времени бесплатного замера;\n"
    "• Направление коммерческого предложения и PDF-сметы в Telegram.\n\n"
    "🛡 <b>Защита данных:</b> Данные передаются по зашифрованному протоколу SSL/TLS и не передаются третьим лицам.\n\n"
    "Полная версия документа доступна по ссылке ниже:"
)


def get_privacy_policy_html(
    company_name: str = "РемонтПро",
    operator_name: str = "Самозанятый Кострикин Алексей Алексеевич",
    operator_inn: str = "711380053758",
    support_email: str = "kostrikin552@gmail.com",
) -> str:
    """Генерирует официальную веб-страницу Политики конфиденциальности по 152-ФЗ РФ"""
    return f"""<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Политика конфиденциальности и обработки персональных данных (152-ФЗ) — {company_name}</title>
  <meta name="description" content="Политика обработки персональных данных сервиса {company_name} в соответствии с Федеральным законом № 152-ФЗ РФ.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    :root {{
      --primary: #0f172a;
      --accent: #2563eb;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --border: #e2e8f0;
      --text-main: #0f172a;
      --text-muted: #475569;
      --highlight: #eff6ff;
      --highlight-border: #3b82f6;
    }}
    @media (prefers-color-scheme: dark) {{
      :root {{
        --primary: #f8fafc;
        --accent: #60a5fa;
        --bg: #09090b;
        --card-bg: #18181b;
        --border: #27272a;
        --text-main: #f4f4f5;
        --text-muted: #a1a1aa;
        --highlight: #172554;
        --highlight-border: #2563eb;
      }}
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background-color: var(--bg);
      color: var(--text-main);
      line-height: 1.65;
      padding: 24px 16px;
    }}
    .container {{
      max-width: 860px;
      margin: 0 auto;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 24px;
      padding: 36px 32px;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05);
    }}
    @media (max-width: 640px) {{
      .container {{ padding: 24px 18px; border-radius: 16px; }}
    }}
    header {{
      border-bottom: 2px solid var(--border);
      padding-bottom: 24px;
      margin-bottom: 28px;
    }}
    .badge {{
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      padding: 4px 10px;
      border-radius: 9999px;
      background: rgba(37, 99, 235, 0.1);
      color: var(--accent);
      margin-bottom: 12px;
    }}
    h1 {{
      font-size: 24px;
      font-weight: 800;
      line-height: 1.3;
      margin-bottom: 8px;
      color: var(--text-main);
    }}
    .date {{ font-size: 13px; color: var(--text-muted); }}
    .operator-card {{
      background: var(--highlight);
      border: 1px solid var(--highlight-border);
      border-radius: 16px;
      padding: 20px;
      margin: 24px 0 28px 0;
    }}
    .operator-card h3 {{
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 10px;
      color: var(--accent);
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .operator-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 12px;
      font-size: 13px;
    }}
    .operator-item strong {{
      display: block;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 2px;
    }}
    .consent-banner {{
      background: rgba(16, 185, 129, 0.08);
      border-left: 4px solid #10b981;
      padding: 16px 20px;
      border-radius: 12px;
      margin-bottom: 28px;
      font-size: 13.5px;
      font-weight: 600;
    }}
    section {{ margin-bottom: 26px; }}
    h2 {{
      font-size: 16px;
      font-weight: 700;
      margin-bottom: 10px;
      color: var(--text-main);
    }}
    p, li {{
      font-size: 14px;
      color: var(--text-muted);
      margin-bottom: 10px;
    }}
    ul {{ padding-left: 20px; margin-bottom: 12px; }}
    li {{ margin-bottom: 6px; }}
    strong {{ color: var(--text-main); }}
    .btn-print {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 600;
      background: var(--border);
      color: var(--text-main);
      border: none;
      border-radius: 8px;
      cursor: pointer;
      text-decoration: none;
      margin-top: 16px;
    }}
    .btn-print:hover {{ opacity: 0.85; }}
    footer {{
      border-top: 1px solid var(--border);
      padding-top: 20px;
      margin-top: 36px;
      font-size: 12px;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 12px;
    }}
    @media print {{
      body {{ background: #fff; color: #000; padding: 0; }}
      .container {{ border: none; box-shadow: none; padding: 0; max-width: 100%; }}
      .btn-print, .no-print {{ display: none !important; }}
    }}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <span class="badge">152-ФЗ РФ</span>
      <h1>ПОЛИТИКА В ОТНОШЕНИИ ОБРАБОТКИ ПЕРСОНАЛЬНЫХ ДАННЫХ</h1>
      <div class="date">Редакция от 1 января 2026 г. • Платформа «{company_name}»</div>
      <button class="btn-print no-print" onclick="window.print()">🖨 Распечатать / Сохранить в PDF</button>
    </header>

    <!-- Карточка Оператора (ФИО и ИНН самозанятого) -->
    <div class="operator-card">
      <h3>🛡 Реквизиты оператора персональных данных</h3>
      <div class="operator-grid">
        <div class="operator-item">
          <strong>Оператор (ФИО):</strong>
          <span>{operator_name}</span>
        </div>
        <div class="operator-item">
          <strong>Статус:</strong>
          <span>Самозанятый (Плательщик НПД)</span>
        </div>
        <div class="operator-item">
          <strong>ИНН самозанятого:</strong>
          <span><code>{operator_inn}</code></span>
        </div>
        <div class="operator-item">
          <strong>Email для обращений:</strong>
          <span><a href="mailto:{support_email}">{support_email}</a></span>
        </div>
      </div>
    </div>

    <!-- Текст согласия -->
    <div class="consent-banner">
      «Нажимая кнопку, вы даете согласие на обработку персональных данных в соответствии с Федеральным законом № 152-ФЗ и настоящей Политикой конфиденциальности».
    </div>

    <section>
      <h2>1. ОБЩИЕ ПОЛОЖЕНИЯ</h2>
      <p>1.1. Настоящая Политика обработки персональных данных составлена в строгом соответствии с требованиями Федерального закона от 27.07.2006 № 152-ФЗ «О персональных данных» и определяет порядок обработки персональных данных и меры по обеспечению безопасности персональных данных, предпринимаемые Оператором ({operator_name}, ИНН {operator_inn}).</p>
      <p>1.2. Оператор ставит важнейшей целью и условием осуществления своей деятельности соблюдение прав и свобод человека и гражданина при обработке его персональных данных, в том числе защиты прав на неприкосновенность частной жизни, личную и семейную тайну.</p>
    </section>

    <section>
      <h2>2. ПЕРЕЧЕНЬ ОБРАБАТЫВАЕМЫХ ПЕРСОНАЛЬНЫХ ДАННЫХ</h2>
      <p>2.1. Оператор осуществляет обработку следующих персональных данных Пользователя, предоставляемых при заполнении форм калькулятора сметы и записи на замер:</p>
      <ul>
        <li>Фамилия, имя, отчество (или имя);</li>
        <li>Номер контактного телефона;</li>
        <li>Параметры объекта ремонта (площадь объекта в м², тип жилья — новостройка или вторичное, выбранный класс ремонта, перечень опций и дополнительных работ);</li>
        <li>Предпочтительный канал связи (Telegram, звонок, WhatsApp);</li>
        <li>Желаемая дата и время выезда инженера-сметчика на объект.</li>
      </ul>
    </section>

    <section>
      <h2>3. ЦЕЛИ ОБРАБОТКИ ПЕРСОНАЛЬНЫХ ДАННЫХ</h2>
      <p>3.1. Персональные данные обрабатываются исключительно в следующих законных целях:</p>
      <ul>
        <li>Расчёт детальной стоимости ремонтно-отделочных работ и формирование интерактивной онлайн-сметы;</li>
        <li>Связь дежурного специалиста/инженера-сметчика с Пользователем для согласования бесплатного замера;</li>
        <li>Генерация официальной PDF-сметы по ГОСТ и отправка коммерческого предложения в чат Telegram;</li>
        <li>Консультирование Пользователя по технологиям ремонта, материалам и этапам работ.</li>
      </ul>
    </section>

    <section>
      <h2>4. ПРАВОВЫЕ ОСНОВАНИЯ ОБРАБОТКИ</h2>
      <p>4.1. Правовыми основаниями обработки персональных данных являются: ст. 6 и ст. 9 Федерального закона № 152-ФЗ «О персональных данных», а также согласие Пользователя, выражаемое путем совершения конклюдентных действий при нажатии кнопки отправки заявки / фиксации сметы.</p>
    </section>

    <section>
      <h2>5. БЕЗОПАСНОСТЬ И КОНФИДЕНЦИАЛЬНОСТЬ</h2>
      <p>5.1. Безопасность персональных данных обеспечивается применением правовых, организационных и технических мер защиты (шифрование каналов передачи данных SSL/TLS, ограничение доступа, парольная защита баз данных).</p>
      <p>5.2. Персональные данные Пользователя ни при каких условиях не передаются третьим лицам, за исключением случаев, прямо установленных законодательством РФ.</p>
    </section>

    <section>
      <h2>6. СРОК ОБРАБОТКИ И ПОРЯДОК ОТЗЫВА СОГЛАСИЯ</h2>
      <p>6.1. Согласие на обработку персональных данных действует с момента его предоставления до достижения целей обработки либо до момента отзыва согласия Пользователем.</p>
      <p>6.2. Пользователь может в любой момент отозвать свое согласие на обработку персональных данных, направив письменное уведомление на электронную почту Оператора: <strong>{support_email}</strong> с темой «Отзыв согласия на обработку персональных данных».</p>
    </section>

    <footer>
      <div>© 2026 {company_name}. Оператор: {operator_name} (ИНН {operator_inn})</div>
      <div>152-ФЗ «О персональных данных»</div>
    </footer>
  </div>
</body>
</html>
"""
