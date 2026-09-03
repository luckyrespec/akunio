import { describe, it, expect, vi } from "vitest";
import * as React from "react";
import { Suggestions, Suggestion } from "@/components/ai-elements/suggestion";

describe("Assistant Widget Dynamic Suggestions Integration", () => {
  it("creates suggestions row for assistant responses", () => {
    const handleAction = vi.fn();
    const el = React.createElement(
      Suggestions,
      null,
      React.createElement(Suggestion, {
        suggestion: "Beban Operasional",
        onClick: handleAction,
      }),
      React.createElement(Suggestion, {
        suggestion: "Konsumsi Pribadi (Prive)",
        onClick: handleAction,
      })
    );

    expect(React.isValidElement(el)).toBe(true);
    expect(React.Children.count(el.props.children)).toBe(2);
  });
});
