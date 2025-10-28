// Глобальные переменные
let uploadedImages = [];
let currentImageIndex = -1;
let detectedObjects = {};
let settings = {
    detectionLimit: 0.5,
    georeference: true,
    pixelSize: 5.0,
    objectTheme: 'animals'
};

// Кэш для DOM элементов
let domCache = {};

let images = []

// Объекты для имитации распознавания по тематикам
const objectThemes = {
    animals: [
        { type: 'Собака', color: 'primary' },
        { type: 'Кошка', color: 'success' },
        { type: 'Птица', color: 'info' },
        { type: 'Лошадь', color: 'warning' },
        { type: 'Корова', color: 'secondary' }
    ],
    vehicles: [
        { type: 'Автомобиль', color: 'primary' },
        { type: 'Грузовик', color: 'success' },
        { type: 'Мотоцикл', color: 'info' },
        { type: 'Велосипед', color: 'warning' },
        { type: 'Автобус', color: 'secondary' }
    ],
    plants: [
        { type: 'Дерево', color: 'primary' },
        { type: 'Куст', color: 'success' },
        { type: 'Цветок', color: 'info' },
        { type: 'Трава', color: 'warning' },
        { type: 'Кактус', color: 'secondary' }
    ],
    buildings: [
        { type: 'Дом', color: 'primary' },
        { type: 'Офис', color: 'success' },
        { type: 'Магазин', color: 'info' },
        { type: 'Завод', color: 'warning' },
        { type: 'Школа', color: 'secondary' }
    ]
};

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Инициализация кэша DOM элементов
    initializeDomCache();

    // Проверяем поддержку webkitdirectory
    const fileInput = document.getElementById('fileInput');
    if (fileInput && 'webkitdirectory' in fileInput) {
        initUploadModeToggle();
    } else {
        // Если браузер не поддерживает webkitdirectory, скрываем переключатель
        console.warn('Браузер не поддерживает выбор папок');
    }

    // Настройка элементов интерфейса
    initializeUI();

//    // Загрузка сохраненных данных (если есть)
//    loadSavedData();
});

// Инициализация кэша DOM элементов для быстрого доступа
function initializeDomCache() {
    domCache = {
        uploadBtn: document.getElementById('uploadBtn'),
        fileInput: document.getElementById('fileInput'),
        analyzeBtn: document.getElementById('analyzeBtn'),
        exportBtn: document.getElementById('exportBtn'),
        paramsBtn: document.getElementById('paramsBtn'),
        saveSettings: document.getElementById('saveSettings'),
        settingsForm: document.getElementById('settingsForm'),
        detectionLimit: document.getElementById('detectionLimit'),
        detectionLimitValue: document.getElementById('detectionLimitValue'),
        imagePreview: document.getElementById('imagePreview'),
//        currentImageName: document.getElementById('currentImageName'),
        detectedObjects: document.getElementById('detectedObjects'),
        imageList: document.getElementById('imageList'),
//        imageCount: document.getElementById('imageCount'),
        exportResults: document.getElementById('exportResults'),
        navbarItemUploadBtn: document.getElementById('navbarUploadBtn'),
        detectedObjectsCard: document.getElementById('detectedObjectsCard'),
        previewCard: document.getElementById('previewCard'),
        previewAndDetectedRow: document.getElementById('previewAndDetectedRow')
    };
}

// Инициализация элементов интерфейса
function initializeUI() {
    // Обработчики для кнопок
    domCache.uploadBtn.addEventListener('click', function() {
        domCache.fileInput.click();
    });

    domCache.fileInput.addEventListener('change', handleFileUpload);
    domCache.analyzeBtn.addEventListener('click', analyzeImages);
    domCache.exportBtn.addEventListener('click', exportResults);
    domCache.saveSettings.addEventListener('click', saveSettings);

    // Обработчик для ползунка предела распознавания
    domCache.detectionLimit.addEventListener('input', function() {
        domCache.detectionLimitValue.textContent = this.value;
    });

    domCache.analyzeBtn.disabled = true;
    domCache.exportBtn.disabled = true;
    domCache.paramsBtn.disabled = true;
}

