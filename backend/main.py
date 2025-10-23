import os
import asyncio
import concurrent.futures
from typing import List
from fastapi import FastAPI
from pydantic import BaseModel
from sahi import AutoDetectionModel
from sahi.predict import get_sliced_prediction
import torch

# Проверяем доступность GPU
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Using device: {device}")

# Инициализируем модель (замените на путь к вашей кастомной модели)
MODEL_PATH = "models/yolo_rgb_weights_obb.pt"  # Укажите путь к вашей модели

# Создаем модель детекции SAHI
detection_model = AutoDetectionModel.from_pretrained(
    model_type="ultralytics",
    model_path=MODEL_PATH,
    confidence_threshold=0.25,
    device=device,
    load_at_init=False  # Инициализируем позже
)

# Инициализируем модель
detection_model.load_model()

app = FastAPI(title="Object Detection API")

# Модели данных Pydantic
class BBox(BaseModel):
    x_min: float
    y_min: float
    width: float
    height: float

class Detection(BaseModel):
    category_name: str
    bbox: List[float]  # [x_min, y_min, width, height]
    confidence: float

class ImageResult(BaseModel):
    image_path: str
    detections: List[Detection]

class DetectionResponse(BaseModel):
    results: List[ImageResult]

class DetectionRequest(BaseModel):
    image_paths: List[str]

def process_single_image(image_path: str) -> ImageResult:
    """
    Обрабатывает одно изображение и возвращает результат детекции.
    Эта функция выполняется в основном процессе для гарантии последовательной работы с GPU.
    """
    try:
        # Выполняем детекцию с использованием SAHI
        result = get_sliced_prediction(
            image_path,
            detection_model,
            slice_height=512,
            slice_width=512,
            overlap_height_ratio=0.3,
            overlap_width_ratio=0.3
        )

        # Форматируем результаты детекции
        detections = []
        for obj_prediction in result.object_prediction_list:
            bbox = obj_prediction.bbox

            detection = Detection(
                category_name=obj_prediction.category.name,
                bbox=[
                    bbox.minx,  # x_min
                    bbox.miny,  # y_min
                    bbox.maxx - bbox.minx,  # width
                    bbox.maxy - bbox.miny   # height
                ],
                confidence=float(obj_prediction.score.value)
            )
            detections.append(detection)

        return ImageResult(
            image_path=image_path,
            detections=detections
        )

    except Exception as e:
        # В случае ошибки возвращаем результат с пустыми детекциями
        return ImageResult(
            image_path=image_path,
            detections=[],
            error=str(e)
        )

def format_detection_result(image_result: ImageResult) -> dict:
    """
    Форматирует результат детекции для JSON ответа.
    Эта функция выполняется в отдельном процессе.
    """
    return {
        "image_path": image_result.image_path,
        "detections": [
            {
                "category_name": det.category_name,
                "bbox": det.bbox,
                "confidence": det.confidence
            }
            for det in image_result.detections
        ]
    }

@app.post("/detect", response_model=DetectionResponse)
async def detect_objects(request: DetectionRequest):
    """
    Эндпоинт для детекции объектов на изображениях.
    """
    results = []

    # Создаем Process Pool Executor для форматирования результатов
    with concurrent.futures.ProcessPoolExecutor() as executor:
        loop = asyncio.get_event_loop()

        # Обрабатываем изображения последовательно
        for image_path in request.image_paths:
            # Проверяем существование файла
            if not os.path.exists(image_path):
                # Создаем результат с ошибкой
                error_result = ImageResult(
                    image_path=image_path,
                    detections=[],
                    error=f"File not found: {image_path}"
                )
                # Форматируем в отдельном процессе
                formatted_result = await loop.run_in_executor(
                    executor, format_detection_result, error_result
                )
                results.append(formatted_result)
                continue

            try:
                # ДЕТЕКЦИЯ: выполняем последовательно на GPU
                image_result = process_single_image(image_path)

                # ФОРМАТИРОВАНИЕ: выполняем в отдельном процессе
                formatted_result = await loop.run_in_executor(
                    executor, format_detection_result, image_result
                )
                results.append(formatted_result)

            except Exception as e:
                # Обрабатываем ошибки детекции
                error_result = ImageResult(
                    image_path=image_path,
                    detections=[],
                    error=f"Detection error: {str(e)}"
                )
                formatted_result = await loop.run_in_executor(
                    executor, format_detection_result, error_result
                )
                results.append(formatted_result)

    return DetectionResponse(results=results)

@app.get("/health")
async def health_check():
    """Эндпоинт для проверки работоспособности сервера"""
    return {
        "status": "healthy",
        "device": device,
        "model_loaded": detection_model is not None
    }

# if __name__ == "__main__":
#     import uvicorn
#     uvicorn.run(
#         "main:app",
#         host="0.0.0.0",
#         port=8000,
#         reload=False
#     )