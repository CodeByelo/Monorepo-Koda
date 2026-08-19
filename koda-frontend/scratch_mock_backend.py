from fastapi import FastAPI, Request
import uvicorn

app = FastAPI()

@app.get("/ventas")
async def read_ventas(request: Request):
    print("=== RECEIVED REQUEST ON /ventas ===", flush=True)
    for name, value in request.headers.items():
        print(f"{name}: {value}", flush=True)
    return {"message": "Success from mock!"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
