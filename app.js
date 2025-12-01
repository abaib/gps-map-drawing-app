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
        this.mapRotation = 0;
        this.isRotating = false;
        this.rotateStartAngle = 0;
        
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
            rotate: true,
            touchRotate: true,
            rotateControl: {
                closeOnZeroBearing: false
            }
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
        this.setupRotateControls();
    }
    
    setupRotateControls() {
        const mapContainer = this.map.getContainer();
        let startBearing = 0;
        let startAngle = 0;
        
        mapContainer.addEventListener('mousedown', (e) => {
            if (this.mode === 'rotate' && e.shiftKey) {
                this.isRotating = true;
                const center = this.map.getSize().divideBy(2);
                startAngle = Math.atan2(e.clientY - center.y, e.clientX - center.x);
                startBearing = this.mapRotation;
                e.preventDefault();
            }
        });
        
        mapContainer.addEventListener('mousemove', (e) => {
            if (this.isRotating) {
                const center = this.map.getSize().divideBy(2);
                const angle = Math.atan2(e.clientY - center.y, e.clientX - center.x);
                const diff = (angle - startAngle) * 180 / Math.PI;
                this.mapRotation = (startBearing + diff) % 360;
                this.rotateMap(this.mapRotation);
            }
        });
        
        mapContainer.addEventListener('mouseup', () => {
            this.isRotating = false;
        });
    }
    
    rotateMap(angle) {
        const mapContainer = this.map.getContainer();
        mapContainer.style.transform = `rotate(${angle}deg)`;
    }
    
    setupEventListeners() {
        document.getElementById('drawBtn').addEventListener('click', () => this.setMode('draw'));
        document.getElementById('selectBtn').addEventListener('click', () => this.setMode('select'));
        document.getElementById('rotateBtn').addEventListener('click', () => this.setMode('rotate'));
        
        document.getElementById('streetBtn').addEventListener('click', () => this.switchLayer('street'));
        document.getElementById('satelliteBtn').addEventListener('click', () => this.switchLayer('satellite'));
        
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
        
        const mapContainer = this.map.getContainer();
        if (mode === 'rotate') {
            mapContainer.classList.add('map-rotate');
        } else {
            mapContainer.classList.remove('map-rotate');
        }
        
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
        
        if (this.mode === 'select') {
            this.handleSelectClick(e);
            return;
        }
        
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
                opacity: 1,
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
        let clickedLine = null;
        const clickPoint = e.latlng;
        
        for (let line of this.lines) {
            const distance = this.distanceToLine(clickPoint, line.start, line.end);
            if (distance < 20) {
                clickedLine = line;
                break;
            }
        }
        
        if (clickedLine) {
            this.selectLine(clickedLine);
        } else {
            this.deselectLine();
        }
    }
    
    distanceToLine(point, lineStart, lineEnd) {
        const p = this.map.latLngToContainerPoint(point);
        const p1 = this.map.latLngToContainerPoint([lineStart.lat, lineStart.lng]);
        const p2 = this.map.latLngToContainerPoint([lineEnd.lat, lineEnd.lng]);
        
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len2 = dx * dx + dy * dy;
        
        if (len2 === 0) return Math.sqrt((p.x - p1.x) ** 2 + (p.y - p1.y) ** 2);
        
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
        if (this.selectedLine) {
            this.selectedLine.polyline.setStyle({ color: '#3b82f6', weight: 3 });
            
            const row = document.querySelector(`tr[data-line-id="${this.selectedLine.id}"]`);
            if (row) row.classList.remove('selected');
            
            this.removeDraggable(this.selectedLine);
            this.selectedLine = null;
        }
    }
    
    makeDraggable(line) {
        line.startMarker.dragging = true;
        line.endMarker.dragging = true;
        
        line.startMarker.on('mousedown', () => {
            this.isDragging = true;
            this.draggedPoint = { line: line, point: 'start' };
        });
        
        line.endMarker.on('mousedown', () => {
            this.isDragging = true;
            this.draggedPoint = { line: line, point: 'end' };
        });
        
        this.map.on('mousemove', (e) => {
            if (this.isDragging && this.draggedPoint) {
                const newPos = { lat: e.latlng.lat, lng: e.latlng.lng };
                
                if (this.draggedPoint.point === 'start') {
                    line.start = newPos;
                    line.startMarker.setLatLng([newPos.lat, newPos.lng]);
                } else {
                    line.end = newPos;
                    line.endMarker.setLatLng([newPos.lat, newPos.lng]);
                }
                
                line.polyline.setLatLngs([[line.start.lat, line.start.lng], [line.end.lat, line.end.lng]]);
                
                const midpoint = [(line.start.lat + line.end.lat) / 2, (line.start.lng + line.end.lng) / 2];
                line.distance = this.calculateDistance(line.start.lat, line.start.lng, line.end.lat, line.end.lng);
                
                line.distanceLabel.setLatLng(midpoint);
                line.distanceLabel.setIcon(L.divIcon({
                    className: 'distance-label',
                    html: `<div style="background: white; padding: 4px 8px; border-radius: 4px; border: 2px solid #3b82f6; font-weight: bold; font-size: 12px; white-space: nowrap;">${line.distance.toFixed(2)} m</div>`,
                    iconSize: [60, 20]
                }));
                
                this.updateTableRow(line);
            }
        });
        
        this.map.on('mouseup', () => {
            this.isDragging = false;
            this.draggedPoint = null;
        });
        
        line.startMarker._icon.style.cursor = 'move';
        line.endMarker._icon.style.cursor = 'move';
    }
    
    removeDraggable(line) {
        line.startMarker.off('mousedown');
        line.endMarker.off('mousedown');
        line.startMarker._icon.style.cursor = '';
        line.endMarker._icon.style.cursor = '';
    }
    
    updateTableRow(line) {
        const row = document.querySelector(`tr[data-line-id="${line.id}"]`);
        if (row) {
            row.cells[1].textContent = line.distance.toFixed(2);
        }
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
        
        if (this.selectedLine && this.selectedLine.id === lineId) {
            this.deselectLine();
        }
        
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
                    const icon = L.divIcon({
                        className: 'gps-marker',
                        html: '<div class="gps-marker"></div>',
                        iconSize: [20, 20]
                    });
                    
                    this.gpsMarker = L.marker([latitude, longitude], { icon: icon }).addTo(this.map);
                } else {
                    this.gpsMarker.setLatLng([latitude, longitude]);
                }
            },
            (error) => {
                console.error('GPS Error:', error);
                document.getElementById('gpsStatus').textContent = 'Error';
            },
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 5000
            }
        );
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
                    this.createLineFromData(lineData);
                });
                
                alert('Drawing loaded successfully!');
            } catch (error) {
                alert('Error loading file. Please check the file format.');
                console.error(error);
            }
        };
        reader.readAsText(file);
    }
    
    createLineFromData(lineData) {
        const polyline = L.polyline([
            [lineData.start.lat, lineData.start.lng],
            [lineData.end.lat, lineData.end.lng]
        ], {
            color: '#3b82f6',
            weight: 3,
            opacity: 0.8
        }).addTo(this.linesLayer);
        
        const startMarker = L.circleMarker([lineData.start.lat, lineData.start.lng], {
            radius: 6,
            fillColor: '#3b82f6',
            color: '#1e40af',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(this.linesLayer);
        
        const endMarker = L.circleMarker([lineData.end.lat, lineData.end.lng], {
            radius: 8,
            fillColor: '#ef4444',
            color: '#991b1b',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(this.linesLayer);
        
        const midpoint = [
            (lineData.start.lat + lineData.end.lat) / 2,
            (lineData.start.lng + lineData.end.lng) / 2
        ];
        
        const distanceLabel = L.marker(midpoint, {
            icon: L.divIcon({
                className: 'distance-label',
                html: `<div style="background: white; padding: 4px 8px; border-radius: 4px; border: 2px solid #3b82f6; font-weight: bold; font-size: 12px; white-space: nowrap;">${lineData.distance.toFixed(2)} m</div>`,
                iconSize: [60, 20]
            })
        }).addTo(this.linesLayer);
        
        const line = {
            id: lineData.id,
            start: lineData.start,
            end: lineData.end,
            distance: lineData.distance,
            depth: lineData.depth || '',
            width: lineData.width || '',
            excavationType: lineData.excavationType || 'العادي',
            roadType: lineData.roadType || 'Soil',
            polyline: polyline,
            startMarker: startMarker,
            endMarker: endMarker,
            distanceLabel: distanceLabel
        };
        
        this.lines.push(line);
        this.addLineToTable(line);
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
