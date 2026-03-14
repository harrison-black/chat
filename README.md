# Chat App

A WebRTC based app for video/audio and messaging.

## Components

### API
Provides peer awareness and signaling capability required to set up WebRTC communication. Currently only provides
WebSocket endpoint and serves static files.

### UI
Provides interface for user and uses native web/browser APIs for WebRTC and Web Socket capabilities.

## Tech Stack
- Python
- FastAPI
- HTML
- TailwindCSS (currently no stylesheets of my own)
- DaisyUI
- Vanilla JS
- Google Font and Icons

## Run Steps
Written for Linux only currently and no Docker image yet...

### Setup:
1. Clone this repo to your machine.
1. Install Python (developed on v3.12.3). Run `python3 --version` to confirm if installed.
1. Create Python virtual environment (from your repo downloaded folder): `cd chat/api && python3 -m venv .venv`
1. Activate virtual environment: `source .venv/bin/activate`
1. Install API dependencies: `pip install -r requirements.txt`

### Run:
1. Run API in dev mode: `fastapi dev main.py`
1. Navigate to index page in browser (first peer/user): http://localhost:8000/static/index.html
1. Navigate to same page in another tab/window (send peer/user).
1. Start video call or send messages.

### Notes
- Close virtual environment via `deactivate`.
- To run the second peer on a seprate machine, the following restrictions exist at this time:
    - Second machine must be on the same network unless you set up port forwarding on the router or deploy in an externally accessible location.
    - Must run FastAPI in production mode so that it exposes the app on 0.0.0.0 (represents all IP addresses on machine) instead of localhost via `fastapi run main.py`.
    - Second machine can navigate to first machine's internal IP address instead of localhost e.g. see `wlo1` device via `ifconfig` command (may need installing, terminal will give package name/apt command).
    - Second machine cannot access (and therefore can't send) video as it requires access to the browser's MediaDevices API which is security sensitive (only allowed on localhost or secure contexts i.e. HTTPS).
- Only two peers supported, adding a third may break things...