// Глобальные переменные
let uploadedImages = [];
let currentImageIndex = -1;
let detectedObjects = {};
let settings = {
    modelType: 'visible',
    detectionLimit: 0.5,
    georeference: false,
    pixelSize: 5.0
};

// Кэш для DOM элементов
let domCache = {};

let images = []

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    // Инициализация кэша DOM элементов
    initializeDomCache();

    // Настройка элементов интерфейса
    initializeUI();

    viewer.setAnnotationRecalcCallback(function() {
        updateDetectedObjectsList();
    });

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
        detectionSlice: document.getElementById('detectionSlice'),
        detectionSliceValue: document.getElementById('detectionSliceValue'),
        detectionOverlap: document.getElementById('detectionOverlap'),
        detectionOverlapValue: document.getElementById('detectionOverlapValue'),
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
    window.addEventListener('beforeunload', (event) => {
        event.preventDefault(); // Обязательно для работы подтверждения
        event.returnValue = ''; // Стандартное сообщение (браузер может его изменить)
        // Дополнительные действия (например, очистка localStorage)
    });

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
        domCache.detectionLimitValue.textContent = `${parseInt(parseFloat(this.value).toFixed(2) * 100, 10)}%`; // Округление до 2 знаков после запятой
    });
    domCache.detectionSlice.addEventListener('input', function() {
        domCache.detectionSliceValue.textContent = this.value;
    });
    domCache.detectionOverlap.addEventListener('input', function() {
        domCache.detectionOverlapValue.textContent = this.value;
    });

    domCache.detectionLimitValue.textContent = domCache.detectionLimit.value;

    document.getElementById('georeference').addEventListener('change', function() {
        if (this.checked) {
            document.getElementById('pixelSize').disabled = false;
        } else {
            document.getElementById('pixelSize').disabled = true;
        }
    });

    // Добавляем обработчики клика на миниатюры с делегированием событий
    domCache.imageList.addEventListener('click', function(e) {
        const thumbnail = e.target.closest('.image-item');
        if (thumbnail) {
            console.log('click image list');
            const index = parseInt(thumbnail.getAttribute('data-index'), 10);
            selectImage(index);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (currentImageIndex !== -1) {
            if (event.key === 'ArrowLeft' || event.key === 'a') {
                // Действие для "назад"
                if ((currentImageIndex - 1) >= 0) {
                    selectImage(currentImageIndex - 1);
                }
            }
            if (event.key === 'ArrowRight' || event.key === 'd') {
                // Действие для "вперед"
                if ((currentImageIndex + 1) < uploadedImages.length) {
                    selectImage(currentImageIndex + 1);
                }
            }
        }
    });

    domCache.analyzeBtn.disabled = true;
    domCache.exportBtn.disabled = true;
    domCache.paramsBtn.disabled = true;
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
                        file = convertResult['result']['blob'];
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
                        analyzed: null,
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
                                analyzed: null,
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
        let badge = '';
        console.log(image);
        if (image.analyzed !== null) {
            const badgeClass = image.analyzed ? 'bg-success' : 'bg-secondary';
            const badgeIcon = image.analyzed ? '✓' : '?';
            badge = `<div class="thumbnail-badge ${badgeClass}">${badgeIcon}</div>`;
        }


        // Создаем контейнер для каждого изображения с названием
        const imageItem = document.createElement('div');
        imageItem.className = `image-item ${index === currentImageIndex ? 'active' : ''}`;
//        imageItem.className = `image-item`;
        imageItem.setAttribute('data-index', index);

        // Формируем содержимое с названием изображения
        imageItem.innerHTML = `
            <div class="image-title" title="${image.name}">${image.name}</div>
            <div class="image-thumbnail fade-in">
                <img src="${image.url}" alt="${image.name}" loading="lazy">
                ${badge}
            </div>
        `;

        container.appendChild(imageItem);
    });

    fragment.appendChild(container);

    // Очищаем и добавляем новые элементы
    domCache.imageList.innerHTML = '';
    domCache.imageList.appendChild(fragment);
}

