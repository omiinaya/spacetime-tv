FROM python:3.12-slim

WORKDIR /app

# Install system deps for ffmpeg (VOD remux) + git (hermes-id is installed
# from a git+https URL in requirements.txt; python:3.12-slim has no git).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg git && \
    rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code
COPY . .

# Override static dir for Docker (ROOT resolves to /app)
ENV STATIC_DIR=/app/web/dist

# The frontend dist is mounted at runtime via docker-compose volume (./web/dist:/app/web/dist)

EXPOSE 8720

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8720"]
