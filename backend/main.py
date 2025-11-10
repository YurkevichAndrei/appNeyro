import io
import os
import tempfile
import uuid
from pathlib import Path
from zipfile import ZipFile

from fastapi import FastAPI, File, UploadFile, HTTPException, BackgroundTasks, Query, Response
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import asyncio
from osgeo import gdal

from sahi.predict import get_sliced_prediction
from sahi import AutoDetectionModel
import torch
from PIL import Image, ImageDraw, ImageFont


# Модели данных
class DetectionRequest(BaseModel):
    image_paths: List[str]


class DetectionSettingsRequest(BaseModel):
    settings: dict


class DetectionResult(BaseModel):
    image_path: str
    detections: List[dict]


class DetectionResponse(BaseModel):
    results: List[DetectionResult]
    errors: Optional[List[str]] = None


class UploadResponse(BaseModel):
    results: List[dict]
    errors: Optional[List[str]] = None


class ImageMetadata(BaseModel):
    image_path: str
    filename: str


# Инициализация FastAPI приложения
app = FastAPI(title="Object Detection API")

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4444",
        "http://127.0.0.1:4444",
        "http://localhost:8000",
        "http://127.0.0.1:8000"
        # "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

gdal.UseExceptions()

# Глобальные переменные для модели
MODEL_PATH = "models/yolo_rgb_weights_obb_301025.pt"
detection_model = None

# Папки для хранения файлов
data_dir = tempfile.mkdtemp()
UPLOAD_DIR = os.path.join(data_dir, "uploaded_images")
ANNOTATED_DIR = os.path.join(data_dir, "annotated_images")
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(ANNOTATED_DIR, exist_ok=True)
print(f"Data directory: {data_dir}")

detect_settings = DetectionSettingsRequest(settings={
    "model_type": "visible",
    "confidence_threshold": 0.5,
    "slice_size": 512,
    "overlap_ratio": 0.3,
    "georeference": False,
    "pixelSize": 5.0
})

# Инициализация модели при запуске
@app.on_event("startup")
async def startup_event():
    load_model()


# Функция для загрузки модели
def load_model():
    global detection_model
    try:
        detection_model = AutoDetectionModel.from_pretrained(
            model_type="ultralytics",
            model_path=MODEL_PATH,
            confidence_threshold=detect_settings.settings["confidence_threshold"],
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
                "type": obj.category.name,
                "bbox": [int(bbox[0]), int(bbox[1]), int(bbox[2]), int(bbox[3])], # x y w h
                "confidence": float(obj.score.value),
                "verified": None
            })

        return detections

    except Exception as e:
        raise Exception(f"Detection failed for {image_path}: {str(e)}")


# Функция для рисования bounding boxes
def draw_bounding_boxes(image_path: str, detections: List[dict]):
    """Рисует bounding boxes на изображении и сохраняет результат"""
    try:
        output_path = os.path.join(ANNOTATED_DIR, os.path.basename(image_path))
        # Открываем изображение
        image = Image.open(image_path)
        draw = ImageDraw.Draw(image)

        # Настройки для рисования
        colors = ['red', 'green', 'blue', 'yellow', 'purple', 'orange']
        font = ImageFont.load_default()

        print(detections)

        # Рисуем каждый bounding box
        for detection in detections:
            print(detection)
            bbox = detection['bbox']
            x, y, w, h = bbox
            color = 'red'

            # Рисуем прямоугольник
            draw.rectangle([x, y, x + w, y + h], outline=color, width=3)

            # Добавляем подпись
            label = f"{detection['type']} {detection['confidence']:.2f}"
            print(label)
            text_bbox = draw.textbbox((x, y), label, font=font)
            draw.rectangle(text_bbox, fill=color)
            draw.text((x, y), label, fill='white', font=font)

        # Сохраняем изображение
        image.save(output_path)
        print(output_path)

    except Exception as e:
        raise Exception(f"Failed to draw bounding boxes: {str(e)}")


# Функция для обработки в отдельном процессе
def process_detection_formatting(image_path: str, detections: List[dict]) -> dict:
    """Форматирует результаты детекции для JSON ответа"""
    return {
        "image_path": image_path,
        "detections": detections
    }


