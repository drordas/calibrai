import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app.core.config import settings
from backend.app.core.dataset_engine import DatasetEngine
from backend.app.core.prompt_engine import PromptEngine
from backend.app.metrics.engine import (
    apply_computed_specs_to_parsed,
    evaluate_computed_specs,
    evaluate_safe_expression,
    extract_aspect_items,
)
from backend.app.schemas.prompt import ComputedSpec, PromptValidationRequest


class TestDatasetAndGroundTruth(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.upload_dir = Path(self.tmp.name) / "uploads"
        self.sample_dir = Path(self.tmp.name) / "samples"
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.sample_dir.mkdir(parents=True, exist_ok=True)
        with patch.object(settings, "upload_dir", self.upload_dir), patch.object(
            settings, "sample_dir", self.sample_dir
        ):
            self.engine = DatasetEngine()

    def tearDown(self):
        self.tmp.cleanup()

    def test_multiple_ground_truths_same_benchmark_id_not_overwritten(self):
        corpus_path = self.upload_dir / "corpus.json"
        corpus_path.write_text(
            json.dumps(
                {
                    "id": "bench_uk_usa",
                    "reviews": [
                        {"review_id": "r1", "review_comment": "Great product", "review_rating": 5},
                        {"review_id": "r2", "review_comment": "Bad quality", "review_rating": 1},
                    ],
                }
            ),
            encoding="utf-8",
        )
        gt1_path = self.upload_dir / "gt_sandra.json"
        gt1_path.write_text(
            json.dumps(
                {
                    "id": "bench_uk_usa",
                    "reviews": [
                        {
                            "review_id": "r1",
                            "brand_awareness": {"sentiment": "Positive", "markers_positive": ["Great"]},
                        },
                        {
                            "review_id": "r2",
                            "brand_awareness": {"sentiment": "Negative", "markers_negative": ["Bad"]},
                        },
                    ],
                }
            ),
            encoding="utf-8",
        )
        gt2_path = self.upload_dir / "gt_adrian.json"
        gt2_path.write_text(
            json.dumps(
                {
                    "id": "bench_uk_usa",
                    "reviews": [
                        {
                            "review_id": "r1",
                            "brand_awareness": {"sentiment": "Positive", "markers_positive": ["Great"]},
                        },
                        {
                            "review_id": "r2",
                            "brand_awareness": {"sentiment": "Negative", "markers_negative": ["Bad"]},
                        },
                    ],
                }
            ),
            encoding="utf-8",
        )

        corpus = self.engine.register_dataset(corpus_path, name="Corpus")
        gt1 = self.engine.register_dataset(gt1_path, name="GT Sandra", force_new=True)
        gt2 = self.engine.register_dataset(gt2_path, name="GT Adrian", force_new=True)

        self.assertNotEqual(gt1.id, gt2.id)
        self.assertNotEqual(gt1.id, corpus.id)
        compatibles = self.engine.get_compatible_ground_truths(corpus.id)
        compat_ids = {c["dataset_id"] for c in compatibles}
        self.assertIn(gt1.id, compat_ids)
        self.assertIn(gt2.id, compat_ids)

    def test_csv_ground_truth_compatibility(self):
        corpus_path = self.upload_dir / "corpus.csv"
        corpus_path.write_text("review_id,text,rating\nr1,hello,5\nr2,world,1\n", encoding="utf-8")
        gt_csv = self.upload_dir / "gt.csv"
        gt_csv.write_text(
            "review_id,ground_truth.brand_awareness.sentiment\nr1,Positive\nr2,Negative\n",
            encoding="utf-8",
        )
        corpus = self.engine.register_dataset(corpus_path, name="Corpus CSV")
        gt = self.engine.register_dataset(gt_csv, name="GT CSV", force_new=True)
        compat = self.engine.check_ground_truth_compatibility(corpus.id, gt.id)
        self.assertTrue(compat["compatible"], f"Expected compatible CSV GT, got: {compat}")

    def test_dataset_file_hash_detection(self):
        p = self.upload_dir / "sample_hash.csv"
        p.write_text("id,text\n1,abc\n", encoding="utf-8")
        ds = self.engine.register_dataset(p, name="Hash Test")
        self.assertIsNotNone(ds.file_hash)
        matches = self.engine.find_datasets_by_hash(ds.file_hash)
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0]["id"], ds.id)


