(function(root) {
  class CaptionTimeline {
    constructor() { this.clear(); }
    clear() { this.cues = []; this.start = Infinity; this.through = 0; }
    add(start,end,cues) {
      this.start = Math.min(this.start,start); this.through = Math.max(this.through,end);
      const valid = (cues || []).filter(cue => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start && typeof cue.text === 'string' && cue.start >= start-.1 && cue.end <= end+1);
      const unique = new Map([...this.cues,...valid].map(cue => [JSON.stringify(cue),cue]));
      this.cues = [...unique.values()].sort((a,b)=>a.start-b.start).slice(-1000);
    }
    at(time) { return this.cues.filter(cue => cue.start <= time && time < cue.end).at(-1)?.text || ''; }
    prune(time) { this.cues = this.cues.filter(cue => cue.end >= time-30); }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { CaptionTimeline };
  else root.CaptionTimeline = CaptionTimeline;
})(globalThis);
