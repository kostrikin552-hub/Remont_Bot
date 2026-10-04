"""
Модуль асинхронной очереди генерации файлов (PDF смет, актов, отчётов).
Предотвращает зависание event loop, перегрузку процессора и падение бота
при одновременном поступлении множества заявок.
"""

import asyncio
import logging
import time
import urllib.request
import urllib.parse
import json
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Any, Optional, List, Tuple

try:
    import httpx
    HAS_HTTPX = True
except ImportError:
    HAS_HTTPX = False
    httpx = None

try:
    from backend.pdf_generator import generate_estimate_pdf
except ImportError:
    try:
        from pdf_generator import generate_estimate_pdf
    except ImportError:
        generate_estimate_pdf = None

logger = logging.getLogger("file_queue")


def _send_document_urllib(token: str, chat_id: int, caption: str, filename: str, file_bytes: bytes) -> bool:
    """Резервная отправка документа в Telegram через urllib (без внешних зависимостей)"""
    boundary = "----TelegramFormBoundary" + hex(int(time.time() * 1000))[2:]
    body = bytearray()

    # chat_id
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(f'Content-Disposition: form-data; name="chat_id"\r\n\r\n{chat_id}\r\n'.encode())

    # caption
    if caption:
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="caption"\r\n\r\n{caption}\r\n'.encode())
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(f'Content-Disposition: form-data; name="parse_mode"\r\n\r\nHTML\r\n'.encode())

    # document file
    body.extend(f"--{boundary}\r\n".encode())
    body.extend(
        f'Content-Disposition: form-data; name="document"; filename="{filename}"\r\n'
        f'Content-Type: application/pdf\r\n\r\n'.encode()
    )
    body.extend(file_bytes)
    body.extend(f"\r\n--{boundary}--\r\n".encode())

    url = f"https://api.telegram.org/bot{token}/sendDocument"
    req = urllib.request.Request(
        url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status == 200
    except Exception as e:
        logger.warning(f"Ошибка отправки документа через urllib: {e}")
        return False


class FileGenerationQueue:
    """
    Потокобезопасная асинхронная очередь с пулом воркеров для тяжелой генерации файлов.
    - Ограничивает параллелизм (max_concurrent=2), чтобы не забивать RAM и CPU.
    - Выполняет ReportLab в ThreadPoolExecutor, не блокируя event loop asyncio.
    - Изолирует ошибки: падение одной генерации не ломает бота и другие запросы.
    - Ведёт статистику и мониторинг очереди.
    """

    def __init__(self, max_concurrent: int = 2, max_queue_size: int = 500):
        self.max_concurrent = max_concurrent
        self.max_queue_size = max_queue_size
        self._executor = ThreadPoolExecutor(
            max_workers=max_concurrent, thread_name_prefix="pdf_worker"
        )
        self._semaphore: Optional[asyncio.Semaphore] = None
        self._total_queued = 0
        self._total_completed = 0
        self._total_failed = 0
        self._active_jobs = 0

    @property
    def semaphore(self) -> asyncio.Semaphore:
        if self._semaphore is None:
            self._semaphore = asyncio.Semaphore(self.max_concurrent)
        return self._semaphore

    async def generate_pdf(
        self,
        lead_data: Dict[str, Any],
        company: Optional[Dict[str, Any]] = None,
        timeout: float = 25.0,
    ) -> Optional[bytes]:
        """
        Асинхронно ставит задачу генерации PDF в очередь и ожидает результат с тайм-аутом.
        Не блокирует event loop.
        """
        if not generate_estimate_pdf:
            logger.warning("Генератор PDF недоступен")
            return None

        self._total_queued += 1
        start_time = time.time()

        try:
            # Ожидаем свободный слот в семафоре очереди
            async with self.semaphore:
                self._active_jobs += 1
                try:
                    loop = asyncio.get_running_loop()
                    # Выполняем синхронную CPU-bound генерацию в отдельном потоке пула
                    pdf_bytes = await asyncio.wait_for(
                        loop.run_in_executor(
                            self._executor, generate_estimate_pdf, lead_data, company
                        ),
                        timeout=timeout,
                    )
                    self._total_completed += 1
                    elapsed = time.time() - start_time
                    logger.info(
                        f"PDF для заявки #{lead_data.get('id', 'N/A')} успешно сгенерирован "
                        f"в очереди за {elapsed:.2f}с (размер: {len(pdf_bytes)} байт, активных: {self._active_jobs})"
                    )
                    return pdf_bytes
                finally:
                    self._active_jobs = max(0, self._active_jobs - 1)
        except asyncio.TimeoutError:
            self._total_failed += 1
            logger.error(
                f"Тайм-аут ({timeout}с) ожидания/генерации PDF для заявки #{lead_data.get('id', 'N/A')}"
            )
            return None
        except Exception as e:
            self._total_failed += 1
            logger.error(
                f"Ошибка генерации PDF в очереди для заявки #{lead_data.get('id', 'N/A')}: {e}"
            )
            return None

    async def enqueue_and_send_telegram_pdf(
        self,
        lead_id: str,
        lead_data: Dict[str, Any],
        company: Optional[Dict[str, Any]],
        bot_targets: List[Tuple[str, str]],
        admin_chat_id: int,
        caption: str,
        timeout: float = 30.0,
    ) -> bool:
        """
        Фоновая задача: ставит генерацию PDF в очередь и после готовности
        отправляет файл в Telegram прорабу без блокировки ответа клиенту.
        """
        try:
            pdf_bytes = await self.generate_pdf(lead_data, company, timeout=timeout)
            if not pdf_bytes:
                logger.warning(
                    f"PDF для заявки #{lead_id} не был получен из очереди, отправка документа пропущена"
                )
                return False

            filename = f"Смета_{lead_id}.pdf"
            delivered = False

            if HAS_HTTPX and httpx:
                async with httpx.AsyncClient(timeout=20.0) as client:
                    for target_name, token in bot_targets:
                        try:
                            pdf_data = {
                                "chat_id": admin_chat_id,
                                "caption": caption,
                                "parse_mode": "HTML",
                            }
                            pdf_files = {
                                "document": (filename, pdf_bytes, "application/pdf")
                            }
                            doc_res = await client.post(
                                f"https://api.telegram.org/bot{token}/sendDocument",
                                data=pdf_data,
                                files=pdf_files,
                            )
                            if doc_res.status_code == 200:
                                logger.info(
                                    f"PDF-смета #{lead_id} из фоновой очереди успешно доставлена через {target_name}: 200 OK"
                                )
                                delivered = True
                                break
                            else:
                                logger.warning(
                                    f"Не удалось отправить PDF через {target_name}: {doc_res.status_code} {doc_res.text}"
                                )
                        except Exception as send_err:
                            logger.error(
                                f"Ошибка отправки PDF через {target_name} в Telegram: {send_err}"
                            )
            else:
                # Резервная отправка через поток urllib
                loop = asyncio.get_running_loop()
                for target_name, token in bot_targets:
                    ok = await loop.run_in_executor(
                        self._executor,
                        _send_document_urllib,
                        token,
                        admin_chat_id,
                        caption,
                        filename,
                        pdf_bytes,
                    )
                    if ok:
                        logger.info(
                            f"PDF-смета #{lead_id} доставлена через {target_name} (urllib): 200 OK"
                        )
                        delivered = True
                        break

            return delivered
        except Exception as e:
            logger.error(f"Исключение в фоновой очереди доставки PDF #{lead_id}: {e}")
            return False

    def get_stats(self) -> Dict[str, Any]:
        """Возвращает метрики работы очереди"""
        return {
            "max_concurrent": self.max_concurrent,
            "active_jobs": self._active_jobs,
            "total_queued": self._total_queued,
            "total_completed": self._total_completed,
            "total_failed": self._total_failed,
        }


# Глобальный синглтон очереди файлов
file_queue = FileGenerationQueue(max_concurrent=2)
