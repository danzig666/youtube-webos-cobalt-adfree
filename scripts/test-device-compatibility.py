#!/usr/bin/env python3
import importlib.util
from pathlib import Path
import unittest
spec = importlib.util.spec_from_file_location("compatibility", Path(__file__).with_name("generate-device-compatibility.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class CompatibilityTests(unittest.TestCase):
    def report(self, body):
        return module.generate([{"number": 12, "labels": [{"name": "device-test"}], "body": body}], "owner/repo")

    def test_unlabeled_and_empty_do_not_claim_hardware(self):
        self.assertIn("No labeled device reports", module.generate([], "owner/repo"))
        self.assertIn("No labeled device reports", module.generate([{"labels": [], "number": 1}], "owner/repo"))

    def test_form_and_unknown_status(self):
        report = self.report("### TV model\n\nOLED|test\n\n### VOD\n\nPass\n\n### Live\n\nNot tested\n\n### AV1\n\nmaybe\n")
        self.assertIn("OLED\\|test", report)
        self.assertIn("[\u002312](https://github.com/owner/repo/issues/12)", report)
        self.assertIn("Not tested", report)
        self.assertNotIn("maybe", report)
        self.assertIn("Not reported", report)

    def test_sensitive_fields_and_unrelated_history_excluded(self):
        report = self.report("### TV model\n\nLG https://video.example/watch?token=SECRET\n\n### Firmware\n\nCookie=SECRET\n\n### History\n\nPRIVATE VIDEO\n")
        self.assertNotIn("SECRET", report)
        self.assertNotIn("PRIVATE VIDEO", report)
        self.assertNotIn("video.example", report)

    def test_duplicate_section_and_bad_repository_refused(self):
        with self.assertRaises(ValueError):
            self.report("### Live\nPass\n### Live\nFail\n")
        with self.assertRaises(ValueError):
            module.generate([], "https://evil.example")


if __name__ == "__main__":
    unittest.main()
