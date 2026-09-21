import { makeMcpRoutes } from '../handler'

// Personal mount — yourbulletin.com/mcp/me (via rewrite). Tokenless requests
// get the 401 + WWW-Authenticate challenge that starts the OAuth flow.
export const { POST, GET, DELETE, OPTIONS } = makeMcpRoutes({ personal: true })
