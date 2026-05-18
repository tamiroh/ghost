import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, resolve, sep } from "node:path";
import { fileExists } from "./files.ts";
import { loadProfile, type ProfileConfig } from "./profile.ts";

//
// Person Installation
//

export async function installPerson(profilePath: string): Promise<InstalledPerson> {
    const resolvedProfilePath = resolve(profilePath);
    const personPath = resolve("people", resolvePersonDirectoryName(resolvedProfilePath));

    if (await fileExists(personPath)) {
        throw new Error(`Person already exists: ${personPath}`);
    }

    await mkdir(personPath, { recursive: true });
    return writeInstalledPerson(
        createInstalledPerson(personPath, await loadProfile(resolvedProfilePath)),
        resolvedProfilePath
    );
}

export async function loadInstalledPerson(reference: string): Promise<InstalledPerson> {
    const personPath = resolvePersonPath(reference);
    return createInstalledPerson(personPath, await loadProfile(resolve(personPath, "profile.json")));
}

function resolvePersonDirectoryName(profilePath: string): string {
    const directoryName = basename(profilePath, extname(profilePath))
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "");

    if (directoryName === "") {
        throw new Error("Profile filename must produce a non-empty person directory name");
    }

    return directoryName;
}

function resolvePersonPath(reference: string): string {
    if (reference.includes(sep) || reference.startsWith(".")) {
        return resolve(reference);
    }

    return resolve("people", reference);
}

//
// Installed Person
//

export type InstalledPerson = {
    path: string;
    profilePath: string;
    memoryPath: string;
    statePath: string;
    profile: ProfileConfig;
};

export async function touchPersonLastOpened(installed: InstalledPerson): Promise<void> {
    await patchPersonState(installed, {
        lastOpenedAt: new Date().toISOString()
    });
}

function createInstalledPerson(personPath: string, profile: ProfileConfig): InstalledPerson {
    return {
        path: personPath,
        profile,
        profilePath: resolve(personPath, "profile.json"),
        memoryPath: resolve(personPath, "memory.jsonl"),
        statePath: resolve(personPath, "state.json")
    };
}

async function writeInstalledPerson(installed: InstalledPerson, sourceProfilePath: string): Promise<InstalledPerson> {
    await copyFile(sourceProfilePath, installed.profilePath);
    await writeFile(installed.memoryPath, "", "utf8");
    await writePersonState(installed, {
        installedAt: new Date().toISOString(),
        installedFrom: sourceProfilePath
    });

    return installed;
}

async function writePersonState(installed: InstalledPerson, state: Record<string, string>): Promise<void> {
    await writeFile(installed.statePath, `${JSON.stringify(state, null, 4)}\n`, "utf8");
}

async function patchPersonState(installed: InstalledPerson, patch: Record<string, string>): Promise<void> {
    try {
        await writePersonState(installed, { ...JSON.parse(await readFile(installed.statePath, "utf8")), ...patch });
    } catch {
        await writePersonState(installed, patch);
    }
}
