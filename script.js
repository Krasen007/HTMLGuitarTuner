// State management
const tunerState = {
  audioContext: null,
  analyser: null,
  mediaStreamSource: null,
  animationId: null,
  pitchBuffer: [],
  lastValidPitch: 0,
  gainNode: null,
  isRunning: false,
  currentStream: null
};

const CONSTANTS = {
  BUFFER_SIZE: 1,
  MIN_RMS: 0.001,
  NOISE_THRESHOLD: 0.02,
  NOTE_STRINGS: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
};

// Device compatibility check
function checkDeviceCompatibility() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error('Your browser does not support audio input');
  }

  if (!window.AudioContext && !window.webkitAudioContext) {
    throw new Error('Your browser does not support Web Audio API');
  }
}

// Improved audio initialization with proper cleanup
async function initializeAudio() {
  console.log('Initializing audio');
  try {
    // Always create a new audio context
    if (tunerState.audioContext) {
      await cleanup(true); // Cleanup but keep the button state
    }

    tunerState.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    await tunerState.audioContext.resume();

    // iOS Safari specific handling
    if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
      document.addEventListener('touchend', async () => {
        if (tunerState.audioContext) {
          await tunerState.audioContext.resume();
        }
      }, { once: true });
    }

    tunerState.analyser = tunerState.audioContext.createAnalyser();
    tunerState.analyser.fftSize = 2048;
    tunerState.analyser.smoothingTimeConstant = 0.8;

    // Initialize gain node
    tunerState.gainNode = tunerState.audioContext.createGain();
    const gainDb = parseInt(document.getElementById('gainSlider').value);
    tunerState.gainNode.gain.value = Math.pow(10, gainDb / 20);

  } catch (err) {
    console.error('Audio initialization failed:', err);
    throw new Error('Failed to initialize audio system');
  }
}

// Improved pitch detection
function autoCorrelate(buf, sampleRate) {
  const SIZE = buf.length;
  const MAX_SAMPLES = Math.floor(SIZE / 2);
  const correlations = new Float32Array(MAX_SAMPLES);

  // Calculate RMS and apply noise gate
  const rms = Math.sqrt(buf.reduce((acc, val) => acc + val * val, 0) / SIZE);
  if (rms < CONSTANTS.NOISE_THRESHOLD) return -1;

  let bestOffset = -1;
  let bestCorrelation = 0;
  let foundGoodCorrelation = false;
  let lastCorrelation = 1;

  for (let offset = 0; offset < MAX_SAMPLES; offset++) {
    let correlation = 0;

    for (let i = 0; i < MAX_SAMPLES; i++) {
      correlation += Math.abs((buf[i]) - (buf[i + offset]));
    }

    correlation = 1 - (correlation / MAX_SAMPLES);
    correlations[offset] = correlation;

    if ((correlation > 0.9) && (correlation > lastCorrelation)) {
      foundGoodCorrelation = true;
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestOffset = offset;
      }
    } else if (foundGoodCorrelation) {
      const shift = (correlations[bestOffset + 1] - correlations[bestOffset - 1]) / correlations[bestOffset];
      return sampleRate / (bestOffset + (8 * shift));
    }
    lastCorrelation = correlation;
  }

  if (bestCorrelation > 0.01) {
    return sampleRate / bestOffset;
  }
  return -1;
}

function noteFromPitch(frequency) {
  const noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
  return Math.round(noteNum) + 69;
}

