import pytest
from unittest.mock import patch, MagicMock
from openai_codex.api import ReasoningEffort
from backend.app.domains.llm.deepseek_client import chat


def test_codex_thinking_effort_mapping():
    """Verify that all thinking parameter variations map properly to valid ReasoningEffort values without AttributeError."""
    test_cases = [
        ("max", ReasoningEffort.xhigh),
        ("xhigh", ReasoningEffort.xhigh),
        ("high", ReasoningEffort.high),
        ("medium", ReasoningEffort.medium),
        ("low", ReasoningEffort.low),
        ("minimal", ReasoningEffort.minimal),
        ("none", ReasoningEffort.none),
        ("disabled", ReasoningEffort.none),
        (True, ReasoningEffort.high),
        (False, ReasoningEffort.none),
        (ReasoningEffort.medium, ReasoningEffort.medium),
    ]

    for thinking_input, expected_effort in test_cases:
        mock_result = MagicMock()
        mock_result.error = None
        mock_result.final_response = "mock response"

        mock_thread = MagicMock()
        mock_thread.run.return_value = mock_result

        mock_session = MagicMock()
        mock_session.thread_start.return_value = mock_thread
        mock_session.__enter__.return_value = mock_session
        mock_session.__exit__.return_value = None

        with patch("backend.app.domains.llm.deepseek_client.Codex", return_value=mock_session), \
             patch("backend.app.domains.llm.deepseek_client.get_provider_api_key", return_value="dummy_key"), \
             patch("backend.app.domains.llm.llm_logger.log_llm_call"):

            resp = chat(
                prompt="test prompt",
                provider="codex",
                thinking=thinking_input,
            )
            assert resp == "mock response"
            mock_thread.run.assert_called_once()
            _, kwargs = mock_thread.run.call_args
            assert kwargs.get("effort") == expected_effort, f"Failed for thinking input: {thinking_input}"
