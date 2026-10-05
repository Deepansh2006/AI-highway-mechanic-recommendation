from fastapi import WebSocket
from typing import Dict, Any
import json

class ConnectionManager:
    def __init__(self):
        # Maps user_id -> WebSocket
        self.motorists: Dict[str, WebSocket] = {}
        self.mechanics: Dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str, client_type: str):
        await websocket.accept()
        if client_type == "motorist":
            self.motorists[client_id] = websocket
        elif client_type == "mechanic":
            self.mechanics[client_id] = websocket

    def disconnect(self, client_id: str, client_type: str):
        if client_type == "motorist" and client_id in self.motorists:
            del self.motorists[client_id]
        elif client_type == "mechanic" and client_id in self.mechanics:
            del self.mechanics[client_id]

    async def send_personal_message(self, message: dict, client_id: str, client_type: str):
        target_dict = self.motorists if client_type == "motorist" else self.mechanics
        if client_id in target_dict:
            ws = target_dict[client_id]
            try:
                await ws.send_json(message)
            except Exception:
                # Connection dropped
                self.disconnect(client_id, client_type)

manager = ConnectionManager()
