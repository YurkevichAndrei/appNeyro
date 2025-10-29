class ImageViewer {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.imageWrapper = document.getElementById('imagePreview');
        this.img = document.getElementById('zoomImage');
        this.annotationContainer = document.createElement('div');
        this.annotationContainer.id = 'annotationContainer';


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

        // Получаем размеры контейнера
        const rect = this.container.getBoundingClientRect();
        this.containerWidth = rect.width;
        this.containerHeight = rect.height;

        this.updateTransform();
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
        this.imageWrapper.style.transform =
        `translate(${this.posX}px, ${this.posY}px) scale(${this.scale})`;
        if (this.img) {
            const rect = this.img.getBoundingClientRect();
            this.annotationContainer.style.width = rect.width + 'px';
            this.annotationContainer.style.height = rect.height + 'px';
        }

    }

    setNaturalSize(width, height) {
        this.naturalWidth = width;
        this.naturalHeight = height;
    }

    // Преобразование координат изображения в координаты контейнера
    imageToContainer(px, py) {
        return {
            x: px * this.scale + this.posX,
            y: py * this.scale + this.posY
        };
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

    addRectangle(x, y, width, height, label = '') {
        if (!(document.getElementById('annotationContainer'))) {
            this.imageWrapper.appendChild(this.annotationContainer);
        }
        const coords = this.imageToContainer(x, y);
        const rect = document.createElement('div');
        rect.className = 'annotation rectangle';
        rect.style.width = `${width}px`;
        rect.style.height = `${height}px`;
        rect.style.left = `${coords.x}px`;
        rect.style.top = `${coords.y}px`;

        console.log(rect);

        this.annotationContainer.appendChild(rect);
        this.addLabel(x, y, label);
    }

    addLabel(x, y, text) {
        if (!text) return;

        const label = document.createElement('div');
        label.className = 'label';
        label.textContent = text;
        label.style.left = `${x}px`;
        label.style.top = `calc(${y}px + 20px)`;

        this.annotationContainer.appendChild(label);
    }

    clearAnnotations() {
        const elementsToKeep = this.imageWrapper.querySelectorAll(':not(div)');
        this.imageWrapper.replaceChildren(...elementsToKeep);
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