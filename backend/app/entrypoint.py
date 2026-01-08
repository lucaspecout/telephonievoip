import asyncio
import signal

import uvicorn

from app.main import app


async def serve() -> None:
    config = uvicorn.Config(app, host="0.0.0.0", port=1128, log_level="info")
    server = uvicorn.Server(config)

    loop = asyncio.get_running_loop()
    stop_event = asyncio.Event()

    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, stop_event.set)

    server_task = asyncio.create_task(server.serve())
    await stop_event.wait()
    server.should_exit = True
    await server_task


if __name__ == "__main__":
    asyncio.run(serve())
