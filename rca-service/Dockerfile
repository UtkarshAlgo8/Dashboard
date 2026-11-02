FROM python:3.12-slim

# LibreOffice prints the Excel sheet to PDF.
# Fonts: Liberation Sans = metric twin of Arial (form font), Carlito = twin of Calibri
# (Before/After captions), DejaVu supplies the tick glyph.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libreoffice-calc-nogui fonts-liberation fonts-crosextra-carlito fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py rca_fill.py RCA_Master_Template.xlsx ./

EXPOSE 8010
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8010", "--workers", "2"]
