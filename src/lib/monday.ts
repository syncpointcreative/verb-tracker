/**
 * Monday.com GraphQL API helper for Eleven Signal content calendar integration.
 *
 * Items are created in the client's board, in the current-month group,
 * and assigned to Libby Ragole.
 *
 * Env var required:
 *   MONDAY_API_TOKEN  — personal API token from the Eleven Signal Monday account
 */

const MONDAY_API_URL = 'https://api.monday.com/v2'

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
]

export function currentMonthGroupTitle(): string {
  const now = new Date()
  return `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`
}

// ── Core GraphQL helper ───────────────────────────────────────────────────────

export async function mondayQuery<T = unknown>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const token = process.env.MONDAY_API_TOKEN
  if (!token) throw new Error('MONDAY_API_TOKEN is not set')

  const res = await fetch(MONDAY_API_URL, {
    method:  'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token,
      'API-Version':   '2024-10',
    },
    body: JSON.stringify({ query, variables }),
  })

  const json = await res.json() as { data?: T; errors?: Array<{ message: string }> }
  if (json.errors?.length) throw new Error(json.errors[0].message)
  if (!json.data) throw new Error('Empty response from Monday.com API')
  return json.data
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MondayBoard {
  id:      string
  name:    string
  groups:  Array<{ id: string; title: string }>
  columns: Array<{ id: string; title: string; type: string }>
}

export interface MondayUser {
  id:    string
  name:  string
  email: string
}

// ── Board helpers ─────────────────────────────────────────────────────────────

/** Fetch all boards (up to 200). Used for discovery and mapping. */
export async function listBoards(): Promise<MondayBoard[]> {
  const data = await mondayQuery<{ boards: MondayBoard[] }>(`
    query {
      boards(limit: 200, board_kind: public) {
        id name
        groups { id title }
        columns { id title type }
      }
    }
  `)
  return data.boards
}

/** Find a board whose name contains the search string (case-insensitive). */
export async function findBoardByName(search: string): Promise<MondayBoard | null> {
  const boards = await listBoards()
  const lower  = search.toLowerCase()
  return boards.find(b => b.name.toLowerCase().includes(lower)) ?? null
}

// ── Group helpers ─────────────────────────────────────────────────────────────

/**
 * Find the current-month group on a board (e.g. "MAY 2026").
 * Creates the group if it doesn't exist yet.
 */
export async function findOrCreateMonthGroup(boardId: string): Promise<string> {
  const title = currentMonthGroupTitle()

  // Re-fetch just this board's groups to get the freshest list
  const data = await mondayQuery<{ boards: Array<{ groups: Array<{ id: string; title: string }> }> }>(`
    query($id: [ID!]) {
      boards(ids: $id) { groups { id title } }
    }
  `, { id: [boardId] })

  const existing = data.boards[0]?.groups.find(g => g.title === title)
  if (existing) return existing.id

  const created = await mondayQuery<{ create_group: { id: string } }>(`
    mutation($boardId: ID!, $groupName: String!) {
      create_group(board_id: $boardId, group_name: $groupName) { id }
    }
  `, { boardId, groupName: title })

  return created.create_group.id
}

// ── User helpers ──────────────────────────────────────────────────────────────

export async function listUsers(): Promise<MondayUser[]> {
  const data = await mondayQuery<{ users: MondayUser[] }>(`
    query { users(limit: 200) { id name email } }
  `)
  return data.users
}

export async function findUserByName(name: string): Promise<MondayUser | null> {
  const users = await listUsers()
  const lower = name.toLowerCase()
  return users.find(u => u.name.toLowerCase().includes(lower)) ?? null
}

// ── Item creation ─────────────────────────────────────────────────────────────

export interface CreateContentItemParams {
  boardId:       string
  groupId:       string
  itemName:      string
  /** Monday user ID (numeric string) to assign the item to, if known */
  assigneeId?:   string
  /** Column ID of the "people" column on this board */
  peopleColId?:  string
}

export async function createContentItem(params: CreateContentItemParams): Promise<string> {
  const columnValues: Record<string, unknown> = {}

  if (params.assigneeId && params.peopleColId) {
    columnValues[params.peopleColId] = {
      personsAndTeams: [{ id: Number(params.assigneeId), kind: 'person' }],
    }
  }

  const data = await mondayQuery<{ create_item: { id: string; name: string } }>(`
    mutation($boardId: ID!, $groupId: String!, $itemName: String!, $cv: JSON!) {
      create_item(
        board_id:      $boardId
        group_id:      $groupId
        item_name:     $itemName
        column_values: $cv
      ) { id name }
    }
  `, {
    boardId:  params.boardId,
    groupId:  params.groupId,
    itemName: params.itemName,
    cv:       JSON.stringify(columnValues),
  })

  return data.create_item.id
}
