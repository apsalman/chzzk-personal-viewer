"""Offline Korean subtitle translation using Meta NLLB-200 (CC-BY-NC-4.0)."""
from pathlib import Path
import re

LANGUAGES = {"en": "eng_Latn", "es": "spa_Latn", "ja": "jpn_Jpan"}


class CaptionTranslator:
    def __init__(self, directory, language):
        if language not in LANGUAGES:
            raise ValueError("Unsupported subtitle language")
        import ctranslate2
        import sentencepiece
        self.language = LANGUAGES[language]
        self.tokenizer = sentencepiece.SentencePieceProcessor(
            model_file=str(Path(directory) / "sentencepiece.bpe.model"))
        self.model = ctranslate2.Translator(str(directory), device="cpu", compute_type="int8",
                                          inter_threads=1, intra_threads=2)

    def translate(self, texts):
        output = [""] * len(texts)
        indexes = [i for i, text in enumerate(texts) if text.strip()]
        if not indexes:
            return output
        sources = [["kor_Hang"] + self.tokenizer.encode(texts[i], out_type=str)[:250] + ["</s>"]
                   for i in indexes]
        results = self.model.translate_batch(
            sources, target_prefix=[[self.language] for _ in sources], beam_size=2,
            max_decoding_length=160, repetition_penalty=1.1, no_repeat_ngram_size=3)
        for index, result in zip(indexes, results):
            tokens = [token for token in result.hypotheses[0]
                      if token not in (self.language, "</s>", "<s>", "<pad>")]
            output[index] = self.tokenizer.decode(tokens).strip()
            if not output[index]:
                raise RuntimeError("Translation returned empty text")
        return output


def translate_subtitles(translator, text, cues):
    """Translate complete cue phrases so the decoder sees sentence context."""
    if not cues and not text.strip():
        return "", []
    if cues:
        groups = []
        pending = None
        for cue in cues:
            if pending is None:
                pending = dict(cue)
            else:
                pending["text"] += " " + cue["text"]
                pending["end"] = cue["end"]
            if re.search(r"[.!?。！？][\"'’”)]*$", pending["text"].strip()) or len(pending["text"]) >= 160:
                groups.append(pending)
                pending = None
        if pending:
            groups.append(pending)
        translations = translator.translate([cue["text"] for cue in groups])
        translated = [{**cue, "original": cue["text"], "text": target}
                      for cue, target in zip(groups, translations)]
        return " ".join(translations), translated
    return translator.translate([text])[0], []