function frequencyFromNoteNumber(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

// Battery optimization
function optimizeForBattery() {
  if ('getBattery' in navigator) {
    navigator.getBattery().then(battery => {
      if (battery.level < 0.2 && !battery.charging) {
        if (tunerState.analyser) {
          tunerState.analyser.smoothingTimeConstant = 0.9;
          tunerState.analyser.fftSize = 1024;
        }
      }
    });
  }
}

// UI State management
function updateUIState(state) {
  const button = document.getElementById('startButton');
  const noteDisplay = document.getElementById('note');
  const frequencyDisplay = document.getElementById('frequency');
  const volumeDisplay = document.getElementById('volume');

  switch (state) {
    case 'loading':
      button.textContent = 'Loading...';
      button.disabled = true;
      break;
    case 'running':
      button.textContent = 'Stop';
      button.disabled = false;
      break;
    case 'stopped':
      button.textContent = 'Start';
      button.disabled = false;
      noteDisplay.textContent = '-';
      frequencyDisplay.textContent = '- Hz';
      volumeDisplay.textContent = '- dB';
      break;
  }
}

// Main pitch update function
function updatePitch() {
  const bufferLength = tunerState.analyser.frequencyBinCount;
  const buffer = new Float32Array(bufferLength);
  tunerState.analyser.getFloatTimeDomainData(buffer);

  const ac = autoCorrelate(buffer, tunerState.audioContext.sampleRate);

  // Calculate RMS volume
  const rms = Math.sqrt(buffer.reduce((acc, val) => acc + val * val, 0) / bufferLength);
  const decibels = 20 * Math.log10(rms);

  // Process pitch if volume is above threshold
  if (rms > CONSTANTS.MIN_RMS && ac !== -1) {
    tunerState.pitchBuffer.push(ac);
    if (tunerState.pitchBuffer.length > CONSTANTS.BUFFER_SIZE) {
      tunerState.pitchBuffer.shift();
    }
    tunerState.lastValidPitch = ac;
  }

  // Get median pitch from buffer
  const sortedPitches = [...tunerState.pitchBuffer].sort((a, b) => a - b);
  const pitch = tunerState.pitchBuffer.length > 0
    ? sortedPitches[Math.floor(sortedPitches.length / 2)]
    : (tunerState.lastValidPitch || 0);

  // Update UI
  document.getElementById('volume').textContent = `${Math.round(decibels)} dB`;

  if (pitch > 0) {
    const note = noteFromPitch(pitch);
    const noteName = CONSTANTS.NOTE_STRINGS[note % 12];
    const octave = Math.floor(note / 12) - 1;
    const idealFrequency = frequencyFromNoteNumber(note);
    const cents = 1200 * Math.log2(pitch / idealFrequency);

    let direction = '';
    if (Math.abs(cents) > 3) {
      direction = cents > 0 ? ' ▼' : ' ▲';
    }
    else {
      direction = ' -';
    }

    document.getElementById('note').textContent = `${noteName}${octave}${direction}`;
    document.getElementById('frequency').textContent =
      `${Math.round(pitch)} Hz → ${noteName}${octave} (${Math.round(idealFrequency)} Hz)`;

    updateTunerGraph(pitch, idealFrequency, cents);
  } else {
    document.getElementById('note').textContent = '-';
    document.getElementById('frequency').textContent = '0 Hz';
  }

  tunerState.animationId = requestAnimationFrame(updatePitch);
}

// Tuner graph visualization
function updateTunerGraph(pitch, idealFrequency, cents) {
  const canvas = document.getElementById('tunerGraph');
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;

  // Clear and draw background
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, width, height);

  // Draw center line
  ctx.strokeStyle = '#666';
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, height);
  ctx.stroke();

  // Calculate position and color
  const maxCents = 50;
  const position = (width / 2) + (cents * width) / (2 * maxCents);
  const clampedPosition = Math.max(0, Math.min(width, position));

  const absCents = Math.abs(cents);
  const color = absCents < 5 ? '#4CAF50' :
    absCents < 15 ? '#FFA500' : '#FF0000';

  // Draw indicator
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(clampedPosition, height / 2, 20, 0, 2 * Math.PI);
  ctx.fill();

  // Draw nearby notes
  const currentNoteNumber = noteFromPitch(pitch);
  const prevNote = CONSTANTS.NOTE_STRINGS[(currentNoteNumber - 1) % 12] +
    Math.floor((currentNoteNumber - 1) / 12 - 1);
  const nextNote = CONSTANTS.NOTE_STRINGS[(currentNoteNumber + 1) % 12] +
    Math.floor((currentNoteNumber + 1) / 12 - 1);

  ctx.fillStyle = '#666';
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(prevNote, width * 0.1, height / 2);
  ctx.fillText(nextNote, width * 0.9, height / 2);
}

