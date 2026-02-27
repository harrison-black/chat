from fastapi import FastAPI, WebSocket
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Can't be on root (/) as the StaticFiles middleware will catch web socket requests (It only handles HTTP requests)
app.mount("/static", StaticFiles(directory="../web"), "static")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    print("Web socket connection initiated")
    
    await websocket.accept()
    while True:
        data = await websocket.receive_text()
        await websocket.send_text(f"You sent {data}")