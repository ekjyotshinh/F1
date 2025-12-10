# F1 Analytics Dashboard 🏎️

A comprehensive Formula 1 race analytics platform with interactive visualizations, lap time analysis, tire strategy tracking, and position changes throughout races.

![F1 Analytics](https://img.shields.io/badge/F1-Analytics-red?style=for-the-badge&logo=formula1)
![Live Demo](https://img.shields.io/badge/demo-live-success?style=for-the-badge)

## 🌐 Live Demo

**[View Live Dashboard](https://ekjyotshinh.github.io/F1/)**

## ✨ Features

### 📊 Race Analytics
- **Lap Times Progression**: Interactive charts showing lap-by-lap performance
- **Position Tracking**: Visualize position changes throughout the race
- **Tire Strategy**: Color-coded tire compound usage and pit stop analysis
- **Driver Comparison**: Select and compare multiple drivers simultaneously

### 🏁 Race Data
- **Historical Data**: Access races from 2018-2024
- **Fastest Lap**: View fastest lap times and drivers
- **Race Results**: Complete finishing order with times and grid positions
- **Real-time Selection**: Dynamic year and race selection

### 🎨 Premium UI
- F1-themed dark design with signature red accents
- Responsive charts and visualizations
- Smooth animations and transitions
- Mobile-friendly interface

## 🛠️ Technology Stack

### Frontend
- **React** (Vite) - Fast, modern UI framework
- **Chart.js** - Interactive data visualizations
- **Axios** - HTTP client for API requests

### Backend
- **Go** (Gin) - High-performance API gateway
- **Python** (FastAPI) - Data processing service
- **FastF1** - Official F1 data library

### Deployment
- **Frontend**: GitHub Pages
- **Backend**: Railway.app
- **CI/CD**: GitHub Actions

## 🚀 Local Development

### Prerequisites
- Node.js 18+
- Go 1.23+
- Python 3.9+

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/ekjyotshinh/F1.git
   cd F1
   ```

2. **Start Python Data Service**
   ```bash
   cd data-service
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```

3. **Start Go API Gateway**
   ```bash
   cd server
   go run main.go
   ```

4. **Start React Frontend**
   ```bash
   cd client
   npm install
   npm run dev
   ```

5. **Open browser**
   ```
   http://localhost:5173
   ```

## 📁 Project Structure

```
F1/
├── client/              # React frontend
│   ├── src/
│   │   ├── components/  # React components
│   │   └── index.css    # Global styles
│   └── vite.config.js
├── server/              # Go API gateway
│   ├── main.go
│   └── Dockerfile
├── data-service/        # Python data service
│   ├── main.py
│   ├── requirements.txt
│   └── railway.json
└── .github/
    └── workflows/       # CI/CD pipelines
```

## 🔧 Configuration

### Environment Variables

**Frontend** (`client/.env.production`):
```bash
VITE_API_URL=https://your-go-server.railway.app
```

**Go Server** (`server/main.go`):
```go
pythonServiceURL = "https://your-python-service.railway.app"
```

## 📊 Data Source

Race data is sourced from the official Formula 1 API via the [FastF1](https://github.com/theOehrly/Fast-F1) Python library, which provides:
- Lap times and telemetry
- Tire compound data
- Position tracking
- Race results and standings

## 🎯 Key Features Explained

### Caching Strategy
- **FastF1 Cache**: Historical race data cached locally for instant access
- **HTTP Cache Headers**: 24-hour browser caching for optimal performance
- **First Request**: ~2-5 seconds (downloads from F1 API)
- **Cached Requests**: <500ms (instant from cache)

### Analytics Capabilities
- **Lap Time Analysis**: Identify pace variations, pit stop impacts, tire degradation
- **Strategy Comparison**: Compare tire strategies across teams and drivers
- **Position Dynamics**: Track overtakes and race progression
- **Driver Selection**: Toggle any combination of drivers for custom analysis

## 🚢 Deployment

**Quick Deploy:**
1. Backend → Railway.app (free tier)
2. Frontend → GitHub Pages (automatic via GitHub Actions)

## 📝 License

MIT License - feel free to use this project for learning and development.

## 🙏 Acknowledgments

- [FastF1](https://github.com/theOehrly/Fast-F1) - F1 data library
- [Chart.js](https://www.chartjs.org/) - Charting library
- Formula 1 for the amazing sport and data

## 📧 Contact

Created by [@ekjyotshinh](https://github.com/ekjyotshinh)

---

**Note**: This is an unofficial project and is not affiliated with Formula 1 or the FIA.