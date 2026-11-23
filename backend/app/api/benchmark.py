from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from backend.app.core.benchmark_runner import benchmark_runner, BenchmarkRunRequest

router = APIRouter(prefix="/api/benchmark", tags=["benchmark"])

@router.post("/run")
async def run_benchmark(req: BenchmarkRunRequest):
    return StreamingResponse(
        benchmark_runner.run_benchmark_stream(req),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )

@router.get("/{benchmark_id}")
def get_benchmark_result(benchmark_id: str):
    res = benchmark_runner.get_run(benchmark_id)
    if not res:
        raise HTTPException(status_code=404, detail="Benchmark no encontrado")
    return res