// Добавляем переключатель режима загрузки
function initUploadModeToggle() {
    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'mb-3 form-check form-switch';
    toggleContainer.innerHTML = `
        <input type="checkbox" class="form-check-input" id="folderMode" checked>
        <label class="form-check-label" for="folderMode">Загрузка папки</label>
    `;

    if (domCache.detectionLimit.parentNode && domCache.detectionLimit.parentNode.parentNode) {
        domCache.detectionLimit.parentNode.parentNode.insertBefore(toggleContainer, domCache.detectionLimit.parentNode);

        document.getElementById('folderMode').addEventListener('change', function(e) {
            const fileInput = document.getElementById('fileInput');
            if (fileInput) {
                if (e.target.checked) {
                    fileInput.setAttribute('webkitdirectory', '');
                    fileInput.setAttribute('directory', '');
                    fileInput.removeAttribute('multiple');
                } else {
                    fileInput.removeAttribute('webkitdirectory');
                    fileInput.removeAttribute('directory');
                    fileInput.setAttribute('multiple', '');
                }
            }
        });
    }
}

// `fileList` - это массив файлов, полученных из input
async function uploadToServer(fileList) {
    const formData = new FormData();

    // Добавляем все файлы в FormData
    for (let i = 0; i < fileList.length; i++) {
        formData.append('files', fileList[i]); // 'images' - название поля на сервере
    }
    res = {'result': null, 'error': null};
    try {
        const response = await fetch('/server/upload-images', {
            method: 'POST',
            body: formData // Content-Type устанавливается автоматически как multipart/form-data
        });

        if (response.ok) {
            const result = await response.json();
            console.log('Изображения успешно загружены!', result);
            res['result'] = result;
        } else {
            console.error('Ошибка при загрузке:', response.status);
            res['error'] = 'error upload';
        }
    } catch (error) {
        console.error('Сетевая ошибка:', error);
        res['error'] = 'error network';
    }
    return res;
}

// `fileList` - это массив файлов, полученных из input
async function convertTiffToPng(file) {
    const formData = new FormData();
    formData.append('files', file);

    console.log("formData", formData);

    res = {'result': null, 'error': null};
    try {
        const response = await fetch('/server/convert/tiff-to-png?save_georeference=false', {
            method: 'POST',
            body: formData // Content-Type устанавливается автоматически как multipart/form-data
        });
        if (response.ok) {
            let imageBlob = await response.blob();
            result = {
                blob: imageBlob,
                path: response.headers.get('Filepath')
            }
            res['result'] = result;
        }
    } catch (error) {
        console.error('Сетевая ошибка:', error);
        res['error'] = 'error network';
    }
    return res;
}

function removeExtension(filename) {
    return filename.replace(/\.[^/.]+$/, "");
}

