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

        // rotation state
        this.mapRotation = 0; // degrees
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

        // Map click: we must unrotate the incoming event before using it
        this.map.on('click', (e) => this.handleMapClick(e));

        // rotation controls
        this.setupRotateControls();
    }

    setupRotateControls() {
        const mapContainer = this.map.getContainer();
        let startAngle = 0;
        let startBearing = 0;

        mapContainer.addEventListener('mousedown', (e) => {
            if (this.mode !== 'rotate') return;
            if (!e.shiftKey) return; // require shift to rotate (same as before)
            this.isRotating = true;

            const rect = mapContainer.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;

            startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
            startBearing = this.mapRotation;

            e.preventDefault();
        });

        mapContainer.addEventListener('mousemove', (e) => {
            if (!this.isRotating) return;

            const rect = mapContainer.getBoundingClientRect();
            const cx = rect.left + rect.width / 2;
            const cy = rect.top + rect.height / 2;

            const angle = Math.atan2(e.clientY - cy, e.clientX - cx);
            const diff = (angle - startAngle) * 180 / Math.PI;

            this.mapRotation = (startBearing + diff) % 360;
            if (this.mapRotation < 0) this.mapRotation += 360;

            this.rotateMap(this.mapRotation);
        });

        mapContainer.addEventListener('mouseup', () => {
            this.isRotating = false;
        });

        // also stop on mouseleave to be safe
        mapContainer.addEventListener('mouseleave', () => {
            this.isRotating = false;
        });
    }

    // rotate the tile/canvas and the vector container visually,
    // but we will keep markers/labels upright by counter-rotating them
    rotateMap(angle) {
        const renderer = this.map.getRenderer(this.map);
        // renderer._container is the canvas container for tiles
        if (renderer && renderer._container) {
            const canvas = renderer._container;
            const size = this.map.getSize();
            canvas.style.transformOrigin = `${size.x / 2}px ${size.y / 2}px`;
            canvas.style.transform = `rotate(${angle}deg)`;
        }

        // rotate vector container (so polylines rotate with tiles)
        if (this.linesLayer && this.linesLayer._container) {
            const layerContainer = this.linesLayer._container;
            const size = this.map.getSize();
            layerContainer.style.transformOrigin = `${size.x / 2}px ${size.y / 2}px`;
            layerContainer.style.transform = `rotate(${angle}deg)`;
        }

        // After rotating containers, make sure icons/labels stay upright:
        this._counterRotateAllIcons(-angle); // pass negative so net rotation for icons is 0
    }

    // apply counter-rotation to all markers / icon-based elements so they stay upright
    _counterRotateAllIcons(counterAngle) {
        // counterAngle expected in degrees (e.g., -mapRotation)
        const allMarkers = [];

        // gather GPS marker icon if exists
        if (this.gpsMarker && this.gpsMarker._icon) allMarkers.push(this.gpsMarker._icon);

        // gather line markers and labels
        for (const ln of this.lines) {
            if (ln.startMarker && ln.startMarker._icon) allMarkers.push(ln.startMarker._icon);
            if (ln.endMarker && ln.endMarker._icon) allMarkers.push(ln.endMarker._icon);
            if (ln.distanceLabel && ln.distanceLabel._icon) allMarkers.push(ln.distanceLabel._icon);
        }

        // apply style transform to keep upright
        for (const el of allMarkers) {
            // ensure transform origin
            el.style.transformOrigin = 'center center';
            // apply counter rotation (so icon appears upright)
            el.style.transform = `rotate(${counterAngle}deg)`;
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

        document.querySelectorAll('.toolbar .btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${mode}Btn`).classList.add('active');

        if (this.tempStartPoint && this.tempStartPoint.marker) {
            this.tempStartPoint.marker.remove();
            this.tempStartPoint = null;
        }

        if (this.selectedLine) this.deselectLine();
    }

    switchLayer(layer) {
        this.baseLayer = layer;

        Object.values(this.layers).forEach(l => l.remove());
        this.layers[layer].addTo(this.map);

        document.getElementById('streetBtn').classList.toggle('active', layer === 'street');
        document.getElementById('satelliteBtn').classList.toggle('active', layer === 'satellite');
    }

    // helper: undo visual rotation to compute correct latlng for events
    // given an event latlng (Leaflet computed from mouse position in DOM),
    // we rotate its container point around center by -mapRotation to get the
    // true latlng corresponding to the rotated map coordinate system.
    _unrotateEventLatLng(latlng) {
        if (!this.map || !this.mapRotation) return latlng;

        const angleRad = -this.mapRotation * Math.PI / 180; // negative to undo rotation
        const size = this.map.getSize();
        const center = L.point(size.x / 2, size.y / 2);

        const p = this.map.latLngToContainerPoint(latlng);

        // translate to center
        const dx = p.x - center.x;
        const dy = p.y - center.y;

        // rotate by angleRad
        const rx = dx * Math.cos(angleRad) - dy * Math.sin(angleRad);
        const ry = dx * Math.sin(angleRad) + dy * Math.cos(angleRad);

        const unrotatedPoint = L.point(rx + center.x, ry + center.y);
        return this.map.containerPointToLatLng(unrotatedPoint);
    }

    handleMapClick(originalEvent) {
        if (this.mode === 'rotate') return;

        // compute corrected latlng
        const correctedLatLng = this._unrotateEventLatLng(originalEvent.latlng);
        const e = { latlng: correctedLatLng };

        if (this.mode === 'select') {
            this.handleSelectClick(e);
            return;
        }
        if (this.mode !== 'draw') return;

        if (!this.tempStartPoint) {
            this.tempStartPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
            this.tempStartPoint.marker = L.circleMarker([e.latlng.lat, e.latlng.lng], {
                radius: 6,
                fillColor: '#3b82f6',
                color: '#1e40af',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(this.linesLayer);

            // ensure marker icon stays upright immediately
            if (this.tempStartPoint.marker && this.tempStartPoint.marker._icon) {
                this.tempStartPoint.marker._icon.style.transformOrigin = 'center center';
                this.tempStartPoint.marker._icon.style.transform = `rotate(${-this.mapRotation}deg)`;
            }
        } else {
            const endPoint = { lat: e.latlng.lat, lng: e.latlng.lng };
            this.createLine(this.tempStartPoint, endPoint);

            if (this.tempStartPoint.marker) this.tempStartPoint.marker.remove();
            this.tempStartPoint = null;
        }
    }

    handleSelectClick(originalEvent) {
        const correctedLatLng = this._unrotateEventLatLng(originalEvent.latlng);
        const p = correctedLatLng;

        let clickedLine = null;
        for (let line of this.lines) {
            const distance = this.distanceToLine(p, line.start, line.end);
            if (distance < 20) {
                clickedLine = line;
                break;
            }
        }

        if (clickedLine) this.selectLine(clickedLine);
        else this.deselectLine();
    }

    distanceToLine(point, lineStart, lineEnd) {
        // point may be a LatLng; make it container point in the UN-ROTATED coordinate system
        const p = this.map.latLngToContainerPoint(point);
        const p1 = this.map.latLngToContainerPoint(L.latLng(lineStart.lat, lineStart.lng));
        const p2 = this.map.latLngToContainerPoint(L.latLng(lineEnd.lat, lineEnd.lng));

        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len2 = dx * dx + dy * dy;

        if (len2 === 0) return Math.hypot(p.x - p1.x, p.y - p1.y);

        let t = ((p.x - p1.x) * dx + (p.y - p1.y) * dy) / len2;
        t = Math.max(0, Math.min(1, t));

        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;

        return Math.hypot(p.x - projX, p.y - projY);
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
        // mousedown handlers on marker icons (note: we use Leaflet events)
        line.startMarker.on('mousedown', (evt) => {
            L.DomEvent.stopPropagation(evt);
            this.isDragging = true;
            this.draggedPoint = { line: line, point: 'start' };
            this.map.dragging.disable();
        });

        line.endMarker.on('mousedown', (evt) => {
            L.DomEvent.stopPropagation(evt);
            this.isDragging = true;
            this.draggedPoint = { line: line, point: 'end' };
            this.map.dragging.disable();
        });

        // mousemove and mouseup on map but we must UN-ROTATE incoming coords
        const mouseMoveHandler = (origEvent) => {
            if (!this.isDragging || !this.draggedPoint || this.draggedPoint.line.id !== line.id) return;

            // correct mouse latlng
            const corrected = this._unrotateEventLatLng(origEvent.latlng);
            const newPos = { lat: corrected.lat, lng: corrected.lng };

            if (this.draggedPoint.point === 'start') {
                line.start = newPos;
                line.startMarker.setLatLng([newPos.lat, newPos.lng]);
            } else {
                line.end = newPos;
                line.endMarker.setLatLng([newPos.lat, newPos.lng]);
            }

            line.polyline.setLatLngs([[line.start.lat, line.start.lng], [line.end.lat, line.end.lng]]);
            line.distance = this.calculateDistance(line.start.lat, line.start.lng, line.end.lat, line.end.lng);

            const midpoint = [(line.start.lat + line.end.lat) / 2, (line.start.lng + line.end.lng) / 2];
            line.distanceLabel.setLatLng(midpoint);

            this.updateTableRow(line);

            // after moving, ensure icons/labels remain upright
            this._counterRotateAllIcons(-this.mapRotation);
        };

        const mouseUpHandler = () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.draggedPoint = null;
                this.map.dragging.enable();
            }
        };

        line._mouseMoveHandler = mouseMoveHandler;
        line._mouseUpHandler = mouseUpHandler;

        this.map.on('mousemove', mouseMoveHandler);
        this.map.on('mouseup', mouseUpHandler);
    }

    removeDraggable(line) {
        line.startMarker.off('mousedown');
        line.endMarker.off('mousedown');

        if (line._mouseMoveHandler) this.map.off('mousemove', line._mouseMoveHandler);
        if (line._mouseUpHandler) this.map.off('mouseup', line._mouseUpHandler);
    }

    updateTableRow(line) {
        const row = document.querySelector(`tr[data-line-id="${line.id}"]`);
        if (row) row.cells[1].textContent = line.distance.toFixed(2);
    }

    createLine(start, end) {
        const distance = this.calculateDistance(start.lat, start.lng, end.lat, end.lng);
        const lineId = `A${this.lineCounter++}`;

        const polyline = L.polyline([
            [start.lat, start.lng],
            [end.lat, end.lng]
        ], {
            color: '#3b82f6',
            weight: 3,
            opacity: 0.8
        }).addTo(this.linesLayer);

        const startMarker = L.circleMarker([start.lat, start.lng], {
            radius: 6,
            fillColor: '#3b82f6',
            color: '#1e40af',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(this.linesLayer);

        const endMarker = L.circleMarker([end.lat, end.lng], {
            radius: 8,
            fillColor: '#ef4444',
            color: '#991b1b',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(this.linesLayer);

        const midpoint = [(start.lat + end.lat) / 2, (start.lng + end.lng) / 2];
        const distanceLabel = L.marker(midpoint, {
            icon: L.divIcon({
                className: 'distance-label',
                html: `<div style="background: white; padding: 4px 8px; border-radius: 4px; border: 2px solid #3b82f6; font-weight: bold; font-size: 12px; white-space: nowrap;">${distance.toFixed(2)} m</div>`,
                iconSize: [60, 20]
            })
        }).addTo(this.linesLayer);

        const line = {
            id: lineId,
            start: { lat: start.lat, lng: start.lng },
            end: { lat: end.lat, lng: end.lng },
            distance: distance,
            depth: '',
            width: '',
            excavationType: 'العادي',
            roadType: 'Soil',
            polyline: polyline,
            startMarker: startMarker,
            endMarker: endMarker,
            distanceLabel: distanceLabel
        };

        this.lines.push(line);
        this.addLineToTable(line);

        // ensure the newly-created icons/labels are counter-rotated to stay upright
        this._counterRotateAllIcons(-this.mapRotation);
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const φ1 = lat1 * Math.PI / 180;
        const φ2 = lat2 * Math.PI / 180;
        const Δφ = (lat2 - lat1) * Math.PI / 180;
        const Δλ = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c;
    }

    addLineToTable(line) {
        const tbody = document.getElementById('linesTableBody');
        const row = document.createElement('tr');
        row.dataset.lineId = line.id;

        row.innerHTML = `
            <td>${line.id}</td>
            <td>${line.distance.toFixed(2)}</td>
            <td><input type="number" step="0.01" value="${line.depth}" data-field="depth"></td>
            <td><input type="number" step="0.01" value="${line.width}" data-field="width"></td>
            <td>
                <select data-field="excavationType">
                    <option value="العادي" ${line.excavationType === 'العادي' ? 'selected' : ''}>العادي</option>
                    <option value="الطارئ" ${line.excavationType === 'الطارئ' ? 'selected' : ''}>الطارئ</option>
                    <option value="المتعدد" ${line.excavationType === 'المتعدد' ? 'selected' : ''}>المتعدد</option>
                    <option value="توصيلة المباني" ${line.excavationType === 'توصيلة المباني' ? 'selected' : ''}>توصيلة المباني</option>
                    <option value="مخططات جديدة" ${line.excavationType === 'مخططات جديدة' ? 'selected' : ''}>مخططات جديدة</option>
                </select>
            </td>
            <td>
                <select data-field="roadType">
                    <option value="Soil" ${line.roadType === 'Soil' ? 'selected' : ''}>Soil</option>
                    <option value="Asphalt" ${line.roadType === 'Asphalt' ? 'selected' : ''}>Asphalt</option>
                    <option value="tiles/blocks" ${line.roadType === 'tiles/blocks' ? 'selected' : ''}>tiles/blocks</option>
                </select>
            </td>
            <td><button class="delete-btn" data-line-id="${line.id}">Delete</button></td>
        `;

        row.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('change', (e) => {
                const field = e.target.dataset.field;
                const lineData = this.lines.find(l => l.id === line.id);
                if (lineData) {
                    lineData[field] = e.target.value;
                }
            });
        });

        row.querySelector('.delete-btn').addEventListener('click', () => {
            this.deleteLine(line.id);
        });

        tbody.appendChild(row);
    }

    deleteLine(lineId) {
        const line = this.lines.find(l => l.id === lineId);
        if (!line) return;

        if (this.selectedLine && this.selectedLine.id === lineId) this.deselectLine();

        line.polyline.remove();
        line.startMarker.remove();
        line.endMarker.remove();
        line.distanceLabel.remove();

        this.lines = this.lines.filter(l => l.id !== lineId);

        const row = document.querySelector(`tr[data-line-id="${lineId}"]`);
        if (row) row.remove();
    }

    startGPSTracking() {
        if (!navigator.geolocation) {
            document.getElementById('gpsStatus').textContent = 'Not Supported';
            return;
        }

        document.getElementById('gpsStatus').textContent = 'Activating...';

        this.gpsWatchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;

                this.currentGpsPosition = { lat: latitude, lng: longitude };

                const statusEl = document.getElementById('gpsStatus');
                statusEl.textContent = 'Active';
                statusEl.classList.add('status-active');

                document.getElementById('gpsAccuracyRow').style.display = 'flex';
                document.getElementById('gpsAccuracy').textContent = `${accuracy.toFixed(1)} m`;

                if (!this.gpsMarker) {
                    // use circleMarker (vector) so it rotates visually with linesLayer,
                    // but we'll counter-rotate its _icon to remain upright
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

                // ensure icon stays upright
                if (this.gpsMarker && this.gpsMarker._icon) {
                    this.gpsMarker._icon.style.transformOrigin = 'center center';
                    this.gpsMarker._icon.style.transform = `rotate(${-this.mapRotation}deg)`;
                }
            },
            (error) => {
                console.error('GPS Error:', error);
                document.getElementById('gpsStatus').textContent = 'Error';
                alert('GPS Error: ' + error.message + '\nPlease enable location services and refresh the page.');
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 5000
            }
        );
    }

    goToCurrentLocation() {
        if (!this.currentGpsPosition) {
            alert('GPS position not available yet. Please wait for GPS signal.');
            return;
        }

        this.map.setView([this.currentGpsPosition.lat, this.currentGpsPosition.lng], 18, {
            animate: true,
            duration: 1
        });

        // flash the gps marker visually (icon will remain upright due to counter-rotation)
        if (this.gpsMarker && this.gpsMarker._icon) {
            const originalTransform = this.gpsMarker._icon.style.transform || '';
            this.gpsMarker._icon.style.transition = 'transform 0.3s';
            this.gpsMarker._icon.style.transform = `rotate(${-this.mapRotation}deg) scale(1.2)`;
            setTimeout(() => {
                this.gpsMarker._icon.style.transform = originalTransform || `rotate(${-this.mapRotation}deg)`;
            }, 300);
        }
    }

    captureStartPoint() {
        if (!this.currentGpsPosition) {
            alert('GPS position not available. Please wait for GPS signal.');
            return;
        }

        this.tempStartPoint = {
            lat: this.currentGpsPosition.lat,
            lng: this.currentGpsPosition.lng
        };

        this.tempStartPoint.marker = L.circleMarker(
            [this.currentGpsPosition.lat, this.currentGpsPosition.lng],
            {
                radius: 6,
                fillColor: '#3b82f6',
                color: '#1e40af',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }
        ).addTo(this.linesLayer);

        // keep upright
        if (this.tempStartPoint.marker && this.tempStartPoint.marker._icon) {
            this.tempStartPoint.marker._icon.style.transformOrigin = 'center center';
            this.tempStartPoint.marker._icon.style.transform = `rotate(${-this.mapRotation}deg)`;
        }

        this.captureState = 'waiting_for_end';
        document.getElementById('captureEndBtn').style.display = 'block';
    }

    captureEndPoint() {
        if (!this.currentGpsPosition || !this.tempStartPoint) {
            alert('GPS position or start point not available.');
            return;
        }

        const endPoint = {
            lat: this.currentGpsPosition.lat,
            lng: this.currentGpsPosition.lng
        };

        this.createLine(this.tempStartPoint, endPoint);

        this.tempStartPoint.marker.remove();
        this.tempStartPoint = null;

        this.captureState = 'idle';
        document.getElementById('captureEndBtn').style.display = 'none';
    }

    saveDrawing() {
        const workOrderNo = document.getElementById('workOrderNo').value;
        const workType = document.getElementById('workType').value;

        const data = {
            workOrderNo: workOrderNo,
            workType: workType,
            lines: this.lines.map(line => ({
                id: line.id,
                start: line.start,
                end: line.end,
                distance: line.distance,
                depth: line.depth,
                width: line.width,
                excavationType: line.excavationType,
                roadType: line.roadType
            }))
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `map-drawing-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    loadDrawing(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);

                if (data.workOrderNo) {
                    document.getElementById('workOrderNo').value = data.workOrderNo;
                }
                if (data.workType) {
                    document.getElementById('workType').value = data.workType;
                }

                this.lines.forEach(line => {
                    line.polyline.remove();
                    line.startMarker.remove();
                    line.endMarker.remove();
                    line.distanceLabel.remove();
                });

                this.lines = [];
                document.getElementById('linesTableBody').innerHTML = '';

                const linesToLoad = data.lines || data;
                linesToLoad.forEach(lineData => {
                    this.createLine(lineData.start, lineData.end);
                });

                alert('Drawing loaded successfully!');
            } catch (error) {
                alert('Error loading file. Please check the file format.');
                console.error(error);
            }
        };
        reader.readAsText(file);
    }

    exportToCSV() {
        const workOrderNo = document.getElementById('workOrderNo').value;
        const workType = document.getElementById('workType').value;

        const headers = ['Work Order No', 'Work Type', 'Line', 'Start Lat', 'Start Lng', 'End Lat', 'End Lng', 'Length (m)', 'Depth', 'Width', 'Excavation Type', 'Road Type'];
        const rows = this.lines.map(line => [
            workOrderNo,
            workType,
            line.id,
            line.start.lat.toFixed(6),
            line.start.lng.toFixed(6),
            line.end.lat.toFixed(6),
            line.end.lng.toFixed(6),
            line.distance.toFixed(2),
            line.depth,
            line.width,
            line.excavationType,
            line.roadType
        ]);

        const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `map-data-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    exportToExcel() {
        const workOrderNo = document.getElementById('workOrderNo').value;
        const workType = document.getElementById('workType').value;

        const headers = ['Work Order No', 'Work Type', 'Line', 'Start Lat', 'Start Lng', 'End Lat', 'End Lng', 'Length (m)', 'Depth', 'Width', 'Excavation Type', 'Road Type'];
        const rows = this.lines.map(line => [
            workOrderNo,
            workType,
            line.id,
            line.start.lat.toFixed(6),
            line.start.lng.toFixed(6),
            line.end.lat.toFixed(6),
            line.end.lng.toFixed(6),
            line.distance.toFixed(2),
            line.depth,
            line.width,
            line.excavationType,
            line.roadType
        ]);

        let html = '<table border="1"><thead><tr>';
        headers.forEach(h => html += `<th>${h}</th>`);
        html += '</tr></thead><tbody>';
        rows.forEach(row => {
            html += '<tr>';
            row.forEach(cell => html += `<td>${cell}</td>`);
            html += '</tr>';
        });
        html += '</tbody></table>';

        const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `map-data-${new Date().toISOString().split('T')[0]}.xls`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new MapDrawingApp();
});
