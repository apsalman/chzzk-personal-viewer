import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "desktop"))
from caption_translation import LANGUAGES, translate_subtitles


class FakeTranslator:
    def translate(self, texts):
        self.inputs = texts
        return ["translated: " + text for text in texts]


class TranslationTests(unittest.TestCase):
    def test_only_requested_languages(self):
        self.assertEqual(set(LANGUAGES), {"en", "es", "ja"})

    def test_sentence_context_preserves_group_times_and_originals(self):
        translator = FakeTranslator()
        cues = [{"start": 60, "end": 62, "text": "안녕하세요. 지금은 한국어"},
                {"start": 62, "end": 65, "text": "자막을 시험합니다."},
                {"start": 66, "end": 69, "text": "다음 문장입니다."}]
        text, translated = translate_subtitles(translator, "", cues)
        self.assertEqual(translator.inputs, ["안녕하세요. 지금은 한국어 자막을 시험합니다.", "다음 문장입니다."])
        self.assertEqual((translated[0]["start"], translated[0]["end"]), (60, 65))
        self.assertEqual(translated[1]["start"], 66)
        self.assertEqual(translated[0]["original"], translator.inputs[0])
        self.assertNotIn("original", cues[0])
        self.assertTrue(text.startswith("translated:"))

    def test_live_text_and_silence(self):
        translator = FakeTranslator()
        self.assertEqual(translate_subtitles(translator, "문장", []), ("translated: 문장", []))
        self.assertEqual(translate_subtitles(translator, "", []), ("", []))


if __name__ == "__main__":
    unittest.main()
