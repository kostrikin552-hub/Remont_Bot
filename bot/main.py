"""
Telegram Bot для калькулятора ремонта квартир (Telegram Mini App)
Стек: Python 3.11+, aiogram 3.x, asyncio
Полностью кнопочный интерфейс для клиентов (без необходимости вводить текстовые команды).
"""

import asyncio
import json
import logging
import os
import sys
from typing import Optional

from aiogram import Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandStart, CommandObject
from aiogram.types import (
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    ReplyKeyboardMarkup,
    MenuButtonWebApp,
    Message,
    CallbackQuery,
    WebAppInfo,
)
from dotenv import load_dotenv

# Загрузка переменных окружения
load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN", "")
WEBAPP_URL = os.getenv(
    "WEBAPP_URL",
    "https://ais-pre-3xeyotanildylb6nzg47ki-97067624345.europe-west1.run.app",
)
ADMIN_CHAT_ID = os.getenv("ADMIN_CHAT_ID", "")

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("remont_bot")

router = Router()


CURRENT_BOT_USERNAME: str = os.getenv("BOT_USERNAME", "")
COMPANY_PHONE: str = os.getenv("COMPANY_PHONE", os.getenv("FOREMAN_PHONE", "+7 (920) 953-45-00"))
COMPANY_NAME: str = os.getenv("COMPANY_NAME", "РемонтПро")
COMPANY_CITY: str = os.getenv("COMPANY_CITY", "Москва и МО")

HOUSING_RISK_PROFILES = {
    "white_box": {
        "percent": 5,
        "label": "White Box (предчистовая)",
        "risks": [
            "Пустоты под штукатуркой застройщика (бухтение)",
            "Геометрия углов 90° в зоне кухни и санузлов",
            "Работоспособность кабельных линий застройщика",
        ],
    },
    "new_concrete": {
        "percent": 8,
        "label": "Новостройка (монолит / бетон)",
        "risks": [
            "Перепад монолитных плит (влияет на слой стяжки от 4 до 8 см)",
            "Отклонение монолитных пилонов от вертикали",
            "Высота канализационного тройника и давление воды",
        ],
    },
    "open_plan": {
        "percent": 10,
        "label": "Свободная планировка",
        "risks": [
            "Точные границы мокрых зон по плану БТИ",
            "Фактический расход блоков для перегородок",
            "Необходимость звукоизоляции межквартирных стен",
        ],
    },
    "secondary_panel": {
        "percent": 12,
        "label": "Вторичка (типовая панель)",
        "risks": [
            "Состояние проводки в скрытых каналах плит",
            "Сцепление старой штукатурки (демонтаж до основания)",
            "Износ общедомовых стояков и чугунного раструба",
        ],
    },
    "old_fund": {
        "percent": 18,
        "label": "Старый фонд / сталинка",
        "risks": [
            "Состояние балок перекрытий (металл / дерево)",
            "Толщина старой штукатурки по дранке (до 10–15 см)",
            "Объём засыпки шлаком и строительного мусора под полом",
        ],
    },
}

def get_bot_reserve_data(housing_type: str, grand_total: float):
    raw = (housing_type or "new_concrete").lower()
    if "white" in raw:
        key = "white_box"
    elif "open" in raw or "свобод" in raw:
        key = "open_plan"
    elif "old" in raw or "сталин" in raw or "старый" in raw:
        key = "old_fund"
    elif "secondary" in raw or "вторич" in raw:
        key = "secondary_panel"
    else:
        key = "new_concrete"

    prof = HOUSING_RISK_PROFILES.get(key, HOUSING_RISK_PROFILES["new_concrete"])
    percent = prof["percent"]
    reserve_amount = int(round((grand_total * (percent / 100.0)) / 100.0) * 100)
    return percent, reserve_amount, prof["label"], prof["risks"]


def format_bot_estimate_text(grand_total: float, works_cost: float, materials_cost: float, housing_type: str = "new_concrete") -> str:
    pct, reserve_amt, label, _ = get_bot_reserve_data(housing_type, grand_total)
    gt_str = f"{grand_total:,.0f}".replace(",", " ")
    w_str = f"{works_cost:,.0f}".replace(",", " ")
    m_str = f"{materials_cost:,.0f}".replace(",", " ")
    res_str = f"{reserve_amt:,.0f}".replace(",", " ")

    return (
        f"📊 <b>Предварительный расчёт:</b> {gt_str} ₽\n\n"
        f"🔹 <b>Работы бригады (ГОСТ):</b> {w_str} ₽\n"
        f"🔹 <b>Черновые материалы Knauf/Rehau:</b> {m_str} ₽\n"
        f"━━━━━━━━━━━━━━━━━━\n"
        f"🛡 <b>Инженерный резерв (+{pct}%):</b> {res_str} ₽\n"
        f"<i>(Рекомендуемый запас на скрытые перепады плит от застройщика. "
        f"Если дефектов нет — деньги остаются у вас).</i>\n\n"
        f"🔒 <b>Гарантия твёрдой цены:</b>\n"
        f"После бесплатного замера смета фиксируется в договоре и не увеличивается в ходе работ."
    )


