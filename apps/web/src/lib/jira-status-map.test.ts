import { describe, expect, it } from "vitest";
import {
  jiraPriorityToTaskPriority,
  jiraStatusToTaskStatus,
} from "./jira-status-map";

describe("jiraStatusToTaskStatus", () => {
  it("maps done category", () => {
    expect(jiraStatusToTaskStatus("Done", "Done")).toBe("done");
  });

  it("maps in progress", () => {
    expect(jiraStatusToTaskStatus("In Progress", "In Progress")).toBe(
      "in_progress",
    );
  });
});

describe("jiraPriorityToTaskPriority", () => {
  it("maps highest to critical", () => {
    expect(jiraPriorityToTaskPriority("Highest")).toBe("critical");
  });
});
