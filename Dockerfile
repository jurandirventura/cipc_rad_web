FROM python:3.10-slim

WORKDIR /app

COPY . .

#RUN pip install flask georaster georaster-layer-for-leaflet
RUN pip install flask georaster

EXPOSE 5000

CMD ["python", "app.py"]
