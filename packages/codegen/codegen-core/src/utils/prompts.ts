/*
 * Copyright 2025 Palantir Technologies, Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { checkbox, confirm, input, number, password, select } from "@inquirer/prompts";
import type { PromptQuestion } from "../types/index.js";

interface Choice {
  readonly name: string;
  readonly value: unknown;
}

function normalizeChoices(choices: PromptQuestion["choices"]): Choice[] {
  return (choices ?? []).map(choice =>
    typeof choice === "string"
      ? { name: choice, value: choice }
      : { name: choice.name, value: choice.value }
  );
}

async function askQuestion(
  question: PromptQuestion,
  answers: Record<string, unknown>,
): Promise<unknown> {
  switch (question.type) {
    case "input":
      return input({
        message: question.message,
        default: question.default as string | undefined,
        validate: question.validate,
      });
    case "number":
      return number({
        message: question.message,
        default: question.default as number | undefined,
        validate: question.validate,
      });
    case "confirm":
      return confirm({
        message: question.message,
        default: question.default as boolean | undefined,
      });
    case "select":
      return select({
        message: question.message,
        choices: normalizeChoices(question.choices),
        default: question.default,
      });
    case "checkbox":
      return checkbox({
        message: question.message,
        choices: normalizeChoices(question.choices),
      });
    case "password":
      return password({
        message: question.message,
        validate: question.validate,
      });
  }
}

export async function promptUser(
  questions: PromptQuestion[],
): Promise<Record<string, unknown>> {
  const answers: Record<string, unknown> = {};
  for (const question of questions) {
    if (question.when && !question.when(answers)) {
      continue;
    }
    answers[question.name] = await askQuestion(question, answers);
  }
  return answers;
}
