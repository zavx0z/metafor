import {describe, expect, test} from "bun:test"
import {
  shouldRevealWorkspaceForSourceOpen,
  workspaceDirectoryIds,
  workspaceFileIdForSourcePath,
  workspaceFileIdForSources,
  workspaceFileRevealState,
  workspaceFilesContextSnapshot,
  workspaceFileTree,
} from "./workspace-files.ts"

describe("interpreter workspace files", () => {
  test("builds a sorted workspace tree and directory id list", () => {
    const items = workspaceFileTree([
      "github/",
      "src/view/main.ts",
      "README.md",
      "src/model.ts",
      "./src/view/pane.ts",
      "../outside.ts",
    ])

    expect(items.map((item) => item.id)).toEqual(["github", "src", "README.md"])
    expect(workspaceDirectoryIds(items)).toEqual(["github", "src", "src/view"])
  })

  test("marks requested file ids as muted", () => {
    const items = workspaceFileTree(["src/view/main.ts", "README.md"], {
      mutedFileIds: ["src/view/main.ts"],
    })

    expect(items[0]?.children?.[0]?.children?.[0]?.muted).toBe(true)
    expect(items[1]?.muted).toBeUndefined()
  })

  test("resolves source URLs to workspace file ids", () => {
    const items = workspaceFileTree(["src/view/main.ts", "README.md"])
    const state = {
      root: "/Users/me/project",
      workspacePath: "/Users/me/project",
      items,
    }

    expect(workspaceFileIdForSources(state, ["file:///Users/me/project/src/view/main.ts:12"])).toBe("src/view/main.ts")
    expect(workspaceFileIdForSources(state, ["r/src/view/main.ts"])).toBe("src/view/main.ts")
  })

  test("derives missing workspace file ids from opened local sources", () => {
    const state = {
      root: "/Users/me/project",
      workspacePath: "/Users/me/project",
      items: [],
    }

    expect(workspaceFileIdForSourcePath(state, "/Users/me/project/src/view/missing.ts:12")).toBe("src/view/missing.ts")
    expect(workspaceFileIdForSourcePath(state, "file:///Users/me/project/src/view/missing.ts")).toBe("src/view/missing.ts")
    expect(workspaceFileIdForSourcePath(state, "r/src/view/missing.ts")).toBe("src/view/missing.ts")
    expect(workspaceFileIdForSourcePath(state, "/Users/me/other/missing.ts")).toBeNull()
    expect(workspaceFileIdForSourcePath(state, "../outside.ts")).toBeNull()
    expect(workspaceFileIdForSourcePath(state, "https://example.com/src/view/missing.ts")).toBeNull()
  })

  test("strips workspace path prefixes from opened sources", () => {
    const state = {
      root: "/Users/me/project/app/web",
      workspacePath: "app/web",
      items: [],
    }

    expect(workspaceFileIdForSourcePath(state, "/Users/me/project/app/web/src/client.ts")).toBe("src/client.ts")
    expect(workspaceFileIdForSourcePath(state, "app/web/src/client.ts")).toBe("src/client.ts")
    expect(workspaceFileIdForSourcePath(state, "src/client.ts")).toBe("src/client.ts")
  })

  test("manual reveal expands parents and selects the resolved file", () => {
    const items = workspaceFileTree(["src/view/main.ts", "README.md"])
    const reveal = workspaceFileRevealState({
      root: "/Users/me/project",
      workspacePath: "/Users/me/project",
      items,
      expandedIds: ["src"],
    }, ["/Users/me/project/src/view/main.ts:12"])

    expect(reveal).toEqual({
      expandedIds: ["src", "src/view"],
      selectedIds: ["src/view/main.ts"],
    })
  })

  test("source open reveal is explicit", () => {
    expect(shouldRevealWorkspaceForSourceOpen({})).toBe(false)
    expect(shouldRevealWorkspaceForSourceOpen({revealInWorkspace: false})).toBe(false)
    expect(shouldRevealWorkspaceForSourceOpen({revealInWorkspace: true})).toBe(true)
  })

  test("exposes a compact context snapshot for selected workspace files", () => {
    const items = workspaceFileTree(["src/view/main.ts", "README.md"])
    const context = workspaceFilesContextSnapshot({
      root: "/Users/me/project",
      workspacePath: "/Users/me/project",
      modulePath: "src/view/main.ts",
      rootLabel: "project",
      items,
      selectedIds: ["README.md", "src/view/main.ts"],
    })

    expect(context.selectedIds).toEqual(["README.md", "src/view/main.ts"])
    expect(context.selectedItems.map((item) => [item.kind, item.path, item.sourceUrl])).toEqual([
      ["file", "README.md", "/Users/me/project/README.md"],
      ["file", "src/view/main.ts", "/Users/me/project/src/view/main.ts"],
    ])
    expect(context.selectedFiles.map((item) => item.path)).toEqual(["README.md", "src/view/main.ts"])
  })
})
