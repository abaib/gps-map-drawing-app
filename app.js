class MapDrawingApp {
    constructor() {
        this.map = null;
        this.lines = [];
        this.lineCounter = 1;
        this.gpsWatchId = null;
        this.gpsMarker = null;
        this.currentGpsPosition = null;
        this.captureState = 'idle';
        this.mode = 'draw';
        this.tempStartPoint = null;
        this.layers = {};
        this.linesLayer = null;
        this.baseLayer = 'street';
        this.selectedLine = null;
        this.isDragging = false;
        this.draggedPoint = null;

        // NEW: rotation state
        this.mapRotation = 0;
        this.isRotating = false;

        this.init();
    }

    init() {
        this.initializeMap();
        this.setupEventListeners();
        this.startGPSTracking();
    }

    initializeMap() {
        this.map = L.map('map', {
            center: [24.4539, 39.5773],
            zoom: 13,
            zoomControl: false,

            // IMPORTANT: use canvas renderer for rotation
            preferCanvas: true,
            renderer: L.canvas()
        });

        L.control.zoom({ position: 'topright' }).addTo(this.map);

        this.layers.street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        });

        this.layers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri',
            maxZoom: 19
        });

        this.layers.street.addTo(this.map);

        this.linesLayer = L.layerGroup().addTo(this.map);

        this.map.on('click', (e) => this.handleMapClick(e));

        // NEW: rotation controls
        this.setupRotateControls();
    }

    setupRotateControls() {
        const mapContainer = this.map.getContainer();

        let startAngle = 0;
        let startBearing = 0;

        mapContainer.addEventListener('mousedown', (e) => {
            if (this.mode !== 'rotate') return;
            if (!e.shiftKey) return; // rotate only with Shift key

            this.isRotating = true;

            const rect = mapContainer.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;

            startAngle = Math.atan2(e.clientY - rect.top - cy, e.clientX - rect.left - cx);
            startBearing = this.mapRotation;

            e.preventDefault();
        });

        mapContainer.addEventListener('mousemove', (e) => {
            if (!this.isRotating) return;

            const rect = mapContainer.getBoundingClientRect();
            const cx = rect.width / 2;
            const cy = rect.height / 2;

            const angle = Math.atan2(e.clientY - rect.top - cy, e.clientX - rect.left - cx);
            const diff = (angle - startAngle) * 180 / Math.PI;

            this.mapRotation = (startBearing + diff) % 360;
            this.rotateMap(this.mapRotation);
        });

        mapContainer.addEventListener('mouseup', () => {
            this.isRotating = false;
        });
    }

    // NEW ROTATION ENGINE (OPTION A)
    rotateMap(angle) {
        const renderer = this.map.getRenderer(this.map);
        if (!renderer || !renderer._container) return;

        const canvas = renderer._container;
        const size = this.map.getSize();

        canvas.style.transformOrigin = `${size.x / 2}px ${size.y / 2}px`;
        canvas.style.transform = `rotate(${angle}deg)`;

        // rotate other layers also
        if (this.linesLayer && this.linesLayer._container) {
            this.linesLayer._container.style.transformOrigin = `${size.x / 2}px ${size.y / 2}px`;
            this.linesLayer._container.style.transform = `rotate(${angle}deg)`;
        }
    }

    setupEventListeners() {
        document.getElementById('drawBtn').addEventListener('click', () => this.setMode('draw'));
        document.getElementById('selectBtn').addEventListener('click', () => this.setMode('select'));
        document.getElementById('rotateBtn').addEventListener('click', () => this.setMode('rotate'));

        document.getElementById('streetBtn').addEventListener('click', () => this.switchLayer('street'));
        document.getElementById('satelliteBtn').addEventListener('click', () => this.switchLayer('satellite'));

        document.getElementById('currentLocationBtn').addEventListener('click', () => this.goToCurrentLocation());
        document.getElementById('captureStartBtn').addEventListener('click', () => this.captureStartPoint());
        document.getElementById('captureEndBtn').addEventListener('click', () => this.captureEndPoint());

        document.getElementById('saveBtn').addEventListener('click', () => this.saveDrawing());
        document.getElementById('loadInput').addEventListener('change', (e) => this.loadDrawing(e));
        document.getElementById('excelBtn').addEventListener('click', () => this.exportToExcel());
        document.getElementById('csvBtn').addEventListener('click', () => this.exportToCSV());
    }

    setMode(mode) {
        this.mode = mode;

        document.querySelectorAll('.toolbar .btn').forEach(btn =>
            btn.classList.remove('active')
        );
        document.getElementById(`${mode}Btn`).classList.add('active');

        if (this.tempStartPoint && this.tempStartPoint.marker) {
            this.tempStartPoint.marker.remove();
            this.tempStartPoint = null;
        }

        if (this.selectedLine) {
            this.deselectLine();
        }
    }

    switchLayer(layer) {
        this.baseLayer = layer;

        Object.values(this.layers).forEach(l => l.remove());
        this.layers[layer].addTo(this.map);

        document.getElementById('streetBtn').classList.toggle('active', layer === 'street');
        document.getElementById('satelliteBtn').classList.toggle('active', layer === 'satellite');
    }

    handleMapClick(e) {
        if (this.mode === 'rotate') return;
        if (this.mode === 'select') return this.handleSelectClick(e);
        if (this.mode !== 'draw') return;

        if (!this.tempStartPoint) {
            this.tempStartPoint = {
                lat: e.latlng.lat,
                lng: e.latlng.lng
            };

            this.tempStartPoint.marker = L.circleMarker([e.latlng.lat, e.latlng.lng], {
                radius: 6,
                fillColor: '#3b82f6',
                color: '#1e40af',
                weight: 2,
                fillOpacity: 0.8
            }).addTo(this.linesLayer);
        } else {
            const endPoint = {
                lat: e.latlng.lat,
                lng: e.latlng.lng
            };

            this.createLine(this.tempStartPoint, endPoint);
            this.tempStartPoint.marker.remove();
            this.tempStartPoint = null;
        }
    }

    handleSelectClick(e) {
        let clicked = null;
        const p = e.latlng;

        for (let line of this.lines) {
            const d = this.distanceToLine(p, line.start, line.end);
            if (d < 20) {
                clicked = line;
                break;
            }
        }

        if (clicked) this.selectLine(clicked);
        else this.deselectLine();
    }

    distanceToLine(point, start, end) {
        const p = this.map.latLngToContainerPoint(point);
        const p1 = this.map.latLngToContainerPoint(start);
        const p2 = this.map.latLngToContainerPoint(end);

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len2 = dx * dx + dy * dy;

        let t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));

        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;

        return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
    }

    selectLine(line) {
        this.deselectLine();
        this.selectedLine = line;

        line.polyline.setStyle({ color: '#f59e0b', weight: 4 });

        const row = document.querySelector(`tr[data-line-id="${line.id}"]`);
        if (row) row.classList.add('selected');

        this.makeDraggable(line);
    }

    deselectLine() {
        if (!this.selectedLine) return;

        this.selectedLine.polyline.setStyle({ color: '#3b82f6', weight: 3 });

        const row = document.querySelector(`tr[data-line-id="${this.selectedLine.id}"]`);
        if (row) row.classList.remove('selected');

        this.removeDraggable(this.selectedLine);
        this.selectedLine = null;
    }

    makeDraggable(line) {
        line.startMarker.on('mousedown', (e) => {
            L.DomEvent.stopPropagation(e);
            this.isDragging = true;
            this.draggedPoint = { line, point: 'start' };
            this.map.dragging.disable();
        });

        line.endMarker.on('mousedown', (e) => {
            L.DomEvent.stopPropagation(e);
            this.isDragging = true;
            this.draggedPoint = { line, point: 'end' };
            this.map.dragging.disable();
        });

        const moveHandler = (e) => {
            if (!this.isDragging || !this.draggedPoint) return;

            const newPos = { lat: e.latlng.lat, lng: e.latlng.lng };

            if (this.draggedPoint.point === 'start') {
                line.start = newPos;
                line.startMarker.setLatLng(newPos);
            } else {
                line.end = newPos;
                line.endMarker.setLatLng(newPos);
            }

            line.polyline.setLatLngs([line.start, line.end]);
            line.distance = this.calculateDistance(line.start.lat, line.start.lng, line.end.lat, line.end.lng);

            const mid = [(line.start.lat + line.end.lat) / 2, (line.start.lng + line.end.lng) / 2];
            line.distanceLabel.setLatLng(mid);

            this.updateTableRow(line);
        };

        const upHandler = () => {
            this.isDragging = false;
            this.draggedPoint = null;
            this.map.dragging.enable();
        };

        line._moveHandler = moveHandler;
        line._upHandler = upHandler;

        this.map.on('mousemove', moveHandler);
        this.map.on('mouseup', upHandler);
    }

    removeDraggable(line) {
        line.startMarker.off('mousedown');
        line.endMarker.off('mousedown');

        if (line._moveHandler) this.map.off('mousemove', line._moveHandler);
        if (line._upHandler) this.map.off('mouseup', line._upHandler);
    }

    updateTableRow(line) {
        const row = document.querySelector(`tr[data-line-id="${line.id}"]`);
        if (row) row.cells[1].textContent = line.distance.toFixed(2);
    }

    createLine(start, end) {
        const distance = this.calculateDistance(start.lat, start.lng, end.lat, end.lng);
        const id = `A${this.lineCounter++}`;

        const poly = L.polyline([start, end], { color: '#3b82f6', weight: 3 }).addTo(this.linesLayer);
        const s = L.circleMarker(start, { radius: 6, fillColor: '#3b82f6', color: '#1e40af', weight: 2 }).addTo(this.linesLayer);
        const e = L.circleMarker(end, { radius: 8, fillColor: '#ef4444', color: '#991b1b', weight: 2 }).addTo(this.linesLayer);

        const mid = [(start.lat + end.lat) / 2, (start.lng + end.lng) / 2];
        const label = L.marker(mid, {
            icon: L.divIcon({
                className: 'distance-label',
                html: `<div style="background:white; padding:4px 8px; border-radius:4px; border:2px solid #3b82f6; font-weight:bold;">${distance.toFixed(2)} m</div>`
            })
        }).addTo(this.linesLayer);

        const line = {
            id,
            start,
            end,
            distance,
            depth: '',
            width: '',
            excavationType: 'العادي',
            roadType: 'Soil',
            polyline: poly,
            startMarker: s,
            endMarker: e,
            distanceLabel: label
        };

        this.lines.push(line);
        this.addLineToTable(line);
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) ** 2 +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) ** 2;

        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    addLineToTable(line) {
        const body = document.getElementById('linesTableBody');
        const row = document.createElement('tr');
        row.dataset.lineId = line.id;

        row.innerHTML = `
            <td>${line.id}</td>
            <td>${line.distance.toFixed(2)}</td>
            <td><input type="number" step="0.01" value="${line.depth}" data-field="depth"></td>
            <td><input type="number" step="0.01" value="${line.width}" data-field="width"></td>
            <td>
                <select data-field="excavationType">
                    <option value="العادي">العادي</option>
                    <option value="الطارئ">الطارئ</option>
                    <option value="المتعدد">المتدد</option>
                    <option value="توصيلة المباني">توصيلة المباني</option>
                    <option value="مخططات جديدة">مخططات جديدة</option>
                </select>
            </td>
            <td>
                <select data-field="roadType">
                    <option value="Soil">Soil</option>
                    <option value="Asphalt">Asphalt</option>
                    <option value="tiles/blocks">tiles/blocks</option>
                </select>
            </td>
            <td><button class="delete-btn" data-line-id="${line.id}">Delete</button></td>
        `;

        row.querySelector('.delete-btn').addEventListener('click', () => this.deleteLine(line.id));

        body.appendChild(row);
    }

    deleteLine(id) {
        const line = this.lines.find(l => l.id === id);
        if (!line) return;

        if (this.selectedLine && this.selectedLine.id === id) this.deselectLine();

        line.polyline.remove();
        line.startMarker.remove();
        line.endMarker.remove();
        line.distanceLabel.remove();

        this.lines = this.lines.filter(l => l.id !== id);

        const row = document.querySelector(`tr[data-line-id="${id}"]`);
        if (row) row.remove();
    }

    startGPSTracking() {
        if (!navigator.geolocation) {
            document.getElementById('gpsStatus').textContent = 'Not Supported';
            return;
        }

        document.getElementById('gpsStatus').textContent = 'Activating...';

        this.gpsWatchId = navigator.geolocation.watchPosition(
            (pos) => {
                const { latitude, longitude, accuracy } = pos.coords;

                this.currentGpsPosition = { lat: latitude, lng: longitude };

                document.getElementById('gpsStatus').textContent = 'Active';
                document.getElementById('gpsAccuracyRow').style.display = 'flex';
                document.getElementById('gpsAccuracy').textContent = `${accuracy.toFixed(1)} m`;

                if (!this.gpsMarker) {
                    this.gpsMarker = L.circleMarker([latitude, longitude], {
                        radius: 10,
                        fillColor: '#10b981',
                        color: '#065f46',
                        weight: 2,
                        fillOpacity: 0.6
                    }).addTo(this.map);
                } else {
                    this.gpsMarker.setLatLng([latitude, longitude]);
                }
            },
            (err) => {
                alert('GPS Error: ' + err.message);
            },
            { enableHighAccuracy: true, maximumAge: 0, timeout: 5000 }
        );
    }

    goToCurrentLocation() {
        if (!this.currentGpsPosition) {
            alert('GPS not ready.');
            return;
        }

        this.map.setView([this.currentGpsPosition.lat, this.currentGpsPosition.lng], 18);
    }

    captureStartPoint() {
        if (!this.currentGpsPosition) return alert('GPS not ready.');

        this.tempStartPoint = {
            lat: this.currentGpsPosition.lat,
            lng: this.currentGpsPosition.lng
        };

        this.tempStartPoint.marker = L.circleMarker([this.tempStartPoint.lat, this.tempStartPoint.lng], {
            radius: 6,
            fillColor: '#3b82f6',
            color: '#1e40af',
            weight: 2
        }).addTo(this.linesLayer);

        this.captureState = 'waiting_for_end';
        document.getElementById('captureEndBtn').style.display = 'block';
    }

    captureEndPoint() {
        if (!this.currentGpsPosition || !this.tempStartPoint)
            return alert('Missing start or GPS.');

        const end = {
            lat: this.currentGpsPosition.lat,
            lng: this.currentGpsPosition.lng
        };

        this.createLine(this.tempStartPoint, end);
        this.tempStartPoint.marker.remove();
        this.tempStartPoint = null;

        this.captureState = 'idle';
        document.getElementById('captureEndBtn').style.display = 'none';
    }

    saveDrawing() {
        const wo = document.getElementById('workOrderNo').value;
        const wt = document.getElementById('workType').value;

        const data = {
            workOrderNo: wo,
            workType: wt,
            lines: this.lines.map(l => ({
                id: l.id,
                start: l.start,
                end: l.end,
                distance: l.distance,
                depth: l.depth,
                width: l.width,
                excavationType: l.excavationType,
                roadType: l.roadType
            }))
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'map-drawing.json';
        a.click();

        URL.revokeObjectURL(url);
    }

    loadDrawing(e) {
        const f = e.target.files[0];
        if (!f) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target.result);

                document.getElementById('workOrderNo').value = data.workOrderNo || '';
                document.getElementById('workType').value = data.workType || '';

                this.lines.forEach(l => {
                    l.polyline.remove();
                    l.startMarker.remove();
                    l.endMarker.remove();
                    l.distanceLabel.remove();
                });

                this.lines = [];
                document.getElementById('linesTableBody').innerHTML = '';

                (data.lines || []).forEach(ld => this.createLine(ld.start, ld.end));

                alert('Drawing loaded.');
            } catch (err) {
                alert('Invalid file.');
            }
        };
        reader.readAsText(f);
    }

    exportToCSV() {
        const wo = document.getElementById('workOrderNo').value;
        const wt = document.getElementById('workType').value;

        const header = [
            'Work Order No', 'Work Type', 'Line', 'Start Lat', 'Start Lng',
            'End Lat', 'End Lng', 'Length (m)', 'Depth', 'Width',
            'Excavation Type', 'Road Type'
        ];

        const rows = this.lines.map(l => [
            wo, wt, l.id,
            l.start.lat, l.start.lng,
            l.end.lat, l.end.lng,
            l.distance.toFixed(2),
            l.depth, l.width,
            l.excavationType, l.roadType
        ]);

        const csv = [header, ...rows].map(r => r.join(',')).join('\n');

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'map-data.csv';
        a.click();

        URL.revokeObjectURL(url);
    }

    exportToExcel() {
        const wo = document.getElementById('workOrderNo').value;
        const wt = document.getElementById('workType').value;

        const header = [
            'Work Order No', 'Work Type', 'Line', 'Start Lat', 'Start Lng',
            'End Lat', 'End Lng', 'Length (m)', 'Depth', 'Width',
            'Excavation Type', 'Road Type'
        ];

        const rows = this.lines.map(l => [
            wo, wt, l.id,
            l.start.lat, l.start.lng,
            l.end.lat, l.end.lng,
            l.distance.toFixed(2),
            l.depth, l.width,
            l.excavationType, l.roadType
        ]);

        let html = '<table><tr>';
        header.forEach(h => html += `<th>${h}</th>`);
        html += '</tr>';

        rows.forEach(r => {
            html += '<tr>';
            r.forEach(c => html += `<td>${c}</td>`);
            html += '</tr>';
        });
        html += '</table>';

        const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = 'map-data.xls';
        a.click();

        URL.revokeObjectURL(url);
    }
}

document.addEventListener('DOMContentLoaded', () => new MapDrawingApp());