// Выбор изображения для просмотра (оптимизированная версия)
function selectImage(index) {
    currentImageIndex = index;
    if (detectedObjects.lenght !== 0) {
        // Обновляем список распознанных объектов
        updateDetectedObjectsList();
    }

//    if (index === currentImageIndex) return; // Уже выбрано это изображение


    const image = uploadedImages[index];

//    domCache.imagePreview.innerHTML = "";

    // Быстрое обновление превью без перерисовки всего DOM
    const previewImg = domCache.imagePreview.querySelector('img');
    if (previewImg) {
        // Если уже есть изображение, просто меняем src
        previewImg.src = image.url;
        previewImg.alt = image.name;
    } else {
        // Создаем новое изображение
        domCache.imagePreview.innerHTML = `<img src="${image.url}" alt="${image.name}" class="fade-in" id="zoomImage" onload="onImageLoad()">`;
//        domCache.imagePreview.innerHTML = "";
//        viewer.loadImage(image.url, image.name);
    }

    // Обновляем название текущего изображения
//    domCache.currentImageName.textContent = image.name;


    // Обновляем активный класс в списке изображений (быстрый способ)
    const items = domCache.imageList.querySelectorAll('.image-item');
    items.forEach((item, i) => {
        var thumb = item.querySelector('.image-thumbnail');
        if (i === index) {
            item.classList.add('active');
            thumb.classList.add('active');
        } else {
            item.classList.remove('active');
            thumb.classList.remove('active');
        }
    });
}

