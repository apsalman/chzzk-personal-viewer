"""Local-only Korean transcription. PCM is received in memory and never saved."""
import base64
import json
import os
import sys
import time
from pathlib import Path

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def main():
    dll_handles = []
    if os.name == "nt":
        for directory in (Path(sys.prefix) / "Lib/site-packages/nvidia").glob("*/bin"):
            dll_handles.append(os.add_dll_directory(str(directory)))
            os.environ["PATH"] = str(directory) + os.pathsep + os.environ.get("PATH", "")
    import numpy as np
    import ctranslate2
    from faster_whisper import WhisperModel

    requested = sys.argv[2] if len(sys.argv) > 2 else "auto"
    device, model, notice = "cpu", None, ""

    def load(target):
        return WhisperModel(sys.argv[1], device=target,
                            compute_type="int8_float32" if target == "cuda" else "int8",
                            cpu_threads=min(3, os.cpu_count() or 1), num_workers=1,
                            local_files_only=True)

    if requested != "cpu":
        try:
            if not ctranslate2.get_cuda_device_count():
                raise RuntimeError("No CUDA device")
            model = load("cuda")
            # Check actual kernels and DLLs before declaring the GPU ready.
            list(model.transcribe(np.zeros(16000, dtype=np.float32), language="ko",
                                  beam_size=1, max_new_tokens=1, vad_filter=False))
            device = "cuda"
        except Exception:
            model = None
            if requested == "cuda":
                emit({"type": "fatal", "message": "GPU를 사용할 수 없습니다. CPU를 선택하거나 setup-captions.ps1 -EnableGpu를 실행하세요."})
                return
            notice = "GPU 사용 불가 · CPU로 처리합니다."
    if model is None:
        model = load("cpu")
    from faster_whisper.vad import get_speech_timestamps
    get_speech_timestamps(np.zeros(16000, dtype=np.float32))
    emit({"type": "ready", "device": device, "notice": notice})
    history = np.empty(0, dtype=np.float32)
    previous_epoch, previous_time = None, None

    def transcribe(audio, timestamped=False):
        segments, _ = model.transcribe(
            audio, language="ko", task="transcribe", beam_size=3 if timestamped else 1, best_of=1,
            temperature=0, condition_on_previous_text=False,
            repetition_penalty=1.1, no_repeat_ngram_size=3, max_new_tokens=224 if timestamped else 96,
            word_timestamps=timestamped,
            vad_filter=True, vad_parameters={"min_silence_duration_ms": 300},
            no_speech_threshold=0.6,
        )
        valid = [segment for segment in segments if segment.no_speech_prob < 0.7
                 and segment.avg_logprob > -1.5 and segment.compression_ratio < 2.4]
        cues = []
        if timestamped:
            for segment in valid:
                if not segment.words:
                    cues.append({"start": segment.start, "end": segment.end, "text": segment.text.strip()})
                    continue
                words = []
                for word in segment.words:
                    words.append(word)
                    if word.end - words[0].start >= 2.5 or len("".join(w.word for w in words)) > 48:
                        cues.append({"start": words[0].start, "end": word.end, "text": "".join(w.word for w in words).strip()})
                        words = []
                if words:
                    cues.append({"start": words[0].start, "end": words[-1].end, "text": "".join(w.word for w in words).strip()})
        return " ".join(segment.text.strip() for segment in valid), cues

    for line in sys.stdin:
        job = None
        try:
            job = json.loads(line)
            vod = job.get("mode") == "vod"
            incoming = np.frombuffer(base64.b64decode(job["pcm"], validate=True), dtype="<f4").copy()
            if not 16000 <= len(incoming) <= 16000 * (16 if vod else 8) or not np.isfinite(incoming).all():
                raise ValueError("Invalid audio buffer")
            seconds = len(incoming) / 16000
            if job["epoch"] != previous_epoch or previous_time is None or job["capturedAt"] - previous_time > (seconds + 1.5) * 1000:
                history = np.empty(0, dtype=np.float32)
            # Update every two seconds while retaining four seconds of context.
            keep = 0 if vod else max(0, 64000 - len(incoming))
            audio = np.concatenate((history[-keep:] if keep else np.empty(0, dtype=np.float32), incoming))
            history = audio[-32000:].copy()
            previous_epoch, previous_time = job["epoch"], job["capturedAt"]
            started = time.perf_counter()
            try:
                text, cues = transcribe(audio, vod)
            except Exception:
                if device != "cuda" or requested != "auto":
                    raise
                model = None
                model = load("cpu")
                device = "cpu"
                emit({"type": "backend", "device": device, "notice": "GPU 처리 실패 · CPU로 전환했습니다."})
                text, cues = transcribe(audio, vod)
            offset = job.get("start", 0)
            emit({"type": "result", "id": job["id"], "epoch": job["epoch"],
                  "mode": "vod" if vod else "live", "start": offset,
                  "cues": [{**cue, "start": cue["start"] + offset, "end": cue["end"] + offset} for cue in cues],
                  "text": text[:1600], "seconds": seconds, "contextSeconds": len(audio) / 16000, "device": device,
                  "processing": time.perf_counter() - started})
        except Exception:
            emit({"type": "job-error", "id": job.get("id") if job else None})


if __name__ == "__main__":
    try:
        main()
    except Exception:
        emit({"type": "fatal", "message": "음성 인식 엔진을 시작하지 못했습니다. 자막 설치 스크립트를 다시 실행하세요."})
        sys.exit(1)
