import io
import logging
from typing import Optional

import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from kokoro import KPipeline
from pydantic import BaseModel

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Newslett TTS Service")

# Initialize Pipeline (English, US)
# This will download the 82M model (~300MB) on first run
try:
    # 'a' is for American English.
    # We use cpu=True for compatibility, change to False if GPU available.
    PIPELINE = KPipeline(lang_code='a')
    logger.info("Kokoro Pipeline Initialized")
except Exception as e:
    logger.error(f"Failed to initialize Kokoro Pipeline: {e}")
    PIPELINE = None


class TtsRequest(BaseModel):
    text: str
    voice: str = "af_heart"  # Default warm female voice
    speed: float = 1.0


@app.get("/health")
def health_check():
    return {"status": "ok", "model_loaded": PIPELINE is not None}


@app.post("/generate")
def generate_tts(request: TtsRequest):
    if PIPELINE is None:
        raise HTTPException(status_code=503, detail="TTS Model not initialized")

    if not request.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    logger.info(f"Generating TTS for: {request.text[:50]}...")

    try:
        # Generate audio
        # generate() returns a generator of (graphemes, phonemes, audio_tensor)
        # We want to concatenate all audio chunks
        generator = PIPELINE(
            request.text,
            voice=request.voice,
            speed=request.speed,
            split_pattern=r'\n+' # usage of split pattern
        )
        
        # Collect all audio segments
        all_audio = []
        for _, _, audio in generator:
            all_audio.append(audio)
            
        if not all_audio:
             raise HTTPException(status_code=500, detail="No audio generated")

        # Concatenate using torch or numpy
        import numpy as np
        final_audio = np.concatenate(all_audio)

        # Convert to WAV in-memory
        buffer = io.BytesIO()
        sf.write(buffer, final_audio, 24000, format='WAV')
        buffer.seek(0)
        
        return StreamingResponse(buffer, media_type="audio/wav")
    
    except Exception as e:
        logger.error(f"TTS Generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8888)
