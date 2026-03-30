"""
Compress old log files to save disk space.

Compresses .log files older than 1 day into .log.gz files.
Runs as a background task in the application lifecycle or standalone.

Usage:
    python -m app.tasks.compress_logs           # One-shot
    Called from main.py lifespan as periodic task
"""

import gzip
import logging
import os
import shutil
from datetime import datetime, timedelta
from pathlib import Path

logger = logging.getLogger(__name__)

RECORDINGS_BASE = "data/recordings"
LOGS_BASE = "data/logs"
# Don't compress files modified within the last N hours
MIN_AGE_HOURS = 24


def compress_old_logs(base_dirs: list[str] | None = None, min_age_hours: int = MIN_AGE_HOURS):
    """Compress .log files older than min_age_hours into .log.gz.

    Scans all subdirectories of the given base directories.
    Skips files already compressed (has a .log.gz sibling).
    Deletes the original .log after successful compression.
    """
    if base_dirs is None:
        base_dirs = [RECORDINGS_BASE, LOGS_BASE]

    cutoff = datetime.now() - timedelta(hours=min_age_hours)
    total_compressed = 0
    total_saved_bytes = 0

    for base_dir in base_dirs:
        base_path = Path(base_dir)
        if not base_path.exists():
            continue

        # Find all .log files recursively
        for log_file in base_path.rglob("*.log"):
            if not log_file.is_file():
                continue

            # Skip if recently modified
            mtime = datetime.fromtimestamp(log_file.stat().st_mtime)
            if mtime > cutoff:
                continue

            # Skip if already has .gz companion
            gz_file = log_file.with_suffix(".log.gz")
            if gz_file.exists():
                continue

            # Skip tiny files (< 1KB)
            original_size = log_file.stat().st_size
            if original_size < 1024:
                continue

            try:
                # Compress
                with open(log_file, "rb") as f_in:
                    with gzip.open(gz_file, "wb", compresslevel=6) as f_out:
                        shutil.copyfileobj(f_in, f_out)

                compressed_size = gz_file.stat().st_size
                saved = original_size - compressed_size
                ratio = (1 - compressed_size / original_size) * 100

                # Verify compressed file is readable
                with gzip.open(gz_file, "rt", encoding="utf-8") as f_check:
                    f_check.readline()

                # Remove original
                log_file.unlink()
                total_compressed += 1
                total_saved_bytes += saved

                logger.info(f"Compressed {log_file}: {original_size:,}B -> {compressed_size:,}B "
                           f"({ratio:.0f}% reduction)")

            except Exception as e:
                logger.error(f"Failed to compress {log_file}: {e}")
                # Clean up failed .gz
                if gz_file.exists():
                    try:
                        gz_file.unlink()
                    except Exception:
                        pass

    if total_compressed > 0:
        logger.info(f"Log compression complete: {total_compressed} files, "
                   f"{total_saved_bytes / 1024 / 1024:.1f} MB saved")
    return total_compressed, total_saved_bytes


async def periodic_compress_loop(interval_hours: int = 6):
    """Background task that periodically compresses old logs."""
    import asyncio
    while True:
        await asyncio.sleep(interval_hours * 3600)
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(None, compress_old_logs)
        except Exception as e:
            logger.error(f"Periodic log compression failed: {e}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    count, saved = compress_old_logs()
    if count == 0:
        print("No files to compress (all recent or already compressed)")
    else:
        print(f"Done: {count} files compressed, {saved / 1024 / 1024:.1f} MB saved")
