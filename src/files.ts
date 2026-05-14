import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

export async function fileExists(path: string): Promise<boolean> {
    try {
        await access(path);
        return true;
    } catch {
        return false;
    }
}

export async function downloadFile(url: string, destination: string): Promise<void> {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
    }

    if (response.body == null) {
        throw new Error("Download response did not include a body");
    }

    await pipeline(Readable.fromWeb(response.body), createWriteStream(destination));
}

export async function assertSha256(path: string, expected: string): Promise<void> {
    const actual = await sha256File(path);
    if (actual !== expected.toLowerCase()) {
        throw new Error(`SHA-256 mismatch for ${path}: expected ${expected}, got ${actual}`);
    }
}

export async function sha256File(path: string): Promise<string> {
    const hash = createHash("sha256");
    await pipeline(createReadStream(path), hash);
    return hash.digest("hex");
}

export async function unlinkIfExists(path: string): Promise<void> {
    try {
        await unlink(path);
    } catch {
        // Best-effort cleanup for temporary files.
    }
}
