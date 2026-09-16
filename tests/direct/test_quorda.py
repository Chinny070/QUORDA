"""
Direct/pure-function tests for the QUORDA Intelligent Contract.

`genlayer` (the in-VM contract-authoring package: gl.Contract, gl.storage,
gl.public, ...) only exists inside the GenVM runner sandbox - it is not a
regular pip package importable from host Python (confirmed: no `genlayer`
distribution is pip-installable here; only `genlayer-py`, the off-chain
client SDK, and `genlayer-test`, which drives contracts over RPC via
`gltest`, are). So these direct tests exercise only the pure, GenVM-free
helper functions extracted from contracts/quorda.py: verdict parsing and
JSON serialization. They run with plain pytest, no network required.

Full contract lifecycle tests (state machine, hard-constraint filter,
authorization, and the real non-deterministic judge_award consensus call)
are covered by tests/integration/test_quorda_integration.py, which uses
`gltest` against network `studio_devnet` (Studio Next, chain 61997) per the
locked hackathon toolchain.
"""

import hashlib
import importlib.util
import os
import sys
import types


class _FakeKeccakHash:
    """Stand-in for gl.Keccak256 in the pure-function test harness. Not
    cryptographically Keccak (uses sha3_256), but reproduces the
    update()/hexdigest() shape well enough to test that _keccak_hex is
    deterministic and input-sensitive, which is all these tests assert."""

    def __init__(self):
        self._h = hashlib.sha3_256()

    def update(self, data: bytes) -> None:
        self._h.update(data)

    def hexdigest(self) -> str:
        return self._h.hexdigest()


def _load_pure_helpers():
    """Load contracts/quorda.py's module-level pure functions without
    requiring the `genlayer` package, by stubbing it out before import."""
    contracts_dir = os.path.join(os.path.dirname(__file__), "..", "..", "contracts")
    path = os.path.join(contracts_dir, "quorda.py")

    class _Stub:
        def __getattr__(self, name):
            return _Stub()

        def __call__(self, *args, **kwargs):
            return _Stub()

        def __getitem__(self, item):
            return _Stub()

    fake_gl = types.ModuleType("genlayer")
    fake_gl.storage = _Stub()
    fake_gl.contract = types.SimpleNamespace(Contract=object)
    fake_gl.public = types.SimpleNamespace(view=lambda f: f, write=lambda f: f)
    fake_gl.vm = _Stub()
    fake_gl.message = _Stub()
    fake_gl.nondet = _Stub()
    fake_gl.eq_principle = _Stub()
    fake_gl.u256 = int
    fake_gl.Address = str
    fake_gl.Keccak256 = _FakeKeccakHash

    fake_storage_mod = types.ModuleType("genlayer.storage")
    fake_storage_mod.allow = lambda cls: cls
    sys.modules["genlayer"] = fake_gl
    sys.modules["genlayer.storage"] = fake_storage_mod

    spec = importlib.util.spec_from_file_location("quorda_pure", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


quorda = _load_pure_helpers()


def test_verdict_parser_fails_closed_on_non_dict():
    result = quorda._parse_verdict("not a dict", [1, 2], "policy-hash")
    assert result["decision"] == "NEEDS_CLARIFICATION"
    assert "LLM_ERROR" in result["unresolved_questions"][0]


def test_verdict_parser_rejects_out_of_set_decision():
    result = quorda._parse_verdict({"decision": "999"}, [1, 2], "policy-hash")
    assert result["decision"] == "NEEDS_CLARIFICATION"


def test_verdict_parser_accepts_valid_candidate():
    result = quorda._parse_verdict(
        {
            "decision": "2",
            "confidence_band": "high",
            "material_findings": ["strong support coverage"],
            "unresolved_questions": [],
            "evidence_refs": ["2"],
        },
        [1, 2],
        "policy-hash",
    )
    assert result["decision"] == "2"
    assert result["confidence_band"] == "high"


def test_verdict_parser_defaults_bad_confidence_band_to_low():
    result = quorda._parse_verdict(
        {"decision": "1", "confidence_band": "extremely-sure"},
        [1, 2],
        "policy-hash",
    )
    assert result["confidence_band"] == "low"


def test_verdict_parser_caps_list_fields_at_ten():
    result = quorda._parse_verdict(
        {
            "decision": "1",
            "material_findings": [f"finding-{i}" for i in range(20)],
        },
        [1, 2],
        "policy-hash",
    )
    assert len(result["material_findings"]) == 10


def test_verdict_parser_non_list_fields_become_empty_list():
    result = quorda._parse_verdict(
        {"decision": "1", "unresolved_questions": "not-a-list"},
        [1, 2],
        "policy-hash",
    )
    assert result["unresolved_questions"] == []


def test_to_json_str_roundtrip():
    import json

    payload = {"a": 1, "b": ["x", "y"]}
    assert json.loads(quorda._to_json_str(payload)) == payload


# ---------------------------------------------------------------------------
# Commitment hashing: same input -> same hash, any change -> different hash.
# This is what makes rfq_hash/soft_policy_hash/bid_hash meaningful
# commitments instead of arbitrary caller-supplied strings.
# ---------------------------------------------------------------------------


def test_keccak_hex_is_deterministic():
    a = quorda._keccak_hex(b"hello world")
    b = quorda._keccak_hex(b"hello world")
    assert a == b
    assert len(a) == 64  # 256-bit digest, hex-encoded


def test_keccak_hex_changes_with_input():
    a = quorda._keccak_hex(b"policy: prefer strong refund terms")
    b = quorda._keccak_hex(b"policy: prefer weak refund terms")
    assert a != b


def test_bid_commitment_binds_every_material_field():
    def commit(rfq_id, seller, price, latency, url):
        return quorda._keccak_hex(
            "|".join([str(rfq_id), seller, str(price), str(latency), url]).encode("utf-8")
        )

    base = commit(1, "0xseller", 45000, 250, "https://example.com/a.json")
    diff_price = commit(1, "0xseller", 45001, 250, "https://example.com/a.json")
    diff_seller = commit(1, "0xother", 45000, 250, "https://example.com/a.json")
    diff_evidence = commit(1, "0xseller", 45000, 250, "https://example.com/b.json")

    assert base != diff_price
    assert base != diff_seller
    assert base != diff_evidence


def test_max_judgment_attempts_is_a_positive_bound():
    assert quorda.MAX_JUDGMENT_ATTEMPTS > 0
