import SwiftUI

// Sign-in — the front door, in the site's voice: dot ground, wordmark-weight
// lockup, one Google button (the invite gate lives server-side; an uninvited
// account gets the same soft copy as the web). System fonts stand in for
// Mier A / Cardo until the licensed files are bundled.
struct SignInView: View {
    @EnvironmentObject private var session: Session
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ZStack {
            DotGround()
            VStack(spacing: 0) {
                Spacer()

                Text("Bulletin")
                    .font(.mier(40))
                    .kerning(-0.8)
                    .foregroundStyle(Color.ink)

                Text("Links to keep. Lists to share.")
                    .font(.cardo(17))
                    .foregroundStyle(Color.ink.opacity(0.55))
                    .padding(.top, 10)

                Button {
                    Task { await signIn() }
                } label: {
                    HStack(spacing: 8) {
                        if busy { ProgressView().tint(.white) }
                        Text(busy ? "Signing in…" : "Continue with Google")
                            .font(.mierDemi(16))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 15)
                    .background(Color.ink, in: RoundedRectangle(cornerRadius: 10))
                    .foregroundStyle(.white)
                }
                .disabled(busy)
                .padding(.horizontal, 44)
                .padding(.top, 44)

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

                Text("Private beta — sign in with an invited account.")
                    .font(.cardo(13))
                    .foregroundStyle(Color.ink.opacity(0.35))
                    .padding(.bottom, 28)
            }
        }
    }

    private func signIn() async {
        busy = true
        error = nil
        do {
            try await session.signInWithGoogle()
        } catch SessionError.cancelled {
            // No error copy for a user-dismissed sheet.
        } catch {
            self.error = error.localizedDescription
        }
        busy = false
    }
}
