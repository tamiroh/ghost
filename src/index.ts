#!/usr/bin/env node

import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import { resolveModelSource } from "./model-source.ts";
import { loadProfile } from "./profile.ts";

type CliOptions = {
    modelPath?: string;
    profilePath?: string;
    systemPrompt?: string;
    contextSize?: number;
    gpuLayers?: number | "auto";
    temperature?: number;
    topK?: number;
    topP?: number;
};

const defaultSystemPrompt = "You are a concise, helpful assistant.";
const defaultTemperature = 0.7;
const defaultTopK = 40;
const defaultTopP = 0.9;

function printHelp(): void {
    console.log(`Local LLM chat CLI

Usage:
  npm run dev -- --model ./models/model.gguf
  npm run dev -- --profile ./profiles/default.json
  npm run start -- --profile ./profiles/default.json

Options:
  -m, --model <path>        Local GGUF model override. Can also use LOCAL_LLM_MODEL.
  --profile <path>          Path to a profile JSON file. Can also use LOCAL_LLM_PROFILE.
  --system <prompt>         System prompt. Default: "${defaultSystemPrompt}"
  --context-size <tokens>   Requested context size. Omit to let the runtime choose.
  --gpu-layers <n|auto>     GPU offload layers. Omit to let the runtime choose.
  --temperature <n>         Sampling temperature. Default: ${defaultTemperature}
  --top-k <n>               top-k sampling. Default: ${defaultTopK}
  --top-p <n>               top-p sampling. Default: ${defaultTopP}
  -h, --help                Show this help.

In chat:
  /exit, /quit              End the session.
  /help                     Show chat commands.
`);
}

function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        profilePath: process.env.LOCAL_LLM_PROFILE
    };

    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case "-h":
            case "--help":
                printHelp();
                process.exit(0);
            case "-m":
            case "--model":
                options.modelPath = requireValue(arg, next);
                i += 1;
                break;
            case "--profile":
                options.profilePath = requireValue(arg, next);
                i += 1;
                break;
            case "--system":
                options.systemPrompt = requireValue(arg, next);
                i += 1;
                break;
            case "--context-size":
                options.contextSize = parseRequiredInteger(arg, next);
                i += 1;
                break;
            case "--gpu-layers":
                options.gpuLayers = next === "auto" ? "auto" : parseRequiredInteger(arg, next);
                i += 1;
                break;
            case "--temperature":
                options.temperature = parseRequiredNumber(arg, next);
                i += 1;
                break;
            case "--top-k":
                options.topK = parseRequiredInteger(arg, next);
                i += 1;
                break;
            case "--top-p":
                options.topP = parseRequiredNumber(arg, next);
                i += 1;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function requireValue(name: string, value: string | undefined): string {
    if (value == null || value.startsWith("-")) {
        throw new Error(`${name} requires a value`);
    }

    return value;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
    if (value == null || value === "") {
        return undefined;
    }

    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`Expected a number, got: ${value}`);
    }

    return parsed;
}

function parseOptionalInteger(value: string | undefined): number | undefined {
    const parsed = parseOptionalNumber(value);
    if (parsed == null) {
        return undefined;
    }

    if (!Number.isInteger(parsed)) {
        throw new Error(`Expected an integer, got: ${value}`);
    }

    return parsed;
}

function parseRequiredNumber(name: string, value: string | undefined): number {
    return parseOptionalNumber(requireValue(name, value)) ?? Number.NaN;
}

function parseRequiredInteger(name: string, value: string | undefined): number {
    return parseOptionalInteger(requireValue(name, value)) ?? Number.NaN;
}

async function assertReadableFile(path: string): Promise<void> {
    try {
        await access(path);
    } catch {
        throw new Error(`Model file does not exist or is not readable: ${path}`);
    }
}

async function main(): Promise<void> {
    const options = parseArgs(process.argv.slice(2));
    const profile = options.profilePath == null ? undefined : await loadProfile(resolve(options.profilePath));
    const modelPath = await resolveModelPath(options, profile);

    if (modelPath == null) {
        printHelp();
        throw new Error("Missing --profile, --model, LOCAL_LLM_PROFILE, or LOCAL_LLM_MODEL");
    }

    await assertReadableFile(modelPath);

    const systemPrompt = options.systemPrompt
        ?? profile?.system
        ?? process.env.LOCAL_LLM_SYSTEM_PROMPT
        ?? defaultSystemPrompt;
    const temperature = options.temperature
        ?? profile?.sampling?.temperature
        ?? parseOptionalNumber(process.env.LOCAL_LLM_TEMPERATURE)
        ?? defaultTemperature;
    const topK = options.topK
        ?? profile?.sampling?.topK
        ?? parseOptionalInteger(process.env.LOCAL_LLM_TOP_K)
        ?? defaultTopK;
    const topP = options.topP
        ?? profile?.sampling?.topP
        ?? parseOptionalNumber(process.env.LOCAL_LLM_TOP_P)
        ?? defaultTopP;

    if (profile?.name != null) {
        console.log(`Profile: ${profile.name}`);
    }

    console.log(`Loading model: ${modelPath}`);
    const llama = await getLlama();
    const model = await llama.loadModel({
        modelPath,
        ...(options.gpuLayers == null ? {} : { gpuLayers: options.gpuLayers })
    });

    const context = await model.createContext({
        ...(options.contextSize == null ? {} : { contextSize: options.contextSize })
    });

    const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt
    });

    console.log("Ready. Type /help for commands, /exit to quit.");

    const rl = createInterface({ input, output });
    try {
        while (true) {
            const message = (await rl.question("\nYou> ")).trim();
            if (message === "") {
                continue;
            }

            if (message === "/exit" || message === "/quit") {
                break;
            }

            if (message === "/help") {
                console.log("Commands: /exit, /quit, /help");
                continue;
            }

            output.write("\nAI> ");
            await session.prompt(message, {
                temperature,
                topK,
                topP,
                onTextChunk(text) {
                    output.write(text);
                }
            });
            output.write("\n");
        }
    } finally {
        rl.close();
    }
}

async function resolveModelPath(
    options: CliOptions,
    profile: Awaited<ReturnType<typeof loadProfile>> | undefined
): Promise<string | undefined> {
    if (options.modelPath != null) {
        return resolve(options.modelPath);
    }

    if (profile != null) {
        return resolveModelSource(profile.model);
    }

    if (process.env.LOCAL_LLM_MODEL != null && process.env.LOCAL_LLM_MODEL !== "") {
        return resolve(process.env.LOCAL_LLM_MODEL);
    }

    return undefined;
}

main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
