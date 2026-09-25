import Foundation
import AuthenticationServices

// Session — Supabase auth for a native client, mirroring the Chrome
// extension's implicit flow (the pattern that already survived the
// chromiumapp redirect-URL gotcha): open the hosted Google flow, catch the
// tokens on a custom-scheme redirect, refresh with the refresh token.
//
// Tokens live in the shared Keychain (KeychainStore, App Group as the
// access group) so the share extension can save without its own sign-in.
// Sessions written by pre-Keychain builds migrate from App Group
// UserDefaults on first load, then the plaintext copy is destroyed.

struct StoredSession: Codable {
    var accessToken: String
    var refreshToken: String
    var expiresAt: Date
    var email: String?
    var username: String?
    /// True when the account exists but has no Bulletin yet (signed up here,
    /// never claimed a handle). Optional so sessions stored by older builds
    /// still decode; nil reads as set up.
    var needsSetup: Bool?
}

final class Session: NSObject, ObservableObject {
    static let shared = Session()

    @Published private(set) var current: StoredSession?
    /// True while a fresh sign-in is learning whether the account has a page.
    /// The tokens land first, so without this RootView flashes Home before
    /// swapping to setup.
    @Published private(set) var resolving = false

    private let defaults = UserDefaults(suiteName: Config.appGroup)!
    private let storageKey = "bulletin.session.v1"
    private var webAuth: ASWebAuthenticationSession?

    override private init() {
        super.init()
        load()
    }

    var isSignedIn: Bool { current != nil }

    /// Re-read the session from the shared container. The share extension
    /// calls this on every invocation: iOS keeps the extension process alive
    /// between shares, so a singleton loaded before the user signed in (or
    /// out) in the main app would otherwise serve that stale state forever.
    func reloadFromDisk() { load() }

    private func load() {
        if let data = KeychainStore.data(forKey: storageKey),
           let session = try? JSONDecoder().decode(StoredSession.self, from: data) {
            current = session
            return
        }
        // Pre-Keychain builds kept the session in App Group UserDefaults —
        // migrate it once and destroy the plaintext copy. (Fresh suite
        // instance: cfprefsd can serve a stale cache cross-process.)
        let defaults = UserDefaults(suiteName: Config.appGroup) ?? self.defaults
        if let data = defaults.data(forKey: storageKey),
           let session = try? JSONDecoder().decode(StoredSession.self, from: data) {
            KeychainStore.set(data, forKey: storageKey)
            defaults.removeObject(forKey: storageKey)
            current = session
        } else {
            current = nil
        }
    }

    private func persist(_ session: StoredSession?) {
        if let session, let data = try? JSONEncoder().encode(session) {
            KeychainStore.set(data, forKey: storageKey)
        } else {
            KeychainStore.remove(forKey: storageKey)
        }
        current = session
    }

    func signOut() { persist(nil) }

    // MARK: - Sign-in (Google via Supabase hosted flow)

    @MainActor
    func signInWithGoogle() async throws {
        // Opened via our own domain, not Supabase's: the system's "wants to
        // use … to sign in" prompt names the host of this first URL. The
        // route bounces straight to Supabase's authorize endpoint.
        var components = URLComponents(
            url: Config.siteURL.appendingPathComponent("api/auth/ios"),
            resolvingAgainstBaseURL: false
        )!
        components.queryItems = [
            .init(name: "provider", value: "google"),
            .init(name: "redirect_to", value: Config.authRedirect),
        ]

        let callbackURL: URL = try await withCheckedThrowingContinuation { continuation in
            let auth = ASWebAuthenticationSession(
                url: components.url!,
                callbackURLScheme: Config.authCallbackScheme
            ) { url, error in
                if let url { continuation.resume(returning: url) }
                else { continuation.resume(throwing: error ?? SessionError.cancelled) }
            }
            auth.presentationContextProvider = self
            auth.prefersEphemeralWebBrowserSession = false
            self.webAuth = auth
            auth.start()
        }

        // Tokens ride the fragment: bulletin://auth-callback#access_token=…
        guard let fragment = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?.fragment else {
            throw SessionError.badCallback
        }
        var params: [String: String] = [:]
        for pair in fragment.split(separator: "&") {
            let kv = pair.split(separator: "=", maxSplits: 1)
            guard kv.count == 2 else { continue }
            params[String(kv[0])] = String(kv[1]).removingPercentEncoding
        }
        guard let access = params["access_token"], let refresh = params["refresh_token"] else {
            // A refused Google sign-in comes back with an error instead of
            // tokens; surface GoTrue's description.
            if let desc = params["error_description"]?.replacingOccurrences(of: "+", with: " ") {
                throw SessionError.server(desc)
            }
            throw SessionError.badCallback
        }
        let expiresIn = Double(params["expires_in"] ?? "3600") ?? 3600
        try await adopt(access: access, refresh: refresh, expiresIn: expiresIn)
    }

    // MARK: - Emailed code (the Chrome extension's email lane, ported)