// Обновление списка распознанных объектов
function updateDetectedObjectsList() {
    viewer.resetView();
    if (currentImageIndex === -1) return;
    const imageId = uploadedImages[currentImageIndex].id;
    console.log('imageId', imageId);
    if (!detectedObjects[imageId] || detectedObjects[imageId]['detections'].length === 0) {
        domCache.detectedObjects.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-search mb-3"></i>
                <p class="text-muted">Объекты будут отображены здесь после анализа</p>
            </div>
        `;
        return;
    }

    viewer.clearAnnotations();

    if (document.getElementById('button-visible') !== null) {
        var button_visible = document.getElementById('button-visible');
        button_visible.setAttribute('visibility', 'true');
        button_visible.innerHTML = `Скрыть все`;
    }

    let color = '#f94144c7';
    if (settings.modelType === 'infrared') {
//        color = '#78ff00c7';
        color = '#30ff43c7';
    } else {
        color = '#f94144c7';
    }

    let html = '';
    detectedObjects[imageId]['detections'].forEach((obj, index) => {
        const checked = obj.verified ? 'checked' : '';
        html += `
            <div class="object-item fade-in" id="object-${index}" data-index="${index}">
                <input type="checkbox" class="object-checkbox form-check-input" data-image="${imageId}" data-index="${index}" ${checked}>
                <span class="object-type badge bg-accent">${obj.type}</span>
                <span>Объект ${index + 1}</span>
                <span class="object-confidence">${(obj.confidence * 100).toFixed(1)}%</span>
                <button class="toggle-visible" type="button" visibility="true" data-index="${index}">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eye" viewBox="0 0 16 16">
                      <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/>
                      <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>
                    </svg>
                </button>
            </div>
        `;

        viewer.addRectangle(obj.bbox[0], obj.bbox[1], obj.bbox[2], obj.bbox[3], `${index + 1}. ${obj.type} ${(obj.confidence * 100).toFixed(1)}`, index, color);
    });

    domCache.detectedObjects.innerHTML = html;

    var objects = document.querySelectorAll('.object-item');
    objects.forEach(object => {
        object.addEventListener('mouseenter', () => {
           const index = object.getAttribute('data-index');
           document.getElementById(`label_${index}`).style.background = 'var(--color)';
        });
        object.addEventListener('mouseleave', () => {
            const index = object.getAttribute('data-index');
            document.getElementById(`label_${index}`).style.background = 'rgba(255, 255, 255, 0.8)';
        });
    });

    var buttons = document.querySelectorAll('.toggle-visible');
    buttons.forEach(button => {
        button.addEventListener('click', function() {
//            если выделены все, то поменять 'button-visible'
            const index = button.getAttribute('data-index');
//            нужно получить id нажатой кнопки и по нему получить id объекта
            let rect = document.getElementById(`rect_${index}`);
            let label = document.getElementById(`label_${index}`);
            if (button.getAttribute('visibility') === 'true') {
                rect.style.display = 'none';
                label.style.display = 'none';
                button.setAttribute('visibility', 'false');
                button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eye-slash" viewBox="0 0 16 16">
                <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z"/>
                <path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/>
                <path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/>
            </svg>`;
            } else {
                document.getElementById(`annotationContainer`).style.display = 'flex';
                rect.style.display = 'flex';
                label.style.display = 'flex';
                button.setAttribute('visibility', 'true');
                button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eye" viewBox="0 0 16 16">
                <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/>
                <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>
            </svg>`;
            }

            let visible_count = 0;
            buttons.forEach(but => {
                if (but.getAttribute('visibility') === 'true') {
                    visible_count++;
                }
            });

            if (visible_count === buttons.length) {
                var bv = document.getElementById('button-visible');
                bv.innerHTML = `Скрыть все`;
                bv.setAttribute('visibility', 'true');
            } else {
                var bv = document.getElementById('button-visible');
                bv.innerHTML = `Показать все`;
                bv.setAttribute('visibility', 'false');
            }
        });
    });

    // Добавляем обработчики для чекбоксов с делегированием событий
    domCache.detectedObjects.addEventListener('change', function(e) {
        if (e.target.classList.contains('object-checkbox')) {
            const imageId = e.target.getAttribute('data-image');
            const objIndex = parseInt(e.target.getAttribute('data-index'), 10);
            detectedObjects[imageId]['detections'][objIndex].verified = e.target.checked;

            var image = domCache.imageList.querySelector('.image-item.active');
            const data_index = image.getAttribute('data-index');
            uploadedImages[data_index].analyzed = false;
            var badge = image.querySelector('.thumbnail-badge');
            badge.classList.replace('bg-success', 'bg-secondary');
            badge.classList.replace('bg-danger', 'bg-secondary');
            badge.innerText = '?';
//            saveToLocalStorage();
            e.target.setAttribute('checked', e.target.checked);
            let button = document.getElementById('button-checked');
            let checked = true;
            document.querySelectorAll('.object-checkbox').forEach(checkbox => {
                if (!checkbox.checked) {
                    checked = false;
                }
            });
            if (!checked) {
                button.setAttribute('checked', 'false');
                button.innerHTML = `Выделить все`;
            } else {
                button.innerHTML = `Сбросить`;
                button.setAttribute('checked', 'true');
            }
        }
    });

    if (document.getElementById('button-checked')) {
        let button = document.getElementById('button-checked');
        let checked = true;
        document.querySelectorAll('.object-checkbox').forEach(checkbox => {
            if (!checkbox.checked) {
                checked = false;
            }
        });
        if (!checked) {
            button.setAttribute('checked', 'false');
            button.innerHTML = `Выделить все`;
        } else {
            button.innerHTML = `Сбросить`;
            button.setAttribute('checked', 'true');
        }
    }

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
    analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Поиск...';
    analyzeBtn.disabled = true;
    domCache.paramsBtn.disabled = true;
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

    const result_detect = await response.json();
    console.log('response detect', result_detect);

    if (result_detect['errors'] !== null) {
        console.log('errors', result_detect['errors']);
        showNotification('Ошибка при анализе изображений.', 'error');
        return;
    }

    if (result_detect['results'] !== (null || undefined)) {
        for (let i = 0; i < result_detect['results'].length; i++) {
            console.log('image_path', i, result_detect['results'][i]['image_path']);
            const imagePath = images.find(img => img.uploaded_path === result_detect['results'][i]['image_path']);
            let image = uploadedImages.find(img => img.name === imagePath['original_filename']);
            if (image) {
                image.analyzed = false;
                detectedObjects[image.id] = result_detect['results'][i];
            }
        }
    }

    // Обновляем интерфейс
    updateImageList();
    if (currentImageIndex >= 0) {
        console.log(domCache.imagePreview, domCache.imagePreview.parentElement, domCache.imagePreview.parentElement.style);
//        console.log('wh container', `${domCache.imagePreview.parentElement.style.width}px`, `${domCache.imagePreview.parentElement.style.height}px`);
        if (!(document.getElementById('annotationContainer'))) {
            viewer.imageWrapper.appendChild(viewer.annotationContainer);
        }

        updateDetectedObjectsList();

        if (!(document.getElementById('button-bar-detected'))) {
            let bar = document.createElement('div');
            bar.id = 'button-bar-detected';
            bar.className = 'd-flex';
            domCache.detectedObjects.parentNode.insertBefore(bar, domCache.detectedObjects);
        }

        if (!(document.getElementById('button-checked'))) {
            let button = document.createElement('button');
            button.className = 'btn btn-accent me-2';
            button.setAttribute('type', 'button');
            button.setAttribute('checked', 'false');
            button.id = 'button-checked';
            button.innerHTML = `Выделить все`;
            button.addEventListener('click', function() {
                const checked = button.getAttribute('checked');
                if (checked === 'true') {
                    button.innerHTML = `Выделить все`;
                    button.setAttribute('checked', 'false');
                    document.querySelectorAll('.object-checkbox').forEach(checkbox => {
                        if (checkbox.checked) {
                            checkbox.click();
                        }
                        checkbox.setAttribute('checked', 'false');
                    });
                } else {
                    button.innerHTML = `Сбросить`;
                    button.setAttribute('checked', 'true');
                    document.querySelectorAll('.object-checkbox').forEach(checkbox => {
                        if (!checkbox.checked) {
                            checkbox.click();
                        }
                        checkbox.setAttribute('checked', 'true');
                    });
                }

            });
            document.getElementById('button-bar-detected').insertAdjacentElement('afterbegin', button);
        }

        if (!(document.getElementById('button-visible'))) {
            let button = document.createElement('button');
            button.className = 'btn btn-accent me-2';
            button.setAttribute('type', 'button');
            button.setAttribute('visibility', 'true');
            button.id = 'button-visible';
            button.innerHTML = `Скрыть все`;
            button.addEventListener('click', function() {
                const visibility = button.getAttribute('visibility');
                if (visibility === 'true') {
                    button.innerHTML = `Показать все`;
                    button.setAttribute('visibility', 'false');
                    document.querySelectorAll('.toggle-visible').forEach(button_visible => {
                        const index = button_visible.getAttribute('data-index');
                        let rect = document.getElementById(`rect_${index}`);
                        let label = document.getElementById(`label_${index}`);
                        rect.style.display = 'none';
                        label.style.display = 'none';
                        button_visible.setAttribute('visibility', 'false');
                        button_visible.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eye-slash" viewBox="0 0 16 16">
                            <path d="M13.359 11.238C15.06 9.72 16 8 16 8s-3-5.5-8-5.5a7.028 7.028 0 0 0-2.79.588l.77.771A5.944 5.944 0 0 1 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.134 13.134 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755-.165.165-.337.328-.517.486l.708.709z"/>
                            <path d="M11.297 9.176a3.5 3.5 0 0 0-4.474-4.474l.823.823a2.5 2.5 0 0 1 2.829 2.829l.822.822zm-2.943 1.299.822.822a3.5 3.5 0 0 1-4.474-4.474l.823.823a2.5 2.5 0 0 0 2.829 2.829z"/>
                            <path d="M3.35 5.47c-.18.16-.353.322-.518.487A13.134 13.134 0 0 0 1.172 8l.195.288c.335.48.83 1.12 1.465 1.755C4.121 11.332 5.881 12.5 8 12.5c.716 0 1.39-.133 2.02-.36l.77.772A7.029 7.029 0 0 1 8 13.5C3 13.5 0 8 0 8s.939-1.721 2.641-3.238l.708.709zm10.296 8.884-12-12 .708-.708 12 12-.708.708z"/>
                        </svg>`;
                    });
                } else {
                    button.innerHTML = `Скрыть все`;
                    button.setAttribute('visibility', 'true');
                    document.querySelectorAll('.toggle-visible').forEach(button_visible => {
                        const index = button_visible.getAttribute('data-index');
                        let rect = document.getElementById(`rect_${index}`);
                        let label = document.getElementById(`label_${index}`);
                        document.getElementById(`annotationContainer`).style.display = 'flex';
                        rect.style.display = 'flex';
                        label.style.display = 'flex';
                        button_visible.setAttribute('visibility', 'true');
                        button_visible.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-eye" viewBox="0 0 16 16">
                            <path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/>
                            <path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM4.5 8a3.5 3.5 0 1 1 7 0 3.5 3.5 0 0 1-7 0z"/>
                        </svg>`;
                    });
                }

            });
//            domCache.detectedObjects.parentNode.insertBefore(button, domCache.detectedObjects);
            document.getElementById('button-bar-detected').insertAdjacentElement('beforeend', button);
        }

        if (!(document.getElementById('button-confirm'))) {
            let button = document.createElement('button');
            button.className = 'btn btn-accent me-2';
            button.setAttribute('type', 'button');
            button.id = 'button-confirm';
            button.innerHTML = `ОК`;
            button.addEventListener('click', function() {
                var detectObjects = domCache.detectedObjects.children;
                const imageId = detectObjects[0].children[0].getAttribute('data-image');
                let verifiedObjects = 0;
                detectedObjects[imageId]['detections'].forEach(obj => {
                    if (obj.verified) {
                        verifiedObjects++;
                    }
                });
                var image = domCache.imageList.querySelector('.image-item.active');
                const data_index = image.getAttribute('data-index');
                uploadedImages[data_index].analyzed = true;
                var badge = image.querySelector('.thumbnail-badge');
                if (detectObjects.length === 0 || verifiedObjects === 0) {
                    badge.classList.replace('bg-secondary', 'bg-danger');
                    badge.innerText = '✕';
                } else {
                    badge.classList.replace('bg-secondary', 'bg-success');
                    badge.innerText = '✓';
                }
            });
//            domCache.detectedObjects.parentNode.after(domCache.detectedObjects, button);
            domCache.detectedObjects.parentNode.insertAdjacentElement('beforeend', button);
        }

        const rect = domCache.imagePreview.parentElement.getBoundingClientRect();
        document.getElementById('annotationContainer').style.height = `${rect.height}px`;
        document.getElementById('annotationContainer').style.width = `${rect.width}px`;
    }

    // Восстанавливаем кнопку
    analyzeBtn.innerHTML = originalText;
    analyzeBtn.disabled = false;

    // Показываем уведомление об успехе
    showNotification('Анализ завершен!', 'success');

    domCache.uploadBtn.disabled = true;
    domCache.analyzeBtn.disabled = false;
    domCache.exportBtn.disabled = false;
}

async function exportImages() {
    var requestData = [];
    Object.keys(detectedObjects).forEach(imageId => {
        result = {}
        const objects = detectedObjects[imageId];

        result['image_path'] = objects['image_path'];
        result['detections'] = objects['detections'].filter(obj => obj.verified);
        requestData.push(result);
    });

    res = {'result': null, 'error': null};
    try {
        console.log('requestData', JSON.stringify(requestData));
        // Отправляем POST запрос на эндпоинт /detect
        const response = await fetch('server/export/images-detect', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Ошибка сервера: ${response.status}`);
        }

        // Получаем blob с архивом
        const blob = await response.blob();

        // Проверяем, что архив не пустой
        if (blob.size === 0) {
            throw new Error('Получен пустой архив');
        }

        // Создаем ссылку для скачивания
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;

        // Получаем имя файла из заголовков или используем стандартное
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'images.zip';
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="(.+)"/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }
        a.download = filename;

        // Добавляем ссылку в DOM и кликаем по ней
        document.body.appendChild(a);
        a.click();

        // Очищаем
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Показываем успешный статус
        const filesAdded = response.headers.get('X-Files-Added');
        const successMessage = filesAdded
        ? `Архив успешно создан! Добавлено файлов: ${filesAdded}`
        : 'Архив успешно создан и скачан!';

    } catch (error) {
        console.error('Сетевая ошибка:', error);
        res['error'] = 'error network';
    }

    domCache.uploadBtn.disabled = true;
    domCache.analyzeBtn.disabled = true;
    domCache.exportBtn.disabled = false;
    domCache.paramsBtn.disabled = true;
}


