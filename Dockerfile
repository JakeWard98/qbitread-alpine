# ── Stage 1: build ────────────────────────────────────────────────────────
FROM python:3.12-alpine AS builder

# Build tools needed by bcrypt (C extension) and any future packages that
# require compilation. binutils provides `strip` used to shrink the venv's
# native shared-objects. All of this is discarded with the builder stage
# and never ships in the runtime image. bcrypt 5.x ships musllinux wheels
# for cp312 on amd64/arm64, so this is a fallback for arches without a wheel.
RUN apk add --no-cache \
    gcc \
    musl-dev \
    python3-dev \
    libffi-dev \
    binutils

WORKDIR /app
RUN python -m venv /venv
ENV PATH="/venv/bin:$PATH"

COPY requirements.txt .
# Install deps, then aggressively slim the venv:
#   - strip debug symbols from all .so files (big wins on pydantic_core, bcrypt)
#   - delete bundled tests/, __pycache__/, *.dist-info/, type stubs
#   - drop pip + setuptools (not needed at runtime)
RUN pip install --no-cache-dir --no-compile -r requirements.txt \
    && find /venv -type f -name "*.so" -exec strip --strip-unneeded {} + 2>/dev/null; true \
    && find /venv -type d \( -name tests -o -name test \) -prune -exec rm -rf {} + 2>/dev/null; true \
    && find /venv -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null; true \
    && find /venv -type d -name "*.dist-info" -exec rm -rf {} + 2>/dev/null; true \
    && find /venv -type f \( -name "*.pyi" -o -name "py.typed" \) -delete 2>/dev/null; true \
    && pip uninstall -y pip setuptools 2>/dev/null; true

# ── Stage 2: runtime ──────────────────────────────────────────────────────
FROM python:3.12-alpine

# Non-root user with no login shell. Alpine uses BusyBox addgroup/adduser.
RUN addgroup -S appuser && adduser -S -G appuser -h /app -s /sbin/nologin appuser

WORKDIR /app

# Copy only the compiled virtualenv — no compilers or headers in the final image
COPY --from=builder /venv /venv
ENV PATH="/venv/bin:$PATH" \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY app/ ./app/
COPY templates/ ./templates/
COPY static/ ./static/

RUN mkdir -p /app/data && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
