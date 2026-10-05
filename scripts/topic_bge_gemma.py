"""
BGE + Gemma topic modelling for one essay set.

Exact port of the research "hybrid" method (run_cd.py + methods/hybrid.py):
  1. BAAI/bge-large-en-v1.5 sentence embeddings on minimally cleaned text
  2. sklearn KMeans(n_clusters=k, random_state=42, n_init=10)
  3. c-TF-IDF top words per cluster (preprocessed tokens)
  4. gemma2:9b (via Ollama) writes a 3-6 word label per cluster from the
     top words + 3 representative excerpts (temperature 0, seed 42)

Stateless: reads a JSON job from stdin, writes a JSON result to stdout.
All progress output goes to stderr. Caching is done by the Next.js caller.

stdin:
  {"essay_set": "C", "k": 5, "essays": [{"id": "1674", "text": "..."}, ...]}
stdout:
  {"topics": [{"label": "...", "keywords": ["..."]}, ...],
   "assignments": {"1674": 0, ...},
   "meta": {...}}

Requires: pip install sentence-transformers scikit-learn
Optional: spacy + en_core_web_sm (lemmatised keywords, as in the research setup)
"""

import argparse
import csv
import json
import os
import re
import sys
import time
import urllib.request
from collections import Counter
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

EXCERPT_WORDS = 60  # words shown per representative essay in the label prompt

DOMAIN_STOPWORDS = {
    "would", "could", "think", "also", "one", "like", "make", "get", "use",
    "people", "many", "first", "much", "well", "even", "say", "said", "want",
    "need", "thing", "things", "way", "good", "time", "life", "know",
}

_LABEL_PROMPT = """\
You are labeling a group of student essays that share the same theme.

Key words found in this group: {keywords}

Sample essay excerpts from this group:
{excerpts}

Write a short, descriptive topic label (3-6 words) that captures what these essays are about.
Reply with ONLY the label — no explanation.

Label:"""


def log(msg: str) -> None:
    print(f"[bge-gemma] {msg}", file=sys.stderr, flush=True)


# ---------------------------------------------------------------------------
# Input: prefer the canonical subset CSV (parsed with the csv module, in the
# same row order the research run used) so clusters match the evaluated ones.
# ---------------------------------------------------------------------------

def canonical_essays(essay_set: str, essays: list[dict]) -> list[tuple[str, str]]:
    given = {str(e["id"]): e["text"] for e in essays}
    path = DATA_DIR / f"subset_{essay_set}.csv"
    if not path.exists():
        return list(given.items())

    with open(path, encoding="utf-8") as f:
        rows = [(row["id"], row["essay"]) for row in csv.DictReader(f)]
    ordered = [(i, t) for i, t in rows if i in given]
    missing = set(given) - {i for i, _ in ordered}
    if missing:
        log(f"{len(missing)} essay(s) not in {path.name}; using text supplied by the app for those")
        ordered += [(i, given[i]) for i in given if i in missing]
    log(f"using text + order from {path.name}")
    return ordered


# ---------------------------------------------------------------------------
# Preprocessing (preprocess.py)
# ---------------------------------------------------------------------------

def clean_minimal(texts: list[str]) -> list[str]:
    return [re.sub(r"\s+", " ", t).strip() for t in texts]


def clean_for_classical(texts: list[str]) -> list[list[str]]:
    try:
        import spacy
        nlp = spacy.load("en_core_web_sm", disable=["parser", "ner"])
    except Exception:
        nlp = None

    if nlp is not None:
        result = []
        for doc in nlp.pipe(texts, batch_size=32):
            result.append([
                token.lemma_.lower()
                for token in doc
                if not token.is_stop
                and not token.is_punct
                and not token.is_space
                and len(token.lemma_) > 2
                and token.lemma_.isalpha()
                and token.lemma_.lower() not in DOMAIN_STOPWORDS
            ])
        return result

    from sklearn.feature_extraction.text import ENGLISH_STOP_WORDS
    stop = set(ENGLISH_STOP_WORDS) | DOMAIN_STOPWORDS
    result = []
    for text in texts:
        text = re.sub(r"[^a-z\s]", " ", text.lower())
        result.append([w for w in text.split() if len(w) > 2 and w not in stop])
    return result


def truncate_words(text: str, max_words: int) -> str:
    return " ".join(text.split()[:max_words])


# ---------------------------------------------------------------------------
# c-TF-IDF (evaluate.extract_top_words_ctfidf)
# ---------------------------------------------------------------------------

