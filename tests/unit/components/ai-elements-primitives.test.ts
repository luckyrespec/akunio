import { describe, it, expect } from "vitest";
import * as React from "react";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import {
  Queue,
  QueueSection,
  QueueSectionLabel,
  QueueSectionContent,
  QueueList,
  QueueItem,
  QueueItemIndicator,
  QueueItemContent,
  QueueItemDescription,
} from "@/components/ai-elements/queue";

describe("AI Elements UI Primitives", () => {
  it("creates Suggestion React element properly", () => {
    const el = React.createElement(Suggestion, {
      suggestion: "Beban Operasional",
      onClick: () => {},
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.suggestion).toBe("Beban Operasional");
  });

  it("creates Suggestions container React element", () => {
    const el = React.createElement(
      Suggestions,
      null,
      React.createElement(Suggestion, { suggestion: "Prive" })
    );
    expect(React.isValidElement(el)).toBe(true);
  });

  it("creates Queue and QueueSection React elements", () => {
    const el = React.createElement(
      Queue,
      null,
      React.createElement(
        QueueSection,
        { defaultOpen: true },
        React.createElement(QueueSectionLabel, { label: "Dokumen", count: 2 }),
        React.createElement(
          QueueSectionContent,
          null,
          React.createElement(
            QueueList,
            null,
            React.createElement(
              QueueItem,
              null,
              React.createElement(QueueItemIndicator, { completed: true }),
              React.createElement(
                QueueItemContent,
                null,
                React.createElement("span", null, "Alfamart"),
                React.createElement(QueueItemDescription, null, "Rp 106.005")
              )
            )
          )
        )
      )
    );
    expect(React.isValidElement(el)).toBe(true);
  });
});
