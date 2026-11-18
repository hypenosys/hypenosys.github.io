"""Offline regression tests for HAIS-001 import planning."""
import json
import unittest
from pathlib import Path
from plan_import import convert

MANIFEST = json.loads(Path(__file__).with_name("backlog.json").read_text(encoding="utf-8"))


class ImportTests(unittest.TestCase):
    def test_initial_import(self):
        data, count = convert(MANIFEST)
        self.assertEqual(count, 24)
        self.assertEqual(data["organizationId"], "hais")
        self.assertEqual(len({t["id"] for t in data["tasks"]}), 24)
        self.assertEqual(data["tasks"][3]["blocked_by"], ["HAIS-001-H002", "HAIS-001-H003"])

    def test_idempotent(self):
        first, _ = convert(MANIFEST)
        second, count = convert(MANIFEST, first)
        self.assertEqual(count, 0)
        self.assertEqual(first, second)

    def test_preserve_existing(self):
        seed = {"organizationId": "hais", "tasks": [{"id": 987, "estado": "Completed"}]}
        result, count = convert(MANIFEST, seed)
        self.assertEqual(count, 24)
        self.assertEqual(result["tasks"][0], seed["tasks"][0])

    def test_cross_workspace_rejected(self):
        with self.assertRaises(ValueError):
            convert(MANIFEST, {"organizationId": "hypenosys", "tasks": []})

    def test_invalid_cycle_rejected(self):
        m = json.loads(json.dumps(MANIFEST))
        m["tasks"][0]["deps"] = ["H024"]
        with self.assertRaises(ValueError):
            convert(m)

    def test_live_mode_rejected(self):
        m = json.loads(json.dumps(MANIFEST))
        m["live_trading_enabled"] = True
        with self.assertRaises(ValueError):
            convert(m)


if __name__ == "__main__":
    unittest.main()
