import { SwaggerDefinition } from "@ng-openapi/shared";
import {
    IndexSignatureDeclarationStructure,
    InterfaceDeclarationStructure,
    OptionalKind,
    PropertySignatureStructure,
    StructureKind,
} from "ts-morph";
import { TypeResolver } from "./type-resolver";

/** Builds interface structures (properties + index signatures) for object definitions. */
export class InterfaceBuilder {
    private readonly resolver: TypeResolver;

    constructor(resolver: TypeResolver) {
        this.resolver = resolver;
    }

    build(name: string, definition: SwaggerDefinition): InterfaceDeclarationStructure {
        return {
            kind: StructureKind.Interface,
            name,
            isExported: true,
            docs: definition.description ? [definition.description] : undefined,
            properties: this.buildProperties(definition),
            indexSignatures: this.buildIndexSignatures(definition),
        };
    }

    buildProperties(definition: SwaggerDefinition): OptionalKind<PropertySignatureStructure>[] {
        if (!definition.properties) {
            return [];
        }

        return Object.entries(definition.properties).map(([propertyName, property]) => {
            const isRequired = definition.required?.includes(propertyName) ?? false;
            const isReadOnly = property.readOnly;
            const propertyType = this.resolver.resolve(property);
            const sanitizedName = this.resolver.sanitizeName(propertyName);

            return {
                name: sanitizedName,
                type: propertyType,
                isReadonly: isReadOnly,
                hasQuestionToken: !isRequired,
                docs: property.description ? [property.description] : undefined,
            };
        });
    }

    buildIndexSignatures(definition: SwaggerDefinition): OptionalKind<IndexSignatureDeclarationStructure>[] {
        if (!definition.properties && definition.additionalProperties === false) {
            return [
                {
                    keyName: "key",
                    keyType: "string",
                    returnType: "never",
                },
            ];
        }

        if (!definition.properties && definition.additionalProperties === true) {
            return [
                {
                    keyName: "key",
                    keyType: "string",
                    returnType: "any",
                },
            ];
        }

        if (!definition.properties) {
            return [
                {
                    keyName: "key",
                    keyType: "string",
                    returnType: "unknown",
                },
            ];
        }

        return [];
    }
}