// Enhanced cleanup function
async function cleanup(keepButtonState = false) {
  try {
    // Stop all tracks in the current stream
    if (tunerState.currentStream) {
      tunerState.currentStream.getTracks().forEach(track => track.stop());
      tunerState.currentStream = null;
    }

    // Cancel animation frame
    if (tunerState.animationId) {
      cancelAnimationFrame(tunerState.animationId);
      tunerState.animationId = null;
    }

    // Disconnect and clean up audio nodes
    if (tunerState.mediaStreamSource) {
      tunerState.mediaStreamSource.disconnect();
      tunerState.mediaStreamSource = null;
    }

    if (tunerState.gainNode) {
      tunerState.gainNode.disconnect();
      tunerState.gainNode = null;
    }

    if (tunerState.analyser) {
      tunerState.analyser.disconnect();
      tunerState.analyser = null;
    }

    // Close audio context
    if (tunerState.audioContext) {
      await tunerState.audioContext.close();
      tunerState.audioContext = null;
    }

    // Reset state
    tunerState.pitchBuffer = [];
    tunerState.isRunning = false;

    // Update UI unless keeping button state
    if (!keepButtonState) {
      updateUIState('stopped');
    }
  } catch (err) {
    console.error('Error during cleanup:', err);
    // Still update UI even if there's an error
    if (!keepButtonState) {
      updateUIState('stopped');
    }
  }
}

// Event Listeners
document.getElementById('settingsButton').addEventListener('click', () => {
  document.getElementById('settingsMenu').classList.toggle('hidden');
});

document.getElementById('gainSlider').addEventListener('input', (e) => {
  const gainDb = Math.min(Math.max(parseInt(e.target.value) || 0, 0), 40);
  if (isNaN(gainDb)) return;

  document.getElementById('gainValue').textContent = `${gainDb} dB`;
  if (tunerState.gainNode) {
    tunerState.gainNode.gain.setTargetAtTime(
      Math.pow(10, gainDb / 20),
      tunerState.audioContext.currentTime,
      0.01
    );
  }
});

document.addEventListener('click', (e) => {
  const menu = document.getElementById('settingsMenu');
  const button = document.getElementById('settingsButton');
  if (!menu.contains(e.target) && !button.contains(e.target)) {
    menu.classList.add('hidden');
  }
});

// Modified start button event listener
document.getElementById('startButton').addEventListener('click', async () => {
  try {
    if (!tunerState.isRunning) {
      updateUIState('loading');
      checkDeviceCompatibility();
      await initializeAudio();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          echoCancellation: false,
          noiseSuppression: false,
          channelCount: 1
        }
      });

      tunerState.currentStream = stream;
      tunerState.mediaStreamSource = tunerState.audioContext.createMediaStreamSource(stream);

      // Connect audio nodes
      tunerState.mediaStreamSource.connect(tunerState.gainNode);
      tunerState.gainNode.connect(tunerState.analyser);

      optimizeForBattery();
      updatePitch();
      tunerState.isRunning = true;
      updateUIState('running');
    } else {
      await cleanup();
    }
  } catch (err) {
    console.error('Error:', err);
    alert(`Error: ${err.message}. Please ensure you have granted microphone permission.`);
    await cleanup();
    updateUIState('stopped');
  }
});

// Enhanced page unload handler
window.addEventListener('unload', () => {
  if (tunerState.isRunning) {
    cleanup();
  }
});

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js')
      .then(reg => console.log('Service Worker registered'))
      .catch(err => console.log('Service Worker registration failed:', err));
  });
}

// Main application code (script.js) - Add this to your existing code
let refreshing = false;

// Function to create and show the update notification
function showUpdateNotification() {
  // Create notification element if it doesn't exist
  let notification = document.getElementById('update-notification');
  if (!notification) {
    notification = document.createElement('div');
    notification.id = 'update-notification';
    notification.className = 'update-notification';
    notification.innerHTML = `
      <div class="update-content">
        <span>A new version is available!</span>
        <button id="update-button">Update Now</button>
      </div>
    `;
    document.body.appendChild(notification);

    // Add event listener to the update button
    document.getElementById('update-button').addEventListener('click', () => {
      // Send skip waiting message to service worker
      navigator.serviceWorker.controller.postMessage('skipWaiting');
    });
  }
  notification.classList.add('show');
}

// Function to check for service worker updates
function checkForUpdates() {
  // Check if service worker is available
  if (!('serviceWorker' in navigator)) return;

  // Register service worker
  navigator.serviceWorker.register('/sw.js').then(registration => {
    // Add update found listener
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker.addEventListener('statechange', () => {
        // When the service worker is installed, show notification
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateNotification();
        }
      });
    });

    // Check for updates every 60 minutes
    setInterval(() => {
      registration.update();
    }, 60 * 60 * 1000);
  });

  // Add controller change listener
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });
}

// Call checkForUpdates when the page loads
window.addEventListener('load', checkForUpdates);