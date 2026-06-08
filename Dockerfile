# 프로덕션 백엔드 이미지 (Messages API 모드).
# CLI/구독 경로(claude-code, Node)는 로컬 개발 전용이라 이 이미지에는 없다.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=/app/src \
    BACKEND=api \
    HOST=0.0.0.0 \
    PORT=8080

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/

EXPOSE 8080
# 방별 인메모리 세션이 있는 단일 상시 프로세스(스케일 시 room 단위 sticky 필요).
# PORT는 환경변수로(Fly=8080 고정, Railway 등은 동적 주입). 둘 다 호환되게 ${PORT:-8080}.
CMD ["sh", "-c", "uvicorn tour_agent.main:app --host 0.0.0.0 --port ${PORT:-8080}"]
