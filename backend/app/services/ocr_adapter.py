"""OCR adapter: server-side (Tesseract) and client-side (Tesseract.js) implementations."""
from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class OCRResult:
    lines: list[str]
    confidence: float
    raw_text: str = ""
    line_confidences: list[float] = field(default_factory=list)


class BaseOCRAdapter:
    """Interface contract for all OCR adapters."""

    def parse_bytes(self, data: bytes, content_type: str) -> OCRResult:
        raise NotImplementedError

    def parse(self, data: dict) -> OCRResult:
        raise NotImplementedError


class ServerOCRAdapter(BaseOCRAdapter):
    """Server-side OCR using pytesseract (Tesseract binary)."""

    def parse_bytes(self, data: bytes, content_type: str) -> OCRResult:
        try:
            import pytesseract
            from PIL import Image
        except ImportError as e:
            raise RuntimeError("pytesseract and Pillow are required for server OCR") from e

        if content_type == "application/pdf":
            return self._parse_pdf(data)

        try:
            image = Image.open(io.BytesIO(data))
            # Get detailed OCR data with confidence
            ocr_data = pytesseract.image_to_data(
                image,
                output_type=pytesseract.Output.DICT,
                config="--psm 6",  # Assume single block of text
            )

            lines: list[str] = []
            line_confidences: list[float] = []
            current_line_num = -1
            current_line_words: list[str] = []
            current_line_confs: list[float] = []

            for i, word in enumerate(ocr_data["text"]):
                conf = int(ocr_data["conf"][i])
                line_num = ocr_data["line_num"][i]
                if conf < 0:
                    continue

                if line_num != current_line_num:
                    if current_line_words:
                        lines.append(" ".join(current_line_words))
                        line_confidences.append(
                            sum(current_line_confs) / len(current_line_confs) if current_line_confs else 0.0
                        )
                    current_line_num = line_num
                    current_line_words = []
                    current_line_confs = []

                if word.strip():
                    current_line_words.append(word.strip())
                    current_line_confs.append(conf / 100.0)

            if current_line_words:
                lines.append(" ".join(current_line_words))
                line_confidences.append(
                    sum(current_line_confs) / len(current_line_confs) if current_line_confs else 0.0
                )

            overall_conf = sum(line_confidences) / len(line_confidences) if line_confidences else 0.0
            raw_text = "\n".join(lines)

            logger.info(f"Server OCR: {len(lines)} lines, confidence={overall_conf:.2f}")
            return OCRResult(
                lines=[line for line in lines if line.strip()],
                confidence=round(overall_conf, 3),
                raw_text=raw_text,
                line_confidences=line_confidences,
            )

        except Exception as e:
            logger.error(f"Server OCR failed: {e}")
            raise RuntimeError(f"OCR processing failed: {e}") from e

    def _parse_pdf(self, data: bytes) -> OCRResult:
        """Extract text from PDF using pdfplumber, fall back to Tesseract if needed."""
        try:
            import pdfplumber

            lines: list[str] = []
            with pdfplumber.open(io.BytesIO(data)) as pdf:
                for page in pdf.pages:
                    text = page.extract_text() or ""
                    page_lines = [line.strip() for line in text.splitlines() if line.strip()]
                    lines.extend(page_lines)

            if lines:
                return OCRResult(lines=lines, confidence=0.9, raw_text="\n".join(lines))

        except Exception as e:
            logger.warning(f"pdfplumber failed, falling back to image OCR: {e}")

        # Fallback: render PDF page as image and OCR it
        try:
            import fitz  # PyMuPDF

            doc = fitz.open(stream=data, filetype="pdf")
            all_lines: list[str] = []
            for page in doc:
                pix = page.get_pixmap(dpi=200)
                img_bytes = pix.tobytes("png")
                result = self.parse_bytes(img_bytes, "image/png")
                all_lines.extend(result.lines)
            return OCRResult(lines=all_lines, confidence=0.75, raw_text="\n".join(all_lines))
        except Exception:
            return OCRResult(lines=lines, confidence=0.5, raw_text="\n".join(lines))


class ClientOCRAdapter(BaseOCRAdapter):
    """Client-side OCR: accepts pre-parsed output from Tesseract.js."""

    def parse(self, data: dict) -> OCRResult:
        """
        Expected data format from Tesseract.js:
        {
          "text": "full text string",
          "confidence": 85.3,
          "lines": [{"text": "line", "confidence": 90.1}, ...]
        }
        """
        raw_text = data.get("text", "")
        overall_conf = float(data.get("confidence", 0)) / 100.0

        if "lines" in data:
            lines = [line_obj["text"].strip() for line_obj in data["lines"] if line_obj.get("text", "").strip()]
            line_confidences = [float(line_obj.get("confidence", 0)) / 100.0 for line_obj in data["lines"]]
        else:
            lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
            line_confidences = [overall_conf] * len(lines)

        logger.info(f"Client OCR: {len(lines)} lines, confidence={overall_conf:.2f}")
        return OCRResult(
            lines=lines,
            confidence=round(overall_conf, 3),
            raw_text=raw_text,
            line_confidences=line_confidences,
        )

    def parse_bytes(self, data: bytes, content_type: str) -> OCRResult:
        raise NotImplementedError("ClientOCRAdapter only accepts pre-parsed dict, not raw bytes")
