import os
import io
import re
from datetime import datetime
from typing import Dict, Any, List, Optional

logger_defined = False
try:
    import logging
    logger = logging.getLogger("pdf_generator")
    logger_defined = True
except Exception:
    pass

# Попытка подключить reportlab
HAS_REPORTLAB = False
try:
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.platypus import (
        SimpleDocTemplate,
        Paragraph,
        Spacer,
        Table,
        TableStyle,
        KeepTogether,
        HRFlowable,
    )
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    HAS_REPORTLAB = True
except ImportError:
    HAS_REPORTLAB = False


import threading

_FONTS_LOCK = threading.Lock()
_FONTS_REGISTERED = False
_CACHED_REGULAR_FONT = "Helvetica"
_CACHED_BOLD_FONT = "Helvetica-Bold"


def _register_fonts():
    """Потокобезопасно регистрирует шрифты с поддержкой кириллицы (FreeSans или DejaVuSans)"""
    global _FONTS_REGISTERED, _CACHED_REGULAR_FONT, _CACHED_BOLD_FONT

    if not HAS_REPORTLAB:
        return "Helvetica", "Helvetica-Bold"

    if _FONTS_REGISTERED:
        return _CACHED_REGULAR_FONT, _CACHED_BOLD_FONT

    with _FONTS_LOCK:
        if _FONTS_REGISTERED:
            return _CACHED_REGULAR_FONT, _CACHED_BOLD_FONT

        candidate_fonts = [
            # 1. Локальные шрифты в проекте
            (
                os.path.join(os.path.dirname(__file__), "fonts", "FreeSans.ttf"),
                os.path.join(os.path.dirname(__file__), "fonts", "FreeSansBold.ttf"),
            ),
            # 2. Системные шрифты Linux
            (
                "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
                "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
            ),
            (
                "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
                "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            ),
        ]

        for regular_path, bold_path in candidate_fonts:
            if os.path.exists(regular_path):
                try:
                    regular_name = "CustomCyrillic"
                    bold_name = "CustomCyrillicBold" if os.path.exists(bold_path) else regular_name
                    try:
                        pdfmetrics.getFont(regular_name)
                    except KeyError:
                        pdfmetrics.registerFont(TTFont(regular_name, regular_path))

                    if os.path.exists(bold_path):
                        try:
                            pdfmetrics.getFont(bold_name)
                        except KeyError:
                            pdfmetrics.registerFont(TTFont(bold_name, bold_path))

                    _CACHED_REGULAR_FONT = regular_name
                    _CACHED_BOLD_FONT = bold_name
                    _FONTS_REGISTERED = True
                    return _CACHED_REGULAR_FONT, _CACHED_BOLD_FONT
                except Exception as e:
                    if logger_defined:
                        logger.debug(f"Ошибка загрузки шрифта {regular_path}: {e}")

        _CACHED_REGULAR_FONT = "Helvetica"
        _CACHED_BOLD_FONT = "Helvetica-Bold"
        _FONTS_REGISTERED = True
        return _CACHED_REGULAR_FONT, _CACHED_BOLD_FONT


def generate_estimate_pdf(lead: Dict[str, Any], company: Optional[Dict[str, Any]] = None) -> bytes:
    """
    Генерирует официальный PDF-документ подробной сметы с расчетом всех работ,
    материалов, контактных данных заказчика и компании.
    Возвращает байты PDF.
    """
    company = company or {}
    company_name = company.get("name") or "Строительная компания"
    company_subtitle = company.get("subtitle") or "Калькулятор ремонта квартир"
    company_city = company.get("city") or "Москва и МО"
    company_phone = company.get("phone") or "+7 (800) 555-35-35"

    lead_id = str(lead.get("id") or lead.get("lead_id") or "LEAD-000000")
    client_name = lead.get("client_name") or lead.get("name") or "Заказчик"
    client_phone = lead.get("client_phone") or lead.get("phone") or ""
    client_address = lead.get("address") or "г. Москва (уточняется на замере)"
    pref_date = lead.get("preferred_date") or "В ближайшее время"
    contact_channel = lead.get("contact_channel") or lead.get("communication") or "telegram"
    housing_type = lead.get("housing_type") or ("Новостройка" if lead.get("property_type") == "new" else "Вторичка")
    renovation_class = lead.get("repair_type") or lead.get("renovation_class") or "Капитальный"

    try:
        area_m2 = float(lead.get("area_m2") or lead.get("area") or 50.0)
    except Exception:
        area_m2 = 50.0

    min_cost = float(lead.get("min_cost") or lead.get("price_min") or 0.0)
    max_cost = float(lead.get("max_cost") or lead.get("price_max") or 0.0)
    total_cost = float(lead.get("total_base_cost") or max_cost or min_cost or (area_m2 * 9000))

    options = lead.get("options") or lead.get("active_options") or []
    clean_options = []
    for opt in options:
        opt_str = str(opt).strip()
        if opt_str.startswith("Адрес:"):
            client_address = opt_str.replace("Адрес:", "").strip()
        else:
            clean_options.append(opt_str)

    # 1. Формируем подробный перечень работ по СНиП / ГОСТ
    is_secondary = "вторич" in housing_type.lower()
    is_designer = "дизайн" in renovation_class.lower()
    is_cosmetic = "космет" in renovation_class.lower()

    # Тарифные коэффициенты
    base_rate = 14500 if is_designer else (5500 if is_cosmetic else 9500)
    sec_coeff = 1.15 if is_secondary else 1.0

    materials_ratio = 0.35  # Черновые материалы ~ 35% от сметы
    works_total = int(round(total_cost * (1 - materials_ratio)))
    materials_total = int(round(total_cost * materials_ratio))
    grand_total = works_total + materials_total

    # Таблица позиций сметы
    categories = [
        {
            "category": "1. ДЕМОНТАЖНЫЕ И ПОДГОТОВИТЕЛЬНЫЕ РАБОТЫ",
            "items": [
                ("Очистка и обеспыливание оснований (стены, пол)", "м²", area_m2 * 2.6, 90),
                ("Демонтаж старых покрытий и плинтусов", "м²", area_m2 * 1.0, 180) if is_secondary else ("Снятие временных защитных покрытий застройщика", "м²", area_m2 * 0.5, 95),
                ("Погрузка и вынос строительного мусора в контейнер", "компл.", 1.0, 8500 if is_secondary else 4500),
            ]
        },
        {
            "category": "2. ОБЩЕСТРОИТЕЛЬНЫЕ И ЧЕРНОВЫЕ РАБОТЫ",
            "items": [
                ("Грунтовка стен и потолков глубокого проникновения (2 слоя)", "м²", area_m2 * 2.6, 95),
                ("Штукатурка стен по лазерным маякам с выведением углов 90°", "м²", area_m2 * 2.6, 680),
                ("Устройство полусухой стяжки пола с фиброволокном", "м²", area_m2 * 1.0, 590),
                ("Обмазочная гидроизоляция санузла с заходом на стены", "м²", max(12.0, area_m2 * 0.35), 480),
            ]
        },
        {
            "category": "3. ИНЖЕНЕРНЫЕ СЕТИ (ЭЛЕКТРИКА И САНТЕХНИКА)",
            "items": [
                ("Штробление и прокладка негорючего кабеля ГОСТ ВВГнг-LS в гофре", "пог. м", area_m2 * 3.2, 210),
                ("Высверливание подрозетников и установка стаканов", "точек", max(18.0, area_m2 * 0.8), 490),
                ("Сборка и пусконаладка силового щита (УЗО, реле напряжения)", "щит", 1.0, 12500),
                ("Разводка труб ХВС/ГВС сшитый полиэтилен Rehau", "точек", max(8.0, area_m2 * 0.2), 2600),
                ("Монтаж коллекторного узла с манометрами и фильтрами", "узел", 1.0, 11000),
            ]
        },
        {
            "category": "4. ЧИСТОВАЯ ОТДЕЛКА",
            "items": [
                ("Шпаклевание стен финишной полимерной смесью (2 слоя)", "м²", area_m2 * 2.6, 420),
                ("Оклейка стен обоями / высококачественная покраска", "м²", area_m2 * 2.4, 390),
                ("Укладка напольных покрытий (ламинат / кварцвинил) с подложкой", "м²", area_m2 * 0.75, 450),
                ("Укладка керамогранита в санузле с запилом 45°", "м²", max(16.0, area_m2 * 0.35), 1750),
                ("Монтаж натяжных матовых потолков со светильниками", "м²", area_m2 * 1.0, 780),
                ("Установка межкомнатных дверей с доборами и фурнитурой", "компл.", max(2.0, round(area_m2 / 20.0)), 4200),
            ]
        },
        {
            "category": "5. ЧЕРНОВЫЕ СТРОИТЕЛЬНЫЕ МАТЕРИАЛЫ",
            "items": [
                ("Сухие смеси (штукатурка Knauf МП-75/Ротбанд, стяжка М-300)", "компл.", 1.0, int(round(materials_total * 0.45))),
                ("Электроматериалы (кабель ГОСТ ВВГнг-LS, гофра, подрозетники, щит)", "компл.", 1.0, int(round(materials_total * 0.30))),
                ("Сантехнические материалы (трубы Rehau, фитинги, коллекторы FAR)", "компл.", 1.0, int(round(materials_total * 0.25))),
            ]
        },
    ]

    # Добавляем выбранные клиентом доп. опции
    if clean_options:
        opt_items = []
        for opt in clean_options:
            opt_items.append((f"Дополнительная опция: {opt}", "компл.", 1.0, int(round(area_m2 * 450))))
        categories.append({
            "category": "6. ДОПОЛНИТЕЛЬНЫЕ ОПЦИИ И ПОЖЕЛАНИЯ",
            "items": opt_items,
        })

    # Если доступен reportlab — генерируем профессиональный PDF
    if HAS_REPORTLAB:
        reg_font, bold_font = _register_fonts()
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=A4,
            leftMargin=30,
            rightMargin=30,
            topMargin=30,
            bottomMargin=30,
        )

        styles = getSampleStyleSheet()
        
        # Стили документа
        title_style = ParagraphStyle(
            "DocTitle",
            fontName=bold_font,
            fontSize=16,
            leading=20,
            textColor=colors.HexColor("#09090b"),
        )
        subtitle_style = ParagraphStyle(
            "DocSubTitle",
            fontName=reg_font,
            fontSize=9.5,
            leading=13,
            textColor=colors.HexColor("#52525b"),
        )
        badge_style = ParagraphStyle(
            "BadgeStyle",
            fontName=bold_font,
            fontSize=9,
            leading=11,
            textColor=colors.HexColor("#ffffff"),
            alignment=1,
        )
        section_style = ParagraphStyle(
            "SectionTitle",
            fontName=bold_font,
            fontSize=11,
            leading=15,
            textColor=colors.HexColor("#18181b"),
        )
        meta_label = ParagraphStyle(
            "MetaLabel",
            fontName=reg_font,
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#71717a"),
        )
        meta_val = ParagraphStyle(
            "MetaVal",
            fontName=bold_font,
            fontSize=9,
            leading=12,
            textColor=colors.HexColor("#09090b"),
        )
        table_hdr = ParagraphStyle(
            "TableHdr",
            fontName=bold_font,
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#ffffff"),
        )
        table_cell = ParagraphStyle(
            "TableCell",
            fontName=reg_font,
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#18181b"),
        )
        table_cell_num = ParagraphStyle(
            "TableCellNum",
            fontName=reg_font,
            fontSize=8,
            leading=10,
            textColor=colors.HexColor("#18181b"),
            alignment=2,
        )
        table_cat = ParagraphStyle(
            "TableCat",
            fontName=bold_font,
            fontSize=8.5,
            leading=11,
            textColor=colors.HexColor("#09090b"),
        )
        total_grand_label = ParagraphStyle(
            "GrandLabel",
            fontName=bold_font,
            fontSize=12,
            leading=15,
            textColor=colors.HexColor("#ffffff"),
        )
        total_grand_val = ParagraphStyle(
            "GrandVal",
            fontName=bold_font,
            fontSize=13,
            leading=16,
            textColor=colors.HexColor("#fbbf24"),
            alignment=2,
        )

        elements = []

        # 1. Шапка документа
        now_date_str = datetime.now().strftime("%d.%m.%Y")
        hdr_data = [
            [
                Paragraph(f"<b>{company_name}</b>", title_style),
                Paragraph(f"<b>СМЕТНЫЙ РАСЧЕТ № {lead_id}</b><br/><font color='#71717a'>Дата: {now_date_str}</font>", ParagraphStyle("RightHdr", fontName=reg_font, fontSize=9, leading=12, alignment=2)),
            ],
            [
                Paragraph(f"{company_subtitle} · г. {company_city} · {company_phone}", subtitle_style),
                Paragraph("<font color='#059669'><b>ПРЕДВАРИТЕЛЬНАЯ ОФИЦИАЛЬНАЯ СМЕТА</b></font>", ParagraphStyle("RightBadge", fontName=bold_font, fontSize=8, leading=10, alignment=2)),
            ],
        ]
        hdr_table = Table(hdr_data, colWidths=[340, 195])
        hdr_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]))
        elements.append(hdr_table)
        elements.append(Spacer(1, 10))
        elements.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#18181b"), spaceAfter=10))

        # 2. Карточка объекта и заказчика
        channel_name = "Telegram" if "telegram" in contact_channel.lower() else "Телефонный звонок"
        meta_table_data = [
            [
                Paragraph("<b>Заказчик:</b>", meta_label),
                Paragraph(f"{client_name}", meta_val),
                Paragraph("<b>Параметры объекта:</b>", meta_label),
                Paragraph(f"{area_m2:.1f} м² ({housing_type})", meta_val),
            ],
            [
                Paragraph("<b>Телефон:</b>", meta_label),
                Paragraph(f"{client_phone}", meta_val),
                Paragraph("<b>Тариф ремонта:</b>", meta_label),
                Paragraph(f"{renovation_class}", meta_val),
            ],
            [
                Paragraph("<b>Адрес / ЖК:</b>", meta_label),
                Paragraph(f"{client_address}", meta_val),
                Paragraph("<b>Канал связи:</b>", meta_label),
                Paragraph(f"{channel_name}", meta_val),
            ],
            [
                Paragraph("<b>Желаемая дата замера:</b>", meta_label),
                Paragraph(f"{pref_date}", meta_val),
                Paragraph("<b>Ориентир стоимости:</b>", meta_label),
                Paragraph(f"<b>{grand_total:,.0f} ₽</b>".replace(",", " "), meta_val),
            ],
        ]
        meta_table = Table(meta_table_data, colWidths=[95, 175, 110, 155])
        meta_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#f4f4f5")),
            ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#e4e4e7")),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e4e4e7")),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ]))
        elements.append(meta_table)
        elements.append(Spacer(1, 12))

        # 3. Таблица расценок
        table_rows = [
            [
                Paragraph("<b>Наименование работ и материалов</b>", table_hdr),
                Paragraph("<b>Ед.</b>", ParagraphStyle("TH2", fontName=bold_font, fontSize=8, alignment=1, textColor=colors.white)),
                Paragraph("<b>Объем</b>", ParagraphStyle("TH3", fontName=bold_font, fontSize=8, alignment=2, textColor=colors.white)),
                Paragraph("<b>Цена, ₽</b>", ParagraphStyle("TH4", fontName=bold_font, fontSize=8, alignment=2, textColor=colors.white)),
                Paragraph("<b>Стоимость, ₽</b>", ParagraphStyle("TH5", fontName=bold_font, fontSize=8, alignment=2, textColor=colors.white)),
            ]
        ]

        t_styles = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#27272a")),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#e4e4e7")),
        ]

        current_row_idx = 1
        for cat in categories:
            # Категория
            table_rows.append([
                Paragraph(f"<b>{cat['category']}</b>", table_cat),
                Paragraph("", table_cell),
                Paragraph("", table_cell),
                Paragraph("", table_cell),
                Paragraph("", table_cell),
            ])
            t_styles.append(('SPAN', (0, current_row_idx), (-1, current_row_idx)))
            t_styles.append(('BACKGROUND', (0, current_row_idx), (-1, current_row_idx), colors.HexColor("#f1f5f9")))
            t_styles.append(('TOPPADDING', (0, current_row_idx), (-1, current_row_idx), 4))
            t_styles.append(('BOTTOMPADDING', (0, current_row_idx), (-1, current_row_idx), 4))
            current_row_idx += 1

            for title, unit, qty, price in cat["items"]:
                row_sum = int(round(qty * price))
                qty_str = f"{qty:,.1f}" if qty % 1 != 0 else f"{int(qty)}"
                table_rows.append([
                    Paragraph(title, table_cell),
                    Paragraph(unit, ParagraphStyle("TU", fontName=reg_font, fontSize=8, alignment=1)),
                    Paragraph(qty_str, table_cell_num),
                    Paragraph(f"{price:,.0f}".replace(",", " "), table_cell_num),
                    Paragraph(f"<b>{row_sum:,.0f}</b>".replace(",", " "), table_cell_num),
                ])
                current_row_idx += 1

        calc_table = Table(table_rows, colWidths=[275, 45, 55, 75, 85])
        calc_table.setStyle(TableStyle(t_styles))
        elements.append(calc_table)
        elements.append(Spacer(1, 10))

        # 4. Итоговый финансовый блок
        total_data = [
            [
                Paragraph("<b>Стоимость строительно-монтажных работ:</b>", ParagraphStyle("TL1", fontName=reg_font, fontSize=9, textColor=colors.HexColor("#a1a1aa"))),
                Paragraph(f"{works_total:,.0f} ₽".replace(",", " "), ParagraphStyle("TV1", fontName=bold_font, fontSize=9, alignment=2, textColor=colors.white)),
            ],
            [
                Paragraph("<b>Ориентировочная стоимость черновых материалов:</b>", ParagraphStyle("TL2", fontName=reg_font, fontSize=9, textColor=colors.HexColor("#a1a1aa"))),
                Paragraph(f"{materials_total:,.0f} ₽".replace(",", " "), ParagraphStyle("TV2", fontName=bold_font, fontSize=9, alignment=2, textColor=colors.white)),
            ],
            [
                Paragraph("<b>ИТОГО ПО СМЕТЕ (РАБОТЫ + МАТЕРИАЛЫ):</b>", total_grand_label),
                Paragraph(f"<b>{grand_total:,.0f} ₽</b>".replace(",", " "), total_grand_val),
            ],
        ]
        total_table = Table(total_data, colWidths=[340, 195])
        total_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#18181b")),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 4),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
            ('LEFTPADDING', (0, 0), (-1, -1), 10),
            ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('LINEBELOW', (0, 1), (-1, 1), 1, colors.HexColor("#3f3f46")),
        ]))
        elements.append(total_table)
        elements.append(Spacer(1, 14))

        # 5. Подвал и подписи
        footer_text = (
            "<i>* Настоящий расчет сформирован на основании параметров онлайн-калькулятора. "
            "Точные объемы и финальная смета фиксируются в официальном договоре после выезда "
            "инженера-замерщика и лазерного сканирования геометрии помещений.</i>"
        )
        elements.append(Paragraph(footer_text, ParagraphStyle("FText", fontName=reg_font, fontSize=7.5, leading=10, textColor=colors.HexColor("#71717a"))))
        elements.append(Spacer(1, 12))

        sign_data = [
            [
                Paragraph("<b>Инженер / Подрядчик:</b> ___________________", ParagraphStyle("S1", fontName=reg_font, fontSize=8)),
                Paragraph("<b>Заказчик:</b> ___________________", ParagraphStyle("S2", fontName=reg_font, fontSize=8, alignment=2)),
            ]
        ]
        sign_table = Table(sign_data, colWidths=[270, 265])
        sign_table.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ]))
        elements.append(sign_table)

        doc.build(elements)
        buffer.seek(0)
        return buffer.getvalue()

    # Fallback: генерация минимального валидного PDF файла
    return _generate_pure_pdf_fallback(company_name, lead_id, client_name, client_phone, area_m2, grand_total)


def _generate_pure_pdf_fallback(company_name: str, lead_id: str, client: str, phone: str, area: float, total: float) -> bytes:
    """Запасной генератор минимального PDF"""
    pdf_text = f"Estimate {lead_id}\nCompany: {company_name}\nClient: {client}\nPhone: {phone}\nArea: {area} m2\nTotal: {total:,.0f} RUB\n"
    content = f"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length {len(pdf_text) + 60} >>
stream
BT
/F1 14 Tf
50 780 Td
({pdf_text.replace(chr(10), ') Tj T* (')}) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000224 00000 n 
0000000297 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
450
%%EOF"""
    return content.encode("latin1", errors="replace")
