export interface ProjectContentRoot {
  id: string
  label: string
  path: string
}

export interface ProjectConfig {
  version: 1
  contentRoots: ProjectContentRoot[]
  defaultDocument?: string
  fileFilter?: {
    include: string[]
    exclude: string[]
  }
  workspace?: {
    showOutlineByDefault: boolean
    showFileTreeByDefault: boolean
  }
}