def get_webapp_url(company_id: Optional[str] = None, bot_username: Optional[str] = None) -> str:
    """Генерация URL WebApp с учётом тенанта и юзернейма бота компании"""
    url = WEBAPP_URL
    params = []
    if company_id:
        params.append(f"company_id={company_id}")
    active_bot = bot_username or CURRENT_BOT_USERNAME or os.getenv("BOT_USERNAME", "")
    if active_bot:
        clean_bot = active_bot.replace("@", "").strip()
        if clean_bot:
            params.append(f"bot={clean_bot}")
    if params:
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}{'&'.join(params)}"
    return url


def get_client_reply_keyboard(company_id: Optional[str] = None, bot_username: Optional[str] = None) -> ReplyKeyboardMarkup:
    """
    Постоянная удобная клавиатура внизу экрана (Reply Keyboard).
    Клиенту не нужно ничего писать текстом — всё доступно в 1 клик!
    """
    url = get_webapp_url(company_id, bot_username)
    return ReplyKeyboardMarkup(
        keyboard=[
            [
                KeyboardButton(
                    text="📱 Рассчитать смету онлайн",
                    web_app=WebAppInfo(url=url),
                )
            ],
            [
                KeyboardButton(text="📋 Прайс и смета работ"),
                KeyboardButton(text="📐 Бесплатный замер (0 ₽)"),
            ],
            [
                KeyboardButton(text="❓ Вопросы и гарантии"),
            ],
        ],
        resize_keyboard=True,
        persistent=True,
    )


def get_webapp_inline_keyboard(company_id: Optional[str] = None, bot_username: Optional[str] = None) -> InlineKeyboardMarkup:
    """Инлайн-кнопки под приветствием"""
    url = get_webapp_url(company_id, bot_username)
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📱 Открыть онлайн-калькулятор",
                    web_app=WebAppInfo(url=url),
                )
            ],
            [
                InlineKeyboardButton(
                    text="📋 Построчная смета",
                    callback_data="btn_price_categories",
                ),
                InlineKeyboardButton(
                    text="❓ Вопросы и гарантии",
                    callback_data="btn_faq",
                ),
            ],
        ]
    )


def get_price_categories_keyboard(company_id: Optional[str] = None, bot_username: Optional[str] = None) -> InlineKeyboardMarkup:
    """Инлайн-меню категорий сметы работ"""
    url = get_webapp_url(company_id, bot_username)
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(text="🧱 Демонтаж", callback_data="price_cat_demolition"),
                InlineKeyboardButton(text="📐 Стены и полы", callback_data="price_cat_rough"),
            ],
            [
                InlineKeyboardButton(text="⚡️ Электрика", callback_data="price_cat_eng"),
                InlineKeyboardButton(text="🚿 Сантехника", callback_data="price_cat_plumb"),
            ],
            [
                InlineKeyboardButton(text="🎨 Чистовая отделка", callback_data="price_cat_finish"),
                InlineKeyboardButton(text="📦 Черновые материалы", callback_data="price_cat_mat"),
            ],
            [
                InlineKeyboardButton(
                    text="📱 Открыть интерактивную смету под мою площадь",
                    web_app=WebAppInfo(url=url),
                )
            ],
        ]
    )


