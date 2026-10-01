import { ToolArgs } from "./types"

export function getManageFilesDescription(args: ToolArgs): string {
	return `## manage_files
Description: Request to perform file and folder management operations like moving, renaming, copying, deleting, and creating folders. This tool can execute multiple operations in a single call, making it efficient for organizing the vault structure.
IMPORTANT: manage_files never creates files with content and never modifies file contents - it only creates empty folders and moves, copies, renames or deletes existing items. For creating or editing file contents use write_to_file, insert_content or search_and_replace instead; if none of those tools is available to you, say that the requested change cannot be done rather than emulating it with manage_files. Operations whose action is not one of the supported ones are rejected, and a call left with no valid operation fails without changing anything.
Parameters:
- operations: (required) A JSON array of file management operations, written as bare JSON (no markdown code fences, no comments). Each operation is an object with:
    * action: (required) The type of operation. Exactly one of "move", "rename", "copy", "delete", "create_folder" - any other value is rejected.
    * ... and the fields of that action, using exactly the names below. An operation that is missing one of its required fields is rejected as well.

### Actions:

#### 1. Move
Moves a file or folder to another path, optionally into another folder.
- action: "move"
- source_path: (required) The current path of the file or folder.
- destination_path: (required) The new path of the file or folder, including its name. Must not exist yet.

#### 2. Rename
Renames a file or folder and keeps it in its current folder.
- action: "rename"
- path: (required) The current path of the file or folder.
- new_name: (required) The new name (not a full path). It may contain sub-folders, which are resolved relative to the item's current folder. The resulting path must not exist yet.

#### 3. Copy
Copies a file to a new path. Folders cannot be copied.
- action: "copy"
- source_path: (required) The path of the existing file.
- destination_path: (required) The path of the copy, including its name. Must not exist yet.

#### 4. Delete
Deletes a file or folder (moved to the trash, not erased).
- action: "delete"
- path: (required) The path of the file or folder to delete.

#### 5. Create Folder
Creates a new empty folder (creating a missing parent folder of a move/copy destination is done for you).
- action: "create_folder"
- path: (required) The path of the new folder.

### Rules for all actions:
- Paths are vault-relative and always use forward slashes ("Notes/Inbox/a.md"): never backslashes, never a leading "/", never "./".
- The result reports every operation separately - which ones succeeded and which ones failed (missing item, destination already taken, unsupported folder copy) - together with an overall success/partial/failed status. Read it before doing anything else: a failed operation changed nothing, while the successful ones in the same call are already applied and must not be repeated.

Usage:
<manage_files>
<operations>[
  {
    "action": "rename",
    "path": "Projects/Old Project.md",
    "new_name": "New Project.md"
  },
  {
    "action": "move",
    "source_path": "Projects/New Project.md",
    "destination_path": "Archive/2023/New Project.md"
  },
  {
    "action": "copy",
    "source_path": "Templates/Note.md",
    "destination_path": "Inbox/Note copy.md"
  },
  {
    "action": "create_folder",
    "path": "Projects/New Initiative/Assets"
  },
  {
    "action": "delete",
    "path": "Temporary/scratchpad.md"
  }
]</operations>
</manage_files>

Example: Reorganize a project directory
<manage_files>
<operations>[
  {
    "action": "create_folder",
    "path": "MyProject/media"
  },
  {
    "action": "move",
    "source_path": "MyProject/draft.md",
    "destination_path": "MyProject/archive/draft_v1.md"
  },
  {
    "action": "delete",
    "path": "MyProject/obsolete_notes.md"
  }
]</operations>
</manage_files>`
}
