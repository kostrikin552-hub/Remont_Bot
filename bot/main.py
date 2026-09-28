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


def get_webapp_url(company_id: Optional[str] = None) -> str:
    """Генерация URL WebApp с учётом тенанта"""
    url = WEBAPP_URL
    if company_id:
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}company_id={company_id}"
    return url


def get_client_reply_keyboard(company_id: Optional[str] = None) -> ReplyKeyboardMarkup:
    """
    Постоянная удобная клавиатура внизу экрана (Reply Keyboard).
    Клиенту не нужно ничего писать текстом — всё доступно в 1 клик!
    """
    url = get_webapp_url(company_id)
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
                KeyboardButton(text="💬 Связаться с прорабом"),
                KeyboardButton(text="❓ Вопросы и гарантии"),
            ],
        ],
        resize_keyboard=True,
        persistent=True,
    )


def get_webapp_inline_keyboard(company_id: Optional[str] = None) -> InlineKeyboardMarkup:
    """Инлайн-кнопки под приветствием"""
    url = get_webapp_url(company_id)
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
                    text="💬 Задать вопрос",
                    callback_data="contact_manager",
                ),
            ],
        ]
    )


def get_price_categories_keyboard(company_id: Optional[str] = None) -> InlineKeyboardMarkup:
    """Инлайн-меню категорий сметы работ"""
    url = get_webapp_url(company_id)
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
            except Exception:
                pass
    elif arg:
        company_id = arg

    # Настраиваем кнопку меню чата для быстрого открытия WebApp
    try:
        menu_url = get_webapp_url(company_id)
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
        deep_app_url = f"{get_webapp_url(company_id)}&area={shared_area}&class={shared_class}&utm_source=shared_tma"

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
        "🏠 <b>Добро пожаловать в сервис прозрачного расчёта ремонта квартир под ключ.</b>\n\n"
        "У нас <b>нет приблизительных цен «на глаз»</b> — каждая позиция рассчитывается по фиксированному "
        "прайс-листу и смете ГОСТ без скрытых переплат:\n\n"
        "⚡️ <b>Что доступно прямо по кнопкам ниже:</b>\n"
        "• <b>📱 Рассчитать смету онлайн:</b> выберите площадь и узнайте стоимость за 1 минуту\n"
        "• <b>📋 Прайс и смета работ:</b> прозрачные расценки за м² по всем видам работ\n"
        "• <b>📐 Бесплатный замер (0 ₽):</b> бронь выезда инженера с лазерным дальномером\n"
        "• <b>💬 Связаться с прорабом:</b> прямая линия с главным инженером\n\n"
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
        "📋 <b>Официальный прайс-лист и фиксированные расценки компании</b>\n\n"
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
            [
                InlineKeyboardButton(
                    text="💬 Написать инженеру",
                    callback_data="contact_manager",
                )
            ],
        ]
    )
    await message.answer(text=text, reply_markup=kb, parse_mode=ParseMode.HTML)


# ---------------------------------------------------------------------------
# Кнопка «💬 Связаться с прорабом»
# ---------------------------------------------------------------------------
@router.message(F.text == "💬 Связаться с прорабом")
async def msg_contact_pro(message: Message):
    """Прямая связь с дежурным инженером и компанией"""
    text = (
        "💬 <b>Служба клиентского сервиса и главный инженер</b>\n\n"
        "🏢 <b>Компания:</b> РемонтПро\n"
        "📍 <b>Регион:</b> Москва и МО, Санкт-Петербург, Казань\n"
        "📞 <b>Прямой телефон:</b> <code>+7 (800) 555-35-35</code>\n"
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
async def msg_faq_guarantees(message: Message):
    """Частые вопросы и гарантии компании"""
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
        "Гарантия 36 месяцев (3 года) по официальному договору."
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

        # 1. Ответ пользователю в чат бота
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
                admin_alert = (
                    f"🔥 <b>НОВЫЙ ЛИД ИЗ КАЛЬКУЛЯТОРА!</b>\n"
                    f"ID: <code>{lead_id}</code>\n"
                    f"От: {message.from_user.full_name} (@{message.from_user.username or 'нет'})\n"
                    f"Телефон: <code>{phone}</code>\n"
                    f"Город: {city}\n"
                    f"Параметры: {area} м², {prop_type}, {tariff}\n"
                    f"Смета: {price_min:,.0f} – {price_max:,.0f} ₽\n"
                    f"Дата замера: {date_visit}\n"
                )
                await bot.send_message(
                    chat_id=int(ADMIN_CHAT_ID),
                    text=admin_alert,
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
