interface TransformerContext {
  answers: Record<string, unknown>;
  projectName: string;
  outputPath: string;
  options: Record<string, unknown>;
}

export default function transformer(
  schema: unknown,
  context: TransformerContext,
): unknown {
  const { answers } = context;

  return {
    ...(typeof schema === "object" && schema !== null ? schema : {}),
    schemaDir: answers.schemaDir || "schema",
  };
}
