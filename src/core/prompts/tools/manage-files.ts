import { ToolArgs } from "./types"

export function getManageFilesDescription(args: ToolArgs): string {
	return `## manage_files
Description: Request to perform file and folder management operations like moving, renaming, deleting, and creating folders. This tool can execute multiple operations in a single call, making it efficient for organizing the vault structure.
IMPORTANT: manage_files never creates files with content and never modifies file contents - it only creates empty folders and moves, copies, renames or deletes existing items. For creating or editing file contents use write_to_file, insert_content or search_and_replace instead; if none of those tools is available to you, say that the requested change cannot be done rather than emulating it with manage_files. Operations whose action is not one of the supported ones are rejected, and a call left with no valid operation fails without changing anything.
Parameters:
- operations: (required) A JSON array of file management operations. Each operation is an object with:
    * action: (required) The type of operation. Can be "move", "delete", or "create_folder".
    * ... and other parameters based on the action.

### Actions:

#### 1. Move / Rename
Moves or renames a file or folder.
- action: "move"
- source_path: (required) The current path of the file or folder.
- destination_path: (required) The new path for the file or folder.

#### 2. Delete
Deletes a file or folder.
- action: "delete"
- path: (required) The path of the file or folder to delete.

#### 3. Create Folder
Creates a new folder.
- action: "create_folder"
- path: (required) The path where the new folder should be created.

Usage:
<manage_files>
<operations>[
  {
    "action": "move",
    "source_path": "Projects/Old Project.md",
    "destination_path": "Archive/2023/Archived Project.md"
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
    "action": "move",
    "source_path": "MyProject/draft.md",
    "destination_path": "MyProject/archive/draft_v1.md"
  },
  {
    "action": "create_folder",
    "path": "MyProject/media"
  },
  {
    "action": "delete",
    "path": "MyProject/obsolete_notes.md"
  }
]</operations>
</manage_files>`
} 
