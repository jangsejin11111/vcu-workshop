import json, os, threading, importlib.metadata
from pathlib import Path

MODEL_ID = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
ROOT = Path(os.environ.get("VCU_DATA", "data"))
LOCK = ROOT / "model-lock.json"
model = None
state = {"status": "not_loaded", "error": None}
mutex = threading.Lock()


def prepare():
    from huggingface_hub import HfApi, snapshot_download

    ROOT.mkdir(parents=True, exist_ok=True)
    revision = (
        json.loads(LOCK.read_text())["revision"]
        if LOCK.exists()
        else HfApi().model_info(MODEL_ID).sha
    )
    path = snapshot_download(
        MODEL_ID,
        revision=revision,
        ignore_patterns=["onnx/*", "openvino/*", "*.h5", "*.ot"],
    )
    LOCK.write_text(
        json.dumps({"model_id": MODEL_ID, "revision": revision, "path": path}),
        encoding="utf-8",
    )
    return load()


def load():
    global model, state
    with mutex:
        if model is not None:
            return state
        state = {"status": "loading", "error": None}
        try:
            from sentence_transformers import SentenceTransformer
            import torch

            torch.set_num_threads(int(os.environ.get("VCU_MODEL_THREADS", "4")))
            config = json.loads(LOCK.read_text())
            model = SentenceTransformer(
                config["path"], local_files_only=True, device="cpu"
            )
            state = {
                **config,
                "status": "ready",
                "error": None,
                "sentence_transformers": importlib.metadata.version(
                    "sentence-transformers"
                ),
                "max_seq_length": model.max_seq_length,
                "preprocessing": "strip; original language; normalized embeddings",
            }
        except Exception as e:
            model = None
            state = {"status": "failed", "error": str(e)}
        return state


def encode(texts):
    if load()["status"] != "ready":
        raise RuntimeError(state["error"])
    vectors = model.encode(texts, normalize_embeddings=True)
    lengths = [len(model.tokenizer.encode(t, truncation=False)) for t in texts]
    return vectors @ vectors.T, lengths


if __name__ == "__main__":
    print(json.dumps(prepare(), ensure_ascii=False, indent=2))
