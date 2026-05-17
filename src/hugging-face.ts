import { mkdir, rename } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { assertSha256, downloadFile, fileExists, unlinkIfExists } from "./files.ts";

export type HuggingFaceModelSource = {
    provider: "huggingface";
    repo: string;
    filename: string;
    revision?: string;
    sha256?: string | null;
    localPath?: string;
};

export async function resolveHuggingFaceModel(model: HuggingFaceModelSource): Promise<string> {
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