# ---------------------------------------------------------------------------
# Приветствие и старт
# ---------------------------------------------------------------------------
@router.message(CommandStart())
async def cmd_start(message: Message, command: CommandObject, bot: Bot):
    """Обработчик команды /start с поддержкой вирусных deep-link смет"""
    arg = command.args.strip() if command.args else ""
    company_id = None
    is_shared = False
    shared_area = 54
    shared_class = "capital"

    if arg.startswith("calc_") or arg.startswith("est_") or arg.startswith("estimate_"):
        parts = arg.split("_")
        if len(parts) >= 3:
            is_shared = True
            try:
                shared_area = int(parts[1])
                shared_class = parts[2]
                if len(parts) >= 4:
                    company_id = parts[3]
            except Exception:
                pass
    elif arg:
        company_id = arg

    # Получаем юзернейм бота для гарантированной передачи в Mini App
    global CURRENT_BOT_USERNAME
    bot_uname = CURRENT_BOT_USERNAME
    if not bot_uname:
        try:
            bot_info = await bot.get_me()
            bot_uname = bot_info.username or ""
            CURRENT_BOT_USERNAME = bot_uname
        except Exception:
            pass

    # Настраиваем кнопку меню чата для быстрого открытия WebApp
    try:
        menu_url = get_webapp_url(company_id, bot_uname)
        await bot.set_chat_menu_button(
            chat_id=message.chat.id,
            menu_button=MenuButtonWebApp(
                text="Калькулятор",
                web_app=WebAppInfo(url=menu_url),
            ),
        )
    except Exception as e:
        logger.warning(f"Не удалось установить MenuButtonWebApp: {e}")

    if is_shared:
        tariff_names = {
            "cosmetic": "Косметический",
            "capital": "Капитальный (ГОСТ)",
            "designer": "Дизайнерский",
        }
        t_name = tariff_names.get(shared_class, "Капитальный")
        deep_app_url = f"{get_webapp_url(company_id, bot_uname)}&area={shared_area}&class={shared_class}&utm_source=shared_tma"

        share_greeting = (
            f"Здравствуйте, {message.from_user.first_name}!\n\n"
            f"👨‍👩‍👧 <b>Вам отправлена интерактивная смета ремонта на согласование:</b>\n"
            f"📐 Площадь: <b>{shared_area} м²</b> (тариф «{t_name}»)\n"
            "⚡️ Все расценки рассчитаны по стандарту ГОСТ с поэтапной оплатой без предоплаты.\n\n"
            "Нажмите кнопку ниже, чтобы открыть живую интерактивную смету и посмотреть детализацию работ:"
        )
        share_kb = InlineKeyboardMarkup(
            inline_keyboard=[
                [
                    InlineKeyboardButton(
                        text=f"📱 Открыть смету ({shared_area} м²)",
                        web_app=WebAppInfo(url=deep_app_url),
                    )
                ],
                [
                    InlineKeyboardButton(
                        text="📐 Вызвать инженера-замерщика 0 ₽",
                        callback_data="btn_booking",
                    )
                ],
            ]
        )
        await message.answer(
            text=share_greeting,
            reply_markup=share_kb,
            parse_mode=ParseMode.HTML,
        )
        return

    greeting = (
        f"Здравствуйте, {message.from_user.first_name}!\n\n"
        f"🏠 <b>Добро пожаловать в сервис прозрачного расчёта ремонта «{COMPANY_NAME}».</b>\n\n"
        f"📍 Город: <b>{COMPANY_CITY}</b>\n"
        f"📞 <b>Контактный телефон компании/прораба:</b> <code>{COMPANY_PHONE}</code>\n"
        "⚡️ Работаем без предоплаты — оплата поэтапно по факту приёмки качества.\n\n"
        "У нас <b>нет приблизительных цен «на глаз»</b> — каждая позиция рассчитывается по фиксированному "
        "прайс-листу и смете ГОСТ без скрытых переплат:\n\n"
        "⚡️ <b>Что доступно прямо по кнопкам ниже:</b>\n"
        "• <b>📱 Рассчитать смету онлайн:</b> выберите площадь и узнайте стоимость за 1 минуту\n"
        "• <b>📋 Прайс и смета работ:</b> прозрачные расценки за м² по всем видам работ\n"
        "• <b>📐 Бесплатный замер (0 ₽):</b> бронь выезда инженера с лазерным дальномером\n"
        "• <b>❓ Вопросы и гарантии:</b> гарантия 36 месяцев и условия договора\n\n"
        "🎁 <b>Подарок к замеру:</b> 3D-планировка расстановки мебели и смета за 24 ч — бесплатно!\n\n"
        "<i>Нажимайте на кнопки внизу для моментального выбора:</i>"
    )

    await message.answer(
        text=greeting,
        reply_markup=get_client_reply_keyboard(company_id),
        parse_mode=ParseMode.HTML,
    )


# ---------------------------------------------------------------------------
# Кнопка «📋 Прайс и смета работ» (Реакция на нажатие кнопки клавиатуры)
# ---------------------------------------------------------------------------
@router.message(F.text == "📋 Прайс и смета работ")
async def msg_price_list(message: Message):
    """Отправка прайс-листа и сметных категорий компании"""
    text = (
        f"📋 <b>Официальный прайс-лист и фиксированные расценки «{COMPANY_NAME}»</b>\n\n"
        "Все цены фиксируются в приложении к договору и остаются неизменными во время ремонта.\n\n"
        "Выберите раздел сметы, чтобы посмотреть конкретные расценки:"
    )
    await message.answer(
        text=text,
        reply_markup=get_price_categories_keyboard(),
        parse_mode=ParseMode.HTML,
    )


