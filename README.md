# EssayGrader2

An essay grading assistant that runs locally. You grade the essays; a local model (via [Ollama](https://ollama.com)) suggests a score, justification and supporting quotes for each rubric criterion. Quotes are checked against the essay text and flagged if they can't be found.

There are two modes:

- **Baseline:** grade the essays one at a time.
- **Dashboard:** start from an overview of the whole set, with essays grouped by topic, a panel of similar essays, and benchmark essays to compare against.

Sessions, grades and logs are stored in a local SQLite file (`data/grading.db`). No essay text leaves your machine.

## Requirements

- Node.js 20.9 or newer
- Ollama
- Python 3.10 or newer (Dashboard mode only)

A GPU with 8 GB+ of VRAM is recommended. Without one everything works, but grading is slow.

## Setup

```bash
git clone https://github.com/LuukWell/CohortEssayGrader.git
cd CohortEssayGrader
npm install
```

Pull the models (the last two are only needed for Dashboard mode):

```bash
ollama pull qwen2.5:7b
ollama pull nomic-embed-text
ollama pull gemma2:9b
```

For Dashboard mode, install the Python packages for the topic script:

```bash
pip install -r requirements.txt
```

The first topic run also downloads `BAAI/bge-large-en-v1.5` (about 1.3 GB) from Hugging Face.

Copy the settings template. The defaults match the models above.

```bash
cp .env.example .env.local      # Windows: copy .env.example .env.local
```

If your Python isn't called `python`, or you installed the packages in a virtual environment, set `TOPIC_PYTHON` in `.env.local` to the right executable.

Start the app and open <http://localhost:3000>:

```bash
npm run dev
```

## Adding essays

Each `data/subset_<NAME>.csv` file appears on the setup screen as "Set NAME". `data/subset_X.csv` contains placeholders showing the format:

```csv
id,prompt,essay
S-001,Essay Prompt 1,The full essay text.
```

`id` and `essay` are required, `prompt` is optional. Other columns are ignored.

Results (summaries, embeddings, AI assessments) are cached per essay ID, so keep IDs unique across sets. If you change an essay's text, give it a new ID or reset the database.

For topic groups, use at least as many essays as the number of topics you choose. Around 20 or more works best.

## Changing the rubric

The rubric is defined in two places, which must be kept in sync:

- `data/rubric/rubric.txt`: the rubric shown to the grader. Changing this file also invalidates cached AI assessments.
- `src/lib/llm-config.ts`: `RUBRIC_CRITERIA`, the criteria, score range and level descriptions the model grades against.

The grading prompt is `GRADING_SYSTEM_PROMPT` in `src/lib/llm-grading.ts`. It assumes a 1-5 scale; adjust it if yours is different.

## Changing models

Set `OLLAMA_MODEL` (grading), `OLLAMA_EMBED_MODEL` (similar essays), `TOPIC_LLM_MODEL` and `TOPIC_EMBED_MODEL` (topic groups) in `.env.local` and restart. The grading model must reliably return JSON.

Cached assessments and embeddings don't record which model produced them, so reset the database after switching the grading or embedding model.

## Data and resetting

Everything is stored in `data/grading.db`. To back up, copy it while the app is stopped. To start fresh, stop the app and delete `data/grading.db*`.

To clear a single cache (`ai_assessment_cache`, `essay_summary_cache` or `topic_model_cache`):

```bash
node -e "require('better-sqlite3')('data/grading.db').exec('DELETE FROM ai_assessment_cache')"
```

## Troubleshooting

- **Topic step fails:** check the terminal output prefixed with `[topics:py]`. Usually Python isn't found (set `TOPIC_PYTHON`) or the packages are installed in a different Python.
- **"Model not found":** Ollama isn't running, or the model hasn't been pulled. Check with `ollama list`.
- **Grading times out:** use a smaller model or raise `LLM_PRECOMPUTE_TIMEOUT_MS`. Failed essay/criterion pairs are cached and skipped later; to retry them, run `DELETE FROM ai_assessment_cache WHERE ai_justification = '[PRECOMPUTE_FAILED]'`.
- **Essay set doesn't appear:** the file must be directly in `data/` and named `subset_<NAME>.csv` (letters, numbers, `-`, `_`).
