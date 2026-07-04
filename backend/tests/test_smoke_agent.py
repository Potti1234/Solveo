from __future__ import annotations

import importlib
import os


def _fresh_app(tmp_path, monkeypatch):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "test.db"))
    monkeypatch.setenv("VULTR_DEMO_MODE", "true")
    import app.db as db
    import app.agent.runner as runner

    importlib.reload(db)
    importlib.reload(runner)
    db.init_db(reset=True).close()
    return runner


def test_hero_ac_case_approves_policy_bound_refund(tmp_path, monkeypatch):
    runner = _fresh_app(tmp_path, monkeypatch)

    result = runner.run_case_for_message("msg_ac_302")
    decision = result["decision"]

    assert decision["verdict"] == "legitimate"
    assert decision["compensation"]["policy_clause"] == "§4.2"
    assert decision["compensation"]["amount"] == 216.0
    assert result["actions"]["citations"]


def test_hero_mold_photo_case_declines_and_escalates(tmp_path, monkeypatch):
    runner = _fresh_app(tmp_path, monkeypatch)

    result = runner.run_case_for_message("msg_mold_214")
    decision = result["decision"]

    assert decision["verdict"] == "unsubstantiated"
    assert decision["compensation"] is None
    assert decision["escalate"] is True
    assert any("water stain" in citation["quote"].lower() for citation in result["actions"]["citations"])
