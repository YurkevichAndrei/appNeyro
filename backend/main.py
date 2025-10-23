import os
import uuid
from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import asyncio
import concurrent.futures
from sahi.predict import get_sliced_prediction
from sahi import AutoDetectionModel
from sahi.utils.cv import read_image
from sahi.prediction import ObjectPrediction
import torch
from PIL import Image, ImageDraw, ImageFont
import json

# Инициализация FastAPI приложения
app = FastAPI(title="Object Detection API")

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4444",
        "http://127.0.0.1:4444",
        "http://localhost:8080",
        "http://127.0.0.1:8080",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Глобальные переменные для модели
MODEL_PATH = "models/yolo_rgb_weights_obb.pt"
detection_model = None

# Папки для хранения файлов
UPLOAD_DIR = "uploaded_images"
ANNOTATED_DIR = "annotated_images"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(ANNOTATED_DIR, exist_ok=True)

# Модели данных
class DetectionRequest(BaseModel):
    image_paths: List[str]

class DetectionResult(BaseModel):
    image_path: str
    detections: List[dict]

class DetectionResponse(BaseModel):
    results: List[DetectionResult]
    errors: Optional[List[str]] = None

class UploadResponse(BaseModel):
    results: List[dict]
    errors: Optional[List[str]] = None

# Инициализация модели при запуске
@app.on_event("startup")
async def startup_event():
    global detection_model
    try:
        detection_model = AutoDetectionModel.from_pretrained(
            model_type="ultralytics",
            model_path=MODEL_PATH,
            confidence_threshold=0.3,
            device="cuda:0" if torch.cuda.is_available() else "cpu"
        )
        print(f"Model loaded successfully on device: {detection_model.device}")
    except Exception as e:
        print(f"Error loading model: {e}")
        raise

# Функция для детекции на одном изображении
def detect_objects(image_path: str) -> List[dict]:
    """Выполняет детекцию объектов на изображении с помощью SAHI"""
    try:
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image not found: {image_path}")

        # Выполняем слайсинг-детекцию
        result = get_sliced_prediction(
            image_path,
            detection_model,
            slice_height=512,
            slice_width=512,
            overlap_height_ratio=0.3,
            overlap_width_ratio=0.3,
        )

        # Форматируем результаты
        detections = []
        for obj in result.object_prediction_list:
            bbox = obj.bbox.to_xywh()
            detections.append({
                "category_name": obj.category.name,
                "bbox": [int(bbox.x), int(bbox.y), int(bbox.w), int(bbox.h)],
                "confidence": float(obj.score.value)
            })

        return detections

    except Exception as e:
        raise Exception(f"Detection failed for {image_path}: {str(e)}")

# Функция для рисования bounding boxes
def draw_bounding_boxes(image_path: str, detections: List[dict], output_path: str):
    """Рисует bounding boxes на изображении и сохраняет результат"""
    try:
        # Открываем изображение
        image = Image.open(image_path)
        draw = ImageDraw.Draw(image)

        # Настройки для рисования
        colors = ['red', 'green', 'blue', 'yellow', 'purple', 'orange']
        font = ImageFont.load_default()

        # Рисуем каждый bounding box
        for i, detection in enumerate(detections):
            bbox = detection['bbox']
            x, y, w, h = bbox
            color = colors[i % len(colors)]

            # Рисуем прямоугольник
            draw.rectangle([x, y, x + w, y + h], outline=color, width=3)

            # Добавляем подпись
            label = f"{detection['category_name']} {detection['confidence']:.2f}"
            text_bbox = draw.textbbox((x, y), label, font=font)
            draw.rectangle(text_bbox, fill=color)
            draw.text((x, y), label, fill='white', font=font)

        # Сохраняем изображение
        image.save(output_path)

    except Exception as e:
        raise Exception(f"Failed to draw bounding boxes: {str(e)}")

