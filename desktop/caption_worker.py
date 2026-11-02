"""Local-only Korean transcription. PCM is received in memory and never saved."""
import base64
import json
import os
import sys
import time

os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def main():
    import numpy as np
    from faster_whisper import WhisperModel

    model = WhisperModel(sys.argv[1], device="cpu", compute_type="int8",
                         cpu_threads=min(3, os.cpu_count() or 1), num_workers=1,
                         local_files_only=True)
    emit({"type": "ready"})
    for line in sys.stdin:
        job = None
        try:
            job = json.loads(line)
            audio = np.frombuffer(base64.b64decode(job["pcm"], validate=True), dtype="<f4").copy()
            if not 16000 <= len(audio) <= 16000 * 8 or not np.isfinite(audio).all():
                raise ValueError("Invalid audio buffer")
            started = time.perf_counter()
            segments, _ = model.transcribe(
                audio, language="ko", task="transcribe", beam_size=1, best_of=1,
                temperature=0, condition_on_previous_text=False,
                repetition_penalty=1.1, no_repeat_ngram_size=3, max_new_tokens=96,
                vad_filter=True, vad_parameters={"min_silence_duration_ms": 300},
                no_speech_threshold=0.6,
            )
            text = " ".join(segment.text.strip() for segment in segments
                            if segment.no_speech_prob < 0.7 and segment.avg_logprob > -1.5
                            and segment.compression_ratio < 2.4)
            emit({"type": "result", "id": job["id"], "epoch": job["epoch"],
                  "text": text[:1600], "seconds": len(audio) / 16000,
                  "processing": time.perf_counter() - started})
        except Exception:
            emit({"type": "job-error", "id": job.get("id") if job else None})


if __name__ == "__main__":
    try:
        main()
    except Exception:
        emit({"type": "fatal", "message": "음성 인식 엔진을 시작하지 못했습니다. 자막 설치 스크립트를 다시 실행하세요."})
        sys.exit(1)
