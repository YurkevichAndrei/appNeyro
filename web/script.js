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

// Упрощенная функция загрузки с поддержкой папок
function handleFileUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Показываем индикатор загрузки
    const originalText = domCache.uploadBtn.innerHTML;
    domCache.uploadBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Загрузка...';
    domCache.uploadBtn.disabled = true;

    const filePromises = [];
    const processedFiles = new Set();

    // Собираем статистику по папкам
    const folderStats = {
        total: 0,
        images: 0,
        folders: new Set()
    };

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        folderStats.total++;

        // Определяем путь файла
        const filePath = file.webkitRelativePath || file.name;
        const folderPath = filePath.includes('/') ? filePath.split('/').slice(0, -1).join('/') : 'корневая папка';

        if (folderPath !== 'корневая папка') {
            folderStats.folders.add(folderPath);
        }

        // Пропускаем не-изображения и дубликаты
        if (!file.type.match('image.*') || processedFiles.has(filePath)) {
            continue;
        }

        processedFiles.add(filePath);
        folderStats.images++;

        filePromises.push(new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const imageData = {
                    id: Date.now() + i + Math.random(),
                    name: file.name,
                    url: e.target.result,
                    analyzed: false,
                    path: filePath
                };
                resolve(imageData);
            };
            reader.onerror = function() {
                console.error('Ошибка чтения файла:', file.name);
                resolve(null);
            };
            reader.readAsDataURL(file);
        }));
    }

    // Обрабатываем все промисы
    Promise.all(filePromises).then(images => {
        const successfulImages = images.filter(img => img !== null);

        if (successfulImages.length > 0) {
            uploadedImages.push(...successfulImages);
            updateImageList();

            if (currentImageIndex === -1 && uploadedImages.length > 0) {
                selectImage(0);
            }

            // Детальное уведомление о результате
            const folderCount = folderStats.folders.size;
            const folderText = folderCount > 0 ? ` из ${folderCount} папок` : '';
            showNotification(
                `Успешно загружено ${successfulImages.length} изображений${folderText} (найдено ${folderStats.images} изображений из ${folderStats.total} файлов)`,
                'success'
            );
        } else {
            showNotification(
                `Не удалось загрузить изображения. Найдено ${folderStats.images} изображений из ${folderStats.total} файлов`,
                'warning'
            );
        }

        // Восстанавливаем кнопку
        domCache.uploadBtn.innerHTML = originalText;
        domCache.uploadBtn.disabled = false;
        domCache.analyzeBtn.disabled = true;
        domCache.exportBtn.disabled = true;
        domCache.paramsBtn.disabled = false;

//        // Сохраняем данные
//        saveToLocalStorage();
    }).catch(error => {
        console.error('Ошибка при загрузке изображений:', error);
        showNotification('Произошла ошибка при загрузке изображений', 'error');

        // Восстанавливаем кнопку в случае ошибки
        domCache.uploadBtn.innerHTML = originalText;
        domCache.uploadBtn.disabled = false;
    });
    // Очистка input для возможности повторной загрузки тех же файлов
    event.target.value = '';
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

//// Улучшенная функция отображения списка с путями
//function updateImageList() {
//    if (!domCache.imageList) return;
//
//    domCache.imageList.innerHTML = '';
//
//    uploadedImages.forEach((image, index) => {
//        const listItem = document.createElement('div');
//        listItem.className = `list-group-item list-group-item-action d-flex justify-content-between align-items-center ${index === currentImageIndex ? 'active' : ''}`;
//
//        // Отображаем путь, если он отличается от имени файла
//        const displayPath = image.path && image.path !== image.name ?
//        `<small class="text-muted d-block mt-1">${truncatePath(image.path, 40)}</small>` : '';
//
//        listItem.innerHTML = `
//            <div class="flex-grow-1">
//                <div class="fw-bold">${image.name}</div>
//                ${displayPath}
//            </div>
//            <div class="ms-2">
//                <span class="badge bg-${image.analyzed ? 'success' : 'secondary'} me-1">
//                    ${image.analyzed ? 'Анализ' : 'Не анализировано'}
//                </span>
//                <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); removeImage(${image.id})">
//                    <i class="fas fa-times"></i>
//                </button>
//            </div>
//        `;
//
//        listItem.addEventListener('click', () => selectImage(index));
//        domCache.imageList.appendChild(listItem);
//    });
//}

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
//        domCache.imageCount.textContent = '0 изображений';
        return;
    }

    let html = '<div class="d-flex flex-wrap">';

    uploadedImages.forEach((image, index) => {
        const badgeClass = image.analyzed ? 'bg-success' : 'bg-secondary';
        const badgeIcon = image.analyzed ? '✓' : '?';

        html += `
            <div class="image-thumbnail fade-in ${index === currentImageIndex ? 'active' : ''}" data-index="${index}">
                <img src="${image.url}" alt="${image.name}" loading="lazy">
                <div class="thumbnail-badge ${badgeClass}">${badgeIcon}</div>
            </div>
        `;
    });

    html += '</div>';
    domCache.imageList.innerHTML = html;