class TestPromptEngineAndEvalSpec(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.upload_dir = Path(self.tmp.name) / "uploads"
        self.sample_dir = Path(self.tmp.name) / "samples"
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        self.sample_dir.mkdir(parents=True, exist_ok=True)
        with patch.object(settings, "upload_dir", self.upload_dir), patch.object(
            settings, "sample_dir", self.sample_dir
        ):
            self.ds_engine = DatasetEngine()
        corpus_path = self.upload_dir / "corpus.csv"
        corpus_path.write_text(
            "review_id,review_comment,review_rating\nr1,Great,5\nr2,Terrible,1\n",
            encoding="utf-8",
        )
        self.corpus = self.ds_engine.register_dataset(corpus_path, name="Corpus")
        self.prompt_engine = PromptEngine()

    def tearDown(self):
        self.tmp.cleanup()

    def test_top_level_ground_truth_col_and_computed_specs_roundtrip(self):
        tpl = """Analyze {review_comment}.
```json
{
  "brand_awareness": {
    "sentiment": "",
    "markers_positive": [],
    "markers_negative": []
  }
}
```
```evaluation-spec
task_type: aspect_polarity
ground_truth_col: review_rating
computed_specs:
  - name: sentiment
    function: conditional_rule
    arguments: []
    apply_to_nested: true
    target_blocks: ["brand_awareness"]
    inject_into_output: true
    default_value: "blank"
    rules:
      - condition: "len(markers_positive) > 0"
        value: "Positive"
metrics:
  - inter_rater_agreement
```
"""
        with patch("backend.app.core.prompt_engine.dataset_engine", self.ds_engine):
            val = self.prompt_engine.validate_prompt(
                PromptValidationRequest(
                    dataset_id=self.corpus.id,
                    template=tpl,
                    system_prompt="",
                    allowed_columns=["review_id", "review_comment", "review_rating"],
                )
            )
        self.assertTrue(val.has_ground_truth)
        self.assertEqual(val.ground_truth_col, "review_rating")
        self.assertEqual(len(val.computed_specs), 1)
        cs = val.computed_specs[0]
        self.assertTrue(cs.apply_to_nested)
        self.assertEqual(cs.target_blocks, ["brand_awareness"])
        self.assertTrue(cs.inject_into_output)
        self.assertEqual(cs.default_value, "blank")
        self.assertEqual(len(cs.rules or []), 1)

    def test_validate_prompt_nested_json_coherence(self):
        tpl = """Analyze {review_comment}.
========================================================
OUTPUT FORMAT
========================================================
Produce markers_positive and markers_negative for brand_awareness.
```json
{
  "brand_awareness": {
    "sentiment": "",
    "markers_positive": [],
    "markers_negative": []
  }
}
```
```evaluation-spec
task_type: aspect_polarity
```
"""
        with patch("backend.app.core.prompt_engine.dataset_engine", self.ds_engine):
            val = self.prompt_engine.validate_prompt(
                PromptValidationRequest(
                    dataset_id=self.corpus.id,
                    template=tpl,
                    system_prompt="",
                    allowed_columns=["review_id", "review_comment"],
                )
            )
        self.assertIsNotNone(val)


class TestComputedSpecsEvaluator(unittest.TestCase):
    def test_arithmetic_and_nested_len(self):
        specs = [
            ComputedSpec(
                name="pos_count",
                function="suma",
                arguments=["brand_awareness.markers_positive", "brand_loyalty.markers_positive"],
                expression="(len(brand_awareness.markers_positive) + len(brand_loyalty.markers_positive))",
            ),
            ComputedSpec(
                name="nss_custom",
                function="nss",
                arguments=["pos_count", "brand_awareness.markers_negative"],
                expression="((pos_count - len(brand_awareness.markers_negative)) / (pos_count + len(brand_awareness.markers_negative)))",
            ),
        ]
        parsed = {
            "brand_awareness": {"markers_positive": ["good", "fast"], "markers_negative": ["pricey"]},
            "brand_loyalty": {"markers_positive": ["recommend"], "markers_negative": []},
        }
        res = evaluate_computed_specs({}, parsed, specs)
        self.assertEqual(res["pos_count"], 3)
        self.assertAlmostEqual(res["nss_custom"], (3 - 1) / (3 + 1))

    def test_division_by_zero_in_expression(self):
        val = evaluate_safe_expression("(a - b) / (a + b)", {"a": 0, "b": 0})
        self.assertEqual(val, 0.0)

    def test_string_and_array_functions(self):
        specs = [
            ComputedSpec(name="parts", function="split", arguments=["tags"], expression='split(tags, ",")'),
            ComputedSpec(name="joined", function="join", arguments=["parts"], expression='join(parts, " | ")'),
            ComputedSpec(name="has_fast", function="contains", arguments=["parts"], expression='contains(parts, "fast")'),
            ComputedSpec(name="empty_check", function="is_empty", arguments=["empty_arr"], expression="is_empty(empty_arr)"),
            ComputedSpec(name="upper_s", function="upper", arguments=["sentiment"], expression="upper(sentiment)"),
            ComputedSpec(name="common", function="intersect", arguments=["a1", "a2"], expression="intersect(a1, a2)"),
            ComputedSpec(name="all_items", function="union", arguments=["a1", "a2"], expression="union(a1, a2)"),
        ]
        parsed = {
            "tags": "fast, reliable, clean",
            "empty_arr": [],
            "sentiment": "Positive",
            "a1": ["x", "y"],
            "a2": ["y", "z"],
        }
        res = evaluate_computed_specs({}, parsed, specs)
        self.assertEqual(res["parts"], ["fast", "reliable", "clean"])
        self.assertEqual(res["joined"], "fast | reliable | clean")
        self.assertTrue(res["has_fast"])
        self.assertTrue(res["empty_check"])
        self.assertEqual(res["upper_s"], "POSITIVE")
        self.assertEqual(res["common"], ["y"])
        self.assertEqual(res["all_items"], ["x", "y", "z"])

    def test_conditional_rule_target_blocks_subset(self):
        specs = [
            ComputedSpec(
                name="sentiment",
                function="conditional_rule",
                apply_to_nested=True,
                target_blocks=["brand_awareness"],
                inject_into_output=True,
                default_value="blank",
                rules=[{"condition": "len(markers_positive) > 0", "value": "Positive"}],
            )
        ]
        parsed = {
            "brand_awareness": {"markers_positive": ["great"], "sentiment": ""},
            "brand_loyalty": {"markers_positive": ["loyal"], "sentiment": "Original"},
        }
        out = apply_computed_specs_to_parsed({}, parsed, specs)
        self.assertEqual(out["brand_awareness"]["sentiment"], "Positive")
        self.assertEqual(out["brand_loyalty"]["sentiment"], "Original")

    def test_extract_aspect_items_custom_quote_fields(self):
        parsed = {
            "bloque_custom": {
                "razones_favor": ["muy rápido", "buen precio"],
                "etiqueta": "Positivo",
            }
        }
        items = extract_aspect_items(parsed, quote_fields=["bloque_custom.razones_favor"])
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["citas"], ["muy rápido", "buen precio"])


if __name__ == "__main__":
    unittest.main()
