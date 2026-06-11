FROM python:3.10-slim

WORKDIR /app

RUN apt-get update && apt-get install -y \
    libexpat1 \
    gdal-bin \
    libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

COPY . .

#RUN pip install flask georaster georaster-layer-for-leaflet
RUN pip install \
    flask \
    pandas \
    numpy \
    rasterio \
    georaster

EXPOSE 5000

CMD ["python", "app.py"]