def create_world_file(png_path: str, geotransform: tuple):
    """Создает мировой файл (.pgw) для PNG"""
    # Проверяем наличие мирового файла
    world_file = png_path.replace('.png', '.pgw')
    if geotransform and not os.path.exists(world_file):
        # Создаем мировой файл вручную если он не создался автоматически
        with open(world_file, 'w') as f:
            f.write(f"{geotransform[1]}\n")   # Pixel width (x-scale)
            f.write(f"{geotransform[4]}\n")   # Rotation parameter (usually 0)
            f.write(f"{geotransform[2]}\n")   # Rotation parameter (usually 0)
            f.write(f"{geotransform[5]}\n")   # Pixel height (y-scale, negative)
            f.write(f"{geotransform[0] + geotransform[1] * 0.5}\n")  # X-coordinate of center
            f.write(f"{geotransform[3] + geotransform[5] * 0.5}\n")  # Y-coordinate of center


@app.post("/convert/tiff-to-png")
async def convert_tiff_to_png(
        files: List[UploadFile] = File(...),
        save_georeference: bool = Query(False, description="Сохранять ли геопривязку")
):
    """
    Конвертирует TIFF файл в PNG с возможностью сохранения геопривязки

    - **file**: TIFF файл для конвертации
    - **save_georeference**: Сохранять ли геопривязку (по умолчанию False)
    """
    file = files[0]
    # Проверяем что файл TIFF
    if not file.filename.lower().endswith(('.tif', '.tiff')):
        raise HTTPException(
            status_code=400,
            detail="Формат файла не поддерживается. Загрузите TIFF файл."
        )

    # Генерируем уникальное имя файла
    file_extension = os.path.splitext(file.filename)[1]
    unique_filename = f"{uuid.uuid4()}{file_extension}"
    upload_path = os.path.join(UPLOAD_DIR, unique_filename)

    print(file.filename)

    # Сохраняем загруженный файл
    with open(upload_path, "wb") as buffer:
        content = await file.read()
        buffer.write(content)

    temp_dir = tempfile.mkdtemp()
    try:
        dataset = None
        try:
            # Открываем исходный TIFF-файл
            dataset = gdal.Open(upload_path, gdal.GA_ReadOnly)
            if dataset is None:
                raise Exception(f"Не удалось открыть файл: {upload_path}")
        except RuntimeError as e:
            print(f"Ошибка GDAL: {e}")
            return HTTPException(
                status_code=500,
                detail=f"Ошибка при открытии TIFF файла: {str(e)}"
                )

        # Получаем геоинформацию
        geotransform = dataset.GetGeoTransform()
        projection = dataset.GetProjection()
        bands_count = dataset.RasterCount

        # Создаем драйвер для PNG
        driver = gdal.GetDriverByName('PNG')
        if driver is None:
            raise Exception("Драйвер PNG не поддерживается")

        # Создаем имя для выходного файла
        output_filename = file.filename.replace('.tiff', '.png').replace('.tif', '.png')
        output_png_path = os.path.join(temp_dir, output_filename)

        # Создаем выходной файл
        png_dataset = driver.CreateCopy(output_png_path, dataset, 0)
        if png_dataset is None:
            raise Exception(f"Ошибка при создании PNG-файла: {output_png_path}")

        # Закрываем datasets
        png_dataset = None
        dataset = None

        # Создаем мировой файл с геопривязкой только если требуется
        if save_georeference:
            create_world_file(output_png_path, geotransform)
            print(f"Геопривязка сохранена: {output_png_path}")
        else:
            print("Геопривязка не сохранена по запросу пользователя")

        # Проверяем что файл создан
        if not os.path.exists(output_png_path):
            raise HTTPException(
                status_code=500,
                detail="Ошибка при создании PNG файла"
            )
        headers = {'Filepath': upload_path}
        return FileResponse(path=output_png_path, media_type='image/png', headers=headers)

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Ошибка при конвертации: {str(e)}"
        )


