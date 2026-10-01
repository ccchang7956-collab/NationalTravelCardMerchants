import re
import unicodedata
from typing import Optional

def space_segment(text: str, generate_ngrams: bool = True) -> str:
    if not text:
        return ""
    tokens = []
    current_word = []
    current_type = None

    for char in text:
        if char.isalnum():
            char_type = 'ascii' if char.isascii() else 'cjk'
            if current_type is not None and char_type != current_type:
                if current_word:
                    w = "".join(current_word)
                    tokens.append(w)
                    if generate_ngrams and current_type == 'cjk' and len(w) > 1:
                        for n in (1, 2, 3):
                            if len(w) >= n:
                                for i in range(len(w) - n + 1):
                                    gram = w[i:i+n]
                                    if gram not in tokens:
                                        tokens.append(gram)
                    current_word = []
            current_type = char_type
            current_word.append(char)
        else:
            if current_word:
                w = "".join(current_word)
                tokens.append(w)
                if generate_ngrams and current_type == 'cjk' and len(w) > 1:
                    for n in (1, 2, 3):
                        if len(w) >= n:
                            for i in range(len(w) - n + 1):
                                gram = w[i:i+n]
                                if gram not in tokens:
                                    tokens.append(gram)
                current_word = []
            current_type = None

    if current_word:
        w = "".join(current_word)
        tokens.append(w)
        if generate_ngrams and current_type == 'cjk' and len(w) > 1:
            for n in (1, 2, 3):
                if len(w) >= n:
                    for i in range(len(w) - n + 1):
                        gram = w[i:i+n]
                        if gram not in tokens:
                            tokens.append(gram)

    return " ".join(tokens)

def _quote_fts_token(tok: str) -> list[str]:
    """把單一 token 轉成 FTS5 phrase 清單。

    生產索引（scheduler/update_data.space_segment）把 CJK 逐字存成獨立 token，
    因此 CJK 必須逐字拆成 AND（`"牛" AND "肉" AND "麵"`）；ASCII 維持整詞 phrase。
    此寫法對 ngram 索引同樣成立（含 unigram），兩側相容。
    """
    if tok.isascii():
        return [f'"{tok}"']
    return [f'"{ch}"' for ch in tok]


def parse_search_query(q: Optional[str]) -> Optional[str]:
    if not q:
        return None
    
    # Normalize unicode (NFKC) and replace '臺' with '台'
    q_norm = unicodedata.normalize("NFKC", q.strip())
    q_norm = q_norm.replace("臺", "台")
    # Strip quotes to prevent phrase breaking or FTS syntax errors
    q_norm = q_norm.replace('"', '').replace("'", '')
    
    # Keep alphanumeric, whitespace, Chinese characters, hyphens, ampersands, pluses, equals
    cleaned_q = re.sub(r'[^\w\s\u4e00-\u9fff\-&+=]', ' ', q_norm)
    
    parts = []
    seen = set()
    for term in cleaned_q.split():
        term = term.strip()
        if not term:
            continue
        segmented = space_segment(term, generate_ngrams=False).strip()
        if not segmented:
            continue
        segmented = segmented.replace('"', '')
        for tok in segmented.split():
            if not tok or tok in seen:
                continue
            seen.add(tok)
            parts.extend(_quote_fts_token(tok))

    return " AND ".join(parts) if parts else None