# ---------------------------------------------------------------------------
# Кнопка «📐 Бесплатный замер (0 ₽)»
# ---------------------------------------------------------------------------
@router.message(F.text == "📐 Бесплатный замер (0 ₽)")
async def msg_booking_info(message: Message):
    """Информация о бесплатном замере"""
    text = (
        "📐 <b>Бесплатный выезд инженера-замерщика (0 ₽)</b>\n\n"
        "Замер ни к чему вас не обязывает, но даёт 100% точную смету копейка в копейку:\n\n"
        "🔹 <b>Что сделает инженер на объекте:</b>\n"
        "• Высокоточные замеры лазерным дальномером Leica\n"
        "• Проверка геометрии и отклонений стен/потолка правилом\n"
        "• Оценка электропроводки, водоснабжения и вентиляции\n"
        "• Подбор оптимальных материалов под ваш бюджет\n\n"
        "🎁 <b>Бесплатные бонусы:</b>\n"
        "1. Фиксированная смета на фирменном бланке (за 24 часа)\n"
        "2. 3D-план расстановки мебели и розеток\n\n"
        f"📞 <b>Контактный телефон компании/прораба:</b> <code>{COMPANY_PHONE}</code>\n\n"
        "Нажмите кнопку ниже, чтобы забронировать удобное время:"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📅 Записаться на замер (в калькуляторе)",
                    web_app=WebAppInfo(url=get_webapp_url()),
                )
            ],
        ]
    )
    await message.answer(text=text, reply_markup=kb, parse_mode=ParseMode.HTML)


# ---------------------------------------------------------------------------
# Контакты компании и службы сервиса
# ---------------------------------------------------------------------------
@router.message(Command("contact"))
@router.message(Command("phone"))
@router.callback_query(F.data == "contact_manager")
async def msg_contact_pro(message_or_call: Any):
    """Прямая связь с дежурным инженером и компанией"""
    is_call = isinstance(message_or_call, CallbackQuery)
    message = message_or_call.message if is_call else message_or_call
    if is_call:
        await message_or_call.answer()

    text = (
        f"💬 <b>Служба клиентского сервиса «{COMPANY_NAME}»</b>\n\n"
        f"🏢 <b>Компания:</b> {COMPANY_NAME}\n"
        f"📍 <b>Регион:</b> {COMPANY_CITY}\n"
        f"📞 <b>Контактный телефон компании/прораба:</b> <code>{COMPANY_PHONE}</code>\n"
        "⏰ <b>График работы:</b> Ежедневно с 09:00 до 21:00\n\n"
        "⚡️ Работаем <b>без предоплаты</b>, оплата по факту приёмки каждого этапа работ по акту."
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📱 Открыть онлайн-калькулятор",
                    web_app=WebAppInfo(url=get_webapp_url()),
                )
            ]
        ]
    )
    await message.answer(text=text, reply_markup=kb, parse_mode=ParseMode.HTML)


# ---------------------------------------------------------------------------
# Кнопка «❓ Вопросы и гарантии»
# ---------------------------------------------------------------------------
@router.message(F.text == "❓ Вопросы и гарантии")
@router.callback_query(F.data == "btn_faq")
async def msg_faq_guarantees(message_or_call: Any):
    """Частые вопросы и гарантии компании"""
    is_call = isinstance(message_or_call, CallbackQuery)
    message = message_or_call.message if is_call else message_or_call
    if is_call:
        await message_or_call.answer()

    text = (
        "❓ <b>Частые вопросы и стандарты надёжности:</b>\n\n"
        "🛡 <b>1. Действительно без предоплаты?</b>\n"
        "Да! Вы не платите аванс за работу. Оплата происходит поэтапно: бригада сдаёт этап "
        "(демонтаж, штукатурка, сантехника), вы проверяете качество и только после подписи акта оплачиваете.\n\n"
        "📝 <b>2. Фиксируется ли цена в договоре?</b>\n"
        "Да. Составляется подробная построчная смета с фиксированными расценками. "
        "Цена не меняется в процессе ремонта.\n\n"
        "📦 <b>3. Кто закупает черновые материалы?</b>\n"
        "Мы закупаем смеси Knauf, кабели ГОСТ и трубы Rehau напрямую с оптовых баз со скидкой до 20% "
        "и полной гарантией подлинности, либо вы можете закупать их сами.\n\n"
        "⏳ <b>4. Какая гарантия на ремонт?</b>\n"
        "Гарантия 36 месяцев (3 года) по официальному договору.\n\n"
        f"📞 <b>Контактный телефон компании/прораба:</b> <code>{COMPANY_PHONE}</code>"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📱 Рассчитать стоимость моей квартиры",
                    web_app=WebAppInfo(url=get_webapp_url()),
                )
            ]
        ]
    )
    await message.answer(text=text, reply_markup=kb, parse_mode=ParseMode.HTML)
    await message.answer(text=text, reply_markup=kb, parse_mode=ParseMode.HTML)


