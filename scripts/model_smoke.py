"""Real local-model smoke evidence, clearly separated from workshop data."""

import json
from pathlib import Path
from datetime import datetime, timezone
from backend import model

texts = [
    "남아 달라는 뜻 같아요.",
    "It sounds like a request to stay.",
    "남아야 해서 불편해요.",
]
matrix, lengths = model.encode(texts)
result = {
    "label": "가상 연습 자료 / synthetic software verification; NOT participant data",
    "at": datetime.now(timezone.utc).isoformat(),
    "model": model.state,
    "texts": texts,
    "cosine_similarity": matrix.tolist(),
    "token_lengths": lengths,
    "checks": {
        "finite_range": bool(((matrix >= -1.00001) & (matrix <= 1.00001)).all()),
        "symmetric": bool(abs(matrix - matrix.T).max() < 1e-6),
    },
    "note": "Scores were measured by the real cached model. No expected semantic score is hard-coded.",
}
Path("validation").mkdir(exist_ok=True)
Path("validation/model-smoke.json").write_text(
    json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
)
print(
    json.dumps(
        {
            "status": model.state["status"],
            "revision": model.state["revision"],
            "checks": result["checks"],
        }
    )
)