    /// Ask GoTrue to email a one-time sign-in code. create_user true: signups
    /// are open, so a new address gets an account and lands on onboarding,
    /// like Apple and Google do.
    func requestEmailCode(email: String) async throws {
        var request = URLRequest(url: Config.supabaseURL.appendingPathComponent("auth/v1/otp"))
        request.httpMethod = "POST"
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "create_user": true])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            struct E: Decodable { let msg: String?; let error_description: String? }
            let raw = (try? JSONDecoder().decode(E.self, from: data)).flatMap { $0.error_description ?? $0.msg } ?? ""
            if raw.range(of: "security purposes|rate", options: [.regularExpression, .caseInsensitive]) != nil {
                throw SessionError.server("Please wait a moment before asking for another code.")
            }
            throw SessionError.server(raw.isEmpty ? "Couldn't send the code. Try again." : raw)
        }
    }

    /// Exchange the emailed code for a session.
    @MainActor
    func verifyEmailCode(email: String, code: String) async throws {
        var request = URLRequest(url: Config.supabaseURL.appendingPathComponent("auth/v1/verify"))
        request.httpMethod = "POST"
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["type": "email", "email": email, "token": code])
        let (data, response) = try await URLSession.shared.data(for: request)
        struct Grant: Decodable { let access_token: String?; let refresh_token: String?; let expires_in: Double? }
        let grant = try? JSONDecoder().decode(Grant.self, from: data)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let access = grant?.access_token, let refresh = grant?.refresh_token else {
            throw SessionError.server("That code didn't match. Check the newest email, or send a new one.")
        }
        try await adopt(access: access, refresh: refresh, expiresIn: grant?.expires_in ?? 3600)
    }

    // MARK: - Password (the App Review demo account, behind "Use a password
    // instead" on the email screen)

    @MainActor
    func signInWithPassword(email: String, password: String) async throws {
        var request = URLRequest(
            url: Config.supabaseURL.appendingPathComponent("auth/v1/token")
                .appending(queryItems: [.init(name: "grant_type", value: "password")])
        )
        request.httpMethod = "POST"
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["email": email, "password": password])
        let (data, response) = try await URLSession.shared.data(for: request)
        struct Grant: Decodable { let access_token: String?; let refresh_token: String?; let expires_in: Double? }
        let grant = try? JSONDecoder().decode(Grant.self, from: data)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let access = grant?.access_token, let refresh = grant?.refresh_token else {
            throw SessionError.server("Those credentials didn't work.")
        }
        try await adopt(access: access, refresh: refresh, expiresIn: grant?.expires_in ?? 3600)
    }

    /// Common landing for every auth door: store the tokens, then hydrate
    /// identity (a failure there doesn't invalidate the sign-in).
    func adopt(access: String, refresh: String, expiresIn: Double) async throws {
        await MainActor.run { resolving = true }
        var session = StoredSession(
            accessToken: access,
            refreshToken: refresh,
            expiresAt: Date().addingTimeInterval(expiresIn),
            email: nil,
            username: nil
        )
        persist(session)
        // A successful read with no username = an account without a page
        // (signups are open, and this door mints accounts). A failed read
        // stays nil so a network blip can't strand a real user on setup.
        if let me = try? await API.finds(limit: 1) {
            session.username = me.username
            session.needsSetup = me.username == nil
        }
        if let email = try? await fetchEmail(access: access) { session.email = email }
        let settled = session
        await MainActor.run {
            persist(settled)
            resolving = false
        }
    }

    private func fetchEmail(access: String) async throws -> String? {
        var request = URLRequest(url: Config.supabaseURL.appendingPathComponent("auth/v1/user"))
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(access)", forHTTPHeaderField: "Authorization")
        let (data, _) = try await URLSession.shared.data(for: request)
        struct U: Decodable { let email: String? }
        return (try? JSONDecoder().decode(U.self, from: data))?.email
    }

    // MARK: - Token freshness

    /// A valid access token, refreshed through Supabase when within a minute
    /// of expiry. The share extension calls this before every save.
    func freshAccessToken() async throws -> String {
        guard var session = current else { throw SessionError.signedOut }
        if session.expiresAt.timeIntervalSinceNow > 60 { return session.accessToken }

        var request = URLRequest(
            url: Config.supabaseURL.appendingPathComponent("auth/v1/token")
                .appending(queryItems: [.init(name: "grant_type", value: "refresh_token")])
        )
        request.httpMethod = "POST"
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(["refresh_token": session.refreshToken])

        let (data, response) = try await URLSession.shared.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else {
            persist(nil)   // refresh token burned or revoked → back to sign-in
            throw SessionError.signedOut
        }
        struct Refreshed: Decodable {
            let access_token: String
            let refresh_token: String
            let expires_in: Double
        }
        let fresh = try JSONDecoder().decode(Refreshed.self, from: data)
        session.accessToken = fresh.access_token
        session.refreshToken = fresh.refresh_token
        session.expiresAt = Date().addingTimeInterval(fresh.expires_in)
        persist(session)
        return session.accessToken
    }

    func noteUsername(_ username: String?) {
        guard var session = current, let username, session.username != username else { return }
        session.username = username
        session.needsSetup = false
        persist(session)
    }

    var needsSetup: Bool { current?.needsSetup == true }
}

enum SessionError: LocalizedError {
    case cancelled, badCallback, signedOut
    case server(String)

    var errorDescription: String? {
        switch self {
        case .cancelled: return "Sign-in was cancelled."
        case .badCallback: return "Sign-in didn't go through. Mind trying again?"
        case .signedOut: return "You're signed out. Open Bulletin to sign in."
        case .server(let message): return message
        }
    }
}

extension Session: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        ASPresentationAnchor()
    }
}