# ---------------------------------------------------------------------------
# Инлайн-колбэки категорий сметы (показ фиксированных расценок)
# ---------------------------------------------------------------------------
@router.callback_query(F.data == "btn_price_categories")
async def cb_price_categories(call: CallbackQuery):
    await call.answer()
    await call.message.edit_text(
        "📋 <b>Официальный прайс-лист и фиксированные расценки компании</b>\n\n"
        "Выберите интересующий раздел сметы для просмотра ставок за м² и единицу:",
        reply_markup=get_price_categories_keyboard(),
        parse_mode=ParseMode.HTML,
    )


@router.callback_query(F.data == "price_cat_demolition")
async def cb_price_demolition(call: CallbackQuery):
    await call.answer()
    text = (
        "🧱 <b>1. Демонтажные и подготовительные работы:</b>\n\n"
        "• Демонтаж старых обоев и краски: <b>140 ₽ / м²</b>\n"
        "• Снятие линолеума / ламината / плинтусов: <b>180 ₽ / м²</b>\n"
        "• Демонтаж цементной стяжки: <b>550 ₽ / м²</b>\n"
        "• Демонтаж ненесущих перегородок: <b>450 ₽ / м²</b>\n"
        "• Сбор мусора в мешки, спуск и вывоз (контейнер): <b>от 8 500 ₽</b>\n\n"
        "<i>Все цены зафиксированы в договоре.</i>"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📱 Рассчитать под мою площадь (WebApp)",
                    web_app=WebAppInfo(url=get_webapp_url()),
                )
            ],
            [
                InlineKeyboardButton(text="⬅️ Назад к разделам", callback_data="btn_price_categories")
            ],
        ]
    )
    await call.message.edit_text(text=text, reply_markup=kb, parse_mode=ParseMode.HTML)


@router.callback_query(F.data == "price_cat_rough")
async def cb_price_rough(call: CallbackQuery):
    await call.answer()
    text = (
        "📐 <b>2. Черновые работы и геометрия помещений:</b>\n\n"
        "• Грунтовка глубокого проникновения (2 слоя): <b>85 ₽ / м²</b>\n"
        "• Штукатурка стен по маякам (углы 90°): <b>680 ₽ / м²</b>\n"
        "• Устройство стяжки пола по маякам с фиброй: <b>580 ₽ / м²</b>\n"
        "• Наливной финишный пол (самонивелир): <b>280 ₽ / м²</b>\n"
        "• Обмазочная гидроизоляция санузла с лентой: <b>480 ₽ / м²</b>\n\n"
        "<i>Контроль лазерным дальномером и построителем плоскостей.</i>"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📱 Рассчитать под мою площадь (WebApp)",
                    web_app=WebAppInfo(url=get_webapp_url()),
                )
            ],
            [
                InlineKeyboardButton(text="⬅️ Назад к разделам", callback_data="btn_price_categories")
            ],
        ]
    )
    await call.message.edit_text(text=text, reply_markup=kb, parse_mode=ParseMode.HTML)


@router.callback_query(F.data == "price_cat_eng")
async def cb_price_eng(call: CallbackQuery):
    await call.answer()
    text = (
        "⚡️ <b>3. Электромонтажные работы по ГОСТ:</b>\n\n"
        "• Штробление и прокладка кабеля ВВГнг-LS в гофре: <b>210 ₽ / пог. м</b>\n"
        "• Алмазное высверливание подрозетника: <b>490 ₽ / точка</b>\n"
        "• Сборка и коммутация силового электрощита с УЗО: <b>9 500 ₽ / щит</b>\n"
        "• Установка чистовых розеток и выключателей: <b>250 ₽ / шт.</b>\n"
        "• Монтаж светодиодной ленты / трекового шинопровода: <b>650 ₽ / пог. м</b>\n\n"
        "<i>Никаких скруток, сварка гильзами, ГОСТ безопасность.</i>"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📱 Рассчитать под мою площадь (WebApp)",
                    web_app=WebAppInfo(url=get_webapp_url()),
                )
            ],
            [
                InlineKeyboardButton(text="⬅️ Назад к разделам", callback_data="btn_price_categories")
            ],
        ]
    )
    await call.message.edit_text(text=text, reply_markup=kb, parse_mode=ParseMode.HTML)


