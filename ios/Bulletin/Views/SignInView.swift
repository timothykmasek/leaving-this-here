import SwiftUI
import AuthenticationServices

// Sign-in — the front door, in the site's voice: dot ground, the wordmark,
// Apple above Google (the App Store requires Apple's button once Google is
// offered, with equal prominence). The invite gate lives server-side; an
// uninvited account gets the same soft copy as the web. A long-press on the
// wordmark opens the password door — no visible UI, it exists for App
// Review's demo credentials.
struct SignInView: View {
    @EnvironmentObject private var session: Session
    @State private var busy = false
    @State private var error: String?
    @State private var appleNonce: (raw: String, hashed: String)?

    @State private var reviewerDoor = false
    @State private var reviewerEmail = ""
    @State private var reviewerPassword = ""

    var body: some View {
        ZStack {
            DotGround()
            VStack(spacing: 0) {
                Spacer()

                Wordmark(height: 44)
                    .onLongPressGesture(minimumDuration: 1.2) {
                        reviewerDoor.toggle()
                    }

                Text("Links to keep. Lists to share.")
                    .font(.cardo(17))
                    .foregroundStyle(Color.ink.opacity(0.55))
                    .padding(.top, 14)

                SignInWithAppleButton(.continue) { request in
                    let nonce = Session.makeNonce()
                    appleNonce = nonce
                    request.requestedScopes = [.email]
                    request.nonce = nonce.hashed
                } onCompletion: { result in
                    guard case .success(let authorization) = result,
                          let nonce = appleNonce else { return }
                    Task {
                        await run { try await session.signInWithApple(authorization: authorization, rawNonce: nonce.raw) }
                    }
                }
                .signInWithAppleButtonStyle(.black)
                .frame(height: 50)
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .padding(.horizontal, 44)
                .padding(.top, 44)

                Button {
                    Task { await run { try await session.signInWithGoogle() } }
                } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().tint(Color.ink) }
                        Text(busy ? "Signing in…" : "Continue with Google")
                            .font(.mierDemi(16))
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 50)
                    .background(Color.white, in: RoundedRectangle(cornerRadius: 10))
                    .overlay(RoundedRectangle(cornerRadius: 10).stroke(Color.ink.opacity(0.18), lineWidth: 1))
                    .foregroundStyle(Color.ink)
                }
                .disabled(busy)
                .padding(.horizontal, 44)
                .padding(.top, 12)

                if reviewerDoor {
                    VStack(spacing: 8) {
                        TextField("Email", text: $reviewerEmail)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                        SecureField("Password", text: $reviewerPassword)
                        Button("Sign in") {
                            Task {
                                await run {
                                    try await session.signInWithPassword(
                                        email: reviewerEmail.trimmingCharacters(in: .whitespaces),
                                        password: reviewerPassword
                                    )
                                }
                            }
                        }
                        .font(.mierDemi(14))
                    }
                    .font(.mier(15))
                    .textFieldStyle(.roundedBorder)
                    .padding(.horizontal, 44)
                    .padding(.top, 16)
                }

                if let error {
                    Text(error)
                        .font(.cardo(14))
                        .foregroundStyle(Color.ink.opacity(0.55))
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 44)
                        .padding(.top, 16)
                }

                Spacer()
                Spacer()
            }
        }
    }

    private func run(_ signIn: @escaping () async throws -> Void) async {
        busy = true
        error = nil
        do {
            try await signIn()
        } catch SessionError.cancelled {
            // No error copy for a user-dismissed sheet.
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}
