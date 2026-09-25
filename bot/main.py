"""
Telegram Bot для калькулятора ремонта квартир (Telegram Mini App)
Стек: Python 3.11+, aiogram 3.x, asyncio
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
    MenuButtonWebApp,
    Message,
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


def get_webapp_keyboard(company_id: Optional[str] = None) -> InlineKeyboardMarkup:
    """Генерация клавиатуры с кнопкой открытия Mini App"""
    url = WEBAPP_URL
    if company_id:
        separator = "&" if "?" in url else "?"
        url = f"{url}{separator}company_id={company_id}"

    keyboard = InlineKeyboardMarkup(
        inline_keyboard=[
            [
                InlineKeyboardButton(
                    text="📱 Рассчитать стоимость ремонта",
                    web_app=WebAppInfo(url=url),
                )
            ],
            [
                InlineKeyboardButton(
                    text="💬 Задать вопрос менеджеру",
                    callback_data="contact_manager",
                )
            ],
        ]
    )
    return keyboard


@router.message(CommandStart())
async def cmd_start(message: Message, command: CommandObject, bot: Bot):
    """Обработчик команды /start (с поддержкой реферальных и тенантных параметров)"""
    company_id = command.args.strip() if command.args else None

    # Настраиваем кнопку меню чата для быстрого открытия WebApp
    try:
        menu_url = (
            f"{WEBAPP_URL}?company_id={company_id}" if company_id else WEBAPP_URL
        )
        await bot.set_chat_menu_button(
            chat_id=message.chat.id,
            menu_button=MenuButtonWebApp(
                text="Калькулятор",
                web_app=WebAppInfo(url=menu_url),
            ),
        )
    except Exception as e:
        logger.warning(f"Не удалось установить MenuButtonWebApp: {e}")

    greeting = (
        f"Здравствуйте, {message.from_user.first_name}!\n\n"
        "🏠 Добро пожаловать в сервис онлайн-расчета стоимости ремонта квартир под ключ.\n\n"
        "⚡️ **Что вы можете сделать прямо в боте:**\n"
        "• Узнать точную вилку сметы за 1 минуту\n"
        "• Выбрать тип жилья (новостройка / вторичка) и метраж\n"
        "• Подобрать тариф: Косметический, Капитальный или Дизайнерский\n"
        "• Забронировать бесплатный выезд инженера с лазерным дальномером\n\n"
        "🎁 **Бонус при замере:** 3D-планировка расстановки мебели и смета за 24 ч — бесплатно!\n\n"
        "Нажмите кнопку ниже, чтобы открыть калькулятор:"
    )

    await message.answer(
        text=greeting,
        reply_markup=get_webapp_keyboard(company_id),
        parse_mode=ParseMode.MARKDOWN,
    )


@router.message(Command("calc"))
async def cmd_calc(message: Message):
    """Быстрый запуск калькулятора"""
    await message.answer(
        "🛠 Нажмите на кнопку, чтобы открыть калькулятор ремонта:",
        reply_markup=get_webapp_keyboard(),
    )


@router.message(Command("help"))
async def cmd_help(message: Message):
    """Справка по боту"""
    help_text = (
        "ℹ️ **Справка по командам бота:**\n\n"
        "/start — Главное меню и запуск приложения\n"
        "/calc — Открыть калькулятор сметы\n"
        "/help — Справка и частые вопросы\n\n"
        "🏢 **Для партнеров и строительных компаний:**\n"
        "Бот поддерживает мультитенантность. Вы можете запустить персональную версию калькулятора "
        "с вашим брендом и прайс-листом по ссылке: `t.me/your_bot?start=company_id`"
    )
    await message.answer(help_text, parse_mode=ParseMode.MARKDOWN)


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
            f"✅ **Заявка #{lead_id} успешно оформлена!**\n\n"
            f"👤 **Имя:** {name}\n"
            f"📞 **Телефон:** {phone}\n"
            f"📍 **Город:** {city}\n"
            f"📐 **Объект:** {area} м² ({prop_type})\n"
            f"🏷 **Тариф:** {tariff}\n"
            f"💰 **Ориентир сметы:** {price_min:,.0f} — {price_max:,.0f} ₽\n"
            f"📅 **Желаемая дата замера:** {date_visit}\n"
            f"💬 **Канал связи:** {comm_channel}\n\n"
            "🎁 **Ваш подарок зафиксирован:** бесплатный замер, точная смета и 3D-план.\n"
            "Инженер свяжется с вами в течение 15 минут!"
        )

        await message.answer(confirmation_text, parse_mode=ParseMode.MARKDOWN)

        # 2. Уведомление администратора / CRM
        if ADMIN_CHAT_ID:
            try:
                admin_alert = (
                    f"🔥 **НОВЫЙ ЛИД ИЗ КАЛЬКУЛЯТОРА!**\n"
                    f"ID: `{lead_id}`\n"
                    f"От: {message.from_user.full_name} (@{message.from_user.username or 'нет'})\n"
                    f"Телефон: `{phone}`\n"
                    f"Город: {city}\n"
                    f"Параметры: {area} м², {prop_type}, {tariff}\n"
                    f"Смета: {price_min:,.0f} – {price_max:,.0f} ₽\n"
                    f"Дата замера: {date_visit}\n"
                )
                await bot.send_message(
                    chat_id=int(ADMIN_CHAT_ID),
                    text=admin_alert,
                    parse_mode=ParseMode.MARKDOWN,
                )
            except Exception as e:
                logger.error(f"Не удалось отправить уведомление админу: {e}")

    except Exception as e:
        logger.error(f"Ошибка при обработке данных WebApp: {e}")
        await message.answer("✅ Ваша заявка получена! Мы свяжемся с вами в ближайшее время.")


@router.callback_query(F.data == "contact_manager")
async def cb_contact_manager(callback):
    """Кнопка связи с менеджером"""
    await callback.answer()
    await callback.message.answer(
        "📞 Вы можете позвонить нам по телефону: 8 (800) 555-35-35\n"
        "Или отправьте заявку через калькулятор ремонта, нажав кнопку «Рассчитать стоимость ремонта» выше."
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

    logger.info("Запуск бота Remont_Bot...")
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
