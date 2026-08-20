import pytest
from unittest.mock import patch, MagicMock
from openai_codex.api import ReasoningEffort
from backend.app.domains.ocr.annotator.pdf_converter import PDFOCRConverter


def test_pdf_converter_codex_init():
    """Verify PDFOCRConverter initializes correctly with codex provider."""
    converter = PDFOCRConverter(
        model="gpt-5.6-luna",
        provider="codex",
        thinking="high",
        enable_figure_detection=False,
    )
    assert converter.provider == "codex"
    assert converter.thinking == "high"
    assert converter.client is None  # Should not create standard OpenAI client


def test_pdf_converter_codex_batch_execution():
    """Verify that process_single_batch runs with Codex session and maps thinking effort."""
    mock_result = MagicMock()
    mock_result.error = None
    mock_result.final_response = "<pages><page>\n# Title\n<page_metadata>{\"p\": 1}</page_metadata>\n</page></pages>"

    mock_thread = MagicMock()
    mock_thread.run.return_value = mock_result

    mock_session = MagicMock()
    mock_session.thread_start.return_value = mock_thread
    mock_session.__enter__.return_value = mock_session
    mock_session.__exit__.return_value = None

    converter = PDFOCRConverter(
        model="gpt-5.6-luna",
        provider="codex",
        thinking="medium",
        enable_figure_detection=False,
    )

    with patch("backend.app.domains.ocr.annotator.pdf_converter.Codex", return_value=mock_session), \
         patch("backend.app.domains.ocr.annotator.pdf_converter.get_provider_api_key", return_value="dummy_key"), \
         patch("backend.app.domains.ocr.annotator.pdf_converter.Path.exists", return_value=True), \
         patch("backend.app.domains.ocr.annotator.pdf_converter.fitz.open") as mock_fitz_open:

        mock_page = MagicMock()
        mock_pix = MagicMock()
        mock_pix.tobytes.return_value = b"fake_jpeg_bytes"
        mock_page.get_pixmap.return_value = mock_pix

        mock_doc = MagicMock()
        mock_doc.__len__.return_value = 1
        mock_doc.__getitem__.return_value = mock_page
        mock_fitz_open.return_value = mock_doc

        result = converter.convert_pdf("tests/dummy.pdf", batch_size=1)

        assert "<pages>" in result
        mock_thread.run.assert_called_once()
        _, kwargs = mock_thread.run.call_args
        assert kwargs.get("effort") == ReasoningEffort.medium
