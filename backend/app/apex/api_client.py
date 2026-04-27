"""
Apex Timing PHP API client.
Exact port of websocket_Secuencial.py request_api(), extract_drivers(), parse_pit_data().

The Apex PHP API provides detailed data not available via WebSocket:
  - INF: Driver information (id, name, current)
  - P: Pit data (numPit, lapIn, timeIn, timeOut, etc.)
  - L: Lap data (lapNumber, lapTime per lap)
"""

import re
import logging
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Default Apex PHP API URL
DEFAULT_PHP_API_URL = "https://live.apex-timing.com/commonv2/functions/request.php"


class ApexApiClient:
    """Client for the Apex Timing PHP API."""

    def __init__(self, php_api_url: str = DEFAULT_PHP_API_URL, php_api_port: int = 0):
        self.php_api_url = php_api_url
        self.php_api_port = php_api_port
        self._client = httpx.AsyncClient(timeout=10.0, verify=False)

    async def close(self):
        await self._client.aclose()

    async def request_api(self, row_id: str, info_type: str) -> str:
        """
        Exact port of websocket_Secuencial.py request_api().
        Makes a POST request to the Apex PHP API.

        Args:
            row_id: e.g. "r7980"
            info_type: "INF" (drivers), "P" (pits), "L" (laps)

        Returns:
            Response text or empty string on error.
        """
        if not self.php_api_port:
            return ""

        row_id_numeric = row_id[1:]  # strip "r" prefix
        payload = {
            "port": str(self.php_api_port),
            "request": f"D#-999#D{row_id_numeric}.{info_type}",
        }

        try:
            response = await self._client.post(self.php_api_url, data=payload)
            if response.status_code == 200:
                return response.text
            logger.warning(f"API error {response.status_code} for {row_id}.{info_type}")
            return ""
        except Exception as e:
            logger.error(f"API request failed for {row_id}.{info_type}: {e}")
            return ""

    def extract_drivers(self, html: str) -> list[dict]:
        """
        Parses driver info from an INF API response.

        Handles two formats:
          - Individual kart:  D7458.INF#<driver id="7458" name="IVAN GARCÍA" .../>
          - Team kart:        <driver id="16967" name="TMS RACING #PRO" ...>
                                <driver id="16969" name="HERMIER Carl" current="1"/>
                                ...
                              </driver>

        For team responses the outer <driver> is the team container; we skip it
        and return only the leaf (nested) drivers.

        Returns list of {"id": str, "name": str, "is_current": bool}
        """
        if not html or "Error" in html:
            return []

        try:
            soup = BeautifulSoup(html, "html.parser")
            drivers = []
            for driver in soup.find_all("driver"):
                # Skip team containers: they have at least one nested <driver> child.
                if driver.find("driver"):
                    continue
                driver_id = driver.get("id")
                name = driver.get("name")
                is_current = driver.get("current") == "1"
                if driver_id and name:
                    drivers.append({
                        "id": driver_id,
                        "name": name.strip(),
                        "is_current": is_current,
                    })
            return drivers
        except Exception as e:
            logger.error(f"Error parsing drivers: {e}")
            return []

    def parse_pit_data(self, data: str) -> list[dict]:
        """
        Exact port of websocket_Secuencial.py parse_pit_data().
        Parses pit stop data from P API response.

        Format per line: numPit|lapIn|timeIn|timeOut|timePit|timeStint|lapStint|idDriver|timeAcumulado

        Returns list of pit dicts.
        """
        if not data or "Error" in data:
            return []

        pits = []
        try:
            for line in data.splitlines():
                parts = line.split("|")
                if len(parts) < 9:
                    continue

                pits.append({
                    "numPit": int(parts[0].split("#")[-1]) if parts[0].strip() else 0,
                    "lapIn": int(parts[1]) if parts[1].strip() else 0,
                    "timeIn": int(parts[2]) if parts[2].strip() else 0,
                    "timeOut": int(parts[3]) if parts[3].strip() else 0,
                    "timePit": int(parts[4]) if parts[4].strip() else 0,
                    "timeStint": int(parts[5]) if parts[5].strip() else 0,
                    "lapStint": int(parts[6]) if parts[6].strip() else 0,
                    "idDriver": int(parts[7]) if parts[7].strip() else 0,
                    "timeAcumulado": int(parts[8]) if parts[8].strip() else 0,
                })
        except Exception as e:
            logger.error(f"Error parsing pit data: {e}")

        return pits

    def parse_laps(self, data: str) -> list[tuple[int, int]]:
        """
        Exact port of websocket_Secuencial.py lap parsing from L API response.
        Pattern: L{lapNumber}#...|...|...|{cssClass}{lapTimeMs}

        Returns list of (lap_number, lap_time_ms).
        """
        if not data or "Error" in data:
            return []

        pattern = r"L(\d{4})#(?:[^|]*\|){3}([a-zA-Z]*)(\d+)"
        matches = re.findall(pattern, data)
        return [(int(m[0]), int(m[2])) for m in matches]

    def get_last_pit_info(self, pit_data: str) -> tuple[int, int, int]:
        """
        Extract last pit's lapIn, timeIn, timeOut from P API response (first line).
        Used to determine vueltaUltimoPit.

        Returns (vueltaUltimoPit, tiempoUltimoPitIn, tiempoUltimoPitOut)
        """
        if not pit_data or "Error" in pit_data:
            return (1, 0, 0)

        lines = pit_data.splitlines()
        if not lines:
            return (1, 0, 0)

        try:
            parts = lines[0].split("|")
            if len(parts) > 3:
                vuelta = int(parts[1]) if parts[1].strip() else 1
                tiempo_in = int(parts[2]) if parts[2].strip() else 0
                tiempo_out = int(parts[3]) if parts[3].strip() else 0
                return (vuelta, tiempo_in, tiempo_out)
        except (ValueError, IndexError):
            pass

        return (1, 0, 0)
