# ghost

Node.js + TypeScript local LLM chat CLI.

This runs inference inside the application process with `node-llama-cpp`, which embeds
`llama.cpp` bindings. It does not require Ollama or a separate model server.

## Requirements

- Node.js 24+
- A profile JSON file that points to a GGUF chat/instruct model

Downloaded model files are stored under `models/` by default. GGUF files are ignored by
git because they are usually large.

Use `tmp/profiles/` for local profile experiments. `tmp/` is ignored by git.
Installed people are stored under `people/`. `people/` is ignored by git because it
contains local memory and state.

## Setup

```sh
npm install
```

## Run

```sh
npm run dev -- install ./profiles/default.json
npm run dev -- chat default
```

After building:

```sh
npm run build
npm run start -- install ./profiles/default.json
npm run start -- chat default
```

## CLI Options

```txt
-h, --help                Show help.
```

Inside chat, use `/exit` or `/quit` to stop.

Profiles are blueprints. Installing a profile creates a local person directory:

```txt
people/
  default/
    profile.json
    memory.jsonl
    state.json
```

The app automatically extracts long-term memory candidates after each turn and appends
them to `memory.jsonl`.

## Profile JSON

Profile files define where the GGUF comes from, the system prompt, and optional default
sampling settings. Only Hugging Face model sources are supported for now, but the
`model.provider` field leaves room for additional providers later.

Current Hugging Face downloads are for public repositories. Gated or private model
downloads that require authentication are not supported yet.

```json
{
    "schemaVersion": 1,
    "name": "ghost-default",
    "model": {
        "provider": "huggingface",
        "repo": "lmstudio-community/Qwen2.5-0.5B-Instruct-GGUF",
        "revision": "main",
        "filename": "Qwen2.5-0.5B-Instruct-Q4_K_M.gguf",
        "sha256": "fa4d41b65761ed565cac6b5f62e35135d050408b033114a128ab308c02b2e83a"
    },
    "system": "You are Ghost, a concise and pragmatic local AI assistant.",
    "sampling": {
        "temperature": 0.7,
        "topK": 40,
        "topP": 0.9
    }
}
```

`revision` can be a branch name, but a commit hash is better for reproducibility.
`sha256` is optional but recommended.
