import importlib.util
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("weather_mask", ROOT / "scripts/generate-weather-mask.py")
mask = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mask)


class WeatherMaskTests(unittest.TestCase):
    def test_foliage_and_its_edges_are_transparent(self):
        rows = [bytearray([255] * 15) for _ in range(5)]
        rows[2][6:9] = bytes([20, 40, 10])
        alpha = mask.sky_alpha(5, 5, rows)
        for y in range(1, 4):
            for x in range(1, 4):
                self.assertEqual(alpha[y * 5 + x], 0)

    def test_sky_is_visible_but_frame_and_indoor_area_are_not(self):
        rows = [bytearray([255] * 450) for _ in range(300)]
        alpha = mask.sky_alpha(150, 300, rows)
        self.assertEqual(alpha[50 * 150 + 60], 255)
        self.assertEqual(alpha[50 * 150 + 121], 0)
        self.assertEqual(alpha[280 * 150 + 60], 0)

    def test_published_mask_matches_original_artwork(self):
        width, height, rows = mask.read_rgb_png(ROOT / "assets/desk.png")
        alpha = mask.sky_alpha(width, height, rows)
        self.assertEqual((width, height), (1448, 1086))
        self.assertEqual(alpha[49 * width + 96], 255)
        self.assertEqual(alpha[10 * width + 10], 0)
        self.assertEqual(alpha[500 * width + 60], 0)
        for x, y in ((115, 120), (110, 150), (110, 180), (105, 210), (110, 255)):
            with self.subTest(tower=(x, y)):
                self.assertEqual(alpha[y * width + x], 255)
        for x, y in ((115, 273), (116, 267), (125, 240), (125, 180)):
            with self.subTest(foliage_or_frame=(x, y)):
                self.assertEqual(alpha[y * width + x], 0)
        self.assertEqual(
            mask.alpha_png(width, height, alpha),
            (ROOT / "assets/weather-glass-mask.png").read_bytes(),
        )


if __name__ == "__main__":
    unittest.main()
