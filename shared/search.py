"""Ordered CJK unigrams and ASCII words for both indexing and queries."""
import re
import unicodedata
from typing import Optional

FTS_VERSION = "ordered-phrase-v2"
_TOKENS = re.compile(r"[a-zA-Z0-9]+|[^\W_]", re.UNICODE)


def normalize_text(text: Optional[str]) -> str:
    return unicodedata.normalize("NFKC", text or "").replace("臺", "台").strip()


def space_segment(text: Optional[str], generate_ngrams: bool = False) -> str:
    # Historical argument retained for callers; all indexes now use one format.
    normalized = normalize_text(text).replace('"', "").replace("'", "")
    return " ".join(_TOKENS.findall(normalized))


def parse_search_query(query: Optional[str]) -> Optional[str]:
    # DoS 防護：單查詢最多 100 字、10 個短語（超出的截斷）
    text = normalize_text(query)
    if len(text) > 100:
        text = text[:100]
    phrases = []
    for term in text.split():
        tokens = space_segment(term)
        if tokens:
            phrase = '"' + tokens.replace('"', '""') + '"'
            if phrase not in phrases:
                phrases.append(phrase)
        if len(phrases) >= 10:
            break
    return " AND ".join(phrases) or None
