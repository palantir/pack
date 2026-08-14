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

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BaseErrorToast } from "../errorToast/BaseErrorToast.js";

describe("BaseErrorToast", () => {
  it("renders title, detail, and a labelled footer", () => {
    const { container } = render(
      <BaseErrorToast
        code="internalError"
        correlationId="abc-123"
        detail="A server error occurred."
        title="data channel error"
      />,
    );

    expect(container.textContent).toContain("data channel error");
    expect(container.textContent).toContain("A server error occurred.");
    expect(container.textContent).toContain("internalError · Error instance ID: abc-123");
  });

  it("lets the correlation id label be overridden", () => {
    const { container } = render(
      <BaseErrorToast
        correlationId="abc-123"
        correlationIdLabel="Support reference"
        detail="d"
        title="t"
      />,
    );

    expect(container.textContent).toContain("Support reference: abc-123");
  });

  it("omits the separator when only a code is given", () => {
    const { container } = render(
      <BaseErrorToast code="internalError" detail="d" title="t" />,
    );

    expect(container.textContent).toContain("internalError");
    expect(container.textContent).not.toContain("·");
  });

  it("omits the footer entirely when neither code nor correlation id is given", () => {
    const { container } = render(<BaseErrorToast detail="d" title="t" />);

    // Title and detail only.
    expect(container.querySelectorAll("span")).toHaveLength(2);
  });
});