//    domCache.imageCount.textContent = `${uploadedImages.length} изображений`;

    // Добавляем обработчики клика на миниатюры с делегированием событий
    domCache.imageList.addEventListener('click', function(e) {
        const thumbnail = e.target.closest('.image-thumbnail');
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
    } else {
        // Создаем новое изображение
        domCache.imagePreview.innerHTML = `<img src="${image.url}" alt="${image.name}" class="fade-in">`;
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
function analyzeImages() {
    if (uploadedImages.length === 0) {
        alert('Пожалуйста, загрузите изображения для анализа.');
        return;
    }

    // Показываем индикатор загрузки
    const analyzeBtn = domCache.analyzeBtn;
    const originalText = analyzeBtn.innerHTML;
    analyzeBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-1"></i> Анализ...';
    analyzeBtn.disabled = true;

    // Имитация анализа с задержкой
    setTimeout(() => {
        // нужно будет переделать под работу с сервером
        // Анализируем каждое изображение
        uploadedImages.forEach(image => {
            if (!image.analyzed) {
                // Генерируем случайные объекты для изображения
                const objects = generateRandomObjects();
                detectedObjects[image.id] = objects;
                image.analyzed = true;
            }
        });

        // Обновляем интерфейс
        updateImageList();
        if (currentImageIndex >= 0) {
            updateDetectedObjectsList();
        }

        // Восстанавливаем кнопку
        analyzeBtn.innerHTML = originalText;
        analyzeBtn.disabled = false;

//        // Сохраняем данные
//        saveToLocalStorage();

        // Показываем уведомление об успехе
        showNotification('Анализ завершен!', 'success');

        domCache.uploadBtn.disabled = true;
        domCache.analyzeBtn.disabled = false;
        domCache.exportBtn.disabled = false;
        domCache.paramsBtn.disabled = true;

    }, 0);
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

//// Показать уведомление
//function showNotification(message, type = 'info') {
//    // Создаем элемент уведомления
//    const notification = document.createElement('div');
//    notification.className = `alert alert-${type} alert-dismissible fade show position-fixed`;
//    notification.style.cssText = 'top: 20px; right: 20px; z-index: 1050; min-width: 300px;';
//    notification.innerHTML = `
//        ${message}
//        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
//    `;
//
//    // Добавляем уведомление на страницу
//    document.body.appendChild(notification);
//
//    // Автоматически удаляем уведомление через 3 секунды
//    setTimeout(() => {
//        if (notification.parentNode) {
//            notification.parentNode.removeChild(notification);
//        }
//    }, 3000);
//}

//// Сохранение данных в localStorage
//function saveToLocalStorage() {
//    const data = {
//        uploadedImages: uploadedImages,
//        currentImageIndex: currentImageIndex,
//        detectedObjects: detectedObjects,
//        settings: settings
//    };
//
//    localStorage.setItem('visionAnalyzerData', JSON.stringify(data));
//}
//
//// Загрузка данных из localStorage
//function loadSavedData() {
//    const savedData = localStorage.getItem('visionAnalyzerData');
//
//    if (savedData) {
//        const data = JSON.parse(savedData);
//
//        uploadedImages = data.uploadedImages || [];
//        currentImageIndex = data.currentImageIndex || -1;
//        detectedObjects = data.detectedObjects || {};
//        settings = data.settings || settings;
//
//        // Восстанавливаем интерфейс
//        updateImageList();
//
//        if (currentImageIndex >= 0 && currentImageIndex < uploadedImages.length) {
//            selectImage(currentImageIndex);
//        }
//
//        // Восстанавливаем настройки в форме
//        document.getElementById('detectionLimit').value = settings.detectionLimit;
//        document.getElementById('detectionLimitValue').textContent = settings.detectionLimit;
//        document.getElementById('georeference').checked = settings.georeference;
//        document.getElementById('pixelSize').value = settings.pixelSize;
//        document.getElementById('objectTheme').value = settings.objectTheme;
//
//        showNotification('Данные восстановлены', 'info');
//    }
//}




//nuctl deploy --project-name cvat --path serverless/pytorch/mis/yolorgb/nuclio --platform local --base-image nvidia/cuda:11.7.1-devel-ubuntu20.04 --image cvat/cvat.pth.mis.yolorgb.gpu --triggers '{"myHttpTrigger": {"maxWorkers": 1}}' --resource-limit nvidia.com/gpu=1