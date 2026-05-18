import { appendFile, readFile } from "node:fs/promises";
import { type LlamaChatSession } from "node-llama-cpp";
import { objectSchema, stringSchema, type InferSchema } from "./schema.ts";

const memoryEntry = objectSchema({
    content: stringSchema,
    createdAt: stringSchema
});

//
// Memory Entry
//

export type MemoryEntry = InferSchema<typeof memoryEntry>;

export function formatMemoriesForPrompt(memories: MemoryEntry[]): string {
    if (memories.length === 0) {
        return "";
    }

    return [
        "Memory:",
        ...memories.map((memory) => `- ${memory.content}`)
    ].join("\n");
}

//
// Memory Store
//

export async function readMemories(path: string): Promise<MemoryEntry[]> {
    try {
        return (await readFile(path, "utf8"))
            .split("\n")
            .map((line) => line.trim())
            .filter((line) => line !== "")
            .map((line, index) => parseMemoryLine(line, index + 1));
    } catch {
        return [];
    }
}

export async function appendMemory(path: string, content: string): Promise<MemoryEntry> {
    const memory: MemoryEntry = {
        content,
        createdAt: new Date().toISOString()
    };

    await appendFile(path, `${JSON.stringify(memory)}\n`, "utf8");
    return memory;
}

export async function appendNewMemories(
    path: string,
    existingMemories: MemoryEntry[],
    contents: string[]
): Promise<MemoryEntry[]> {
    const existing = new Set(existingMemories.map((memory) => normalizeMemoryContent(memory.content)));
    const appended: MemoryEntry[] = [];

    for (const content of contents) {
        const normalized = normalizeMemoryContent(content);
        if (normalized === "" || existing.has(normalized)) {
            continue;
        }

        existing.add(normalized);
        appended.push(await appendMemory(path, content));
    }

    return appended;
}

function parseMemoryLine(line: string, lineNumber: number): MemoryEntry {
    try {
        return memoryEntry.parse(JSON.parse(line), `memory line ${lineNumber}`);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid memory JSONL at line ${lineNumber}: ${message}`);
    }
}

function normalizeMemoryContent(content: string): string {
    return content.trim().replace(/\s+/g, " ").toLowerCase();
}

//
// Memory Extraction
//

export function parseMemoryCandidates(text: string): string[] {
    return text
        .trim()
        .split("\n")
        .map(cleanMemoryCandidate)
        .filter((value) => value !== "" && value.length <= 300);
}

export async function extractAndStoreMemories({
    session,
    memoryPath,
    userMessage,
    assistantMessage
}: {
    session: LlamaChatSession;
    memoryPath: string;
    userMessage: string;
    assistantMessage: string;
}): Promise<void> {
    const existingMemories = await readMemories(memoryPath);
    const history = session.getChatHistory();

    try {
        await appendNewMemories(
            memoryPath,
            existingMemories,
            parseMemoryCandidates(await session.prompt(buildMemoryExtractionPrompt({
                existingMemories,
                userMessage,
                assistantMessage
            }), {
                temperature: 0,
                topP: 1,
                maxTokens: 160
            }))
        );
    } finally {
        session.setChatHistory(history);
    }
}

function cleanMemoryCandidate(text: string): string {
    return text
        .trim()
        .replace(/^[-*・]\s*/, "")
        .replace(/^\d+[.)]\s*/, "")
        .replace(/^["'「『]|["'」』]$/g, "")
        .trim();
}

function buildMemoryExtractionPrompt({
    existingMemories,
    userMessage,
    assistantMessage
}: {
    existingMemories: MemoryEntry[];
    userMessage: string;
    assistantMessage: string;
}): string {
    return `/no_think

Extract only long-term memories worth saving from the latest turn.

Rules:
- Output plain text only.
- Write one memory per line.
- Do not use JSON, Markdown, bullets, numbering, labels, or explanations.
- Write each memory as this AI's own short experience, not as a detached fact database.
- Save each memory in the same language used in the latest user message whenever possible.
- Prefer this shape in the user's language: The user said "...", so I remembered ....
- Save stable user preferences, personal facts, relationship facts, or explicit changes to this AI's persona.
- Do not save temporary requests, greetings, compliments, one-off tasks, or facts already present.
- If there is nothing worth saving, output nothing.

Good examples:
The user told me how they want to be addressed, so I remembered that name.

Existing memories:
${formatExistingMemories(existingMemories)}

Latest user message:
${userMessage}

Latest assistant response:
${assistantMessage}`;
}

function formatExistingMemories(memories: MemoryEntry[]): string {
    return memories.length === 0
        ? "(none)"
        : memories.map((memory) => `- ${memory.content}`).join("\n");
}
