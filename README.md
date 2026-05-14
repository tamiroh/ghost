# ghost

Node.js + TypeScript local LLM chat CLI.

This runs inference inside the application process with `node-llama-cpp`, which embeds
`llama.cpp` bindings. It does not require Ollama or a separate model server.

## Requirements

- Node.js 24+
- A profile JSON file that points to a GGUF chat/instruct model

Downloaded model files are stored under `models/` by default. GGUF files are ignored by
git because they are usually large.

## Setup

```sh
npm install
```

## Run

```sh
npm run dev -- --profile ./profiles/default.json
```

You can still force a local GGUF path:

```sh
npm run dev -- --model ./models/your-model.gguf
```

After building:

```sh
npm run build
npm run start -- --profile ./profiles/default.json
```

You can also use an environment variable:

```sh
LOCAL_LLM_PROFILE=./profiles/default.json npm run dev
```

## CLI Options

```txt
-m, --model <path>        Local GGUF model override. Can also use LOCAL_LLM_MODEL.
--profile <path>          Path to a profile JSON file. Can also use LOCAL_LLM_PROFILE.
--system <prompt>         System prompt.
--context-size <tokens>   Requested context size.
--gpu-layers <n|auto>     GPU offload layers.
--temperature <n>         Sampling temperature. Default: 0.7
--top-k <n>               top-k sampling. Default: 40
--top-p <n>               top-p sampling. Default: 0.9
```

Inside chat, use `/exit` or `/quit` to stop. CLI flags override profile values, and
profile values override environment variables.

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