@router.callback_query(F.data == "price_cat_plumb")
async def cb_price_plumb(call: CallbackQuery):
    await call.answer()
    text = (
        "🚿 <b>4. Сантехнические работы и водоснабжение:</b>\n\n"
        "• Разводка труб Rehau / сшитый полиэтилен: <b>2 400 ₽ / точка</b>\n"
        "• Монтаж коллекторного узла с манометрами и фильтрами: <b>11 500 ₽ / узел</b>\n"
        "• Установка скрытой инсталляции унитаза: <b>3 800 ₽ / шт.</b>\n"
        "• Монтаж ванны / душевого поддона с гидроизоляцией: <b>4 500 ₽ / шт.</b>\n"
        "• Опрессовка системы под давлением 10 атм: <b>входит в стоимость</b>\n\n"
        "<i>Гарантия от протечек на фитинги и трубы 50 лет.</i>"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📱 Рассчитать под мою площадь (WebApp)",
                    web_app=WebAppInfo(url=get_webapp_url()),
                )
            ],
            [
                InlineKeyboardButton(text="⬅️ Назад к разделам", callback_data="btn_price_categories")
            ],
        ]
    )
    await call.message.edit_text(text=text, reply_markup=kb, parse_mode=ParseMode.HTML)


@router.callback_query(F.data == "price_cat_finish")
async def cb_price_finish(call: CallbackQuery):
    await call.answer()
    text = (
        "🎨 <b>5. Чистовая отделка:</b>\n\n"
        "• Шпаклевание стен финишное под лампу (2 слоя): <b>420 ₽ / м²</b>\n"
        "• Оклейка флизелиновыми обоями без швов: <b>380 ₽ / м²</b>\n"
        "• Укладка керамогранита с запилом углов под 45°: <b>1 650 ₽ / м²</b>\n"
        "• Настил ламината 33 кл. / кварцвинила: <b>460 ₽ / м²</b>\n"
        "• Монтаж напольного плинтуса с запилом: <b>260 ₽ / пог. м</b>\n"
        "• Установка межкомнатных дверей с доборами: <b>4 200 ₽ / комплект</b>\n"
        "• Натяжной потолок MSD Premium с установкой: <b>780 ₽ / м²</b>\n\n"
        "<i>Идеальные стыки и геометрия.</i>"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📱 Рассчитать под мою площадь (WebApp)",
                    web_app=WebAppInfo(url=get_webapp_url()),
                )
            ],
            [
                InlineKeyboardButton(text="⬅️ Назад к разделам", callback_data="btn_price_categories")
            ],
        ]
    )
    await call.message.edit_text(text=text, reply_markup=kb, parse_mode=ParseMode.HTML)


@router.callback_query(F.data == "price_cat_mat")
async def cb_price_mat(call: CallbackQuery):
    await call.answer()
    text = (
        "📦 <b>6. Черновые сертифицированные материалы:</b>\n\n"
        "• Сухие смеси Knauf Ротбанд, МП-75, Пескобетон М-300\n"
        "• Кабель ГОСТ Конкорд / РЭК ВВГнг-LS в негорючей гофре\n"
        "• Трубы Rehau Rautitan stabil, фитинги латунные, краны Bugatti\n"
        "• Грунтовка Knauf Тифенгрунд, гидроизоляция Knauf Флэхендихт\n\n"
        "🔹 <b>Наши преимущества по материалам:</b>\n"
        "• Оптовые цены без наценок магазинов (до -20% от Леруа / Петрович)\n"
        "• Доставка и подъём на этаж включены в смету\n"
        "• Полная ответственность за качество материалов"
    )
    kb = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📱 Рассчитать материалы под мою квартиру",
                    web_app=WebAppInfo(url=get_webapp_url()),
                )
            ],
            [
                InlineKeyboardButton(text="⬅️ Назад к разделам", callback_data="btn_price_categories")
            ],
        ]
    )
    await call.message.edit_text(text=text, reply_markup=kb, parse_mode=ParseMode.HTML)


