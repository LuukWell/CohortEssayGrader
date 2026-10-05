# EssayGrader2

EssayGrader2 is an essay grading assistant that runs entirely on your own computer. You grade the essays; a local AI model sits next to you and, for every rubric criterion, suggests a score, a short justification and quotes from the essay that back it up. You can accept the suggestion, change it, or ignore it completely. The final grade is always yours.

It was built for an MSc thesis study that compares two ways of grading:

- **Baseline:** you work through the essays one at a time, the way most people grade.
- **Dashboard:** you first get an overview of the whole class. Essays are grouped by topic, you can see which essays are similar to the one you are reading, and you can pin example essays ("this is what a 4 looks like") to compare against.

Both modes work fine outside a study too. Everything runs locally: the AI models run in [Ollama](https://ollama.com), and all sessions, grades and logs are stored in a SQLite file inside the project. No essay text is sent to an external service. The only internet traffic is downloading the models the first time.

---

## Contents

1. [What you need](#what-you-need)
2. [Getting it running](#getting-it-running)
3. [Using the app](#using-the-app)
4. [Adding your own essays](#adding-your-own-essays)
5. [Changing the rubric](#changing-the-rubric)
6. [Choosing different models](#choosing-different-models)
7. [How the topic groups are made](#how-the-topic-groups-are-made)
8. [Where your data lives (and how to reset it)](#where-your-data-lives-and-how-to-reset-it)
9. [Project layout](#project-layout)
10. [Troubleshooting](#troubleshooting)

---

## What you need

| | Version | Needed for |
|---|---|---|
| [Node.js](https://nodejs.org) | **20.9 or newer** | Everything (the app itself) |
| [Ollama](https://ollama.com) | recent | Everything (runs the AI models) |
| [Python](https://www.python.org) | 3.10 or newer | Dashboard mode only (topic groups) |

**Hardware.** The default models need about 13 GB of disk space in total. A graphics card with 8 GB or more of video memory makes a big difference: grading one essay takes seconds instead of minutes. Without one, everything still works, just slowly.

**If you only want Baseline mode**, you can skip Python and the `gemma2:9b` and `nomic-embed-text` models. Those are only used to build the Dashboard overview.

---

## Getting it running

### 1. Get the code and install the Node packages

```bash
git clone https://github.com/LuukWell/EssayGrader2.git
cd EssayGrader2
npm install
```

### 2. Install Ollama and download the models

Install Ollama from [ollama.com](https://ollama.com) and make sure it is running (on Windows and macOS it sits in the system tray). Then download the three default models:

```bash
ollama pull qwen2.5:7b          # grading model                       (~4.7 GB)
ollama pull nomic-embed-text    # "similar essays" panel, Dashboard   (~0.3 GB)
ollama pull gemma2:9b           # names the topic groups, Dashboard   (~5.4 GB)
```

You can check that Ollama is up by opening <http://localhost:11434> in a browser; it should say "Ollama is running".

### 3. Install the Python packages (Dashboard mode only)

The topic groups are made by a small Python script. It is a good idea to give it its own virtual environment:

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
```

This pulls in PyTorch, so it can take a few minutes. The first time a topic grouping runs, it also downloads the `BAAI/bge-large-en-v1.5` embedding model from Hugging Face (about 1.3 GB). After that it works offline.

If you used a virtual environment, or your Python is called `python3` rather than `python`, tell the app where it is via `TOPIC_PYTHON` in the next step.

### 4. Create your settings file

All settings live in `.env.local`. Start from the template:

```bash
# macOS / Linux
cp .env.example .env.local
# Windows
copy .env.example .env.local
```

The defaults match the models from step 2, so you don't have to change anything. For reference:

| Setting | Default | What it does |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Where Ollama is running |
| `OLLAMA_MODEL` | `qwen2.5:7b` | The model that grades essays, writes the overall feedback and summarises essays |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Finds similar essays (Dashboard) |
| `TOPIC_LLM_MODEL` | `gemma2:9b` | Gives each topic group a name (Dashboard) |
| `TOPIC_EMBED_MODEL` | `BAAI/bge-large-en-v1.5` | Groups essays by topic (Dashboard, runs in Python) |
| `TOPIC_PYTHON` | `python` | Python to run the topic script with, e.g. `python3` or the full path to `.venv/bin/python` (macOS/Linux) or `.venv\Scripts\python.exe` (Windows) |
| `LLM_PRECOMPUTE_TIMEOUT_MS` | `180000` | How long one AI grading call may take before it is skipped. Raise it on slow machines |
| `TOPIC_MODEL_TIMEOUT_MS` | `900000` | How long one topic grouping run may take |

After changing `.env.local`, restart the app.

### 5. Start the app

```bash
npm run dev
```

Open <http://localhost:3000>. To check that everything works, start a session with **Set X**: a set of 12 made-up sample essays that ships with the project.

For day-to-day use you can also run an optimised build:

```bash
npm run build
npm start
```

---

## Using the app

### The setup screen

Every grading session starts here.

| Field | What it means |
|---|---|
| **Participant ID** | Any name or code. It identifies the session in the logs and exports. |
| **Condition** | *Baseline* (one essay at a time) or *Dashboard* (class overview first). |
| **Essay Set** | Which essays to grade. Every `data/subset_<NAME>.csv` file shows up here as "Set NAME" (see [Adding your own essays](#adding-your-own-essays)). |
| **Number of topics (k)** | Dashboard only: how many topic groups to split the essays into. The line underneath tells you whether the groups for this set and k have already been computed (instant) or still need to be computed (a few minutes, once). |
| **Pre-compute AI assessments** | On by default. The AI grades every essay before you start, so suggestions appear instantly while you grade. Turn it off to get suggestions on demand instead. |
| **Reuse cached assessments** | If another session already had the AI grade these essays with the same rubric and settings, reuse those results instead of asking the model again. Faster, but every session then sees identical AI suggestions. |
| **Reset topic cache** | Throws away the stored topic groups for the selected set, so they are recomputed next time. |

**Picking up where you left off.** If you enter the same participant ID, condition and essay set as an unfinished session, that session is resumed with all its grades. Restarting the server sends the browser back to the setup screen, but nothing is lost: enter the same details to continue.

### The preparation screen

After setup, the app prepares the essays. In Baseline mode it only pre-grades them. In Dashboard mode it also:

1. writes a one or two sentence summary of every essay,
2. groups the essays by topic,
3. works out which essays are most similar to each other.

The first time you use a set this takes a while: think minutes for 50 essays, depending on your hardware. Summaries, similarities, topic groups and AI assessments are all cached, so the next session with the same essays is much faster.

### Grading an essay

Each essay goes through a few short steps:

1. **Welcome:** a short introduction.
2. **Rubric:** read the rubric you will be grading with.
3. **Settings:** choose how the AI writes its feedback (flowing text or bullet points; short, medium or long) and how strictly its quotes are checked (low, medium or high).
4. **Grading:** for each criterion you see the AI's suggested score, its reasoning and the quotes it based that on, highlighted in the essay. Pick your own score, write or edit the justification, and move on to the next criterion.

The app checks every quote the AI gives against the actual essay text. A quote that cannot be found (or only roughly) is flagged, because a language model will sometimes "quote" sentences that are not there.

When all criteria are done, the AI writes an overall assessment, and you can move on to the next essay.

### Dashboard extras

- **Cohort view:** all essays at a glance, grouped by topic, with your grading progress and grade distribution.
- **Similar essays:** while grading, a side panel shows the essays that are closest in content to the one you are reading.
- **Benchmarks:** mark an essay as the example of a given score on a criterion (say, "Organization: this is a 4"). Later you can open any essay side by side with that example to keep your grading consistent.

### Analytics and exporting

The **Analytics** tab shows your grades, how closely your scores matched the AI's, how the essays rank, and how long you spent per criterion and per essay. The download button in the top bar saves two files for the current session:

- a CSV with one row per graded criterion: your score, the AI's score, the time you spent, how many quotes were flagged, and whether you edited the AI's assessment, and
- a JSON file with the full session: grades, timings and the complete interaction log.

To export all sessions of one participant at once, open these URLs while the app is running:

```
http://localhost:3000/api/export?participantId=P01        # interaction log as CSV
http://localhost:3000/api/export/all?participantId=P01    # everything as JSON
```

---

## Adding your own essays

An essay set is simply a CSV file in the `data/` folder whose name starts with `subset_`:

```
data/subset_X.csv        →  "Set X"   (the sample set)
data/subset_week3.csv    →  "Set week3"
```

Set names may contain letters, numbers, `-` and `_`. Refresh the setup screen and the new set appears; there is no need to restart the app.

### The format

The easiest way to start is to copy `data/subset_X.csv` and replace the rows. The columns are matched by their header name, so the order does not matter:

| Column | Required? | What goes in it |
|---|---|---|
| `id` | **yes** | A unique ID for the essay, e.g. `S-014`. |
| `essay` | **yes** | The full essay text. |
| `prompt` | no | The assignment the student answered. Shown above the essay while grading. |
| `word_count` | no | Calculated automatically if empty. |
| anything else | no | Ignored. |

A minimal file looks like this:

```csv
id,prompt,essay
S-001,"Should homework be banned? Explain your view.","I believe homework should not be banned, because..."
S-002,"Should homework be banned? Explain your view.","Homework takes up time that students could spend..."
```

It is a normal CSV file, so any text containing commas, quotes or line breaks just needs to be in double quotes. Spreadsheet programs do this for you: in Excel, use *Save As → CSV UTF-8*.

A few practical tips:

- **Use enough essays for the topic groups.** You need at least as many essays as the number of topics you pick, and the groups only become meaningful from roughly 20 essays up.
- **Keep IDs unique across all your sets.** Cached results (summaries, similarities, AI assessments) are stored per essay ID, so two different essays should never share an ID.
- **If you edit an essay's text, give it a new ID**, or clear the caches (see [resetting](#where-your-data-lives-and-how-to-reset-it)). Otherwise the app keeps showing results that were computed for the old text.
- **Paragraphs:** many essay datasets store each essay as one long line. That is fine: the app adds paragraph breaks for display at sentences that start with phrases like "First,", "However," or "In conclusion,".
- **Remove the sample set** by deleting `data/subset_X.csv` once you have your own.

---

## Changing the rubric

The rubric lives in **two** places. Always change both, and keep them in step.

### 1. `data/rubric/rubric.txt`: what the grader reads

This is the plain-text rubric shown on the Rubric step. Write it however you like, for example:

```
Argument (Is the position clear and well supported?)
1 – No clear position.
2 – ...
```

The app also uses a fingerprint of this file to decide whether cached AI assessments are still valid. When this text changes, all old assessments are ignored automatically.

### 2. `src/lib/llm-config.ts`: what the AI grades against

`RUBRIC_CRITERIA` is the structured version of the same rubric. It defines the criteria, the score range and what each score means. The AI grades against these descriptions, and they decide which score buttons you see. One criterion looks like this:

```ts
{
  id: 1,                               // unique number
  name: 'Content',                     // unique name, shown in the app and stored with every grade
  scoreRange: { min: 1, max: 5 },
  levels: [
    { score: 1, description: 'No clear position or completely off-topic.' },
    { score: 2, description: 'A position is stated but reasons or examples are missing.' },
    // ... one entry per score
  ],
},
```

You can add or remove criteria, rename them, and use any score range (0–4, 1–10, ...), as long as there is one `levels` entry per score.

### Good to know

- **Only change `llm-config.ts` together with `rubric.txt`.** If you change only `llm-config.ts`, the fingerprint stays the same and "Reuse cached assessments" can hand you AI scores from the old rubric.
- **Sessions keep the rubric they started with.** Start a new session to grade with a changed rubric.
- **The grading instructions** (the "system prompt") are in `src/lib/llm-grading.ts`, in `GRADING_SYSTEM_PROMPT`. They describe a strict grader for a master's-level course. Adjust the tone and level to suit your students.
- **Not using a 1–5 scale?** The same file adds an extra "decision process" hint to the prompt that is written for scores 1 to 5 (`decisionBlock`). Rewrite or remove it if your scale is different.

---

## Choosing different models

Any chat model in Ollama can be the grading model. Pull it with `ollama pull <name>`, put the name in `OLLAMA_MODEL` and restart. Bigger models generally give better feedback but are slower. Whatever you pick has to reliably return JSON, which most recent instruction-tuned models of 7B and up do well.

A few things to keep in mind when you switch:

- **Grading model:** cached AI assessments do not record which model made them. After switching, turn off "Reuse cached assessments", or clear the `ai_assessment_cache` table, to get fresh suggestions.
- **Embedding model:** cached summaries and similarity embeddings are kept per essay. After changing `OLLAMA_EMBED_MODEL`, clear the `essay_summary_cache` table.
- **Topic models:** nothing to do. The topic cache records which models were used, so changing `TOPIC_LLM_MODEL` or `TOPIC_EMBED_MODEL` simply leads to a fresh grouping.

How to clear a table is explained [below](#where-your-data-lives-and-how-to-reset-it).

---

## How the topic groups are made

In Dashboard mode the essays are grouped like this:

1. Every essay is turned into a numerical "meaning" vector with the `BAAI/bge-large-en-v1.5` embedding model.
2. K-means clustering splits those vectors into *k* groups (with a fixed random seed, so the same essays and k always give the same groups).
3. For each group, the words that are most typical of it compared with the other groups are picked out.
4. `gemma2:9b` reads those words plus three excerpts from the group and comes up with a short name, like "Online vs. Offline Courses".

The work is done by `scripts/topic_bge_gemma.py`, which the app starts automatically. The result is saved in the database per essay set and k. The first session for a set/k combination computes it (a minute or two, longer on the very first run while the model downloads); every later session reuses it instantly. Use **Reset topic cache** on the setup screen to force a new grouping.

**Optional:** if a file `data/essay_topic_assignments_cd.csv` exists (topic assignments computed outside the app, as in the original study), the setup screen offers a **Use pre-computed topics** switch for the sets that file covers. Without that file the switch simply does not appear.

---

## Where your data lives (and how to reset it)

Everything the app stores is in one file: **`data/grading.db`** (plus two small helper files next to it, `-shm` and `-wal`). It holds the sessions, grades, highlights, benchmarks and the interaction log, as well as these caches:

| Table | What is cached |
|---|---|
| `ai_assessment_cache` | AI scores and feedback per essay, criterion, rubric and feedback style |
| `essay_summary_cache` | Essay summaries and similarity embeddings |
| `topic_model_cache` | Topic groups per essay set, k and models |

**Back it up** by copying `data/grading.db` while the app is stopped. If you run a study, do this regularly.

**Start completely fresh** by stopping the app and deleting `data/grading.db*`. A new, empty database is created the next time you start.

**Clear just one cache** (with the app stopped), from the project folder:

```bash
node -e "require('better-sqlite3')('data/grading.db').exec('DELETE FROM ai_assessment_cache')"
```

Replace `ai_assessment_cache` with the table you want to empty. You can also open `data/grading.db` in a graphical tool such as [DB Browser for SQLite](https://sqlitebrowser.org).

---

## Project layout

```
EssayGrader2/
├── .env.example           settings template, copy to .env.local
├── requirements.txt       Python packages for the topic script
├── data/
│   ├── subset_X.csv       sample essay set, add your own subset_<NAME>.csv files here
│   ├── rubric/rubric.txt  the rubric graders read
│   └── grading.db         created on first start: sessions, grades, logs, caches
├── scripts/
│   └── topic_bge_gemma.py topic grouping (BGE + k-means + Gemma)
└── src/
    ├── app/               pages and API routes (Next.js)
    ├── components/        the user interface
    ├── hooks/             session state
    ├── lib/               database, AI calls, grading, essay loading, topic model
    │   ├── llm-config.ts  the rubric criteria the AI grades against
    │   └── llm-grading.ts the grading prompt
    └── types/
```

---

## Troubleshooting

**"Processing failed" or the topic step never finishes.** Look at the terminal where `npm run dev` runs; the topic script prints its progress there with a `[topics:py]` prefix.
- `could not start "python"`: Python is not on your PATH, or is called `python3`. Set `TOPIC_PYTHON` in `.env.local`.
- `ModuleNotFoundError`: the Python packages are missing, or are installed in a different Python than the one the app uses. Run `pip install -r requirements.txt` with the same Python as `TOPIC_PYTHON`.
- `model "gemma2:9b" not found`: run `ollama pull gemma2:9b`, or change `TOPIC_LLM_MODEL`.

**AI grading errors or "model not found".** Ollama is not running, or the model in `OLLAMA_MODEL` has not been downloaded. Run `ollama list` to see what you have.

**Grading is very slow or calls time out.** The model is too big for your hardware, or is running on the CPU. Try a smaller model, or raise `LLM_PRECOMPUTE_TIMEOUT_MS`. Note that an essay/criterion pair that failed during pre-computing is remembered and skipped in later sessions, so it doesn't hang every time. To retry those, delete the failed rows with a SQLite tool:
```sql
DELETE FROM ai_assessment_cache WHERE ai_justification = '[PRECOMPUTE_FAILED]';
```

**My essay set does not show up.** The file must be directly in `data/`, named `subset_<NAME>.csv`, with only letters, numbers, `-` or `_` in the name.

**The set shows up but has no essays (or fewer than expected).** Check that the file has `id` and `essay` columns and that every row has both filled in. Rows without them are skipped.

**`npm install` fails while building `better-sqlite3`.** Check `node --version`; it must be 20.9 or newer. Older or very new Node versions may have no ready-made build, and then npm tries to compile it, which needs C++ build tools.

**Port 3000 is already in use.** Start on another port with `npm run dev -- -p 3001`.

**Warnings about symlinks on Windows** during the first model download come from Hugging Face and are harmless.
