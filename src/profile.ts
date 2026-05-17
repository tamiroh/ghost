import { readFile } from "node:fs/promises";
import {
    integerSchema,
    discriminatedUnionSchema,
    literalSchema,
    nullableSchema,
    numberSchema,
    objectSchema,
    optionalSchema,
    stringSchema,
    type InferSchema
} from "./schema.ts";

const profileConfig = objectSchema({
    schemaVersion: literalSchema(1),
    name: optionalSchema(stringSchema),
    model: discriminatedUnionSchema("provider", {
        huggingface: objectSchema({
            provider: literalSchema("huggingface"),
            repo: stringSchema,
            filename: stringSchema,
            revision: optionalSchema(stringSchema),
            sha256: optionalSchema(nullableSchema(stringSchema)),
            localPath: optionalSchema(stringSchema)
        })
    }),
    system: stringSchema,
    sampling: optionalSchema(objectSchema({
        temperature: optionalSchema(numberSchema),
        topK: optionalSchema(integerSchema),
        topP: optionalSchema(numberSchema)
    }))
});

export type ProfileConfig = InferSchema<typeof profileConfig>;

export async function loadProfile(path: string): Promise<ProfileConfig> {
    const source = await readFile(path, "utf8");
    let parsed: unknown;

    try {
        parsed = JSON.parse(source);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid profile JSON: ${message}`);
    }

    return profileConfig.parse(parsed, "profile");
}
