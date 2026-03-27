FROM python:3.12-slim

WORKDIR /app

# Install dependencies first (cache layer)
COPY pyproject.toml .
RUN pip install --no-cache-dir \
    fastapi uvicorn[standard] websockets \
    "sqlalchemy[asyncio]" aiosqlite \
    beautifulsoup4 httpx pandas numpy \
    jenkspy scikit-learn pydantic-settings \
    python-dotenv bcrypt PyJWT

COPY . .
RUN mkdir -p data/logs

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