async function handleFileUpload(event) {
    let files = event.target.files;
    if (!files || files.length === 0) return;

    // Показываем индикатор загрузки
    const originalText = domCache.uploadBtn.innerHTML;
    domCache.uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Загрузка...';
    domCache.uploadBtn.disabled = true;

    const SIZE_THRESHOLD = 200 * 1024 * 1024; // 200 МБ
    const processedFiles = new Set();
    const folderStats = {
        total: 0,
        images: 0,
        skipped: 0,
        folders: new Set(),
        largeFiles: 0,
        smallFiles: 0
    };

    const successfulImages = [];
    const imageForServer = [];

    try {
        // Сначала собираем информацию о файлах
        for (let i = 0; i < files.length; i++) {
            let file = files[i];
            folderStats.total++;

            const filePath = file.webkitRelativePath || file.name;
            const folderPath = filePath.includes('/') ?
            filePath.split('/').slice(0, -1).join('/') : 'корневая папка';

            if (folderPath !== 'корневая папка') {
                folderStats.folders.add(folderPath);
            }

            // Пропускаем не-изображения и дубликаты
            if (!file.type.match('image.*') || processedFiles.has(filePath)) {
                folderStats.skipped++;
                continue;
            }

            // Проверяем, не загружали ли мы файл с таким же именем ранее
            if (uploadedImages.some(img => removeExtension(img.path) === removeExtension(filePath))) {
                folderStats.skipped++;
                continue;
            }

            if (file.type === 'image/tiff') {
                convertResult = await convertTiffToPng(file);
                if (convertResult['error'] === 'error upload') {
                    showNotification(
                        'Не удалось конвертировать TIFF в PNG. Проверьте формат файла.',
                        'error'
                    );
                    folderStats.skipped++;
                    continue;
                } else if (convertResult['error'] === 'error network') {
                    showNotification(
                        'Сетевая ошибка при конвертации TIFF в PNG. Попробуйте позже.',
                        'warning'
                    );
                    folderStats.skipped++;
                    continue;
                } else {
                    if (convertResult['result'] !== (null || undefined)) {
                        console.log('Изображение успешно конвертировано!', convertResult['result']);
                        file = convertResult['result'][blob];
                        if (file.name === (null || undefined)) {
                            file.name = filePath
                        }
                        images.push({
                            "original_filename": filePath,
                            "uploaded_path": convertResult['result']['path']
                        })
                    }
                }

            }
            else {
                imageForServer.push(file)
            }

            processedFiles.add(filePath);
            folderStats.images++;

            // Определяем стратегию загрузки в зависимости от размера
            if (file.size > SIZE_THRESHOLD) {
                folderStats.largeFiles++;
                // Для больших файлов используем createObjectURL
                try {
                    const url = URL.createObjectURL(file);
                    const imageData = {
                        id: Date.now() + i + Math.random(),
                        name: file.name,
                        url: url,
                        analyzed: false,
                        path: filePath,
                        size: file.size,
                        type: file.type,
                        isBlobUrl: true, // Помечаем как blob URL для последующей очистки
                        loadMethod: 'blob'
                    };
                    successfulImages.push(imageData);
                } catch (error) {
                    console.error('Ошибка создания blob URL для большого файла:', file.name, error);
                    folderStats.skipped++;
                }
            } else {
                folderStats.smallFiles++;
                // Для маленьких файлов используем FileReader (сохраняем оригинальный подход)
                try {
                    const imageData = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = function(e) {
                            const imageData = {
                                id: Date.now() + i + Math.random(),
                                name: file.name,
                                url: e.target.result,
                                analyzed: false,
                                path: filePath,
                                size: file.size,
                                type: file.type,
                                isBlobUrl: false,
                                loadMethod: 'dataurl'
                            };
                            resolve(imageData);
                        };
                        reader.onerror = function() {
                            console.error('Ошибка чтения файла через FileReader:', file.name);
                            resolve(null);
                        };
                        reader.readAsDataURL(file);
                    });

                    if (imageData) {
                        successfulImages.push(imageData);
                    } else {
                        folderStats.skipped++;
                    }
                } catch (error) {
                    console.error('Ошибка при чтении маленького файла:', file.name, error);
                    folderStats.skipped++;
                }
            }
        }

        // Загружаем файлы на сервер (если требуется)
        let res;
        try {
            if (imageForServer.length !== 0) {
                res = await uploadToServer(imageForServer);
                console.log("res", res);

                if (res['error'] === 'error upload') {
                    showNotification('Не удалось загрузить изображения на сервер.', 'error');
                    // Отзываем blob URLs в случае ошибки
                    successfulImages.forEach(img => {
                        if (img.isBlobUrl) {
                            URL.revokeObjectURL(img.url);
                        }
                    });
                    images = [];
                    return;
                } else if (res['error'] === 'error network') {
                    showNotification('Сетевая ошибка при загрузке изображений. Попробуйте позже.', 'warning');
                    // Отзываем blob URLs в случае ошибки
                    successfulImages.forEach(img => {
                        if (img.isBlobUrl) {
                            URL.revokeObjectURL(img.url);
                        }
                    });
                    images = [];
                    return;
                } else {
                    if (res['result']['results'] !== (null || undefined)) {
                        console.log('Изображения успешно загружены на сервер!', res['result']['results']);
                        images.push(...res['result']['results']);
                    }
                }
            }
        } catch (error) {
            console.error('Ошибка при загрузке на сервер:', error);
            // Отзываем blob URLs в случае ошибки
            successfulImages.forEach(img => {
                if (img.isBlobUrl) {
                    URL.revokeObjectURL(img.url);
                }
            });
            images = [];
            throw error;
        }

        // Добавляем успешные изображения в основной массив
        if (successfulImages.length > 0) {
            uploadedImages.push(...successfulImages);
            updateImageList();

            if (currentImageIndex === -1 && uploadedImages.length > 0) {
                selectImage(0);
            }

            // Детальное уведомление о результате
            const folderCount = folderStats.folders.size;
            const folderText = folderCount > 0 ? ` из ${folderCount} папок` : '';
            const sizeInfo = folderStats.largeFiles > 0 ?
            ` (${folderStats.smallFiles} через DataURL, ${folderStats.largeFiles} через BlobURL)` : '';
            const skippedText = folderStats.skipped > 0 ?
            `, пропущено: ${folderStats.skipped}` : '';

            showNotification(
                `Успешно загружено ${successfulImages.length} изображений${folderText}${sizeInfo}${skippedText}`,
                'success'
            );
        } else {
            showNotification(
                `Не удалось загрузить изображения. Проверьте размер и формат файлов.`,
                'warning'
            );
        }

    } catch (error) {
        console.error('Общая ошибка при загрузке:', error);
        showNotification('Произошла ошибка при загрузке изображений', 'error');
    } finally {
        // Всегда восстанавливаем кнопку
        domCache.uploadBtn.innerHTML = originalText;
        domCache.uploadBtn.disabled = false;
        domCache.analyzeBtn.disabled = true;
        domCache.exportBtn.disabled = true;
        domCache.paramsBtn.disabled = false;
        event.target.value = '';
    }
    console.log('images', images);
}

