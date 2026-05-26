# Tiny FastAPI app that renders markdown through the same Pelican plugin
# chain as the live build. Deployed to Fly.io; called from the Sveltia CMS
# preview pane.
FROM python:3.12-slim

WORKDIR /app

# Install Python deps first so they cache independently of source changes.
COPY preview/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bring in the preview server AND the Pelican plugins it imports.
COPY preview/app.py /app/app.py
COPY plugins /app/plugins

ENV PORT=8080
EXPOSE 8080

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8080"]