async function exportXLSX() {
    var requestData = [];
    Object.keys(detectedObjects).forEach(imageId => {
        result = {}
        const objects = detectedObjects[imageId];

        result['image_path'] = objects['image_path'];
        result['detections'] = objects['detections'].filter(obj => obj.verified);
        requestData.push(result);
    });

    res = {'result': null, 'error': null};
    try {
        console.log('requestData', JSON.stringify(requestData));
        // Отправляем POST запрос на эндпоинт /detect
        const response = await fetch('server/export/xlsx-data-detect', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(requestData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || `Ошибка сервера: ${response.status}`);
        }

        // Получаем blob с архивом
        const blob = await response.blob();

        // Проверяем, что архив не пустой
        if (blob.size === 0) {
            throw new Error('Получен пустой файл');
        }

        // Создаем ссылку для скачивания
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;

        // Получаем имя файла из заголовков или используем стандартное
        const contentDisposition = response.headers.get('Content-Disposition');
        let filename = 'detection_report.xlsx';
        if (response.headers.get('Filename')) {
            filename = response.headers.get('Filename');
        }
        if (contentDisposition) {
            const filenameMatch = contentDisposition.match(/filename="(.+)"/);
            if (filenameMatch) {
                filename = filenameMatch[1];
            }
        }
        a.download = filename;

        // Добавляем ссылку в DOM и кликаем по ней
        document.body.appendChild(a);
        a.click();

        // Очищаем
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        // Показываем успешный статус
        const filesAdded = response.headers.get('X-Files-Added');
        const successMessage = filesAdded
        ? `Архив успешно создан! Добавлено файлов: ${filesAdded}`
        : 'Архив успешно создан и скачан!';

    } catch (error) {
        console.error('Сетевая ошибка:', error);
        res['error'] = 'error network';
    }

    domCache.uploadBtn.disabled = true;
    domCache.analyzeBtn.disabled = true;
    domCache.exportBtn.disabled = false;
    domCache.paramsBtn.disabled = true;
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
        const objects = detectedObjects[imageId]['detections'];
        totalObjects += objects.length;
        totalVerified += objects.filter(obj => obj.verified).length;
    });

    // Формируем результаты экспорта
    html += `
        <div class="export-item fade-in">
            <span class="badge bg-primary">JSON</span>
            <span>Векторные данные объектов (${totalVerified} проверенных из ${totalObjects})</span>
            <button id="exportJSON" class="btn btn-sm btn-outline-primary ms-auto">Скачать</button>
        </div>
        <div class="export-item fade-in">
            <span class="badge bg-success">ZIP</span>
            <span>Размеченные изображения (${uploadedImages.length} файлов)</span>
            <button id="exportImages" class="btn btn-sm btn-outline-success ms-auto">Скачать</button>
        </div>
        <div class="export-item fade-in">
            <span class="badge bg-info">XLSX</span>
            <span>Таблица с данными объектов</span>
            <button id="exportCSV" class="btn btn-sm btn-outline-info ms-auto">Скачать</button>
        </div>
    `;

    html += '</div>';
    domCache.exportResults.innerHTML = html;

    // Назначаем обработчики напрямую через onclick
