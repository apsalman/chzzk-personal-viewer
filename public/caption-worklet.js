class KoreanCaptionPCM extends AudioWorkletProcessor {
  constructor() {
    super(); this.epoch = 0; this.seconds = 2; this.reset();
    this.port.onmessage = event => { this.epoch = event.data.epoch; if ([2,3,4].includes(event.data.seconds)) this.seconds = event.data.seconds; this.reset(); };
  }
  reset() { this.buffer = new Float32Array(16000*this.seconds); this.offset = 0; this.phase = 0; this.sum = 0; this.count = 0; }
  process(inputs) {
    const audio = inputs[0]?.[0];
    if (!audio) return true;
    for (let i=0;i<audio.length;i++) {
      this.sum += audio[i]; this.count++; this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.buffer[this.offset++] = this.sum / this.count;
        this.phase -= sampleRate; this.sum = 0; this.count = 0;
        if (this.offset === this.buffer.length) {
          const data = this.buffer; this.buffer = new Float32Array(16000*this.seconds); this.offset = 0;
          this.port.postMessage({pcm:data.buffer,epoch:this.epoch}, [data.buffer]);
        }
      }
    }
    return true;
  }
}
registerProcessor('korean-caption-pcm', KoreanCaptionPCM);
