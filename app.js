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
        
        this.init();
    }
    
    init() {
        this.initializeMap();
        this.setupEventListeners();
        this.startGPSTracking();
    }
    
    initializeMap() {
        // Initialize map centered on Madinah
        this.map = L.map('map', {
            center: [24.4539, 39.5773],
            zoom: 13,
            zoomControl: false
        });
        
        // Add zoom control to top right
        L.control.zoom({ position: 'topright' }).addTo(this.map);
        
        // Create base layers
        this.layers.street = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        });
        
        this.layers.satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri',
            maxZoom: 19
        });
        
        // Add default layer
        this.layers.street.addTo(this.map);
        
        // Create layer for lines
        this.linesLayer = L.layerGroup().addTo(this.map);
        
        // Map click event
        this.map.on('click', (e) => this.handleMapClick(e));
    }
    
    setupEventListeners() {
        // Toolbar buttons
        document.getElementById('drawBtn').addEventListener('click', () => this.setMode('draw'));
        document.getElementById('selectBtn').addEventListener('click', () => this.setMode('select'));
        document.getElementById('deleteBtn').addEventListener('click', () => this.setMode('delete'));
        
        // Layer buttons
        document.getElementById('streetBtn').addEventListener('click', () => this.switchLayer('street'));
        document.getElementById('satelliteBtn').addEventListener('click', () => this.switchLayer('satellite'));
        
        // GPS capture buttons
        document.getElementById('captureStartBtn').addEventListener('click', () => this.captureStartPoint());
        document.getElementById('captureEndBtn').addEventListener('click', () => this.captureEndPoint());
        
        // Save & Export buttons
        document.getElementById('saveBtn').addEventListener('click', () => this.saveDrawing());
        document.getElementById('loadInput').addEventListener('change', (e) => this.loadDrawing(e));
        document.getElementById('excelBtn').addEventListener('click', () => this.exportToExcel());
        document.getElementById('csvBtn').addEventListener('click', () => this.exportToCSV());
    }
    
    setMode(mode) {
        this.mode = mode;
        
        // Update button states
        document.querySelectorAll('.toolbar .btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`${mode}Btn`).classList.add('active');
        
        // Clear temp start point if switching modes
        if (this.tempStartPoint && this.tempStartPoint.marker) {
            this.tempStartPoint.marker.remove();
            this.tempStartPoint = null;
        }
    }
    
    switchLayer(layer) {
        this.baseLayer = layer;
        
        // Remove all base layers
        Object.values(this.layers).forEach(l => l.remove());
        
        // Add selected layer
        this.layers[layer].addTo(this.map);
        
        // Update button states
        document.getElementById('streetBtn').classList.toggle('active', layer === 'street');
        document.getElementById('satelliteBtn').classList.toggle('active', layer === 'satellite');
    }
    
    handleMapClick(e) {
        if (this.mode !== 'draw') return;
        
        if (!this.tempStartPoint) {
            // First click - set start point
            this.tempStartPoint = {
                lat: e.latlng.lat,
                lng: e.latlng.lng
            };
            
            // Add temporary marker
            this.tempStartPoint.marker = L.circleMarker([e.latlng.lat, e.latlng.lng], {
                radius: 6,
                fillColor: '#3b82f6',
                color: '#1e40af',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(this.linesLayer);
        } else {
            // Second click - create line
            const endPoint = {
                lat: e.latlng.lat,
                lng: e.latlng.lng
            };
            
            this.createLine(this.tempStartPoint, endPoint);
            
            // Remove temporary marker
            this.tempStartPoint.marker.remove();
            this.tempStartPoint = null;
        }
    }
    
    createLine(start, end) {
        const distance = this.calculateDistance(start.lat, start.lng, end.lat, end.lng);
        const lineId = `A${this.lineCounter++}`;
        
        // Create polyline
        const polyline = L.polyline([
            [start.lat, start.lng],
            [end.lat, end.lng]
        ], {
            color: '#3b82f6',
            weight: 3,
            opacity: 0.8
        }).addTo(this.linesLayer);
        
        // Create start marker
        const startMarker = L.circleMarker([start.lat, start.lng], {
            radius: 6,
            fillColor: '#3b82f6',
            color: '#1e40af',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(this.linesLayer);
        
        // Create end marker
        const endMarker = L.circleMarker([end.lat, end.lng], {
            radius: 8,
            fillColor: '#ef4444',
            color: '#991b1b',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.8
        }).addTo(this.linesLayer);
        
        // Create distance label
        const midpoint = [(start.lat + end.lat) / 2, (start.lng + end.lng) / 2];
        const distanceLabel = L.marker(midpoint, {
            icon: L.divIcon({
                className: 'distance-label',
                html: `<div style="background: white; padding: 4px 8px; border-radius: 4px; border: 2px solid #3b82f6; font-weight: bold; font-size: 12px; white-space: nowrap;">${distance.toFixed(2)} m</div>`,
                iconSize: [60, 20]
            })
        }).addTo(this.linesLayer);
        
        // Store line data
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
        const R = 6371000; // Earth's radius in meters
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
            <td>${line.start.lat.toFixed(6)}, ${line.start.lng.toFixed(6)}</td>
            <td>${line.end.lat.toFixed(6)}, ${line.end.lng.toFixed(6)}</td>
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
        
        // Add event listeners for inputs
        row.querySelectorAll('input, select').forEach(input => {
            input.addEventListener('change', (e) => {
                const field = e.target.dataset.field;
                const lineData = this.lines.find(l => l.id === line.id);
                if (lineData) {
                    lineData[field] = e.target.value;
                }
            });
        });
        
        // Add delete button listener
        row.querySelector('.delete-btn').addEventListener('click', () => {
            this.deleteLine(line.id);
        });
        
        tbody.appendChild(row);
    }
    
    deleteLine(lineId) {
        const line = this.lines.find(l => l.id === lineId);
        if (!line) return;
        
        // Remove from map
        line.polyline.remove();
        line.startMarker.remove();
        line.endMarker.remove();
        line.distanceLabel.remove();
        
        // Remove from array
        this.lines = this.lines.filter(l => l.id !== lineId);
        
        // Remove from table
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
                
                // Update status
                const statusEl = document.getElementById('gpsStatus');
                statusEl.textContent = 'Active';
                statusEl.classList.add('status-active');
                
                // Show accuracy
                document.getElementById('gpsAccuracyRow').style.display = 'flex';
                document.getElementById('gpsAccuracy').textContent = `${accuracy.toFixed(1)} m`;
                
                // Update or create GPS marker
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
        
        // Add temporary marker
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
        
        // Remove temporary marker
        this.tempStartPoint.marker.remove();
        this.tempStartPoint = null;
        
        this.captureState = 'idle';
        document.getElementById('captureEndBtn').style.display = 'none';
    }
    
    saveDrawing() {
        const data = this.lines.map(line => ({
            id: line.id,
            start: line.start,
            end: line.end,
            distance: line.distance,
            depth: line.depth,
            width: line.width,
            excavationType: line.excavationType,
            roadType: line.roadType
        }));
        
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
                
                // Clear existing lines
                this.lines.forEach(line => {
                    line.polyline.remove();
                    line.startMarker.remove();
                    line.endMarker.remove();
                    line.distanceLabel.remove();
                });
                
                this.lines = [];
                document.getElementById('linesTableBody').innerHTML = '';
                
                // Load lines
                data.forEach(lineData => {
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
        const headers = ['Line', 'Start Lat', 'Start Lng', 'End Lat', 'End Lng', 'Length (m)', 'Depth', 'Width', 'Excavation Type', 'Road Type'];
        const rows = this.lines.map(line => [
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
        const headers = ['Line', 'Start Lat', 'Start Lng', 'End Lat', 'End Lng', 'Length (m)', 'Depth', 'Width', 'Excavation Type', 'Road Type'];
        const rows = this.lines.map(line => [
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

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MapDrawingApp();
});