// Дополнительная функция для очистки blob URLs при удалении изображений
function cleanupBlobUrls() {
    uploadedImages.forEach(img => {
        if (img.isBlobUrl && img.url) {
            URL.revokeObjectURL(img.url);
        }
    });
}

// Функция для удаления отдельного изображения с очисткой blob URL
function removeImage(index) {
    const image = uploadedImages[index];
    if (image && image.isBlobUrl && image.url) {
        URL.revokeObjectURL(image.url);
    }
    uploadedImages.splice(index, 1);
    updateImageList();
}

// Функция для показа уведомлений
function showNotification(message, type = 'info') {
    // Удаляем предыдущие уведомления
    const existingAlerts = document.querySelectorAll('.alert');
    existingAlerts.forEach(alert => {
        if (alert.parentNode) {
            alert.parentNode.removeChild(alert);
        }
    });

    // Создаем элемент уведомления
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} alert-dismissible fade show mt-3`;
    notification.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;

    // Вставляем уведомление в DOM
    const container = document.querySelector('.container');
    if (container) {
        container.insertBefore(notification, container.firstChild);

        // Автоматически скрываем через 5 секунд
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    }
}

// Функция для обрезки длинных путей
function truncatePath(path, maxLength) {
    if (!path || path.length <= maxLength) return path;

    const parts = path.split('/');
    if (parts.length <= 2) return path.substring(0, maxLength) + '...';

    // Оставляем первую и последнюю часть пути
    const firstPart = parts[0];
    const lastPart = parts[parts.length - 1];
    const remainingLength = maxLength - firstPart.length - lastPart.length - 5; // -5 для ".../"

    if (remainingLength <= 0) {
        return firstPart + '/.../' + lastPart;
    }

    return firstPart + '/.../' + lastPart;
}

// Обновление списка изображений
function updateImageList() {
    if (uploadedImages.length === 0) {
        domCache.imageList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-cloud-upload-alt mb-3"></i>
                <p class="text-muted">Изображения не загружены</p>
            </div>
        `;
        return;
    }

    // Создаем DocumentFragment для эффективного добавления элементов
    const fragment = document.createDocumentFragment();
    const container = document.createElement('div');
    container.className = 'd-flex flex-wrap image-list-container';

    uploadedImages.forEach((image, index) => {
        const badgeClass = image.analyzed ? 'bg-success' : 'bg-secondary';
        const badgeIcon = image.analyzed ? '✓' : '?';

        // Создаем контейнер для каждого изображения с названием
        const imageItem = document.createElement('div');
        imageItem.className = `image-item ${index === currentImageIndex ? 'active' : ''}`;
        imageItem.setAttribute('data-index', index);

        console.log(image);
        // Формируем содержимое с названием изображения
        imageItem.innerHTML = `
            <div class="image-title" title="${image.name}">${image.name}</div>
            <div class="image-thumbnail fade-in">
                <img src="${image.url}" alt="${image.name}" loading="lazy">
                <div class="thumbnail-badge ${badgeClass}">${badgeIcon}</div>
            </div>
        `;

        container.appendChild(imageItem);
    });

    fragment.appendChild(container);

    // Очищаем и добавляем новые элементы
    domCache.imageList.innerHTML = '';
    domCache.imageList.appendChild(fragment);

    // Добавляем обработчики клика на миниатюры с делегированием событий
    domCache.imageList.addEventListener('click', function(e) {
        const thumbnail = e.target.closest('.image-item');
        if (thumbnail) {
            const index = parseInt(thumbnail.getAttribute('data-index'));
            selectImage(index);
        }
    });
}

