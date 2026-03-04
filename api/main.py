from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles

MAX_USERS_PER_CHAT = 2
app = FastAPI()
websocket_connections: list[WebSocket] = []

# Can't be on root (/) as the StaticFiles middleware will catch Web Socket requests (It only handles HTTP requests)
app.mount("/static", StaticFiles(directory="../web"), "static")

async def websocket_broadcast(data, *exclusions: WebSocket):
    for websocket in websocket_connections:
        if(websocket not in exclusions):
            print(f"Broadcasting to websocket {websocket.client} data {data}")
            await websocket.send_json(data)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    websocket_connections.append(websocket)
    print("Web Socket connection accepted.")
    print(f"Now have {len(websocket_connections)} active WebSocket connections")

    try:
        # TODO implement "chat rooms"
        # Only for initial setup
        if(len(websocket_connections) < MAX_USERS_PER_CHAT):
            await websocket_broadcast({"status": "WAITING"})
        else: # All peers connected
            await websocket_broadcast({"status": "READY"})
    
        # WebRTC signaling messaging flow. Need to loop otherwise WebSocket connection will close
        while True:
            data = await websocket.receive_json()
            await websocket_broadcast(data, websocket)
    except WebSocketDisconnect as e:
        print(f"Websocket connection has disconnected: {e}")
        websocket_connections.remove(websocket)