import { makeMcpRoutes } from './handler'

// Public mount — yourbulletin.com/mcp (via rewrite). Anonymous, never 401s.
export const { POST, GET, DELETE, OPTIONS } = makeMcpRoutes({ personal: false })