// Выбор изображения для просмотра (оптимизированная версия)
function selectImage(index) {
    if (index === currentImageIndex) return; // Уже выбрано это изображение

    currentImageIndex = index;
    const image = uploadedImages[index];

    // Быстрое обновление превью без перерисовки всего DOM
    const previewImg = domCache.imagePreview.querySelector('img');
    if (previewImg) {
        // Если уже есть изображение, просто меняем src
        previewImg.src = image.url;
        previewImg.alt = image.name;
    } else {
        // Создаем новое изображение
        domCache.imagePreview.innerHTML = `<img src="${image.url}" alt="${image.name}" class="fade-in" id="zoomImage">`;
    }

    // Обновляем название текущего изображения
//    domCache.currentImageName.textContent = image.name;

    // Обновляем список распознанных объектов
    updateDetectedObjectsList();

    // Обновляем активный класс в списке изображений (быстрый способ)
    const thumbnails = domCache.imageList.querySelectorAll('.image-thumbnail');
    thumbnails.forEach((thumb, i) => {
        if (i === index) {
            thumb.classList.add('active');
        } else {
            thumb.classList.remove('active');
        }
    });
}

// Обновление списка распознанных объектов
function updateDetectedObjectsList() {
    const imageId = uploadedImages[currentImageIndex].id;

    if (!detectedObjects[imageId] || detectedObjects[imageId].length === 0) {
        domCache.detectedObjects.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search mb-3"></i>
                <p class="text-muted">Объекты будут отображены здесь после анализа</p>
            </div>
        `;
        return;
    }

    let html = '';
    detectedObjects[imageId].forEach((obj, index) => {
        const checked = obj.verified ? 'checked' : '';
        html += `
            <div class="object-item fade-in">
                <input type="checkbox" class="object-checkbox form-check-input" data-image="${imageId}" data-index="${index}" ${checked}>
                <span class="object-type badge bg-${obj.color}">${obj.type}</span>
                <span>Объект ${index + 1}</span>
                <span class="object-confidence">${(obj.confidence * 100).toFixed(1)}%</span>
            </div>
        `;
    });

    domCache.detectedObjects.innerHTML = html;

    // Добавляем обработчики для чекбоксов с делегированием событий
    domCache.detectedObjects.addEventListener('change', function(e) {
        if (e.target.classList.contains('object-checkbox')) {
            const imageId = e.target.getAttribute('data-image');
            const objIndex = parseInt(e.target.getAttribute('data-index'));
            detectedObjects[imageId][objIndex].verified = e.target.checked;
//            saveToLocalStorage();
        }
    });
    domCache.detectedObjectsCard.hidden = false;
    domCache.exportBtn.hidden = false;
}

// Анализ изображений
async function analyzeImages() {
    if (uploadedImages.length === 0) {
        alert('Пожалуйста, загрузите изображения для анализа.');
        return;
    }

    // Показываем индикатор загрузки
    const analyzeBtn = domCache.analyzeBtn;
    const originalText = analyzeBtn.innerHTML;
    analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Анализ...';
    analyzeBtn.disabled = true;
    console.log('uploadedImages', uploadedImages);
    imagePaths = images.map(image => image.uploaded_path);
    console.log('imagePaths', imagePaths);
    // Подготавливаем данные для отправки
    const requestData = {
        image_paths: imagePaths
    };

    // Отправляем POST запрос на эндпоинт /detect
    const response = await fetch('server/detect', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(requestData)
    });

    console.log('response detect', response);

    // Имитация анализа с задержкой
//    setTimeout(() => {
//        // нужно будет переделать под работу с сервером
//        // Анализируем каждое изображение
//        uploadedImages.forEach(image => {
//            if (!image.analyzed) {
//                // Генерируем случайные объекты для изображения
//                const objects = generateRandomObjects();
//                detectedObjects[image.id] = objects;
//                image.analyzed = true;
//            }
//        });
//
//        // Обновляем интерфейс
//        updateImageList();
//        if (currentImageIndex >= 0) {
//            updateDetectedObjectsList();
//        }
//
//        // Восстанавливаем кнопку
//        analyzeBtn.innerHTML = originalText;
//        analyzeBtn.disabled = false;
//
////        // Сохраняем данные
////        saveToLocalStorage();
//
//        // Показываем уведомление об успехе
//        showNotification('Анализ завершен!', 'success');
//
//        domCache.uploadBtn.disabled = true;
//        domCache.analyzeBtn.disabled = false;
//        domCache.exportBtn.disabled = false;
//        domCache.paramsBtn.disabled = true;
//
//    }, 0);
}

// Генерация случайных объектов для имитации
function generateRandomObjects() {
    const themeObjects = objectThemes[settings.objectTheme];
    const numObjects = Math.floor(Math.random() * 5) + 3; // От 3 до 7 объектов

    const objects = [];
    for (let i = 0; i < numObjects; i++) {
        const randomObj = themeObjects[Math.floor(Math.random() * themeObjects.length)];
        objects.push({
            type: randomObj.type,
            color: randomObj.color,
            confidence: Math.random() * 0.4 + 0.6, // От 0.6 до 1.0
            verified: false
        });
    }

    return objects;
}

// Экспорт результатов
function exportResults() {
    if (uploadedImages.length === 0) {
        showNotification('Нет данных для экспорта.', 'warning');
        return;
    }

    let html = '<div class="d-grid gap-2">';

    // Считаем количество проверенных объектов
    let totalVerified = 0;
    let totalObjects = 0;

    Object.keys(detectedObjects).forEach(imageId => {
        const objects = detectedObjects[imageId];
        totalObjects += objects.length;
        totalVerified += objects.filter(obj => obj.verified).length;
    });

    // Формируем результаты экспорта
    html += `
        <div class="export-item fade-in">
            <span class="badge bg-primary">JSON</span>
            <span>Векторные данные объектов (${totalVerified} проверенных из ${totalObjects})</span>
            <button class="btn btn-sm btn-outline-primary ms-auto">Скачать</button>
        </div>
        <div class="export-item fade-in">
            <span class="badge bg-success">ZIP</span>
            <span>Размеченные изображения (${uploadedImages.length} файлов)</span>
            <button class="btn btn-sm btn-outline-success ms-auto">Скачать</button>
        </div>
        <div class="export-item fade-in">
            <span class="badge bg-info">CSV</span>
            <span>Таблица с данными объектов</span>
            <button class="btn btn-sm btn-outline-info ms-auto">Скачать</button>
        </div>
    `;

    html += '</div>';
    domCache.exportResults.innerHTML = html;

    // Добавляем обработчики для кнопок скачивания (имитация)
    domCache.exportResults.addEventListener('click', function(e) {
        if (e.target.tagName === 'BUTTON') {
            const format = e.target.previousElementSibling.previousElementSibling.textContent;
            showNotification(`Имитация скачивания ${format} файла`, 'info');

            domCache.uploadBtn.disabled = false;
            domCache.analyzeBtn.disabled = true;
            domCache.exportBtn.disabled = false;
            domCache.paramsBtn.disabled = true;
        }
    });
}

// Сохранение настроек
function saveSettings() {
    settings.detectionLimit = parseFloat(document.getElementById('detectionLimit').value);
    settings.georeference = document.getElementById('georeference').checked;
    settings.pixelSize = parseFloat(document.getElementById('pixelSize').value);
    settings.objectTheme = document.getElementById('objectTheme').value;

    // Закрываем модальное окно
    const modal = bootstrap.Modal.getInstance(document.getElementById('settingsModal'));
    modal.hide();

//    // Сохраняем настройки
//    saveToLocalStorage();

    showNotification('Настройки сохранены!', 'success');

    domCache.uploadBtn.disabled = true;
    domCache.analyzeBtn.disabled = false;;
    domCache.exportBtn.disabled = true;
    domCache.paramsBtn.disabled = false;

}

