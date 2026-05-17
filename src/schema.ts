export function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export type Schema<T> = {
    parse(value: unknown, field: string): T;
};

export const stringSchema: Schema<string> = {
    parse(value, field) {
        return requiredString(value, field);
    }
};

export const integerSchema: Schema<number> = {
    parse(value, field) {
        return requiredInteger(value, field);
    }
};

export const numberSchema: Schema<number> = {
    parse(value, field) {
        const parsed = optionalNumber(value, field);
        if (parsed == null) {
            throw new Error(`${field} must be a finite number`);
        }

        return parsed;
    }
};

export function literalSchema<const T extends string | number | boolean | null>(literal: T): Schema<T> {
    return {
        parse(value, field) {
            if (value !== literal) {
                throw new Error(`${field} must be ${JSON.stringify(literal)}`);
            }

            return literal;
        }
    };
}

export function optionalSchema<T>(schema: Schema<T>): Schema<T | undefined> {
    return {
        parse(value, field) {
            if (value == null) {
                return undefined;
            }

            return schema.parse(value, field);
        }
    };
}

export function nullableSchema<T>(schema: Schema<T>): Schema<T | null> {
    return {
        parse(value, field) {
            if (value === null) {
                return null;
            }

            return schema.parse(value, field);
        }
    };
}

export function objectSchema<const Shape extends Record<string, Schema<unknown>>>(
    shape: Shape
): Schema<{ [Key in keyof Shape]: InferSchema<Shape[Key]> }> {
    return {
        parse(value, field) {
            if (!isRecord(value)) {
                throw new Error(`${field} must be a JSON object`);
            }

            const parsed: Record<string, unknown> = {};
            for (const key of Object.keys(shape) as Array<keyof Shape>) {
                const property = shape[key];
                parsed[String(key)] = property.parse(value[key as string], field === "" ? String(key) : `${field}.${String(key)}`);
            }

            return parsed as { [Key in keyof Shape]: InferSchema<Shape[Key]> };
        }
    };
}

export function discriminatedUnionSchema<
    const Discriminator extends string,
    const Options extends Record<string, Schema<unknown>>
>(
    discriminator: Discriminator,
    options: Options
): Schema<InferSchema<Options[keyof Options]>> {
    return {
        parse(value, field) {
            if (!isRecord(value)) {
                throw new Error(`${field} must be a JSON object`);
            }

            const discriminatorValue = value[discriminator];
            if (typeof discriminatorValue !== "string") {
                throw new Error(`${field}.${discriminator} must be a string`);
            }

            const schema = options[discriminatorValue];
            if (schema == null) {
                throw new Error(`${field}.${discriminator} has unsupported value: ${discriminatorValue}`);
            }

            return schema.parse(value, field) as InferSchema<Options[keyof Options]>;
        }
    };
}

export type InferSchema<T> = T extends Schema<infer Value> ? Value : never;

export function requiredString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`${field} must be a non-empty string`);
    }

    return value;
}

export function optionalString(value: unknown, field: string): string | undefined {
    if (value == null) {
        return undefined;
    }

    if (typeof value !== "string") {
        throw new Error(`${field} must be a string`);
    }

    return value;
}

export function optionalNullableString(value: unknown, field: string): string | null | undefined {
    if (value === null) {
        return null;
    }

    return optionalString(value, field);
}

export function optionalNumber(value: unknown, field: string): number | undefined {
    if (value == null) {
        return undefined;
    }

    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${field} must be a finite number`);
    }

    return value;
}

export function requiredInteger(value: unknown, field: string): number {
    const parsed = optionalInteger(value, field);
    if (parsed == null) {
        throw new Error(`${field} must be an integer`);
    }

    return parsed;
}

export function optionalInteger(value: unknown, field: string): number | undefined {
    const parsed = optionalNumber(value, field);
    if (parsed == null) {
        return undefined;
    }

    if (!Number.isInteger(parsed)) {
        throw new Error(`${field} must be an integer`);
    }

    return parsed;
}