@router.callback_query(F.data == "contact_manager")
async def cb_contact_manager(callback: CallbackQuery):
    """Кнопка связи с менеджером"""
    await callback.answer()
    await callback.message.answer(
        "📞 <b>Прямая телефонная линия:</b> <code>+7 (800) 555-35-35</code>\n\n"
        "Дежурный инженер ответит на любые технические вопросы по смете и замеру ежедневно с 09:00 до 21:00.",
        parse_mode=ParseMode.HTML,
    )


# ---------------------------------------------------------------------------
# Обработка данных из WebApp (отправка сметы и подтверждения клиенту)
# ---------------------------------------------------------------------------
@router.message(F.web_app_data)
async def handle_webapp_data(message: Message, bot: Bot):
    """Обработка данных, отправленных из Mini App через Telegram.WebApp.sendData()"""
    raw_data = message.web_app_data.data
    logger.info(f"Получены данные из WebApp от пользователя {message.from_user.id}: {raw_data}")

    try:
        data = json.loads(raw_data)
        lead_id = data.get("leadId") or data.get("bookingCode", "NEW")
        name = data.get("name", "Клиент")
        phone = data.get("phone", "—")
        city = data.get("city", "—")
        area = data.get("area", "—")
        prop_type = "Новостройка" if data.get("propertyType") == "new" else "Вторичка"
        tariff = data.get("renovationClass", "Капитальный")
        price_min = data.get("priceMin", 0)
        price_max = data.get("priceMax", 0)
        date_visit = data.get("date", "В ближайшее время")
        comm_channel = data.get("communication", "Telegram")
        key_status = data.get("keyStatus") or data.get("key_status", "ready")
        is_visit_blocked = key_status == "construction" or (data.get("isVisitAllowed") is False)

        # 1. Ответ пользователю в чат бота
        if is_visit_blocked:
            confirmation_text = (
                f"✅ <b>Заявка #{lead_id} на онлайн-консультацию оформлена!</b>\n\n"
                f"👤 <b>Заказчик:</b> {name}\n"
                f"📞 <b>Телефон:</b> <code>{phone}</code>\n"
                f"📍 <b>Город:</b> {city}\n"
                f"📐 <b>Объект:</b> {area} м² ({prop_type}) — <i>дом ещё строится</i>\n"
                f"🏷 <b>Выбранный тариф:</b> {tariff}\n"
                f"💰 <b>Диапазон сметы:</b> {price_min:,.0f} — {price_max:,.0f} ₽\n"
                f"📅 <b>Формат:</b> Онлайн-разбор планировки\n"
                f"💬 <b>Канал связи:</b> {comm_channel}\n\n"
                f"📞 <b>Телефон компании/прораба:</b> <code>{COMPANY_PHONE}</code>\n\n"
                "🎁 <b>За вами зафиксированы бонусы:</b>\n"
                "• Фиксация цены сметы со скидкой до получения ключей\n"
                "• Экспресс-аудит планировки от главного инженера — 0 ₽\n"
                "• 3D-планировка расстановки мебели — в подарок!\n\n"
                "Инженер свяжется с вами в течение 15 минут для онлайн-консультации."
            )
        else:
            confirmation_text = (
                f"✅ <b>Заявка #{lead_id} на бесплатный замер оформлена!</b>\n\n"
                f"👤 <b>Заказчик:</b> {name}\n"
                f"📞 <b>Телефон:</b> <code>{phone}</code>\n"
                f"📍 <b>Город:</b> {city}\n"
                f"📐 <b>Объект:</b> {area} м² ({prop_type})\n"
                f"🏷 <b>Выбранный тариф:</b> {tariff}\n"
                f"💰 <b>Диапазон сметы:</b> {price_min:,.0f} — {price_max:,.0f} ₽\n"
                f"📅 <b>Желаемая дата выезда:</b> {date_visit}\n"
                f"💬 <b>Канал связи:</b> {comm_channel}\n\n"
                f"📞 <b>Телефон компании/прораба:</b> <code>{COMPANY_PHONE}</code>\n\n"
                "🎁 <b>За вами зафиксированы бонусы:</b>\n"
                "• Лазерный замер объекта — 0 ₽\n"
                "• Построчная смета на бланке за 24 ч — 0 ₽\n"
                "• 3D-планировка расстановки мебели — в подарок!\n\n"
                "Инженер свяжется с вами в течение 15 минут для подтверждения времени."
            )

        await message.answer(
            confirmation_text,
            reply_markup=get_client_reply_keyboard(),
            parse_mode=ParseMode.HTML,
        )

        # 2. Уведомление администратора / CRM
        if ADMIN_CHAT_ID:
            try:
                client_tg_username = data.get("telegram_username") or message.from_user.username or ""
                clean_tg_uname = client_tg_username.replace("@", "").strip()

                # Буфер скрытых работ и лазерные точки контроля
                calc_total = float(price_max or price_min or 0)
                res_pct, res_sum, res_label, res_risks = get_bot_reserve_data(data.get("propertySubtype") or data.get("propertyType") or "new", calc_total)
                risks_list = "\n".join([f" • {r}" for r in res_risks])

                # Бюджет заселения по формуле 25/40/25/10 (2.2х)
                full_move_in_budget = calc_total * 2.2

                if is_visit_blocked:
                    key_warning = (
                        "⛔️ <b>ВНИМАНИЕ ПРОРАБУ: ФИЗИЧЕСКИЙ ВЫЕЗД ЗАПРЕЩЕН!</b>\n"
                        "<i>Дом строится, ключей нет! Не тратьте бензин и время мастера.</i>\n"
                        "👉 <b>Действие:</b> Проведите онлайн-консультацию или добавьте клиента в прогрев.\n\n"
                    )
                elif key_status == "in_30_days":
                    key_warning = "🔑 <b>Статус ключей:</b> Ожидаются в течение 30 дней (предварительный созвон)\n\n"
                else:
                    key_warning = "🟢 <b>Статус ключей:</b> Ключи на руках! Можно выезжать на лазерный замер.\n\n"

                admin_alert = (
                    f"⚡ <b>НОВАЯ ЗАЯВКА НА ЗАМЕР [#{lead_id}]</b>\n\n"
                    f"{key_warning}"
                    f"👤 <b>Клиент:</b> {name} (@{clean_tg_uname or 'не указан'})\n"
                    f"📞 <b>Телефон:</b> <code>{phone}</code>\n"
                    f"🏢 <b>Объект:</b> {prop_type}, {area} м², {tariff}\n"
                    f"💰 <b>Расчётная смета:</b> {price_min:,.0f} – {price_max:,.0f} ₽\n"
                    f"🏠 <b>Бюджет заселения (2.2×):</b> {full_move_in_budget:,.0f} ₽ (по формуле 25/40/25/10)\n\n"
                    f"🛡 <b>Буфер скрытых работ:</b> +{res_pct}% ({res_sum:,.0f} ₽)\n"
                    f"🔍 <b>Точки лазерного контроля на замере:</b>\n"
                    f"{risks_list}\n\n"
                    f"📅 <b>Дата:</b> {date_visit}\n"
                    f"💬 <b>Канал связи:</b> {comm_channel}\n"
                ).replace(",", " ")
                ik_admin = []
                if clean_tg_uname:
                    ik_admin.append([
                        InlineKeyboardButton(
                            text="💬 Написать клиенту в Telegram",
                            url=f"https://t.me/{clean_tg_uname}",
                        )
                    ])

                await bot.send_message(
                    chat_id=int(ADMIN_CHAT_ID),
                    text=admin_alert,
                    reply_markup=InlineKeyboardMarkup(inline_keyboard=ik_admin) if ik_admin else None,
                    parse_mode=ParseMode.HTML,
                )
            except Exception as e:
                logger.error(f"Не удалось отправить уведомление админу: {e}")

    except Exception as e:
        logger.error(f"Ошибка при обработке данных WebApp: {e}")
        await message.answer(
            "✅ Ваша заявка получена! Мы свяжемся с вами в ближайшее время.",
            reply_markup=get_client_reply_keyboard(),
        )


# Fallback для любых текстовых сообщений клиента
@router.message(F.text)
async def fallback_text_handler(message: Message):
    """Если пользователь отправил любой текст, показываем кнопки меню"""
    await message.answer(
        "Выберите нужное действие с помощью кнопок ниже 👇",
        reply_markup=get_client_reply_keyboard(),
    )


async def main():
    if not BOT_TOKEN:
        logger.warning(
            "ВНИМАНИЕ: BOT_TOKEN не указан в файле .env. Укажите токен от @BotFather для запуска бота."
        )
        print("Для запуска бота укажите BOT_TOKEN в файле bot/.env")
        return

    bot = Bot(token=BOT_TOKEN, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()
    dp.include_router(router)

    global CURRENT_BOT_USERNAME
    try:
        me = await bot.get_me()
        CURRENT_BOT_USERNAME = me.username or ""
        logger.info(f"Запуск бота @{CURRENT_BOT_USERNAME} с кнопочным интерфейсом...")
    except Exception as e:
        logger.info("Запуск бота Remont_Bot с кнопочным интерфейсом...")
    try:
        await bot.delete_webhook(drop_pending_updates=True)
        await dp.start_polling(bot)
    finally:
        await bot.session.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Бот остановлен.")