# Функция для обработки в отдельном процессе
def process_detection_formatting(image_path: str, detections: List[dict]) -> dict:
    """Форматирует результаты детекции для JSON ответа"""
    return {
        "image_path": image_path,
        "detections": detections
    }

# Оригинальный эндпоинт для детекции по путям
@app.post("/detect", response_model=DetectionResponse)
async def detect_objects_endpoint(request: DetectionRequest, background_tasks: BackgroundTasks):
    """Оригинальный эндпоинт для детекции по путям к изображениям"""
    results = []
    errors = []

    # Создаем executor для фоновых задач
    loop = asyncio.get_event_loop()

    for image_path in request.image_paths:
        try:
            # Последовательная детекция на GPU
            detections = await loop.run_in_executor(
                None, detect_objects, image_path
            )

            # Форматирование в отдельном процессе
            formatted_result = await loop.run_in_executor(
                None, process_detection_formatting, image_path, detections
            )

            results.append(formatted_result)

        except FileNotFoundError:
            errors.append(f"File not found: {image_path}")
        except Exception as e:
            errors.append(str(e))

    return DetectionResponse(results=results, errors=errors if errors else None)

# Новый эндпоинт для загрузки изображений
@app.post("/upload-images", response_model=UploadResponse)
async def upload_images(files: List[UploadFile] = File(...)):
    """Эндпоинт для загрузки изображений через multipart/form-data"""
    results = []
    errors = []

    # Создаем executor для фоновых задач
    loop = asyncio.get_event_loop()

    for file in files:
        try:
            # Генерируем уникальное имя файла
            file_extension = os.path.splitext(file.filename)[1]
            unique_filename = f"{uuid.uuid4()}{file_extension}"
            upload_path = os.path.join(UPLOAD_DIR, unique_filename)
            annotated_path = os.path.join(ANNOTATED_DIR, unique_filename)

            # Сохраняем загруженный файл
            with open(upload_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)

            # Последовательная детекция на GPU
            detections = await loop.run_in_executor(
                None, detect_objects, upload_path
            )

            # Рисуем bounding boxes и сохраняем размеченное изображение
            await loop.run_in_executor(
                None, draw_bounding_boxes, upload_path, detections, annotated_path
            )

            # Форматируем результат
            formatted_result = {
                "original_filename": file.filename,
                "uploaded_path": upload_path,
                "annotated_path": annotated_path,
                "detections": detections
            }

            results.append(formatted_result)

        except Exception as e:
            errors.append(f"Error processing {file.filename}: {str(e)}")

    return UploadResponse(results=results, errors=errors if errors else None)

# Эндпоинт для получения размеченных изображений
@app.get("/annotated-images/{image_name}")
async def get_annotated_image(image_name: str):
    """Эндпоинт для получения размеченных изображений"""
    image_path = os.path.join(ANNOTATED_DIR, image_name)

    if not os.path.exists(image_path):
        raise HTTPException(status_code=404, detail="Image not found")

    return FileResponse(
        image_path,
        media_type="image/jpeg",
        filename=image_name
    )

# Эндпоинт для получения списка всех размеченных изображений
@app.get("/annotated-images")
async def list_annotated_images():
    """Эндпоинт для получения списка всех размеченных изображений"""
    images = []
    for filename in os.listdir(ANNOTATED_DIR):
        if filename.lower().endswith(('.png', '.jpg', '.jpeg')):
            images.append({
                "name": filename,
                "path": f"/annotated-images/{filename}",
                "size": os.path.getsize(os.path.join(ANNOTATED_DIR, filename))
            })

    return {"images": images}

# Эндпоинт для проверки здоровья сервера
@app.get("/health")
async def health_check():
    """Проверка состояния сервера"""
    return {
        "status": "healthy",
        "gpu_available": torch.cuda.is_available(),
        "model_loaded": detection_model is not None
    }

# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run(
#         "main:app",
#         host="0.0.0.0",
#         port=8000,
#         reload=True
#     )