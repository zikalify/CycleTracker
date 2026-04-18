# Cycle Tracker - Natural Family Planning

Cycle Tracker is a privacy-first, offline-capable Progressive Web App (PWA) designed to help users track their fertility using the Symptothermal Method of Natural Family Planning (NFP).

## Features

- **Daily Logging**: Easily track your daily signs, including:
  - **Bleeding**: Unknown, None, Spotting, Light, Medium, Heavy.
  - **Basal Body Temperature (BBT)**: Record your daily waking temperature to confirm ovulation.
  - **Cervical Mucus**: Track mucus consistency (Dry, Cloudy/Damp, Clear/Slippery) to identify fertile windows.
- **Fertility Insights**: 
  - Automatically identifies cycle phases based on the Symptothermal method.
  - Applies safety rules like the "3-Day Rule" for fertile mucus.
  - Confirms ovulation by analyzing BBT temperature shifts.
- **Offline First**: Built as a Progressive Web App (PWA), meaning it works entirely offline once installed. Your data stays on your device.
- **Data Backup**: Export your cycle data as a JSON file, and import it back anytime to secure or migrate your data.
- **Modern UI**: A responsive, mobile-first design with smooth aesthetics and interactions.

## How It Works

The app calculates your fertility status based on standard Symptothermal rules:
- **New Cycle**: Begins on the first day of full bleeding (Light, Medium, or Heavy).
- **Fertile Window**: Opens when you observe fertile mucus (Cloudy/Damp or Clear/Slippery).
- **3-Day Rule**: The fertile window stays open for 3 full days after the last observation of fertile mucus.
- **Ovulation Confirmation**: Identified by a temperature shift (3 consecutive days of BBT that are at least 0.2°C higher than the highest of the previous 6 days).

## Running Locally

Because this is a static web app, no build step or package manager is required. However, to utilize local storage and PWA features, it should sit behind a local server rather than being opened directly as a `file://` URL.

1. Clone or download the repository.
2. Open your terminal in the project directory.
3. Run a simple local server. For example:
   - Using PowerShell: `.\server.ps1`
   - Using Python: `python -m http.server 8000`
   - Using Node.js: `npx serve .`
4. Open your browser and navigate to the provided local URL (e.g., `http://localhost:8000`).

## Installation (PWA)

To install Cycle Tracker on your device:
1. Open the app in your browser (like Chrome or Safari).
2. Look for the "Install" or "Add to Home Screen" prompt in your browser's menu (or URL bar).
3. Follow the steps to install. It will now appear as a native app on your phone or desktop and work offline.

## Technologies Used

- HTML5
- CSS3 (Vanilla)
- JavaScript (Vanilla, ES6)
- Service Workers & Web App Manifest (PWA)

## Privacy Protocol

This app does not send any of your health or logging data to external servers. Everything is saved locally on your device within your browser's storage. You are in full control of your data backups via the provided Import/Export functionalities.
