import Foundation

// BulletinAPI — the same /api/extension/* surface the Chrome extension
// speaks, verbatim. Bearer-token auth; every call refreshes through Session
// first. Response shapes mirror the route handlers, decoded permissively.

enum API {
    struct Bullet: Decodable, Identifiable {
        let id: String
        let url: String
        let title: String?
        let image_url: String?
        let favicon_url: String?
        let created_at: String?
        // Server-rendered display fields (finds route): the web's
        // formatCardTitle voice and pickCardImage choice. Optional so the app
        // degrades to raw fields against an older deploy.
        let display_title: String?
        let display_image: String?

        var cardTitle: String { display_title ?? title ?? url }
        var cardImage: String? { display_image ?? image_url }
    }

    struct List: Decodable, Identifiable {
        let id: String
        let name: String
        let slug: String
    }

    struct ListsResponse: Decodable {
        let lists: [List]
        let member_of: [String]?
    }

    struct SavedBookmark: Decodable {
        let id: String
        let url: String?
        let title: String?
    }

    struct SaveResponse: Decodable {
        let bookmark: SavedBookmark
        let username: String?
        let refreshed: Bool?
    }

    struct SuggestResponse: Decodable {
        let name: String?
        let names: [String]?
    }

    struct CreateListResponse: Decodable {
        struct L: Decodable { let id: String; let name: String; let slug: String }
        let list: L
        let existed: Bool?
    }

    enum APIError: LocalizedError {
        case http(Int, String)
        case alreadySaved

        var errorDescription: String? {
            switch self {
            case .alreadySaved: return "Already in your bulletin."
            case .http(let code, let message): return message.isEmpty ? "Request failed (\(code))." : message
            }
        }
    }

    // MARK: - Plumbing

    private static func request(
        _ path: String,
        method: String = "GET",
        query: [URLQueryItem] = [],
        body: [String: Any]? = nil
    ) async throws -> Data {
        let token = try await Session.shared.freshAccessToken()
        var url = Config.siteURL.appendingPathComponent(path)
        if !query.isEmpty { url = url.appending(queryItems: query) }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            struct Err: Decodable { let error: String?; let alreadySaved: Bool? }
            let parsed = try? JSONDecoder().decode(Err.self, from: data)
            if parsed?.alreadySaved == true { throw APIError.alreadySaved }
            throw APIError.http(status, parsed?.error ?? "")
        }
        return data
    }

    // MARK: - Endpoints

    @discardableResult
    static func save(url: String, title: String? = nil) async throws -> SaveResponse {
        var body: [String: Any] = ["url": url]
        if let title, !title.isEmpty { body["title"] = title }
        let data = try await request("api/extension/save", method: "POST", body: body)
        let saved = try JSONDecoder().decode(SaveResponse.self, from: data)
        Session.shared.noteUsername(saved.username)
        return saved
    }

    static func lists(bookmarkId: String? = nil) async throws -> ListsResponse {
        var query: [URLQueryItem] = []
        if let bookmarkId { query.append(.init(name: "bookmark_id", value: bookmarkId)) }
        let data = try await request("api/extension/lists", query: query)
        return try JSONDecoder().decode(ListsResponse.self, from: data)
    }

    static func addToList(listId: String, bookmarkId: String) async throws {
        _ = try await request("api/extension/lists", method: "POST",
                              body: ["op": "add", "list_id": listId, "bookmark_id": bookmarkId])
    }

    static func removeFromList(listId: String, bookmarkId: String) async throws {
        _ = try await request("api/extension/lists", method: "POST",
                              body: ["op": "remove", "list_id": listId, "bookmark_id": bookmarkId])
    }

    @discardableResult
    static func createList(named name: String, bookmarkId: String?) async throws -> CreateListResponse {
        var body: [String: Any] = ["op": "create", "name": name]
        if let bookmarkId { body["bookmark_id"] = bookmarkId }
        let data = try await request("api/extension/lists", method: "POST", body: body)
        return try JSONDecoder().decode(CreateListResponse.self, from: data)
    }

    static func suggestListName(bookmarkId: String) async throws -> SuggestResponse {
        let data = try await request("api/extension/suggest-list-name", method: "POST",
                                     body: ["bookmark_id": bookmarkId])
        return try JSONDecoder().decode(SuggestResponse.self, from: data)
    }

    struct FindsPage: Decodable {
        let finds: [Bullet]
        let total: Int
        let username: String?
    }

    static func finds(limit: Int = 30) async throws -> FindsPage {
        let data = try await request("api/extension/finds",
                                     query: [.init(name: "limit", value: String(limit))])
        let page = try JSONDecoder().decode(FindsPage.self, from: data)
        Session.shared.noteUsername(page.username)
        return page
    }
}
