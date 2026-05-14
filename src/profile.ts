import { mkdir, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { assertSha256, downloadFile, fileExists, unlinkIfExists } from "./files.ts";

export type HuggingFaceModelSource = {
    provider: "huggingface";
    repo: string;
    filename: string;
    revision?: string;
    sha256?: string | null;
    localPath?: string;
};

export type ModelSource = HuggingFaceModelSource;

export type ProfileConfig = {
    schemaVersion: 1;
    name?: string;
    model: ModelSource;
    system: string;
    sampling?: {
        temperature?: number;
        topK?: number;
        topP?: number;
    };
};

export async function loadProfile(path: string): Promise<ProfileConfig> {
    const source = await readFile(path, "utf8");
    let parsed: unknown;

    try {
        parsed = JSON.parse(source);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid profile JSON: ${message}`);
    }

    return parseProfileConfig(parsed);
}

export async function resolveModelSource(model: ModelSource): Promise<string> {
    switch (model.provider) {
        case "huggingface":
            return resolveHuggingFaceModel(model);
    }
}

async function resolveHuggingFaceModel(model: HuggingFaceModelSource): Promise<string> {
    const localPath = resolve(model.localPath ?? defaultHuggingFaceLocalPath(model));

    if (await fileExists(localPath)) {
        if (model.sha256 != null) {
            await assertSha256(localPath, model.sha256);
        }

        return localPath;
    }

    const url = buildHuggingFaceDownloadUrl(model);
    const temporaryPath = `${localPath}.download`;

    await mkdir(dirname(localPath), { recursive: true });
    console.log(`Downloading model: ${url}`);
    console.log(`Destination: ${localPath}`);

    try {
        await downloadFile(url, temporaryPath);

        if (model.sha256 != null) {
            await assertSha256(temporaryPath, model.sha256);
        }

        await rename(temporaryPath, localPath);
    } catch (error) {
        await unlinkIfExists(temporaryPath);
        throw error;
    }

    return localPath;
}

function parseProfileConfig(value: unknown): ProfileConfig {
    if (!isRecord(value)) {
        throw new Error("Profile must be a JSON object");
    }

    const schemaVersion = requiredInteger(value.schemaVersion, "schemaVersion");
    if (schemaVersion !== 1) {
        throw new Error(`Unsupported schemaVersion: ${schemaVersion}`);
    }

    const name = optionalString(value.name, "name");
    const model = parseModelSource(value.model);
    const system = requiredString(value.system, "system");
    const sampling = parseSampling(value.sampling);

    return {
        schemaVersion,
        ...(name == null ? {} : { name }),
        model,
        system,
        ...(sampling == null ? {} : { sampling })
    };
}

function parseModelSource(value: unknown): ModelSource {
    if (!isRecord(value)) {
        throw new Error("model must be a JSON object");
    }

    const provider = requiredString(value.provider, "model.provider");
    switch (provider) {
        case "huggingface":
            return {
                provider,
                repo: requiredString(value.repo, "model.repo"),
                filename: requiredString(value.filename, "model.filename"),
                revision: optionalString(value.revision, "model.revision"),
                sha256: optionalNullableString(value.sha256, "model.sha256"),
                localPath: optionalString(value.localPath, "model.localPath")
            };
        default:
            throw new Error(`Unsupported model provider: ${provider}`);
    }
}

function parseSampling(value: unknown): ProfileConfig["sampling"] {
    if (value == null) {
        return undefined;
    }

    if (!isRecord(value)) {
        throw new Error("sampling must be a JSON object");
    }

    const temperature = optionalNumber(value.temperature, "sampling.temperature");
    const topK = optionalInteger(value.topK, "sampling.topK");
    const topP = optionalNumber(value.topP, "sampling.topP");

    return {
        ...(temperature == null ? {} : { temperature }),
        ...(topK == null ? {} : { topK }),
        ...(topP == null ? {} : { topP })
    };
}

function defaultHuggingFaceLocalPath(model: HuggingFaceModelSource): string {
    return join("models", "huggingface", ...model.repo.split("/"), model.filename);
}

function buildHuggingFaceDownloadUrl(model: HuggingFaceModelSource): string {
    const revision = model.revision ?? "main";
    const repo = encodePath(model.repo);
    const filename = encodePath(model.filename);

    return `https://huggingface.co/${repo}/resolve/${encodeURIComponent(revision)}/${filename}?download=true`;
}

function encodePath(path: string): string {
    return path.split("/").map(encodeURIComponent).join("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`${field} must be a non-empty string`);
    }

    return value;
}

function optionalString(value: unknown, field: string): string | undefined {
    if (value == null) {
        return undefined;
    }

    if (typeof value !== "string") {
        throw new Error(`${field} must be a string`);
    }

    return value;
}

function optionalNullableString(value: unknown, field: string): string | null | undefined {
    if (value === null) {
        return null;
    }

    return optionalString(value, field);
}

function optionalNumber(value: unknown, field: string): number | undefined {
    if (value == null) {
        return undefined;
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${field} must be a finite number`);
    }

    return value;
}

function requiredInteger(value: unknown, field: string): number {
    const parsed = optionalInteger(value, field);
    if (parsed == null) {
        throw new Error(`${field} must be an integer`);
    }

    return parsed;
}

function optionalInteger(value: unknown, field: string): number | undefined {
    const parsed = optionalNumber(value, field);
    if (parsed == null) {
        return undefined;
    }

    if (!Number.isInteger(parsed)) {
        throw new Error(`${field} must be an integer`);
    }

    return parsed;
}
