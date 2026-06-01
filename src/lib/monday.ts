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

/** Find a board whose name contains the search string (case-insensitive).
 *  Skips "Subitems of …" boards that Monday auto-creates alongside main boards. */
export async function findBoardByName(search: string): Promise<MondayBoard | null> {
  const boards = await listBoards()
  const lower  = search.toLowerCase()
  return boards.find(b =>
    !b.name.toLowerCase().startsWith('subitems of') &&
    b.name.toLowerCase().includes(lower)
  ) ?? null
}

// ── Group helpers ─────────────────────────────────────────────────────────────

const INCOMING_GROUP_NAME = '📥 Incoming Assets'

/**
 * Find or create the "📥 Incoming Assets" group on a board.
 *
 * New assets land here because go-live month isn't known at submission time
 * (assets are typically created 1-2 months before use). The team drags items
 * to the appropriate month group when scheduling.
 */
export async function findOrCreateIncomingGroup(boardId: string): Promise<string> {
  const data = await mondayQuery<{ boards: Array<{ groups: Array<{ id: string; title: string }> }> }>(`
    query($id: [ID!]) {
      boards(ids: $id) { groups { id title } }
    }
  `, { id: [boardId] })

  const existing = data.boards[0]?.groups.find(g => g.title === INCOMING_GROUP_NAME)
  if (existing) return existing.id

  const created = await mondayQuery<{ create_group: { id: string } }>(`
    mutation($boardId: ID!, $groupName: String!) {
      create_group(board_id: $boardId, group_name: $groupName) { id }
    }
  `, { boardId, groupName: INCOMING_GROUP_NAME })

  return created.create_group.id
}

/**
 * Find the month-named group on a board (e.g. "MAY 2026").
 * Creates it if it doesn't exist yet. Used for future use when date_live is known.
 */
export async function findOrCreateMonthGroup(boardId: string): Promise<string> {
  const title = currentMonthGroupTitle()

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
  /** Monday user ID (numeric string) to assign the item to */
  assigneeId?:   string
  /** Column ID of the "people" column on this board */
  peopleColId?:  string
  /** URL to link (e.g. Slack message URL) */
  linkUrl?:      string
  /** Display text for the link */
  linkText?:     string
  /** Column ID of the "link" column on this board */
  linkColId?:    string
}

export async function createContentItem(params: CreateContentItemParams): Promise<string> {
  const columnValues: Record<string, unknown> = {}

  if (params.assigneeId && params.peopleColId) {
    columnValues[params.peopleColId] = {
      personsAndTeams: [{ id: Number(params.assigneeId), kind: 'person' }],
    }
  }

  if (params.linkUrl && params.linkColId) {
    columnValues[params.linkColId] = {
      url:  params.linkUrl,
      text: params.linkText ?? params.linkUrl,
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

// ── Item updates ──────────────────────────────────────────────────────────────

/**
 * Update the link column on an existing Monday item.
 * Called after the Drive upload cron finishes so the Monday item's link
 * switches from the Slack message URL to the permanent Google Drive URL.
 */
export async function updateItemLinkColumn(
  boardId:  string,
  itemId:   string,
  colId:    string,
  url:      string,
  text:     string,
): Promise<void> {
  const cv = JSON.stringify({ [colId]: { url, text } })

  await mondayQuery<{ change_multiple_column_values: { id: string } }>(`
    mutation($boardId: ID!, $itemId: ID!, $cv: JSON!) {
      change_multiple_column_values(
        board_id:      $boardId
        item_id:       $itemId
        column_values: $cv
      ) { id }
    }
  `, { boardId, itemId, cv })
}
