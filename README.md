# GPS Map Line Drawing Application

A complete web application for drawing lines on interactive maps with GPS tracking and comprehensive data capture capabilities.

![GPS Map Drawing App](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

## 🌟 Features

- **Interactive Map**: Toggle between Street Map and Satellite views using Leaflet.js
- **Line Drawing**: Click two points on the map to draw straight lines
- **GPS Tracking**: Real-time GPS location with accuracy display
- **GPS Capture**: Capture start and end points using device GPS
- **Distance Calculation**: Automatic distance measurement in meters (Haversine formula)
- **Data Management**: Comprehensive line information table with 8 columns
- **Export Options**: Save drawings as JSON, export to Excel (.xls) or CSV
- **Responsive Design**: Works on desktop and mobile devices

## 🎯 Live Demo

Visit: `https://yourusername.github.io/gps-map-drawing-app`

## 📋 Requirements

- Modern web browser with GPS/geolocation support
- Internet connection (for map tiles)
- HTTPS enabled (required for GPS on most browsers)

## 🚀 Installation

### Option 1: GitHub Pages (Recommended)

1. Fork this repository
2. Go to Settings → Pages
3. Select "main" branch as source
4. Your app will be live at: `https://yourusername.github.io/gps-map-drawing-app`

### Option 2: Local Development

```bash
# Clone the repository
git clone https://github.com/yourusername/gps-map-drawing-app.git

# Navigate to directory
cd gps-map-drawing-app

# Open with a local server (required for GPS to work)
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000

# Node.js (if you have http-server installed)
npx http-server -p 8000

# Then open: http://localhost:8000
```

**⚠️ Important**: Due to browser security restrictions, GPS features only work:
- On HTTPS websites (like GitHub Pages)
- On localhost during development

## 📱 Usage

### Drawing Lines

1. **Manual Drawing**:
   - Ensure "Draw" mode is active
   - Click on the map for the start point (blue circle appears)
   - Click again for the end point
   - Line is created with distance label

2. **GPS Capture**:
   - Click "Capture Start Point" to mark current GPS location
   - Move to end location
   - Click "Capture End Point" to complete the line

### Managing Lines

- **View Data**: All lines appear in the information table
- **Edit Data**: Enter Depth, Width, and select Excavation/Road types
- **Delete Lines**: Click the Delete button for any line

### Exporting Data

- **Save Drawing**: Download all lines as JSON (preserves all data)
- **Load Drawing**: Upload a previously saved JSON file
- **Export Excel**: Download as .xls file
- **Export CSV**: Download as comma-separated values

## 📊 Line Information Table Columns

1. **Line**: Auto-incrementing ID (A1, A2, A3...)
2. **Start Coordinates**: Latitude, Longitude (6 decimal places)
3. **End Coordinates**: Latitude, Longitude (6 decimal places)
4. **Length (m)**: Distance in meters (2 decimal places)
5. **Depth**: Editable numeric field
6. **Width**: Editable numeric field
7. **Excavation Type**: Dropdown with Arabic options
   - العادي (Normal)
   - الطارئ (Emergency)
   - المتعدد (Multiple)
   - توصيلة المباني (Building Connection)
   - مخططات جديدة (New Layouts)
8. **Road Type**: Dropdown
   - Soil
   - Asphalt
   - tiles/blocks

## 🛠️ Technical Details

### File Structure

```
gps-map-drawing-app/
├── index.html          # Main HTML structure
├── app.js             # Application logic
└── README.md          # Documentation
```

### Dependencies

All dependencies are loaded from CDN:

- **Leaflet.js v1.9.4**: Interactive maps
- **Font Awesome 6.4.0**: Icons
- **OpenStreetMap**: Street map tiles
- **Esri World Imagery**: Satellite imagery

### Browser Compatibility

- Chrome 90+ ✅
- Firefox 88+ ✅
- Safari 14+ ✅
- Edge 90+ ✅
- Mobile browsers (with GPS) ✅

## 🔧 Customization

### Change Default Map Center

Edit in `app.js`:

```javascript
this.map = L.map('map', {
    center: [24.4539, 39.5773], // [latitude, longitude]
    zoom: 13
});
```

### Modify Line Colors

Edit in `app.js` (createLine method):

```javascript
const polyline = L.polyline([...], {
    color: '#3b82f6',  // Change line color
    weight: 3,         // Change line width
    opacity: 0.8       // Change transparency
});
```

## 📄 License

MIT License - feel free to use this project for any purpose.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the project
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 🐛 Known Issues

- GPS accuracy depends on device hardware
- Safari on iOS requires user permission for location access
- Some mobile browsers may limit background GPS tracking

## 📞 Support

If you encounter any issues or have questions:
- Open an issue on GitHub
- Check existing issues for solutions

## 🙏 Acknowledgments

- Map tiles by OpenStreetMap and Esri
- Built with Leaflet.js
- Icons by Font Awesome

---

**Made with ❤️ for field surveying and utility mapping**
