import Foundation
import AuthenticationServices
import CryptoKit

// Native Sign in with Apple → Supabase session (App Store rule: offering
// Google login requires offering Apple's). The id_token grant: we hand Apple
// a SHA256 of a fresh nonce, Apple bakes it into the identity token, and
// Supabase verifies token + raw nonce and returns the same session shape as
// every other door. The invite gate holds: with signups off, an uninvited
// Apple ID gets the same soft rejection as an uninvited Google account.
extension Session {
    @MainActor
    func signInWithApple(authorization: ASAuthorization, rawNonce: String) async throws {
        guard let credential = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = credential.identityToken,
              let idToken = String(data: tokenData, encoding: .utf8)
        else { throw SessionError.badCallback }

        var request = URLRequest(
            url: Config.supabaseURL.appendingPathComponent("auth/v1/token")
                .appending(queryItems: [.init(name: "grant_type", value: "id_token")])
        )
        request.httpMethod = "POST"
        request.setValue(Config.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "provider": "apple",
            "id_token": idToken,
            "nonce": rawNonce,
        ])

        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        struct Grant: Decodable {
            let access_token: String?
            let refresh_token: String?
            let expires_in: Double?
            let error_description: String?
            let msg: String?
        }
        let grant = try JSONDecoder().decode(Grant.self, from: data)
        guard status == 200, let access = grant.access_token, let refresh = grant.refresh_token else {
            let reason = grant.error_description ?? grant.msg ?? ""
            if reason.range(of: "signup|not allowed", options: [.regularExpression, .caseInsensitive]) != nil {
                throw SessionError.server("Bulletin is invite-only for now — this Apple ID isn't on the guest list.")
            }
            throw SessionError.server(reason.isEmpty ? "Apple sign-in didn't go through." : reason)
        }
        try await adopt(access: access, refresh: refresh, expiresIn: grant.expires_in ?? 3600)
    }

    /// Random URL-safe nonce; its SHA256 goes to Apple, the raw one to Supabase.
    static func makeNonce() -> (raw: String, hashed: String) {
        let raw = UUID().uuidString + UUID().uuidString
        let hashed = SHA256.hash(data: Data(raw.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        return (raw, hashed)
    }
}