def extract_top_words_ctfidf(tokenized: list[list[str]], labels: list[int], n_words: int = 10) -> list[list[str]]:
    unique_labels = sorted(set(labels))
    cluster_docs = []
    for lbl in unique_labels:
        tokens = [t for i, l in enumerate(labels) if l == lbl for t in tokenized[i]]
        cluster_docs.append(" ".join(tokens) if tokens else "unknown")

    if len(cluster_docs) < 2:
        all_tokens = [t for doc in tokenized for t in doc]
        return [[w for w, _ in Counter(all_tokens).most_common(n_words)]]

    from sklearn.feature_extraction.text import TfidfVectorizer
    vec = TfidfVectorizer(max_features=10_000)
    tfidf = vec.fit_transform(cluster_docs)
    feature_names = vec.get_feature_names_out()

    topics = []
    for i in range(len(unique_labels)):
        row = tfidf[i].toarray()[0]
        top_idx = row.argsort()[-n_words:][::-1]
        topics.append([str(feature_names[j]) for j in top_idx])
    return topics


# ---------------------------------------------------------------------------
# Gemma labelling (hybrid._label_cluster) — failures are fatal here so a
# keyword-only fallback label never ends up in the app's cache.
# ---------------------------------------------------------------------------

def ollama_chat(base_url: str, model: str, prompt: str) -> str:
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {"temperature": 0.0, "seed": 42},
    }).encode("utf-8")
    req = urllib.request.Request(
        f"{base_url.rstrip('/')}/api/chat",
        data=body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=600) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["message"]["content"].strip()


def label_cluster(cluster_texts: list[str], top_words: list[str], model: str, base_url: str) -> str:
    excerpts = "\n---\n".join(truncate_words(t, EXCERPT_WORDS) for t in cluster_texts[:3])
    prompt = _LABEL_PROMPT.format(keywords=", ".join(top_words[:10]), excerpts=excerpts)
    label = ollama_chat(base_url, model, prompt)
    label = re.sub(r"[\"'*\n]", "", label).strip()
    if not label:
        raise RuntimeError("empty label from LLM")
    return label


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--embed-model", default="BAAI/bge-large-en-v1.5")
    parser.add_argument("--llm-model", default="gemma2:9b")
    parser.add_argument("--ollama-url", default=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434"))
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    job = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    essay_set = str(job["essay_set"])
    k = int(job["k"])

    pairs = canonical_essays(essay_set, job["essays"])
    ids = [i for i, _ in pairs]
    if k < 2 or k > len(ids):
        raise ValueError(f"k={k} is invalid for {len(ids)} essays")

    t0 = time.time()
    minimal = clean_minimal([t for _, t in pairs])
    tokenized = clean_for_classical([t for _, t in pairs])

    log(f"set {essay_set}: encoding {len(ids)} essays with {args.embed_model} ...")
    from sentence_transformers import SentenceTransformer
    embeddings = SentenceTransformer(args.embed_model).encode(minimal, show_progress_bar=False, batch_size=32)

    log(f"KMeans k={k} seed={args.seed} ...")
    from sklearn.cluster import KMeans
    labels = KMeans(n_clusters=k, random_state=args.seed, n_init=10).fit_predict(embeddings).tolist()
    topic_words = extract_top_words_ctfidf(tokenized, labels)

    unique_labels = sorted(set(labels))
    log(f"labelling {len(unique_labels)} clusters with {args.llm_model} ...")
    topics = []
    for i, lbl in enumerate(unique_labels):
        cluster_texts = [minimal[j] for j, l in enumerate(labels) if l == lbl]
        words = topic_words[i] if i < len(topic_words) else []
        label = label_cluster(cluster_texts, words, args.llm_model, args.ollama_url)
        log(f"  cluster {lbl} ({len(cluster_texts)} essays): {label!r}")
        topics.append({"label": label, "keywords": words})

    index_of = {lbl: i for i, lbl in enumerate(unique_labels)}
    result = {
        "topics": topics,
        "assignments": {essay_id: index_of[l] for essay_id, l in zip(ids, labels)},
        "meta": {
            "embed_model": args.embed_model,
            "llm_model": args.llm_model,
            "k": k,
            "seed": args.seed,
            "runtime_s": round(time.time() - t0, 1),
        },
    }
    sys.stdout.write(json.dumps(result))
    sys.stdout.flush()
    log(f"done in {result['meta']['runtime_s']}s")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"FAILED: {type(e).__name__}: {e}")
        sys.exit(1)
