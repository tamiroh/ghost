import { access } from "node:fs/promises";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { getLlama, LlamaChatSession } from "node-llama-cpp";
import {
    extractAndStoreMemories,
    formatMemoriesForPrompt,
    readMemories
} from "./memory.ts";
import { resolveModelSource } from "./model-source.ts";
import { installPerson, loadInstalledPerson, touchPersonLastOpened } from "./person.ts";

export async function cliApp(argv: string[]): Promise<void> {
    const command = parseCommand(argv);

    switch (command.name) {
        case "install": {
            const installed = await installPerson(command.profilePath);
            console.log("Installed person.");
            console.log(`Path: ${installed.path}`);
            return;
        }
        case "chat": {
            const installed = await loadInstalledPerson(command.person);
            await touchPersonLastOpened(installed);
            await runChat(installed);
            return;
        }
    }
}

async function runChat(installed: Awaited<ReturnType<typeof loadInstalledPerson>>): Promise<void> {
    const profile = installed.profile;
    const modelPath = await resolveModelSource(profile.model);
    const memories = await readMemories(installed.memoryPath);
    const memoryPrompt = formatMemoriesForPrompt(memories);

    await assertReadableFile(modelPath);

    const temperature = profile.sampling?.temperature;
    const topK = profile.sampling?.topK;
    const topP = profile.sampling?.topP;

    if (profile.name != null) {
        console.log(`Person: ${installed.path} (${profile.name})`);
    } else {
        console.log(`Person: ${installed.path}`);
    }

    console.log(`Loading model: ${modelPath}`);
    const llama = await getLlama();
    const model = await llama.loadModel({ modelPath });

    const context = await model.createContext();

    const session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt: memoryPrompt === "" ? profile.system : `${profile.system}\n\n${memoryPrompt}`
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
                console.log("Commands: /memories, /exit, /quit, /help");
                continue;
            }

            if (message === "/memories") {
                await printMemories(installed.memoryPath);
                continue;
            }

            output.write("\nAI> ");
            const response = await session.prompt(message, {
                ...(temperature == null ? {} : { temperature }),
                ...(topK == null ? {} : { topK }),
                ...(topP == null ? {} : { topP }),
                onTextChunk(text) {
                    output.write(text);
                }
            });
            output.write("\n");

            await extractAndStoreMemories({
                session,
                memoryPath: installed.memoryPath,
                userMessage: message,
                assistantMessage: response
            });
        }
    } finally {
        rl.close();
    }
}

async function printMemories(path: string): Promise<void> {
    const memories = await readMemories(path);
    console.log(memories.length === 0
        ? "No memories."
        : memories.map((memory, index) => `${index + 1}. ${memory.content}`).join("\n"));
}

function printHelp(): void {
    console.log(`Local LLM chat CLI

Usage:
  npm run dev -- install ./profiles/default.json
  npm run dev -- chat default
  npm run start -- install ./profiles/default.json
  npm run start -- chat default

Options:
  -h, --help                Show this help.

In chat:
  /memories                 Show memories.
  /exit, /quit              End the session.
  /help                     Show chat commands.
`);
}

type Command =
    | { name: "install"; profilePath: string }
    | { name: "chat"; person: string };

function parseCommand(argv: string[]): Command {
    if (argv.length === 1 && (argv[0] === "-h" || argv[0] === "--help")) {
        printHelp();
        process.exit(0);
    }

    if (argv.length !== 2) {
        printHelp();
        throw new Error("Expected a command and one argument");
    }

    const [command, value] = argv;

    if (value.startsWith("-")) {
        throw new Error(`Expected a person path or shorthand name, got option-like value: ${value}`);
    }

    switch (command) {
        case "install":
            return { name: "install", profilePath: value };
        case "chat":
            return { name: "chat", person: value };
        default:
            throw new Error(`Unknown command: ${command}`);
    }
}

async function assertReadableFile(path: string): Promise<void> {
    try {
        await access(path);
    } catch {
        throw new Error(`Model file does not exist or is not readable: ${path}`);
    }
}