//    document.getElementById('exportJSON').onclick = handleExportJSON;
    document.getElementById('exportImages').onclick = exportImages;
    document.getElementById('exportCSV').onclick = exportXLSX;
}

// Сохранение настроек
async function saveSettings() {
    console.log('modelType', document.getElementById('modelType').value);
    settings.modelType = document.getElementById('modelType').value;
    settings.detectionLimit = parseFloat(document.getElementById('detectionLimit').value);
    settings.detectionSlice = parseInt(document.getElementById('detectionSlice').value, 10);
    settings.detectionOverlap = parseFloat(document.getElementById('detectionOverlap').value);
    settings.georeference = document.getElementById('georeference').checked;
    settings.pixelSize = parseFloat(document.getElementById('pixelSize').value);

    // Формируем данные для отправки
    let requestData = {
        'settings': settings
    };
    console.log('requestData', requestData);
    // Отправляем POST запрос на эндпоинт /detect/settings
    const response = await fetch('server/detect/settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(requestData)
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Ошибка сервера: ${response.status}`);
    }

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

function onImageLoad() {
    const img = document.getElementById('zoomImage');
    console.log('wh', img.naturalWidth, img.naturalHeight);
    viewer.setNaturalSize(img.naturalWidth, img.naturalHeight);
}
