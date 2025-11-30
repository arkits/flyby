# FLYBY2

A high-performance 3D flight maneuver visualizer built with React, Three.js, and Vite.

## 🚀 Overview

FLYBY2 is an interactive 3D application that simulates and visualizes various aircraft performing complex flight maneuvers. It features a dynamic camera system that tracks the aircraft, realistic environment rendering, and a "Cyberpunk" styled control panel for real-time customization.

## ✨ Features

- **Real-time 3D Rendering**: High-quality aircraft visualization using Three.js.
- **Dynamic Maneuvers**: Watch aircraft perform loops, barrel rolls, climbs, figure-8s, and more.
- **Interactive Camera**: Smart camera system that tracks the action with adjustable zoom.
- **Customizable Environment**: Toggle sky, ground, smoke trails, and jet flames.
- **Cyberpunk Control Panel**: A stylish UI to control the simulation, select aircraft, and trigger specific maneuvers.
- **Performance Optimized**: Built with Vite for lightning-fast development and optimized production builds.

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Build Tool**: [Vite](https://vitejs.dev/)
- **3D Engine**: [Three.js](https://threejs.org/)
- **React 3D Bindings**: [React Three Fiber](https://docs.pmnd.rs/react-three-fiber) & [Drei](https://github.com/pmndrs/drei)

## 📦 Installation & Usage

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd flyby
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```
   Open your browser and navigate to the URL shown in the terminal (usually `http://localhost:5173`).

4. **Build for production**
   ```bash
   npm run build
   ```

5. **Preview production build**
   ```bash
   npm run preview
   ```

## 🎮 Controls

- **Press `D`**: Toggle the Debug/Control UI.
- **Mouse Wheel**: Zoom in/out.
- **Control Panel**:
  - **Select Aircraft**: Choose a specific model or let it cycle randomly.
  - **Select Maneuver**: Pick a specific stunt or randomize it.
  - **Toggles**: Turn on/off environmental effects like Sky, Ground, Smoke, and Flame.

## 📄 License

[MIT](LICENSE)
