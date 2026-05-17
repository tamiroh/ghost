import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import { resolveModelSource } from "./model-source.ts";
import { loadProfile } from "./profile.ts";

export async function cliApp(argv: string[]): Promise<void> {
    const profilePath = parseProfilePath(argv);
    const profile = await loadProfile(resolve(profilePath));
    const modelPath = await resolveModelSource(profile.model);

    await assertReadableFile(modelPath);

    const temperature = profile.sampling?.temperature;
    const topK = profile.sampling?.topK;
    const topP = profile.sampling?.topP;

    if (profile.name != null) {
        console.log(`Profile: ${profile.name}`);
    }

    console.log(`Loading model: ${modelPath}`);
    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath });

    const context = await model.createContext();

    const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: profile.system
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
                ...(temperature == null ? {} : { temperature }),
                ...(topK == null ? {} : { topK }),
                ...(topP == null ? {} : { topP }),
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

function printHelp(): void {
    console.log(`Local LLM chat CLI

Usage:
  npm run dev -- ./profiles/default.json
  npm run start -- ./profiles/default.json

Options:
  -h, --help                Show this help.

In chat:
  /exit, /quit              End the session.
  /help                     Show chat commands.
`);
}

function parseProfilePath(argv: string[]): string {
    if (argv.length === 1 && (argv[0] === "-h" || argv[0] === "--help")) {
        printHelp();
        process.exit(0);
    }

    if (argv.length !== 1) {
        printHelp();
        throw new Error("Expected exactly one profile path");
    }

    const [profilePath] = argv;

    if (profilePath.startsWith("-")) {
        throw new Error(`Expected a profile path, got option-like value: ${profilePath}`);
    }

    return profilePath;
}

async function assertReadableFile(path: string): Promise<void> {
    try {
        await access(path);
    } catch {
        throw new Error(`Model file does not exist or is not readable: ${path}`);
    }
}
