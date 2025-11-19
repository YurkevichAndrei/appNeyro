class ImageViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.imageWrapper = document.getElementById('imagePreview');
        this.img = document.getElementById('zoomImage');
        this.annotationContainer = document.createElement('div');
        this.annotationContainer.id = 'annotationContainer';
        this.annotationContainer.setAttribute('visibility', 'true');

        this.recalcAnnotations = function () {};


        this.scale = 1;
        this.posX = 0;
        this.posY = 0;
        this.isDragging = false;
        this.startX = 0;
        this.startY = 0;
        this.naturalWidth = 0;
        this.naturalHeight = 0;
        this.containerWidth = 0;
        this.containerHeight = 0;

        this.init();
    }

    init() {
        // Обработчики событий мыши
        this.container.addEventListener('wheel', this.handleWheel.bind(this));
        this.container.addEventListener('mousedown', this.startDrag.bind(this));
        this.container.addEventListener('mousemove', this.onDrag.bind(this));
        this.container.addEventListener('mouseup', this.endDrag.bind(this));
        this.container.addEventListener('mouseleave', this.endDrag.bind(this));

        // Обработчики для сенсорных устройств
        this.container.addEventListener('touchstart', this.startDrag.bind(this));
        this.container.addEventListener('touchmove', this.onDrag.bind(this));
        this.container.addEventListener('touchend', this.endDrag.bind(this));

        this.updateContainerSize();

        this.resizeObserver = new ResizeObserver(entries => {
            this.updateContainerSize();
        });
        this.resizeObserver.observe(this.container);

        this.updateTransform();
    }

    setAnnotationRecalcCallback(callback) {
        if (typeof callback === 'function') {
            this.recalcAnnotations = callback;
        }
    }

    updateContainerSize() {
        // Получаем размеры контейнера
        const rect = this.container.getBoundingClientRect();
        this.containerWidth = rect.width;
        this.containerHeight = rect.height;
        this.recalcAnnotations();
    }

    handleWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        this.zoom(delta, e.clientX, e.clientY);
    }

    zoom(delta, x, y) {
        const rect = this.container.getBoundingClientRect();
        const offsetX = x - rect.left;
        const offsetY = y - rect.top;

        const worldX = (offsetX - this.posX) / this.scale;
        const worldY = (offsetY - this.posY) / this.scale;

        this.scale *= delta;
        this.scale = Math.max(0.1, Math.min(80, this.scale));

        this.posX = offsetX - worldX * this.scale;
        this.posY = offsetY - worldY * this.scale;

        this.updateTransform();
    }

    startDrag(e) {
        e.preventDefault();
        this.isDragging = true;
        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;

        this.startX = clientX - this.posX;
        this.startY = clientY - this.posY;
    }

    onDrag(e) {
        if (!this.isDragging) return;
        e.preventDefault();

        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;

        this.posX = clientX - this.startX;
        this.posY = clientY - this.startY;

        this.updateTransform();
    }

    endDrag() {
        this.isDragging = false;
    }

    updateTransform() {
        this.imageWrapper.style.transform = `translate(${this.posX}px, ${this.posY}px) scale(${this.scale})`;

        this.annotationContainer.querySelectorAll('.annotation').forEach(annotation => {
            annotation.style.transform = `scale(${1/this.scale})`;
            annotation.style.height = `${parseFloat(annotation.getAttribute('height')) * this.scale}px`;
            annotation.style.width = `${parseFloat(annotation.getAttribute('width')) * this.scale}px`;
        });
    }

    setNaturalSize(width, height) {
        this.naturalWidth = width;
        this.naturalHeight = height;
    }

    // Преобразование координат изображения в координаты контейнера
    imageToContainer(px, py, width, height) {
//        let img = document.getElementById('zoomImage');
//        let xs = img.width * px / this.naturalWidth;
//        let ys = img.height * py / this.naturalHeight;
//        let ww = (this.containerWidth - img.width) / 2;
//        let hh = (this.containerHeight - img.height) / 2;
//        let w = width * this.scale * (img.width / this.naturalWidth);
//        let h = height * this.scale * (img.height / this.naturalHeight);
//        let s = {
////            x: xs * this.scale + this.posX + ww + (w / 2),
////            y: ys * this.scale + this.posY + hh + (h / 2),
//            x: xs * this.scale + this.posX + ww,
//            y: ys * this.scale + this.posY + hh,
//            w: w,
//            h: h
//        };
//        return s;
        let img = document.getElementById('zoomImage');
        const rect = this.container.getBoundingClientRect();

        // Получаем реальные размеры отображаемого изображения
        const displayWidth = img.width;
        const displayHeight = img.height;

        // Масштабируем координаты относительно отображаемого размера
        let xs = displayWidth * px / this.naturalWidth;
        let ys = displayHeight * py / this.naturalHeight;

        // Вычисляем смещение для центрирования
        let ww = (this.containerWidth - displayWidth * this.scale) / 2;
        let hh = (this.containerHeight - displayHeight * this.scale) / 2;

        // Учитываем текущую позицию и масштаб
        let w = width * this.scale * (displayWidth / this.naturalWidth);
        let h = height * this.scale * (displayHeight / this.naturalHeight);

        let s = {
            x: xs * this.scale + this.posX + ww,
            y: ys * this.scale + this.posY + hh,
            w: w,
            h: h
        };
        return s;
    }

    // Добавление геометрических фигур
    addCircle(x, y, radius, label = '') {
        const circle = document.createElement('div');
        circle.className = 'annotation circle';
        circle.style.width = `${radius * 2}px`;
        circle.style.height = `${radius * 2}px`;
        circle.style.left = `${px - radius}px`;
        circle.style.top = `${py - radius}px`;

        this.annotationContainer.appendChild(circle);
        this.addLabel(x, y, label);
    }

    addRectangle(x, y, width, height, label = '', index = None, color = '#f94144c7') {
        this.updateTransform();
        const coords = this.imageToContainer(x, y, width, height);
        console.log(label, coords);
        const rect = document.createElement('div');
        rect.className = 'annotation rectangle';
        rect.id = `rect_${index}`;
//        let img = document.getElementById('zoomImage');
//        let w = width * this.scale * (img.width / this.naturalWidth);
//        let h = height * this.scale * (img.height / this.naturalHeight);
//        let xx = coords.x + (w / 2);
//        let yy = coords.y + (h / 2);
        rect.style.width = `${coords.w}px`;
        rect.style.height = `${coords.h}px`;
        rect.style.left = `${coords.x}px`;
        rect.style.top = `${coords.y}px`;
        rect.setAttribute('width', `${coords.w}px`);
        rect.setAttribute('height', `${coords.h}px`);
        rect.setAttribute('x', `${coords.x}px`);
        rect.setAttribute('y', `${coords.y}px`);

        rect.style.setProperty('--color-border', `${color}`);

        console.log(rect);

        this.annotationContainer.appendChild(rect);
        this.addLabel(coords.x, coords.y + coords.h, label, index);
    }

    addLabel(x, y, text, index = None) {
        if (!text) return;

        const label = document.createElement('div');
        label.className = 'annotation label';
        label.id = `label_${index}`;
        label.textContent = text;
        label.style.left = `${x}px`;
        label.style.top = `calc(${y}px + 0px)`;
        label.setAttribute('x', `${x}`);
        label.setAttribute('y', `${y}`);
        label.setAttribute('yy', `${0}`);

        this.annotationContainer.appendChild(label);
    }

    clearAnnotations() {
        this.annotationContainer.innerHTML = ""
    }

    resetView() {
        this.scale = 1;
        this.posX = 0;
        this.posY = 0;
        this.updateTransform();
    }
}

// Инициализация после загрузки изображения
var viewer = new ImageViewer('imageContainer');