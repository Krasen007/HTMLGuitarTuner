# Guitar Tuner

A progressive web app (PWA) that provides precise chromatic tuning for guitars and other musical instruments. Built with modern web technologies, it offers a clean interface and accurate pitch detection.

## Features

- Real-time pitch detection
- Visual tuning feedback with cents deviation
- Adjustable input gain
- Works offline (PWA)
- Battery optimization
- Dark theme interface
- Auto-updates notification system

## Technical Details

- Uses Web Audio API for audio processing
- Implements autocorrelation algorithm for pitch detection
- PWA with service worker for offline functionality
- Responsive design that works on both desktop and mobile devices

## Usage

1. Open the app in your browser
2. Grant microphone permissions when prompted
3. Click "Start the Tuner" to begin
4. Play a note on your instrument
5. Watch the display to see:
   - The detected note
   - Current frequency in Hz
   - Visual indicator showing if you're sharp or flat
   - Volume level in dB

## Settings

- Input Boost: Adjust the input gain (0-40 dB) using the settings gear icon

## Browser Support

Requires a modern browser with support for:
- Web Audio API
- getUserMedia API
- Service Workers

## Installation

You can install this as a PWA on your device:
1. Open the app in your browser
2. Your browser should prompt you to "Add to Home Screen"
3. Follow the prompts to install

## Development

The app consists of:
- `index.html`: Main application structure
- `style.css`: Styling and layout
- `script.js`: Core tuner functionality
- `sw.js`: Service worker for PWA features
- `manifest.json`: PWA configuration

## Updates

The app checks for updates on startup and notifies users when a new version is available.