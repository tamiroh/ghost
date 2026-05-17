import { resolveHuggingFaceModel, type HuggingFaceModelSource } from "./hugging-face.ts";

export type ModelSource = HuggingFaceModelSource;

export async function resolveModelSource(model: ModelSource): Promise<string> {
    switch (model.provider) {
        case "huggingface":
            return resolveHuggingFaceModel(model);
    }
}