# Оригинальный эндпоинт для детекции по путям
@app.post("/detect", response_model=DetectionResponse)
async def detect_objects_endpoint(request: DetectionRequest, background_tasks: BackgroundTasks):
    """Оригинальный эндпоинт для детекции по путям к изображениям"""
    results = []
    errors = []

    # Создаем executor для фоновых задач
    loop = asyncio.get_event_loop()

    for image_path in request.image_paths:
        print(image_path)
        try:
            # Последовательная детекция на GPU
            detections = await loop.run_in_executor(
                None, detect_objects, image_path
            )

            # # Нанесение результатов
            # await loop.run_in_executor(
            #     None, draw_bounding_boxes, image_path, detections
            # )

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
    # loop = asyncio.get_event_loop()

    for file in files:
        try:
            # Генерируем уникальное имя файла
            file_extension = os.path.splitext(file.filename)[1]
            unique_filename = f"{uuid.uuid4()}{file_extension}"
            upload_path = os.path.join(UPLOAD_DIR, unique_filename)

            print(file.filename)

            # Сохраняем загруженный файл
            with open(upload_path, "wb") as buffer:
                content = await file.read()
                buffer.write(content)

            # # Последовательная детекция на GPU
            # detections = await loop.run_in_executor(
            #     None, detect_objects, upload_path
            # )
            #
            # # Рисуем bounding boxes и сохраняем размеченное изображение
            # await loop.run_in_executor(
            #     None, draw_bounding_boxes, upload_path, detections, annotated_path
            # )

            # Форматируем результат
            formatted_result = {
                "original_filename": file.filename,
                "uploaded_path": upload_path,
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


@app.post("/export/images-detect")
async def export_images_detect(request: List[DetectionResult]):
    """Эндпоинт для разметки и отправки изображений"""
    # Проверяем, что пути переданы
    if len(request) == 0:
        raise HTTPException(status_code=400, detail="No data provided")

    results = []
    errors = []

    # Создаем executor для фоновых задач
    loop = asyncio.get_event_loop()
    print(request)
    for image in request:
        print(image.image_path)
        try:
            # Нанесение результатов
            await loop.run_in_executor(
                None, draw_bounding_boxes, image.image_path, image.detections
            )
        except FileNotFoundError:
            errors.append(f"File not found: {image.image_path}")
        except Exception as e:
            errors.append(str(e))

    # Создаем буфер в памяти для ZIP-архива
    zip_buffer = io.BytesIO()

    # Счетчик успешно добавленных файлов
    added_files_count = 0

    # Создаем ZIP-архив и добавляем файлы
    with ZipFile(zip_buffer, "w") as zip_file:
        for image in request:
            file_path = os.path.join(ANNOTATED_DIR, os.path.basename(image.image_path))
            try:
                # Проверяем существование файла
                if not os.path.exists(file_path):
                    continue

                # Проверяем, что это файл, а не директория
                if not os.path.isfile(file_path):
                    continue

                # Проверяем, что файл является изображением (по расширению)
                image_extensions = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp'}
                file_extension = Path(file_path).suffix.lower()
                if file_extension not in image_extensions:
                    continue

                # Читаем содержимое файла
                with open(file_path, "rb") as f:
                    file_contents = f.read()

                # Получаем только имя файла (без пути)
                filename = os.path.basename(file_path)

                # Добавляем файл в архив
                zip_file.writestr(filename, file_contents)
                added_files_count += 1

            except Exception as e:
                # Логируем ошибку, но продолжаем обработку других файлов
                print(f"Error processing file {file_path}: {str(e)}")
                continue

    # Проверяем, что хотя бы один файл был добавлен
    if added_files_count == 0:
        raise HTTPException(
            status_code=404,
            detail="No valid image files found from the provided paths"
        )

    # Перемещаем указатель в начало буфера
    zip_buffer.seek(0)

    # Возвращаем архив как потоковый ответ
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={
            "Content-Disposition": "attachment; filename=images.zip",
            "X-Files-Added": str(added_files_count)
        }
    )


@app.post("/detect/settings")
async def update_detect_settings(request: DetectionSettingsRequest):
    print(request.settings)
    detect_settings.settings['confidence_threshold'] = float(request.settings['detectionLimit'])
    detect_settings.settings['georeference'] = bool(request.settings['georeference'])
    detect_settings.settings['pixel_size'] = float(request.settings['pixelSize'])
    load_model()


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