import hashlib
import io
import mimetypes
import os
import re
import csv
import json
import zipfile
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB

SUPPORTED_EXTENSIONS = {
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.markdown': 'text/markdown',
    '.csv': 'text/csv',
    '.pdf': 'application/pdf',
    '.json': 'application/json',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.html': 'text/html',
    '.htm': 'text/html',
}

class ContextExtractionError(Exception):
    """Raised when context document extraction or normalization fails."""
    pass

class ContextExtractor:
    """
    Extracts and normalizes uploaded context documents into safe, plain text/markdown
    representations suitable for persistent context storage and agent consumption.
    """

    @classmethod
    def sanitize_filename(cls, filename: str) -> str:
        """
        Strips path traversal sequences and dangerous characters from filename.
        """
        if not filename:
            return "unnamed_document.txt"
        
        # Take basename only to prevent directory traversal
        clean_name = os.path.basename(filename.replace('\\', '/'))
        # Remove null bytes and non-printable characters
        clean_name = re.sub(r'[\x00-\x1f\x7f]', '', clean_name)
        # Fallback if empty
        if not clean_name.strip():
            return "unnamed_document.txt"
        return clean_name.strip()

    @classmethod
    def extract_from_bytes(cls, raw_bytes: bytes, filename: str, custom_mime: str = None) -> dict:
        """
        Validates, hashes, and extracts normalized text content from document raw bytes.

        Returns:
            dict containing:
                - normalized_content (str)
                - content_hash (str, sha256)
                - original_filename (str)
                - mime_type (str)
                - file_size (int)
                - metadata (dict)
        """
        if not raw_bytes:
            raise ContextExtractionError("Uploaded file is empty (0 bytes).")

        file_size = len(raw_bytes)
        if file_size > MAX_FILE_SIZE_BYTES:
            raise ContextExtractionError(
                f"File size ({file_size / (1024 * 1024):.2f} MB) exceeds maximum allowed limit of {MAX_FILE_SIZE_BYTES / (1024 * 1024):.0f} MB."
            )

        sanitized_name = cls.sanitize_filename(filename)
        _, ext = os.path.splitext(sanitized_name.lower())

        if ext not in SUPPORTED_EXTENSIONS:
            allowed_list = ", ".join(sorted(SUPPORTED_EXTENSIONS.keys()))
            raise ContextExtractionError(
                f"Unsupported file format '{ext}'. Supported formats: {allowed_list}"
            )

        mime_type = custom_mime or SUPPORTED_EXTENSIONS.get(ext) or mimetypes.guess_type(sanitized_name)[0] or 'application/octet-stream'
        content_hash = hashlib.sha256(raw_bytes).hexdigest()

        normalized_text = ""
        extra_meta = {
            "extension": ext,
            "char_count": 0,
            "line_count": 0,
        }

        try:
            if ext in ['.txt', '.md', '.markdown']:
                normalized_text = cls._extract_text(raw_bytes)
            elif ext == '.csv':
                normalized_text, csv_meta = cls._extract_csv(raw_bytes)
                extra_meta.update(csv_meta)
            elif ext == '.json':
                normalized_text = cls._extract_json(raw_bytes)
            elif ext == '.pdf':
                normalized_text, pdf_meta = cls._extract_pdf(raw_bytes)
                extra_meta.update(pdf_meta)
            elif ext == '.docx':
                normalized_text, docx_meta = cls._extract_docx(raw_bytes)
                extra_meta.update(docx_meta)
            elif ext in ['.html', '.htm']:
                normalized_text = cls._extract_html(raw_bytes)
            else:
                raise ContextExtractionError(f"No extractor implemented for '{ext}'.")
        except ContextExtractionError:
            raise
        except Exception as e:
            raise ContextExtractionError(f"Failed to process and normalize {sanitized_name}: {str(e)}")

        clean_text = normalized_text.strip()
        if not clean_text:
            raise ContextExtractionError(f"File '{sanitized_name}' did not yield any readable text content.")

        extra_meta["char_count"] = len(clean_text)
        extra_meta["line_count"] = len(clean_text.splitlines())

        return {
            "normalized_content": clean_text,
            "content_hash": content_hash,
            "original_filename": sanitized_name,
            "mime_type": mime_type,
            "file_size": file_size,
            "metadata": extra_meta,
        }

    @staticmethod
    def _extract_text(raw_bytes: bytes) -> str:
        for encoding in ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']:
            try:
                return raw_bytes.decode(encoding)
            except UnicodeDecodeError:
                continue
        return raw_bytes.decode('utf-8', errors='replace')

    @staticmethod
    def _extract_csv(raw_bytes: bytes) -> tuple[str, dict]:
        text = ContextExtractor._extract_text(raw_bytes)
        stream = io.StringIO(text)
        reader = csv.reader(stream)
        rows = list(reader)
        
        if not rows:
            return "", {"rows": 0, "columns": 0}

        max_cols = max(len(r) for r in rows) if rows else 0
        
        # Format as Markdown table if small-medium, or plain tabular format
        if len(rows) <= 500 and max_cols <= 20:
            lines = []
            header = rows[0]
            padded_header = [cell.strip() for cell in header] + [""] * (max_cols - len(header))
            lines.append("| " + " | ".join(padded_header) + " |")
            lines.append("| " + " | ".join(["---"] * max_cols) + " |")
            for row in rows[1:]:
                padded_row = [cell.strip().replace('\n', ' ') for cell in row] + [""] * (max_cols - len(row))
                lines.append("| " + " | ".join(padded_row) + " |")
            formatted = "\n".join(lines)
        else:
            # Fallback to normalized plain CSV
            formatted = text

        return formatted, {"rows": len(rows), "columns": max_cols}

    @staticmethod
    def _extract_json(raw_bytes: bytes) -> str:
        text = ContextExtractor._extract_text(raw_bytes)
        parsed = json.loads(text)
        return json.dumps(parsed, indent=2, ensure_ascii=False)

    @staticmethod
    def _extract_pdf(raw_bytes: bytes) -> tuple[str, dict]:
        try:
            import pypdf
        except ImportError:
            raise ContextExtractionError("PDF extraction library (pypdf) is not installed.")

        stream = io.BytesIO(raw_bytes)
        try:
            reader = pypdf.PdfReader(stream)
            num_pages = len(reader.pages)
            pages_text = []
            for idx, page in enumerate(reader.pages):
                page_text = page.extract_text() or ""
                if page_text.strip():
                    pages_text.append(f"--- Page {idx + 1} ---\n{page_text.strip()}")
            
            combined = "\n\n".join(pages_text)
            return combined, {"total_pages": num_pages, "extracted_pages": len(pages_text)}
        except Exception as e:
            raise ContextExtractionError(f"Corrupted or password-protected PDF document: {str(e)}")

    @staticmethod
    def _extract_docx(raw_bytes: bytes) -> tuple[str, dict]:
        stream = io.BytesIO(raw_bytes)
        try:
            with zipfile.ZipFile(stream) as docx_zip:
                xml_content = docx_zip.read('word/document.xml')
                tree = ET.fromstring(xml_content)
                
                # XML namespace for WordprocessingML
                namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
                paragraphs = []
                for p in tree.iterfind('.//w:p', namespaces):
                    texts = [node.text for node in p.iterfind('.//w:t', namespaces) if node.text]
                    if texts:
                        paragraphs.append(''.join(texts))
                
                combined = '\n\n'.join(paragraphs)
                return combined, {"paragraphs": len(paragraphs)}
        except Exception as e:
            raise ContextExtractionError(f"Corrupted or invalid DOCX document: {str(e)}")

    @staticmethod
    def _extract_html(raw_bytes: bytes) -> str:
        html_text = ContextExtractor._extract_text(raw_bytes)
        soup = BeautifulSoup(html_text, 'html.parser')
        
        # Remove scripts and styles
        for tag in soup(['script', 'style', 'head', 'meta', 'noscript']):
            tag.decompose()
            
        text = soup.get_text(separator='\n')
        # Clean multiple blank lines
        cleaned_lines = [line.strip() for line in text.splitlines() if line.strip()]
        return '\n'.join(cleaned_lines)
